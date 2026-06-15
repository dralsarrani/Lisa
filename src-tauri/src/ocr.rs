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
#[cfg(any(test, all(windows, feature = "ocr")))]
use std::ffi::OsString;
#[cfg(any(test, all(windows, feature = "ocr")))]
use std::path::Path;
#[cfg(all(windows, feature = "ocr"))]
use std::path::PathBuf;
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

#[cfg(any(test, all(windows, feature = "ocr")))]
const WINDOWS_OCR_SCRIPT: &str = r#"param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ImagePath
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
    $null = [Windows.Storage.StorageFile,Windows.Foundation,ContentType=WindowsRuntime]
    $null = [Windows.Storage.Streams.IRandomAccessStream,Windows.Foundation,ContentType=WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
    $null = [Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime]

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and
        $_.IsGenericMethod -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1)

    function Await-Operation($Operation, [Type]$ResultType) {
        $task = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
        $task.GetAwaiter().GetResult()
    }

    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($null -eq $engine) {
        throw 'LISA_OCR_ENGINE_UNAVAILABLE'
    }

    $file = Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
    $stream = Await-Operation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-Operation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await-Operation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

    [PSCustomObject]@{
        ok = $true
        text = [string]$result.Text
    } | ConvertTo-Json -Compress
} catch {
    $code = if ($_.Exception.Message -like '*LISA_OCR_ENGINE_UNAVAILABLE*') {
        'OCR_ENGINE_UNAVAILABLE'
    } elseif (
        $_.Exception.Message -like '*cannot find*' -or
        $_.Exception.Message -like '*not found*' -or
        $_.Exception.Message -like '*access*'
    ) {
        'IMAGE_ACCESS_ERROR'
    } else {
        'OCR_RUNTIME_ERROR'
    }

    [PSCustomObject]@{
        ok = $false
        code = $code
    } | ConvertTo-Json -Compress
    exit 1
}
"#;

#[cfg(any(test, all(windows, feature = "ocr")))]
#[derive(Debug, Deserialize)]
struct PowerShellOcrResponse {
    ok: bool,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    code: Option<String>,
}

#[cfg(any(test, all(windows, feature = "ocr")))]
fn build_powershell_ocr_args(script_path: &Path, image_path: &str) -> Vec<OsString> {
    vec![
        OsString::from("-NoProfile"),
        OsString::from("-NonInteractive"),
        OsString::from("-ExecutionPolicy"),
        OsString::from("Bypass"),
        OsString::from("-File"),
        script_path.as_os_str().to_os_string(),
        OsString::from(image_path),
    ]
}

#[cfg(any(test, all(windows, feature = "ocr")))]
fn safe_ocr_error_for_code(code: Option<&str>) -> String {
    match code {
        Some("OCR_ENGINE_UNAVAILABLE") => {
            "OCR failed: Windows OCR engine is unavailable on this system.".to_string()
        }
        Some("IMAGE_ACCESS_ERROR") => {
            "OCR failed: screenshot file is missing or not accessible. Capture the screen again."
                .to_string()
        }
        _ => "OCR failed: Windows OCR engine returned a PowerShell error. See terminal logs for details."
            .to_string(),
    }
}

#[cfg(any(test, all(windows, feature = "ocr")))]
fn sanitize_powershell_failure(stderr: &str) -> String {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("parsererror")
        || lower.contains("unexpected token")
        || lower.contains("missing closing")
        || lower.contains("terminatorexpectedatendofstring")
    {
        return "OCR failed: PowerShell script parse error. The local OCR helper could not be parsed."
            .to_string();
    }
    if lower.contains("ocr_engine_unavailable") {
        return safe_ocr_error_for_code(Some("OCR_ENGINE_UNAVAILABLE"));
    }
    if lower.contains("cannot find")
        || lower.contains("not found")
        || lower.contains("access is denied")
    {
        return safe_ocr_error_for_code(Some("IMAGE_ACCESS_ERROR"));
    }
    safe_ocr_error_for_code(None)
}

#[cfg(any(test, all(windows, feature = "ocr")))]
fn parse_powershell_ocr_output(
    stdout: &str,
    stderr: &str,
    process_succeeded: bool,
) -> Result<String, String> {
    let json = stdout.trim().trim_start_matches('\u{feff}');
    match serde_json::from_str::<PowerShellOcrResponse>(json) {
        Ok(response) if response.ok && process_succeeded => Ok(response.text.unwrap_or_default()),
        Ok(response) if !response.ok => Err(safe_ocr_error_for_code(response.code.as_deref())),
        Ok(_) => Err(safe_ocr_error_for_code(None)),
        Err(_) if !process_succeeded => Err(sanitize_powershell_failure(stderr)),
        Err(_) => Err("OCR failed: Windows OCR engine returned an invalid response.".to_string()),
    }
}

#[cfg(any(test, all(windows, feature = "ocr")))]
fn text_counts(text: &str) -> (usize, usize) {
    let chars = text.chars().count();
    let lines = if text.is_empty() {
        0
    } else {
        text.lines().count()
    };
    (chars, lines)
}

#[cfg(all(windows, feature = "ocr"))]
fn write_windows_ocr_script() -> Result<PathBuf, String> {
    use std::io::Write;

    let script_path = std::env::temp_dir().join(format!("lisa_ocr_{}.ps1", uuid::Uuid::new_v4()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&script_path)
        .map_err(|_| "OCR failed: could not prepare the local Windows OCR helper.".to_string())?;
    file.write_all(WINDOWS_OCR_SCRIPT.as_bytes()).map_err(|_| {
        let _ = std::fs::remove_file(&script_path);
        "OCR failed: could not prepare the local Windows OCR helper.".to_string()
    })?;
    Ok(script_path)
}

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
            error: Some("OCR is only supported on Windows in this build.".to_string()),
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
pub fn run_screen_ocr(image_path: String, manager: tauri::State<'_, OcrManager>) -> OcrResult {
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
            error: Some(
                "OCR failed: screenshot file is missing or not accessible. Capture the screen again."
                    .to_string(),
            ),
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
fn run_windows_ocr(image_path: &str, manager: tauri::State<'_, OcrManager>) -> OcrResult {
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    let script_path = match write_windows_ocr_script() {
        Ok(path) => path,
        Err(error) => {
            return OcrResult {
                accepted: false,
                provider: OCR_PROVIDER_WINDOWS.to_string(),
                text: None,
                chars: 0,
                lines: 0,
                error: Some(error),
            };
        }
    };
    let output = Command::new("powershell.exe")
        .args(build_powershell_ocr_args(&script_path, image_path))
        .output();
    let _ = std::fs::remove_file(&script_path);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let stderr = String::from_utf8_lossy(&o.stderr);
            let text = match parse_powershell_ocr_output(&stdout, &stderr, o.status.success()) {
                Ok(text) => text,
                Err(error) => {
                    eprintln!(
                        "Windows OCR process failed: exit_success={} error_class=safe_ocr_failure",
                        o.status.success()
                    );
                    return OcrResult {
                        accepted: false,
                        provider: OCR_PROVIDER_WINDOWS.to_string(),
                        text: None,
                        chars: 0,
                        lines: 0,
                        error: Some(error),
                    };
                }
            };
            let (chars, lines) = text_counts(&text);

            // Store in manager (transient — not persisted).
            *manager
                .last_ocr_text
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(text.clone());
            *manager
                .last_ocr_chars
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = chars;
            *manager
                .last_ocr_lines
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = lines;
            *manager
                .last_ocr_provider
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(OCR_PROVIDER_WINDOWS.to_string());
            *manager
                .last_ocr_at
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(now);

            OcrResult {
                accepted: true,
                provider: OCR_PROVIDER_WINDOWS.to_string(),
                text: Some(text),
                chars,
                lines,
                error: None,
            }
        }
        Err(_) => OcrResult {
            accepted: false,
            provider: OCR_PROVIDER_WINDOWS.to_string(),
            text: None,
            chars: 0,
            lines: 0,
            error: Some(
                "OCR failed: Windows PowerShell could not be started on this system.".to_string(),
            ),
        },
    }
}

#[tauri::command]
pub fn clear_screen_text(manager: tauri::State<'_, OcrManager>) -> bool {
    *manager
        .last_ocr_text
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = None;
    *manager
        .last_ocr_chars
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = 0;
    *manager
        .last_ocr_lines
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = 0;
    *manager
        .last_ocr_provider
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = None;
    *manager
        .last_ocr_at
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = None;
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
        assert!(
            !is_lisa_managed_screenshot(""),
            "empty path must be rejected"
        );
    }

    #[test]
    fn line_count_matches_text_content() {
        let text = "line one\nline two\nline three";
        let (chars, lines) = text_counts(text);
        assert_eq!(lines, 3);
        assert_eq!(chars, 28);
    }

    #[test]
    fn line_count_empty_text_is_zero() {
        let (chars, lines) = text_counts("");
        assert_eq!(lines, 0);
        assert_eq!(chars, 0);
    }

    #[test]
    fn powershell_args_pass_image_path_as_a_separate_argument() {
        let script_path = Path::new("C:/Temp/lisa_ocr_helper.ps1");
        let image_path = "C:/Temp/lisa_screen_'quoted'.png";
        let args = build_powershell_ocr_args(script_path, image_path);
        assert_eq!(args.last().unwrap(), image_path);
        assert!(WINDOWS_OCR_SCRIPT.contains("$ImagePath"));
        assert!(!WINDOWS_OCR_SCRIPT.contains(image_path));
        assert!(WINDOWS_OCR_SCRIPT.contains("System.Text.UTF8Encoding"));
    }

    #[test]
    fn parses_valid_ocr_json_and_counts_text() {
        let text =
            parse_powershell_ocr_output(r#"{"ok":true,"text":"Hello\nWorld"}"#, "", true).unwrap();
        assert_eq!(text, "Hello\nWorld");
        assert_eq!(text_counts(&text), (11, 2));
    }

    #[test]
    fn parses_valid_empty_ocr_json() {
        let text = parse_powershell_ocr_output(r#"{"ok":true,"text":""}"#, "", true).unwrap();
        assert!(text.is_empty());
        assert_eq!(text_counts(&text), (0, 0));
    }

    #[test]
    fn rejects_invalid_success_stdout() {
        let error = parse_powershell_ocr_output("not json", "", true).unwrap_err();
        assert_eq!(
            error,
            "OCR failed: Windows OCR engine returned an invalid response."
        );
    }

    #[test]
    fn classifies_powershell_parse_failure_without_echoing_source() {
        let stderr = "try {\nAt helper.ps1:1 char:1\n+ CategoryInfo : ParserError";
        let error = parse_powershell_ocr_output("", stderr, false).unwrap_err();
        assert!(error.contains("PowerShell script parse error"));
        assert!(!error.contains("try {"));
    }

    #[test]
    fn raw_try_line_never_becomes_the_user_error() {
        let error = sanitize_powershell_failure("try {");
        assert_ne!(error, "OCR failed: try {");
        assert!(error.contains("PowerShell error"));
    }

    #[test]
    fn maps_structured_engine_and_path_errors() {
        let unavailable = parse_powershell_ocr_output(
            r#"{"ok":false,"code":"OCR_ENGINE_UNAVAILABLE"}"#,
            "",
            false,
        )
        .unwrap_err();
        assert!(unavailable.contains("unavailable on this system"));

        let path_error =
            parse_powershell_ocr_output(r#"{"ok":false,"code":"IMAGE_ACCESS_ERROR"}"#, "", false)
                .unwrap_err();
        assert!(path_error.contains("Capture the screen again"));
    }

    #[cfg(not(feature = "ocr"))]
    #[test]
    fn provider_not_compiled_constant_is_correct() {
        assert_eq!(OCR_PROVIDER_NOT_COMPILED, "not_compiled");
    }
}
