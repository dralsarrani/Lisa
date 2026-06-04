use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager};

// ─── Ollama endpoint constants ────────────────────────────────────────────────
// Localhost only. Arbitrary host URLs are never accepted in Phase 1A.

const OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434";
const OLLAMA_CHAT_URL: &str = "http://127.0.0.1:11434/api/chat";
const OLLAMA_TAGS_URL: &str = "http://127.0.0.1:11434/api/tags";

// Short timeout for model discovery; long timeout for generation (first load can be slow).
// Model test uses a dedicated short timeout to fail fast without blocking the UI.
const OLLAMA_TAGS_TIMEOUT_SECS: u64 = 5;
const OLLAMA_CHAT_TIMEOUT_SECS: u64 = 180;
const OLLAMA_MODEL_TEST_TIMEOUT_SECS: u64 = 15;

// ─── Data Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub modified_at: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct OllamaChatOptions {
    num_predict: u32,
    temperature: f32,
    top_p: f32,
}

#[derive(Debug, Serialize)]
struct OllamaChatRequest<'a> {
    model: &'a str,
    messages: &'a [OllamaChatMessage],
    stream: bool,
    options: OllamaChatOptions,
}

#[derive(Debug, Deserialize)]
struct OllamaMessageField {
    content: String,
}

#[derive(Debug, Deserialize)]
struct OllamaRawChatResponse {
    message: Option<OllamaMessageField>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamChunk {
    message: Option<OllamaMessageField>,
    done: Option<bool>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamChunkPayload {
    pub id: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamDonePayload {
    pub id: String,
    pub model: String,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamErrorPayload {
    pub id: String,
    pub error: String,
    pub latency_ms: u64,
}

// ─── Stream abort event payload ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct StreamAbortedPayload {
    pub id: String,
    pub model: String,
    pub latency_ms: u64,
    pub response_chars: usize,
}

// ─── Per-stream cancellation state ───────────────────────────────────────────

pub struct CancelState {
    cancelled: AtomicBool,
    active_id: Mutex<Option<String>>,
}

impl CancelState {
    fn new() -> Self {
        CancelState {
            cancelled: AtomicBool::new(false),
            active_id: Mutex::new(None),
        }
    }

    /// Mark a new stream as active and reset the cancellation flag.
    fn begin_stream(&self, id: &str) {
        let mut guard = self.active_id.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(id.to_string());
        // Reset BEFORE the stream starts so any stale cancel from the prior stream is cleared.
        self.cancelled.store(false, Ordering::SeqCst);
    }

    /// Clear active stream tracking and reset the cancellation flag.
    fn end_stream(&self) {
        let mut guard = self.active_id.lock().unwrap_or_else(|e| e.into_inner());
        *guard = None;
        self.cancelled.store(false, Ordering::SeqCst);
    }

    /// Set the cancellation flag if `id` matches the active stream. Returns true if cancelled.
    fn cancel_if_active(&self, id: &str) -> bool {
        let guard = self.active_id.lock().unwrap_or_else(|e| e.into_inner());
        if guard.as_deref() == Some(id) {
            self.cancelled.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}

#[derive(Debug, Serialize)]
pub struct OllamaListResult {
    pub models: Vec<OllamaModel>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OllamaChatResult {
    pub response: Option<String>,
    pub error: Option<String>,
    pub model: String,
    pub latency_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RuntimeHealth {
    pub backend_reachable: bool,
    pub app_version: String,
    pub os_type: String,
    pub os_version: String,
    pub arch: String,
    pub timestamp: String,
    pub ollama_status: String,
    pub docker_status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PingResponse {
    pub alive: bool,
    pub message: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppStateWriteResult {
    pub success: bool,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct OllamaModelTestResult {
    pub success: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SttResult {
    pub status: String,
    pub transcript: Option<String>,
    pub engine: String,
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Returns a placeholder STT result. No audio is captured or processed.
/// Real transcription will be implemented when a local STT engine is integrated.
#[tauri::command]
async fn transcribe_voice_placeholder() -> SttResult {
    SttResult {
        status: "not_configured".to_string(),
        transcript: None,
        engine: "placeholder".to_string(),
    }
}

#[tauri::command]
async fn ping_backend() -> PingResponse {
    let timestamp = chrono::Utc::now().to_rfc3339();
    PingResponse {
        alive: true,
        message: "Lisa backend is online.".to_string(),
        timestamp,
    }
}

#[tauri::command]
async fn get_runtime_health() -> RuntimeHealth {
    let timestamp = chrono::Utc::now().to_rfc3339();

    let os_type = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    let os_version = get_os_version();

    RuntimeHealth {
        backend_reachable: true,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_type,
        os_version,
        arch,
        timestamp,
        ollama_status: check_ollama_safe(),
        docker_status: check_docker_safe(),
    }
}

#[tauri::command]
async fn read_app_state(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_state_path(&app_handle)?;
    if !path.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read state: {e}"))
}

#[tauri::command]
async fn write_app_state(
    app_handle: tauri::AppHandle,
    state_json: String,
) -> Result<AppStateWriteResult, String> {
    let path = get_state_path(&app_handle)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create data directory: {e}"))?;
    }

    serde_json::from_str::<serde_json::Value>(&state_json)
        .map_err(|e| format!("Invalid JSON: {e}"))?;

    std::fs::write(&path, &state_json).map_err(|e| format!("Failed to write state: {e}"))?;

    Ok(AppStateWriteResult {
        success: true,
        path: path.to_string_lossy().to_string(),
    })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn get_state_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data directory: {e}"))?;
    Ok(data_dir.join("lisa_state.json"))
}

fn get_os_version() -> String {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "Windows (version unknown)".to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| format!("macOS {}", s.trim()))
            .unwrap_or_else(|| "macOS (version unknown)".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("uname")
            .arg("-r")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| format!("Linux kernel {}", s.trim()))
            .unwrap_or_else(|| "Linux (version unknown)".to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "Unknown OS".to_string()
    }
}

fn check_ollama_safe() -> String {
    let result = std::net::TcpStream::connect_timeout(
        &"127.0.0.1:11434".parse().unwrap(),
        std::time::Duration::from_millis(300),
    );
    match result {
        Ok(_) => "available".to_string(),
        Err(_) => "not_configured".to_string(),
    }
}

fn check_docker_safe() -> String {
    #[cfg(target_os = "windows")]
    let docker_socket_exists = std::path::Path::new(r"\\.\pipe\docker_engine").exists();
    #[cfg(unix)]
    let docker_socket_exists = std::path::Path::new("/var/run/docker.sock").exists();
    #[cfg(not(any(target_os = "windows", unix)))]
    let docker_socket_exists = false;

    if docker_socket_exists {
        "available".to_string()
    } else {
        "not_configured".to_string()
    }
}

/// Maps raw Ollama error strings to user-friendly messages with actionable guidance.
/// Matched case-insensitively against the full error text.
fn classify_ollama_error(raw: &str) -> String {
    let lower = raw.to_lowercase();

    // Memory allocation failure — model too large for available RAM/VRAM.
    if lower.contains("unable to allocate")
        || lower.contains("failed to allocate")
        || lower.contains("llama runner process has terminated")
        || lower.contains("out of memory")
        || lower.contains("cannot allocate")
    {
        return "This model failed to load because Ollama could not allocate enough memory. \
                Try a smaller model such as llama3.2:1b, qwen2.5-coder:1.5b, or deepseek-r1:1.5b."
            .to_string();
    }

    // Model not installed locally.
    if lower.contains("model not found") || lower.contains("pull model manifest") {
        return "Model not found. Make sure it is installed by running: ollama pull <model-name>"
            .to_string();
    }

    // Ollama process not running or port not open.
    if lower.contains("connection refused")
        || lower.contains("tcp connect error")
        || lower.contains("not reachable")
        || lower.contains("failed to connect")
    {
        return "Ollama is not running. Start it with: ollama serve".to_string();
    }

    // Disk full — model cannot be loaded or swapped.
    if lower.contains("no space left") || lower.contains("disk full") || lower.contains("not enough space") {
        return "Ollama could not load the model because disk space is insufficient. \
                Free up disk space and try again."
            .to_string();
    }

    // Request or connection timeout.
    if lower.contains("timed out") || lower.contains("deadline exceeded") {
        return "Local model did not respond before the timeout. \
                First responses can be slow while Ollama loads the model. \
                Try again, choose a smaller model, or restart Ollama."
            .to_string();
    }

    // Malformed or unexpected response body.
    if lower.contains("parse error")
        || lower.contains("invalid json")
        || lower.contains("unexpected token")
        || lower.contains("response parse error")
    {
        return "Ollama returned an unexpected response. \
                The model may have failed to load correctly. Try restarting Ollama."
            .to_string();
    }

    // Unknown — pass through as-is so nothing is silently swallowed.
    raw.to_string()
}

/// Walks the reqwest error source chain and returns a concise diagnostic string.
/// Puts the innermost (root) cause first so it is not clipped by the UI.
fn reqwest_error_detail(e: &reqwest::Error) -> String {
    use std::error::Error;

    let top = e.to_string();
    let mut root = top.clone();
    let mut source = e.source();
    while let Some(cause) = source {
        root = cause.to_string();
        source = cause.source();
    }

    if root == top {
        root
    } else {
        format!("{root} (detail: {top})")
    }
}

// ─── Ollama Commands ──────────────────────────────────────────────────────────

#[tauri::command]
async fn cancel_ollama_stream(
    interaction_id: String,
    cancel: tauri::State<'_, CancelState>,
) -> Result<(), String> {
    cancel.cancel_if_active(&interaction_id);
    Ok(())
}

#[tauri::command]
async fn list_ollama_models() -> OllamaListResult {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(OLLAMA_TAGS_TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return OllamaListResult {
                models: vec![],
                error: Some(format!("HTTP client build error: {e}")),
            }
        }
    };

    match client.get(OLLAMA_TAGS_URL).send().await {
        Ok(resp) => match resp.json::<OllamaTagsResponse>().await {
            Ok(tags) => OllamaListResult {
                models: tags.models,
                error: None,
            },
            Err(e) => OllamaListResult {
                models: vec![],
                error: Some(format!(
                    "Ollama response parse error at {OLLAMA_TAGS_URL}: {e}"
                )),
            },
        },
        Err(e) => OllamaListResult {
            models: vec![],
            error: Some(format!(
                "Ollama not reachable at {OLLAMA_BASE_URL}: {}",
                reqwest_error_detail(&e)
            )),
        },
    }
}

#[tauri::command]
async fn send_ollama_chat(model: String, messages: Vec<OllamaChatMessage>) -> OllamaChatResult {
    let start = std::time::Instant::now();

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(OLLAMA_CHAT_TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return OllamaChatResult {
                response: None,
                error: Some(format!("HTTP client build error: {e}")),
                model,
                latency_ms: 0,
            }
        }
    };

    let body = OllamaChatRequest {
        model: &model,
        messages: &messages,
        stream: false,
        options: OllamaChatOptions {
            num_predict: 256,
            temperature: 0.4,
            top_p: 0.9,
        },
    };

    let resp = match client.post(OLLAMA_CHAT_URL).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            let msg = if e.is_timeout() {
                "Local model did not respond before the timeout. First responses can be slow while Ollama loads the model. Try again, choose a smaller model, or restart Ollama.".to_string()
            } else {
                format!(
                    "Ollama chat failed at {OLLAMA_CHAT_URL}: {}",
                    reqwest_error_detail(&e)
                )
            };
            return OllamaChatResult {
                response: None,
                error: Some(msg),
                model,
                latency_ms: start.elapsed().as_millis() as u64,
            }
        }
    };

    let status = resp.status();
    let latency_ms = start.elapsed().as_millis() as u64;

    // Surface non-2xx HTTP errors before attempting body parse.
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return OllamaChatResult {
            response: None,
            error: Some(classify_ollama_error(&body_text)),
            model,
            latency_ms,
        };
    }

    match resp.json::<OllamaRawChatResponse>().await {
        Ok(raw) => OllamaChatResult {
            response: raw.message.map(|m| m.content),
            error: None,
            model,
            latency_ms,
        },
        Err(e) => OllamaChatResult {
            response: None,
            error: Some(classify_ollama_error(&format!(
                "response parse error: {e}"
            ))),
            model,
            latency_ms,
        },
    }
}

#[tauri::command]
async fn stream_ollama_chat(
    app_handle: tauri::AppHandle,
    cancel: tauri::State<'_, CancelState>,
    interaction_id: String,
    model: String,
    messages: Vec<OllamaChatMessage>,
) -> Result<(), String> {
    let start = std::time::Instant::now();
    cancel.begin_stream(&interaction_id);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(OLLAMA_CHAT_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("HTTP client build error: {e}"))?;

    let body = OllamaChatRequest {
        model: &model,
        messages: &messages,
        stream: true,
        options: OllamaChatOptions {
            num_predict: 256,
            temperature: 0.4,
            top_p: 0.9,
        },
    };

    let resp = match client
        .post(OLLAMA_CHAT_URL)
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            cancel.end_stream();
            let msg = if e.is_timeout() {
                "Local model did not respond before the timeout. First responses can be slow while Ollama loads the model. Try again, choose a smaller model, or restart Ollama.".to_string()
            } else {
                format!("Ollama chat failed at {OLLAMA_CHAT_URL}: {}", reqwest_error_detail(&e))
            };
            return Err(msg);
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        cancel.end_stream();
        return Err(classify_ollama_error(&body_text));
    }

    let mut byte_stream = resp.bytes_stream();
    let mut line_buf = String::new();
    let mut response_chars: usize = 0;

    while let Some(item) = byte_stream.next().await {
        // Check cancellation before processing each network chunk.
        if cancel.is_cancelled() {
            let _ = app_handle.emit(
                "lisa-stream-aborted",
                StreamAbortedPayload {
                    id: interaction_id.clone(),
                    model: model.clone(),
                    latency_ms: start.elapsed().as_millis() as u64,
                    response_chars,
                },
            );
            cancel.end_stream();
            return Ok(());
        }

        let bytes = match item {
            Ok(b) => b,
            Err(e) => {
                let _ = app_handle.emit(
                    "lisa-stream-error",
                    StreamErrorPayload {
                        id: interaction_id.clone(),
                        error: format!("Stream read error: {e}"),
                        latency_ms: start.elapsed().as_millis() as u64,
                    },
                );
                cancel.end_stream();
                return Ok(());
            }
        };

        let text = String::from_utf8_lossy(&bytes);
        for ch in text.chars() {
            if ch == '\n' {
                let line = line_buf.trim().to_string();
                line_buf.clear();
                if line.is_empty() {
                    continue;
                }
                match serde_json::from_str::<OllamaStreamChunk>(&line) {
                    Ok(chunk) => {
                        if let Some(err_msg) = chunk.error {
                            let _ = app_handle.emit(
                                "lisa-stream-error",
                                StreamErrorPayload {
                                    id: interaction_id.clone(),
                                    error: classify_ollama_error(&err_msg),
                                    latency_ms: start.elapsed().as_millis() as u64,
                                },
                            );
                            cancel.end_stream();
                            return Ok(());
                        }
                        if let Some(msg) = chunk.message {
                            if !msg.content.is_empty() {
                                response_chars += msg.content.len();
                                let _ = app_handle.emit(
                                    "lisa-stream-chunk",
                                    StreamChunkPayload {
                                        id: interaction_id.clone(),
                                        chunk: msg.content,
                                    },
                                );
                            }
                        }
                        if chunk.done.unwrap_or(false) {
                            let _ = app_handle.emit(
                                "lisa-stream-done",
                                StreamDonePayload {
                                    id: interaction_id.clone(),
                                    model: model.clone(),
                                    latency_ms: start.elapsed().as_millis() as u64,
                                },
                            );
                            cancel.end_stream();
                            return Ok(());
                        }
                    }
                    Err(_) => {} // Skip non-JSON lines (e.g. blank lines, headers)
                }
            } else {
                line_buf.push(ch);
            }
        }
    }

    // Stream exhausted without an explicit done marker — emit done anyway.
    let _ = app_handle.emit(
        "lisa-stream-done",
        StreamDonePayload {
            id: interaction_id,
            model,
            latency_ms: start.elapsed().as_millis() as u64,
        },
    );
    cancel.end_stream();

    Ok(())
}

/// Sends a minimal "Reply with OK." prompt to verify a model loads and responds.
/// Result is returned to the frontend for display only — nothing is added to
/// conversation history, memory notes, or audit logs from the Rust side.
#[tauri::command]
async fn test_ollama_model(model: String) -> OllamaModelTestResult {
    let start = std::time::Instant::now();

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(OLLAMA_MODEL_TEST_TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return OllamaModelTestResult {
                success: false,
                latency_ms: 0,
                error: Some(format!("HTTP client build error: {e}")),
            }
        }
    };

    let messages = vec![OllamaChatMessage {
        role: "user".to_string(),
        content: "Reply with OK.".to_string(),
    }];

    let body = OllamaChatRequest {
        model: &model,
        messages: &messages,
        stream: false,
        options: OllamaChatOptions {
            num_predict: 10,
            temperature: 0.0,
            top_p: 1.0,
        },
    };

    let resp = match client.post(OLLAMA_CHAT_URL).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            let raw = if e.is_timeout() {
                "timed out".to_string()
            } else {
                reqwest_error_detail(&e)
            };
            return OllamaModelTestResult {
                success: false,
                latency_ms,
                error: Some(classify_ollama_error(&raw)),
            };
        }
    };

    let status = resp.status();
    let latency_ms = start.elapsed().as_millis() as u64;

    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        return OllamaModelTestResult {
            success: false,
            latency_ms,
            error: Some(classify_ollama_error(&body_text)),
        };
    }

    match resp.json::<OllamaRawChatResponse>().await {
        Ok(raw) => {
            if raw.message.is_some() {
                OllamaModelTestResult {
                    success: true,
                    latency_ms,
                    error: None,
                }
            } else {
                OllamaModelTestResult {
                    success: false,
                    latency_ms,
                    error: Some(classify_ollama_error("response parse error: empty message")),
                }
            }
        }
        Err(e) => OllamaModelTestResult {
            success: false,
            latency_ms,
            error: Some(classify_ollama_error(&format!("response parse error: {e}"))),
        },
    }
}

// ─── App Entry ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .manage(CancelState::new())
        .invoke_handler(tauri::generate_handler![
            ping_backend,
            get_runtime_health,
            read_app_state,
            write_app_state,
            list_ollama_models,
            send_ollama_chat,
            stream_ollama_chat,
            cancel_ollama_stream,
            test_ollama_model,
            transcribe_voice_placeholder,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Lisa application");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ollama_urls_are_localhost_http_only() {
        for url in [OLLAMA_BASE_URL, OLLAMA_CHAT_URL, OLLAMA_TAGS_URL] {
            assert!(
                url.starts_with("http://127.0.0.1:11434"),
                "URL must be localhost-only http: {url}"
            );
            assert!(
                !url.starts_with("https://"),
                "TLS must not be used for localhost: {url}"
            );
        }
    }

    #[test]
    fn ollama_urls_have_correct_paths() {
        assert_eq!(OLLAMA_CHAT_URL, "http://127.0.0.1:11434/api/chat");
        assert_eq!(OLLAMA_TAGS_URL, "http://127.0.0.1:11434/api/tags");
        assert_eq!(OLLAMA_BASE_URL, "http://127.0.0.1:11434");
    }

    #[test]
    fn timeout_constants_have_correct_values() {
        assert_eq!(OLLAMA_TAGS_TIMEOUT_SECS, 5, "tags timeout must be short");
        assert_eq!(OLLAMA_CHAT_TIMEOUT_SECS, 180, "chat timeout must allow slow first loads");
        assert!(
            OLLAMA_CHAT_TIMEOUT_SECS > OLLAMA_TAGS_TIMEOUT_SECS,
            "chat timeout must exceed tags timeout"
        );
    }

    #[test]
    fn chat_request_serializes_correctly() {
        let msg = OllamaChatMessage {
            role: "user".to_string(),
            content: "hello".to_string(),
        };
        let req = OllamaChatRequest {
            model: "llama3.2:1b",
            messages: &[msg],
            stream: false,
            options: OllamaChatOptions {
                num_predict: 256,
                temperature: 0.4,
                top_p: 0.9,
            },
        };
        let json = serde_json::to_string(&req).expect("serialization must succeed");
        let v: serde_json::Value = serde_json::from_str(&json).expect("must round-trip");

        assert_eq!(v["model"], "llama3.2:1b");
        assert_eq!(v["stream"], false);
        assert_eq!(v["messages"][0]["role"], "user");
        assert_eq!(v["messages"][0]["content"], "hello");
        assert_eq!(v["options"]["num_predict"], 256);
        assert!((v["options"]["temperature"].as_f64().unwrap() - 0.4).abs() < 1e-6);
        assert!((v["options"]["top_p"].as_f64().unwrap() - 0.9).abs() < 1e-6);
    }

    #[test]
    fn chat_response_parses_message_content() {
        let json = r#"{
            "model": "llama3.2:1b",
            "message": {"role": "assistant", "content": "Hello!"},
            "done": true
        }"#;
        let parsed: OllamaRawChatResponse =
            serde_json::from_str(json).expect("must parse Ollama chat response");
        assert_eq!(parsed.message.unwrap().content, "Hello!");
    }

    #[test]
    fn chat_response_handles_missing_message() {
        // Ollama error responses may omit the message field.
        let json = r#"{"model": "llama3.2:1b", "done": true, "error": "model not found"}"#;
        let parsed: OllamaRawChatResponse =
            serde_json::from_str(json).expect("must parse even without message field");
        assert!(parsed.message.is_none());
    }

    #[test]
    fn stream_chunk_parses_content_token() {
        let json = r#"{"model":"llama3.2:1b","message":{"role":"assistant","content":"Hello"},"done":false}"#;
        let chunk: OllamaStreamChunk =
            serde_json::from_str(json).expect("must parse stream chunk");
        assert_eq!(chunk.message.unwrap().content, "Hello");
        assert_eq!(chunk.done, Some(false));
        assert!(chunk.error.is_none());
    }

    #[test]
    fn stream_chunk_parses_done_marker() {
        let json = r#"{"model":"llama3.2:1b","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop"}"#;
        let chunk: OllamaStreamChunk =
            serde_json::from_str(json).expect("must parse done chunk");
        assert_eq!(chunk.done, Some(true));
    }

    #[test]
    fn stream_chunk_parses_error_field() {
        let json = r#"{"error":"model not found"}"#;
        let chunk: OllamaStreamChunk =
            serde_json::from_str(json).expect("must parse error chunk");
        assert_eq!(chunk.error.as_deref(), Some("model not found"));
        assert!(chunk.message.is_none());
    }

    // ─── CancelState ─────────────────────────────────────────────────────────

    #[test]
    fn cancel_state_starts_not_cancelled() {
        let state = CancelState::new();
        assert!(!state.is_cancelled());
    }

    #[test]
    fn cancel_state_begin_stream_resets_flag() {
        let state = CancelState::new();
        state.begin_stream("req-1");
        assert!(!state.is_cancelled(), "flag must be false after begin_stream");
    }

    #[test]
    fn cancel_state_matching_id_cancels() {
        let state = CancelState::new();
        state.begin_stream("req-1");
        let cancelled = state.cancel_if_active("req-1");
        assert!(cancelled);
        assert!(state.is_cancelled());
    }

    #[test]
    fn cancel_state_wrong_id_does_not_cancel() {
        let state = CancelState::new();
        state.begin_stream("req-1");
        let cancelled = state.cancel_if_active("req-999");
        assert!(!cancelled);
        assert!(!state.is_cancelled());
    }

    #[test]
    fn cancel_state_no_active_stream_does_not_cancel() {
        let state = CancelState::new();
        let cancelled = state.cancel_if_active("req-1");
        assert!(!cancelled);
        assert!(!state.is_cancelled());
    }

    #[test]
    fn cancel_state_end_stream_resets_flag() {
        let state = CancelState::new();
        state.begin_stream("req-1");
        state.cancel_if_active("req-1");
        assert!(state.is_cancelled());
        state.end_stream();
        assert!(!state.is_cancelled());
    }

    #[test]
    fn cancel_state_end_stream_clears_active_id() {
        let state = CancelState::new();
        state.begin_stream("req-1");
        state.end_stream();
        // After end, a cancel for the old ID should not work.
        let cancelled = state.cancel_if_active("req-1");
        assert!(!cancelled);
    }

    #[test]
    fn cancel_state_second_stream_overrides_first() {
        let state = CancelState::new();
        state.begin_stream("req-1");
        state.begin_stream("req-2");
        // req-1 is stale — cancelling it must not work.
        let cancelled = state.cancel_if_active("req-1");
        assert!(!cancelled);
        assert!(!state.is_cancelled());
        // req-2 is active.
        let cancelled = state.cancel_if_active("req-2");
        assert!(cancelled);
        assert!(state.is_cancelled());
    }

    // ─── classify_ollama_error ────────────────────────────────────────────────

    #[test]
    fn classify_ollama_error_memory_allocation() {
        let msg = classify_ollama_error("unable to allocate CPU buffer");
        assert!(msg.contains("could not allocate enough memory"), "got: {msg}");
        assert!(msg.contains("llama3.2:1b"), "got: {msg}");
        assert!(msg.contains("qwen2.5-coder:1.5b"), "got: {msg}");
        assert!(msg.contains("deepseek-r1:1.5b"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_llama_runner_terminated() {
        let msg = classify_ollama_error("llama runner process has terminated");
        assert!(msg.contains("could not allocate enough memory"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_out_of_memory() {
        let msg = classify_ollama_error("out of memory: kill process");
        assert!(msg.contains("could not allocate enough memory"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_model_not_found() {
        let msg = classify_ollama_error("model not found");
        assert!(msg.contains("ollama pull"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_pull_manifest() {
        let msg = classify_ollama_error("pull model manifest: file does not exist");
        assert!(msg.contains("ollama pull"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_connection_refused() {
        let msg = classify_ollama_error("connection refused");
        assert!(msg.contains("ollama serve"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_not_reachable() {
        let msg = classify_ollama_error("Ollama not reachable at http://127.0.0.1:11434");
        assert!(msg.contains("ollama serve"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_disk_space() {
        let msg = classify_ollama_error("no space left on device");
        assert!(msg.contains("disk space"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_timeout() {
        let msg = classify_ollama_error("request timed out after 15s");
        assert!(msg.contains("timeout") || msg.contains("slow"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_malformed_response() {
        let msg = classify_ollama_error("response parse error: unexpected token");
        assert!(msg.contains("unexpected response"), "got: {msg}");
    }

    #[test]
    fn classify_ollama_error_unknown_passthrough() {
        let raw = "some truly unknown error 99999";
        let msg = classify_ollama_error(raw);
        assert_eq!(msg, raw);
    }

    #[test]
    fn classify_ollama_error_case_insensitive() {
        let msg = classify_ollama_error("UNABLE TO ALLOCATE CPU BUFFER");
        assert!(msg.contains("could not allocate enough memory"), "got: {msg}");
    }

    #[test]
    fn ollama_model_test_result_serializes() {
        let result = OllamaModelTestResult {
            success: true,
            latency_ms: 423,
            error: None,
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["success"], true);
        assert_eq!(v["latency_ms"], 423);
        assert!(v["error"].is_null());
    }

    #[test]
    fn ollama_model_test_result_serializes_failure() {
        let result = OllamaModelTestResult {
            success: false,
            latency_ms: 15000,
            error: Some("Ollama is not running. Start it with: ollama serve".to_string()),
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["success"], false);
        assert!(v["error"].as_str().unwrap().contains("ollama serve"));
    }

    // ─── SttResult / transcribe_voice_placeholder ────────────────────────────

    #[test]
    fn stt_result_not_configured_serializes() {
        let result = SttResult {
            status: "not_configured".to_string(),
            transcript: None,
            engine: "placeholder".to_string(),
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["status"], "not_configured");
        assert!(v["transcript"].is_null());
        assert_eq!(v["engine"], "placeholder");
    }

    #[test]
    fn transcribe_voice_placeholder_returns_not_configured() {
        let result = futures::executor::block_on(transcribe_voice_placeholder());
        assert_eq!(result.status, "not_configured");
        assert!(result.transcript.is_none());
        assert_eq!(result.engine, "placeholder");
    }

    #[test]
    fn stream_aborted_payload_serializes_correctly() {
        let payload = StreamAbortedPayload {
            id: "req-001".to_string(),
            model: "llama3.2:1b".to_string(),
            latency_ms: 1234,
            response_chars: 42,
        };
        let json = serde_json::to_string(&payload).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).expect("must round-trip");
        assert_eq!(v["id"], "req-001");
        assert_eq!(v["model"], "llama3.2:1b");
        assert_eq!(v["latency_ms"], 1234);
        assert_eq!(v["response_chars"], 42);
    }
}
