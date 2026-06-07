// ─────────────────────────────────────────────────────────────────────────────
// Lisa Phase 4C — Local OCR / Screen Text Understanding
//
// Manual, explicit, local-only OCR of Lisa-managed screenshots.
// Feature flag: ocr
//
// Safety constraints (non-negotiable):
//   - No background OCR — every extraction is user-initiated
//   - No periodic or automatic OCR
//   - No upload to any network service
//   - No OCR text in audit details (only metadata: chars, lines, provider)
//   - OCR text stored in memory only — never written to persistent state
//   - Only allowed on Lisa-managed temp screenshot paths (lisa_screen_*.png in OS temp)
//   - On non-Windows / without feature flag: returns clean not-available status
//   - Error messages must not include extracted OCR text
//   - Path validation rejects arbitrary file paths
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// ─── Public data types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OcrStatus {
    pub available: bool,
    pub provider: String,
    pub configured: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct OcrRequest {
    pub image_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub accepted: bool,
    pub provider: String,
    /// Extracted text. None when OCR failed or is not configured.
    /// Never contains raw image bytes or base64.
    pub text: Option<String>,
    pub chars: usize,
    pub lines: usize,
    /// Error reason only — must never contain extracted OCR text.
    pub error: Option<String>,
}

// ─── Manager ──────────────────────────────────────────────────────────────────

pub struct OcrManager {
    pub last_ocr_text: Mutex<Option<String>>,
    pub last_ocr_chars: Mutex<usize>,
    pub last_ocr_lines: Mutex<usize>,
    pub last_ocr_provider: Mutex<Option<String>>,
    pub last_ocr_at: Mutex<Option<u64>>,
}

impl OcrManager {
    pub fn new() -> Self {
        Self {
            last_ocr_text: Mutex::new(None),
            last_ocr_chars: Mutex::new(0),
            last_ocr_lines: Mutex::new(0),
            last_ocr_provider: Mutex::new(None),
            last_ocr_at: Mutex::new(None),
        }
    }
}

// ─── Constants ────────────────────────────────────────────────────────────────

#[cfg(all(windows, feature = "ocr"))]
pub const OCR_PROVIDER_WINDOWS: &str = "windows_ocr";

#[cfg(not(feature = "ocr"))]
pub const OCR_PROVIDER_NOT_COMPILED: &str = "not_compiled";

#[cfg(all(not(windows), feature = "ocr"))]
pub const OCR_PROVIDER_UNSUPPORTED: &str = "unsupported";

/// Path validation: only allow Lisa-managed temp screenshots.
/// Rejects arbitrary user-supplied file paths to prevent path traversal.
pub fn is_lisa_managed_screenshot(path: &str) -> bool {
    // Must point to a file named lisa_screen_*.png in the OS temp directory.
    // We normalize separators and check the filename prefix.
    let path_lower = path.replace('\\', "/");
    let filename = path_lower.split('/').last().unwrap_or("");
    if !filename.starts_with("lisa_screen_") || !filename.ends_with(".png") {
        return false;
    }
    // The path must be inside the OS temp directory.
    let temp_dir = std::env::temp_dir();
    let temp_str = temp_dir.to_string_lossy().replace('\\', "/");
    path_lower.starts_with(temp_str.trim_end_matches('/'))
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_ocr_status(manager: tauri::State<'_, OcrManager>) -> OcrStatus {
    #[cfg(all(windows, feature = "ocr"))]
    {
        let _ = &manager;
        OcrStatus {
            available: true,
            provider: OCR_PROVIDER_WINDOWS.to_string(),
            configured: true,
            error: None,
        }
    }
    #[cfg(all(not(windows), feature = "ocr"))]
    {
        let _ = &manager;
        OcrStatus {
            available: false,
            provider: OCR_PROVIDER_UNSUPPORTED.to_string(),
            configured: false,
            error: Some(
                "OCR is only supported on Windows in this build.".to_string(),
            ),
        }
    }
    #[cfg(not(feature = "ocr"))]
    {
        let _ = &manager;
        OcrStatus {
            available: false,
            provider: OCR_PROVIDER_NOT_COMPILED.to_string(),
            configured: false,
            error: Some(
                "OCR not compiled. Build Lisa with --features ocr to enable screen text extraction."
                    .to_string(),
            ),
        }
    }
}

#[tauri::command]
pub fn run_screen_ocr(
    image_path: String,
    manager: tauri::State<'_, OcrManager>,
) -> OcrResult {
    // Path validation — reject anything that is not a Lisa-managed screenshot.
    if !is_lisa_managed_screenshot(&image_path) {
        return OcrResult {
            accepted: false,
            provider: "rejected".to_string(),
            text: None,
            chars: 0,
            lines: 0,
            error: Some(
                "OCR rejected: path is not a Lisa-managed screenshot. Only screenshots taken by Lisa can be processed.".to_string(),
            ),
        };
    }

    // Verify the file exists before attempting OCR.
    if !std::path::Path::new(&image_path).exists() {
        return OcrResult {
            accepted: false,
            provider: "rejected".to_string(),
            text: None,
            chars: 0,
            lines: 0,
            error: Some("OCR rejected: screenshot file not found.".to_string()),
        };
    }

    #[cfg(all(windows, feature = "ocr"))]
    {
        run_windows_ocr(&image_path, manager)
    }
    #[cfg(all(not(windows), feature = "ocr"))]
    {
        let _ = &manager;
        OcrResult {
            accepted: false,
            provider: OCR_PROVIDER_UNSUPPORTED.to_string(),
            text: None,
            chars: 0,
            lines: 0,
            error: Some("OCR is only supported on Windows in this build.".to_string()),
        }
    }
    #[cfg(not(feature = "ocr"))]
    {
        let _ = &manager;
        OcrResult {
            accepted: false,
            provider: OCR_PROVIDER_NOT_COMPILED.to_string(),
            text: None,
            chars: 0,
            lines: 0,
            error: Some(
                "OCR not compiled. Build Lisa with --features ocr to enable screen text extraction."
                    .to_string(),
            ),
        }
    }
}

#[cfg(all(windows, feature = "ocr"))]
fn run_windows_ocr(
    image_path: &str,
    manager: tauri::State<'_, OcrManager>,
) -> OcrResult {
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    // Escape single quotes in path for PowerShell. Path is already validated to be a
    // Lisa-managed temp file, so injection surface is minimal, but we still escape.
    let safe_path = image_path.replace('\'', "''");

    // PowerShell script using Windows built-in WinRT OCR engine.
    // The engine is available on Windows 10 1803+ with at least one language pack.
    // We print a sentinel so we can distinguish an empty page from a failed run.
    let script = format!(
        r#"
try {{
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
    $null = [Windows.Storage.StorageFile,Windows.Foundation,ContentType=WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
    function AwaitTask($task) {{ $task.GetAwaiter().GetResult() }}
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($null -eq $engine) {{
        Write-Error 'OCR_ENGINE_UNAVAILABLE: No OCR language pack found'
        exit 1
    }}
    $file = AwaitTask([Windows.Storage.StorageFile]::GetFileFromPathAsync('{path}'))
    $stream = AwaitTask($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
    $decoder = AwaitTask([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
    $bitmap = AwaitTask($decoder.GetSoftwareBitmapAsync())
    $result = AwaitTask($engine.RecognizeAsync($bitmap))
    $text = $result.Text
    Write-Output $text
    Write-Output 'LISA_OCR_DONE'
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"#,
        path = safe_path
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            // Strip the sentinel marker.
            let text = stdout
                .trim_end_matches("LISA_OCR_DONE")
                .trim_end_matches('\n')
                .trim_end_matches('\r')
                .to_string();

            let chars = text.chars().count();
            let lines = if text.is_empty() { 0 } else { text.lines().count() };

            // Store in manager (transient — not persisted).
            *manager.last_ocr_text.lock().unwrap_or_else(|e| e.into_inner()) =
                Some(text.clone());
            *manager.last_ocr_chars.lock().unwrap_or_else(|e| e.into_inner()) = chars;
            *manager.last_ocr_lines.lock().unwrap_or_else(|e| e.into_inner()) = lines;
            *manager.last_ocr_provider.lock().unwrap_or_else(|e| e.into_inner()) =
                Some(OCR_PROVIDER_WINDOWS.to_string());
            *manager.last_ocr_at.lock().unwrap_or_else(|e| e.into_inner()) = Some(now);

            OcrResult {
                accepted: true,
                provider: OCR_PROVIDER_WINDOWS.to_string(),
                text: Some(text),
                chars,
                lines,
                error: None,
            }
        }
        Ok(o) => {
            // stderr contains error reason — never contains OCR text body.
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            // Truncate and sanitize the error so it cannot leak OCR text.
            let short_err = stderr.lines().next().unwrap_or("OCR failed").trim();
            let safe_err = if short_err.len() > 200 {
                format!("{}…", &short_err[..200])
            } else {
                short_err.to_string()
            };
            OcrResult {
                accepted: false,
                provider: OCR_PROVIDER_WINDOWS.to_string(),
                text: None,
                chars: 0,
                lines: 0,
                error: Some(format!("OCR failed: {safe_err}")),
            }
        }
        Err(e) => OcrResult {
            accepted: false,
            provider: OCR_PROVIDER_WINDOWS.to_string(),
            text: None,
            chars: 0,
            lines: 0,
            error: Some(format!("Failed to launch OCR process: {e}")),
        },
    }
}

#[tauri::command]
pub fn clear_screen_text(manager: tauri::State<'_, OcrManager>) -> bool {
    *manager.last_ocr_text.lock().unwrap_or_else(|e| e.into_inner()) = None;
    *manager.last_ocr_chars.lock().unwrap_or_else(|e| e.into_inner()) = 0;
    *manager.last_ocr_lines.lock().unwrap_or_else(|e| e.into_inner()) = 0;
    *manager.last_ocr_provider.lock().unwrap_or_else(|e| e.into_inner()) = None;
    *manager.last_ocr_at.lock().unwrap_or_else(|e| e.into_inner()) = None;
    true
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ocr_status_serializes_not_compiled() {
        let status = OcrStatus {
            available: false,
            provider: "not_compiled".to_string(),
            configured: false,
            error: Some("not compiled".to_string()),
        };
        let json = serde_json::to_string(&status).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["available"], false);
        assert_eq!(v["provider"], "not_compiled");
        assert_eq!(v["configured"], false);
        assert!(v["error"].as_str().unwrap().contains("not compiled"));
    }

    #[test]
    fn ocr_status_serializes_available() {
        let status = OcrStatus {
            available: true,
            provider: "windows_ocr".to_string(),
            configured: true,
            error: None,
        };
        let json = serde_json::to_string(&status).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["available"], true);
        assert_eq!(v["provider"], "windows_ocr");
        assert_eq!(v["configured"], true);
        assert!(v["error"].is_null());
    }

    #[test]
    fn ocr_result_serializes_failure_safely() {
        let result = OcrResult {
            accepted: false,
            provider: "not_compiled".to_string(),
            text: None,
            chars: 0,
            lines: 0,
            error: Some("not compiled".to_string()),
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["accepted"], false);
        assert!(v["text"].is_null());
        assert_eq!(v["chars"], 0);
        assert_eq!(v["lines"], 0);
        assert!(v["error"].as_str().unwrap().contains("not compiled"));
    }

    #[test]
    fn ocr_result_serializes_success() {
        let result = OcrResult {
            accepted: true,
            provider: "windows_ocr".to_string(),
            text: Some("Hello world\nSecond line".to_string()),
            chars: 22,
            lines: 2,
            error: None,
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["accepted"], true);
        assert_eq!(v["chars"], 22);
        assert_eq!(v["lines"], 2);
        assert!(v["error"].is_null());
        assert!(v["text"].as_str().unwrap().contains("Hello world"));
    }

    #[test]
    fn ocr_result_has_no_image_data_fields() {
        let result = OcrResult {
            accepted: true,
            provider: "windows_ocr".to_string(),
            text: Some("some extracted text".to_string()),
            chars: 19,
            lines: 1,
            error: None,
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        assert!(!json.contains("pixels"), "must not contain pixels field");
        assert!(!json.contains("base64"), "must not contain base64 field");
        assert!(!json.contains("data:image"), "must not contain data URI");
        assert!(!json.contains("image_data"), "must not contain image_data");
    }

    #[test]
    fn ocr_manager_starts_empty() {
        let mgr = OcrManager::new();
        assert!(mgr.last_ocr_text.lock().unwrap().is_none());
        assert_eq!(*mgr.last_ocr_chars.lock().unwrap(), 0);
        assert_eq!(*mgr.last_ocr_lines.lock().unwrap(), 0);
        assert!(mgr.last_ocr_provider.lock().unwrap().is_none());
        assert!(mgr.last_ocr_at.lock().unwrap().is_none());
    }

    #[test]
    fn clear_logic_clears_all_fields() {
        let mgr = OcrManager::new();
        *mgr.last_ocr_text.lock().unwrap() = Some("some text".to_string());
        *mgr.last_ocr_chars.lock().unwrap() = 9;
        *mgr.last_ocr_lines.lock().unwrap() = 1;
        *mgr.last_ocr_provider.lock().unwrap() = Some("windows_ocr".to_string());
        *mgr.last_ocr_at.lock().unwrap() = Some(12345678);

        // Mirror clear_screen_text logic without Tauri state.
        *mgr.last_ocr_text.lock().unwrap() = None;
        *mgr.last_ocr_chars.lock().unwrap() = 0;
        *mgr.last_ocr_lines.lock().unwrap() = 0;
        *mgr.last_ocr_provider.lock().unwrap() = None;
        *mgr.last_ocr_at.lock().unwrap() = None;

        assert!(mgr.last_ocr_text.lock().unwrap().is_none());
        assert_eq!(*mgr.last_ocr_chars.lock().unwrap(), 0);
        assert_eq!(*mgr.last_ocr_lines.lock().unwrap(), 0);
        assert!(mgr.last_ocr_provider.lock().unwrap().is_none());
        assert!(mgr.last_ocr_at.lock().unwrap().is_none());
    }

    #[test]
    fn path_validation_accepts_lisa_managed_screenshot() {
        let temp = std::env::temp_dir();
        let path = temp.join("lisa_screen_1700000000000.png");
        assert!(
            is_lisa_managed_screenshot(&path.to_string_lossy()),
            "should accept lisa-managed screenshot: {}",
            path.display()
        );
    }

    #[test]
    fn path_validation_rejects_arbitrary_path() {
        assert!(
            !is_lisa_managed_screenshot("C:/Users/user/Desktop/photo.png"),
            "should reject arbitrary desktop path"
        );
        assert!(
            !is_lisa_managed_screenshot("C:/Windows/System32/cmd.exe"),
            "should reject system path"
        );
    }

    #[test]
    fn path_validation_rejects_wrong_prefix() {
        let temp = std::env::temp_dir();
        let path = temp.join("evil_screen_1700000000000.png");
        assert!(
            !is_lisa_managed_screenshot(&path.to_string_lossy()),
            "should reject non-lisa prefix"
        );
    }

    #[test]
    fn path_validation_rejects_wrong_extension() {
        let temp = std::env::temp_dir();
        let path = temp.join("lisa_screen_1700000000000.jpg");
        assert!(
            !is_lisa_managed_screenshot(&path.to_string_lossy()),
            "should reject non-png extension"
        );
    }

    #[test]
    fn path_validation_rejects_empty_path() {
        assert!(!is_lisa_managed_screenshot(""), "empty path must be rejected");
    }

    #[test]
    fn line_count_matches_text_content() {
        let text = "line one\nline two\nline three";
        let lines = text.lines().count();
        assert_eq!(lines, 3);
        let chars = text.chars().count();
        assert_eq!(chars, 28);
    }

    #[test]
    fn line_count_empty_text_is_zero() {
        let text = "";
        let lines = if text.is_empty() { 0 } else { text.lines().count() };
        assert_eq!(lines, 0);
    }

    #[cfg(not(feature = "ocr"))]
    #[test]
    fn provider_not_compiled_constant_is_correct() {
        assert_eq!(OCR_PROVIDER_NOT_COMPILED, "not_compiled");
    }
}
