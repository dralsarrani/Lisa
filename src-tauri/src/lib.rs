use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

// ─── Data Types ──────────────────────────────────────────────────────────────

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

// ─── Commands ─────────────────────────────────────────────────────────────────

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

    // Safe OS version check — best-effort, never panics.
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

    // Ensure directory exists.
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create data directory: {e}"))?;
    }

    // Validate JSON before writing.
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
    // Use a safe cross-platform approach.
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
    // Only check if Ollama is reachable on the default port. Never fail.
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
    // Check Docker socket / daemon safely. Never fail.
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

// ─── App Entry ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            ping_backend,
            get_runtime_health,
            read_app_state,
            write_app_state,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Lisa application");
}
