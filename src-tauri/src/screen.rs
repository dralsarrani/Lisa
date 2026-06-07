// ─────────────────────────────────────────────────────────────────────────────
// Lisa Phase 4A — Screen Awareness Foundation
//
// Manual, explicit, local-only screen capture.
// Feature flag: screen-capture
//
// Safety constraints (non-negotiable):
//   - No background capture — every capture is user-initiated
//   - No periodic or automatic capture
//   - No upload to any network service
//   - No base64 or raw pixels sent to frontend or LLM
//   - Audit metadata only (width, height, timestamp, provider)
//   - Temp files stored in OS temp dir; cleared on user request
//   - On non-Windows / without feature flag: returns clean not-available status
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// ─── Public data types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScreenCaptureStatus {
    pub available: bool,
    pub provider: String,
    pub last_capture_id: Option<String>,
    pub last_capture_at: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScreenCaptureResult {
    pub accepted: bool,
    pub capture_id: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub captured_at: u64,
    pub provider: String,
    pub error: Option<String>,
}

// ─── Manager ──────────────────────────────────────────────────────────────────

pub struct ScreenManager {
    pub last_capture_id: Mutex<Option<String>>,
    pub last_capture_at: Mutex<Option<u64>>,
    pub last_capture_path: Mutex<Option<String>>,
}

impl ScreenManager {
    pub fn new() -> Self {
        Self {
            last_capture_id: Mutex::new(None),
            last_capture_at: Mutex::new(None),
            last_capture_path: Mutex::new(None),
        }
    }
}

// ─── Constants ────────────────────────────────────────────────────────────────

#[cfg(all(windows, feature = "screen-capture"))]
pub const SCREEN_PROVIDER_WINDOWS: &str = "windows_capture";

#[cfg(not(feature = "screen-capture"))]
pub const SCREEN_PROVIDER_NOT_COMPILED: &str = "not_compiled";

#[cfg(all(not(windows), feature = "screen-capture"))]
pub const SCREEN_PROVIDER_UNSUPPORTED: &str = "unsupported";

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_screen_capture_status(
    manager: tauri::State<'_, ScreenManager>,
) -> ScreenCaptureStatus {
    #[cfg(all(windows, feature = "screen-capture"))]
    {
        let last_id = manager
            .last_capture_id
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        let last_at = *manager
            .last_capture_at
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        ScreenCaptureStatus {
            available: true,
            provider: SCREEN_PROVIDER_WINDOWS.to_string(),
            last_capture_id: last_id,
            last_capture_at: last_at,
            error: None,
        }
    }
    #[cfg(all(not(windows), feature = "screen-capture"))]
    {
        let _ = &manager;
        ScreenCaptureStatus {
            available: false,
            provider: SCREEN_PROVIDER_UNSUPPORTED.to_string(),
            last_capture_id: None,
            last_capture_at: None,
            error: Some(
                "Screen capture is only supported on Windows in this build.".to_string(),
            ),
        }
    }
    #[cfg(not(feature = "screen-capture"))]
    {
        let _ = &manager;
        ScreenCaptureStatus {
            available: false,
            provider: SCREEN_PROVIDER_NOT_COMPILED.to_string(),
            last_capture_id: None,
            last_capture_at: None,
            error: Some(
                "Screen capture not compiled. Build Lisa with --features screen-capture to enable."
                    .to_string(),
            ),
        }
    }
}

#[tauri::command]
pub fn capture_screen(manager: tauri::State<'_, ScreenManager>) -> ScreenCaptureResult {
    #[cfg(all(windows, feature = "screen-capture"))]
    {
        use std::process::Command;
        use std::time::{SystemTime, UNIX_EPOCH};

        let captured_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let capture_id = format!("sc_{captured_at}");

        // Use OS temp dir for screenshot storage.
        let temp_dir = std::env::temp_dir();
        let filename = format!("lisa_screen_{captured_at}.png");
        let out_path = temp_dir.join(&filename);
        let out_path_str = out_path.to_string_lossy().to_string();

        // PowerShell captures the primary screen to a PNG.
        // Path is constructed internally — no user input enters the script.
        // Only metadata (width, height) is printed to stdout.
        // No base64, no pixel data, no OCR is produced.
        let script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; \
             Add-Type -AssemblyName System.Drawing; \
             $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \
             $b = New-Object System.Drawing.Bitmap($s.Width, $s.Height); \
             $g = [System.Drawing.Graphics]::FromImage($b); \
             $g.CopyFromScreen($s.Location, [System.Drawing.Point]::Empty, $s.Size); \
             $b.Save('{path}'); \
             $g.Dispose(); $b.Dispose(); \
             Write-Output \"width=$($s.Width)\"; \
             Write-Output \"height=$($s.Height)\"",
            path = out_path_str.replace('\'', "''")
        );

        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output();

        match output {
            Ok(o) if o.status.success() => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                let mut width: Option<u32> = None;
                let mut height: Option<u32> = None;
                for line in stdout.lines() {
                    if let Some(w) = line.strip_prefix("width=") {
                        width = w.trim().parse().ok();
                    }
                    if let Some(h) = line.strip_prefix("height=") {
                        height = h.trim().parse().ok();
                    }
                }

                *manager
                    .last_capture_id
                    .lock()
                    .unwrap_or_else(|e| e.into_inner()) = Some(capture_id.clone());
                *manager
                    .last_capture_at
                    .lock()
                    .unwrap_or_else(|e| e.into_inner()) = Some(captured_at);
                *manager
                    .last_capture_path
                    .lock()
                    .unwrap_or_else(|e| e.into_inner()) = Some(out_path_str);

                ScreenCaptureResult {
                    accepted: true,
                    capture_id,
                    width,
                    height,
                    captured_at,
                    provider: SCREEN_PROVIDER_WINDOWS.to_string(),
                    error: None,
                }
            }
            Ok(o) => {
                let stderr = String::from_utf8_lossy(&o.stderr);
                ScreenCaptureResult {
                    accepted: false,
                    capture_id,
                    width: None,
                    height: None,
                    captured_at,
                    provider: SCREEN_PROVIDER_WINDOWS.to_string(),
                    error: Some(format!("Screen capture failed: {}", stderr.trim())),
                }
            }
            Err(e) => ScreenCaptureResult {
                accepted: false,
                capture_id,
                width: None,
                height: None,
                captured_at,
                provider: SCREEN_PROVIDER_WINDOWS.to_string(),
                error: Some(format!("Failed to launch screen capture: {e}")),
            },
        }
    }
    #[cfg(all(not(windows), feature = "screen-capture"))]
    {
        let _ = &manager;
        use std::time::{SystemTime, UNIX_EPOCH};
        let captured_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        ScreenCaptureResult {
            accepted: false,
            capture_id: format!("sc_{captured_at}"),
            width: None,
            height: None,
            captured_at,
            provider: SCREEN_PROVIDER_UNSUPPORTED.to_string(),
            error: Some("Screen capture is only supported on Windows in this build.".to_string()),
        }
    }
    #[cfg(not(feature = "screen-capture"))]
    {
        let _ = &manager;
        use std::time::{SystemTime, UNIX_EPOCH};
        let captured_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        ScreenCaptureResult {
            accepted: false,
            capture_id: format!("sc_{captured_at}"),
            width: None,
            height: None,
            captured_at,
            provider: SCREEN_PROVIDER_NOT_COMPILED.to_string(),
            error: Some(
                "Screen capture not compiled. Build Lisa with --features screen-capture to enable."
                    .to_string(),
            ),
        }
    }
}

#[tauri::command]
pub fn clear_screen_capture(manager: tauri::State<'_, ScreenManager>) -> bool {
    let path_opt = manager
        .last_capture_path
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    if let Some(path) = path_opt {
        let _ = std::fs::remove_file(&path);
    }
    *manager
        .last_capture_id
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = None;
    *manager
        .last_capture_at
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = None;
    *manager
        .last_capture_path
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = None;
    true
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn screen_capture_status_serializes() {
        let status = ScreenCaptureStatus {
            available: false,
            provider: "not_compiled".to_string(),
            last_capture_id: None,
            last_capture_at: None,
            error: Some("not compiled".to_string()),
        };
        let json = serde_json::to_string(&status).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["available"], false);
        assert_eq!(v["provider"], "not_compiled");
        assert!(v["last_capture_id"].is_null());
        assert!(v["last_capture_at"].is_null());
        assert!(v["error"].as_str().unwrap().contains("not compiled"));
    }

    #[test]
    fn screen_capture_result_serializes_failure() {
        let result = ScreenCaptureResult {
            accepted: false,
            capture_id: "sc_123".to_string(),
            width: None,
            height: None,
            captured_at: 1_700_000_000_000,
            provider: "not_compiled".to_string(),
            error: Some("not compiled".to_string()),
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["accepted"], false);
        assert_eq!(v["capture_id"], "sc_123");
        assert!(v["width"].is_null());
        assert!(v["height"].is_null());
        assert_eq!(v["captured_at"], 1_700_000_000_000_u64);
        assert!(v["error"].as_str().unwrap().contains("not compiled"));
    }

    #[test]
    fn screen_capture_result_serializes_success() {
        let result = ScreenCaptureResult {
            accepted: true,
            capture_id: "sc_456".to_string(),
            width: Some(1920),
            height: Some(1080),
            captured_at: 1_700_000_001_000,
            provider: "windows_capture".to_string(),
            error: None,
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["accepted"], true);
        assert_eq!(v["width"], 1920);
        assert_eq!(v["height"], 1080);
        assert!(v["error"].is_null());
    }

    #[test]
    fn screen_manager_starts_empty() {
        let mgr = ScreenManager::new();
        assert!(mgr.last_capture_id.lock().unwrap().is_none());
        assert!(mgr.last_capture_at.lock().unwrap().is_none());
        assert!(mgr.last_capture_path.lock().unwrap().is_none());
    }

    #[test]
    fn clear_logic_is_safe_when_path_missing() {
        let mgr = ScreenManager::new();
        *mgr.last_capture_id.lock().unwrap() = Some("sc_999".to_string());
        *mgr.last_capture_at.lock().unwrap() = Some(12345678);
        *mgr.last_capture_path.lock().unwrap() =
            Some("/nonexistent/path/to/file.png".to_string());

        // Mirror clear_screen_capture logic without Tauri state.
        let path_opt = mgr.last_capture_path.lock().unwrap().clone();
        if let Some(path) = path_opt {
            let _ = std::fs::remove_file(&path);
        }
        *mgr.last_capture_id.lock().unwrap() = None;
        *mgr.last_capture_at.lock().unwrap() = None;
        *mgr.last_capture_path.lock().unwrap() = None;

        assert!(mgr.last_capture_id.lock().unwrap().is_none());
        assert!(mgr.last_capture_at.lock().unwrap().is_none());
        assert!(mgr.last_capture_path.lock().unwrap().is_none());
    }

    #[test]
    fn capture_result_has_no_image_data_fields() {
        let result = ScreenCaptureResult {
            accepted: true,
            capture_id: "sc_test".to_string(),
            width: Some(800),
            height: Some(600),
            captured_at: 0,
            provider: "windows_capture".to_string(),
            error: None,
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        assert!(!json.contains("pixels"), "result must not contain raw pixels field");
        assert!(!json.contains("base64"), "result must not contain base64 field");
        assert!(!json.contains("data:image"), "result must not contain data URI");
        assert!(!json.contains("image_data"), "result must not contain image_data field");
    }

    #[cfg(not(feature = "screen-capture"))]
    #[test]
    fn provider_not_compiled_constant_is_correct() {
        assert_eq!(SCREEN_PROVIDER_NOT_COMPILED, "not_compiled");
    }
}
