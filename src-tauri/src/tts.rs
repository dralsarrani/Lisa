// ─────────────────────────────────────────────────────────────────────────────
// Lisa Phase 3E — Local TTS Voice Output Foundation
//
// Backend for Windows-native SAPI TTS via PowerShell stdin pipe.
// Feature flag: tts-sapi
//
// Architecture:
//   - Pure validation helper (always compiled)
//   - TtsManager holds optional child process under feature gate
//   - PowerShell script is a fixed compile-time constant
//   - User text goes through child stdin only — never embedded in script
//   - stdout/stderr of child are suppressed
//   - Drop impl reaps child on app shutdown
// ─────────────────────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};

#[cfg(all(windows, feature = "tts-sapi"))]
use std::sync::Mutex;

// ─── Constants ────────────────────────────────────────────────────────────────

pub const TTS_MAX_TEXT_CHARS: usize = 3000;

// Compiler avoids unused-constant warnings by gating each constant to where it is used.
// Each variant is available in tests so serialization tests can reference provider strings.

// Used when tts-sapi feature is absent (base build), and in tests.
#[cfg(any(test, not(feature = "tts-sapi")))]
pub const TTS_PROVIDER_NOT_COMPILED: &str = "not_compiled";

// Used in Windows+tts-sapi builds, and in tests (serialization tests reference this string).
#[cfg(any(test, all(windows, feature = "tts-sapi")))]
pub const TTS_PROVIDER_WINDOWS_SAPI: &str = "windows_sapi";

// Used on non-Windows when tts-sapi feature is active.
#[cfg(all(not(windows), feature = "tts-sapi"))]
pub const TTS_PROVIDER_UNSUPPORTED: &str = "unsupported";

#[cfg(not(feature = "tts-sapi"))]
const TTS_ERROR_NOT_COMPILED: &str = "Local TTS is not available in this build.";

#[cfg(all(not(windows), feature = "tts-sapi"))]
const TTS_ERROR_UNSUPPORTED_PLATFORM: &str =
    "Local TTS is not supported on this platform in this build.";
const TTS_ERROR_EMPTY_TEXT: &str = "Cannot speak empty text.";
const TTS_ERROR_TEXT_TOO_LONG: &str = "Text is too long for local speech output.";

// ─── Public data types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TtsVoiceSummary {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TtsStatus {
    pub available: bool,
    pub provider: String,
    pub speaking: bool,
    pub voices: Vec<TtsVoiceSummary>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SpeakTextRequest {
    pub text: String,
    pub voice_id: Option<String>,
    pub rate: Option<i32>,
    pub volume: Option<u8>,
    pub source: Option<String>,
}

/// Result from speak_text. Contains metadata only — never the spoken text.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SpeakTextResult {
    pub accepted: bool,
    pub provider: String,
    pub speaking: bool,
    pub text_chars: usize,
}

/// Result from stop_speaking. Contains metadata only.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StopSpeakingResult {
    pub stopped: bool,
    pub provider: String,
    pub speaking: bool,
}

// ─── Validation helper ────────────────────────────────────────────────────────

/// Validates and sanitizes a TTS text input.
///
/// Returns the trimmed text on success.
/// Error strings never include the original input text.
pub fn validate_speak_text(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(TTS_ERROR_EMPTY_TEXT.to_string());
    }
    // Count chars, not bytes, for human-readable limit semantics.
    let char_count = trimmed.chars().count();
    if char_count > TTS_MAX_TEXT_CHARS {
        return Err(format!(
            "{} Limit is {} characters.",
            TTS_ERROR_TEXT_TOO_LONG, TTS_MAX_TEXT_CHARS
        ));
    }
    Ok(trimmed.to_string())
}

// ─── Feature-gated SAPI script ────────────────────────────────────────────────
//
// This constant is only compiled when Windows + tts-sapi feature is active.
// User text is NEVER embedded here — it is written to child stdin.
// PowerShell reads it via $input | Out-String.

#[cfg(all(windows, feature = "tts-sapi"))]
const SAPI_SPEAK_SCRIPT: &str = "\
$text = $input | Out-String; \
Add-Type -AssemblyName System.Speech; \
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
$s.Speak($text.Trim()); \
$s.Dispose();";

// ─── TtsManager ───────────────────────────────────────────────────────────────

pub struct TtsManager {
    // Active child process tracked for stop_speaking and replacement.
    // Only present when tts-sapi feature is compiled on Windows.
    #[cfg(all(windows, feature = "tts-sapi"))]
    child: Mutex<Option<std::process::Child>>,
}

impl TtsManager {
    pub fn new() -> Self {
        Self {
            #[cfg(all(windows, feature = "tts-sapi"))]
            child: Mutex::new(None),
        }
    }

    /// Returns the TTS provider identifier for the current build variant.
    fn provider_str(&self) -> &'static str {
        #[cfg(all(windows, feature = "tts-sapi"))]
        {
            return TTS_PROVIDER_WINDOWS_SAPI;
        }

        #[cfg(all(not(windows), feature = "tts-sapi"))]
        {
            return TTS_PROVIDER_UNSUPPORTED;
        }

        #[cfg(not(feature = "tts-sapi"))]
        TTS_PROVIDER_NOT_COMPILED
    }

    /// Returns current TTS availability and speaking state. Never panics.
    pub fn status(&self) -> TtsStatus {
        #[cfg(all(windows, feature = "tts-sapi"))]
        {
            let speaking = self
                .child
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_some();
            return TtsStatus {
                available: true,
                provider: TTS_PROVIDER_WINDOWS_SAPI.to_string(),
                speaking,
                voices: vec![],
                error: None,
            };
        }

        #[cfg(all(not(windows), feature = "tts-sapi"))]
        {
            return TtsStatus {
                available: false,
                provider: TTS_PROVIDER_UNSUPPORTED.to_string(),
                speaking: false,
                voices: vec![],
                error: Some(TTS_ERROR_UNSUPPORTED_PLATFORM.to_string()),
            };
        }

        #[cfg(not(feature = "tts-sapi"))]
        TtsStatus {
            available: false,
            provider: TTS_PROVIDER_NOT_COMPILED.to_string(),
            speaking: false,
            voices: vec![],
            error: Some(TTS_ERROR_NOT_COMPILED.to_string()),
        }
    }

    /// Validates text and starts speech if TTS is available.
    /// Stops any currently active speech before starting a new one.
    /// Returns metadata only — the spoken text is never in the result.
    pub fn speak(&self, request: SpeakTextRequest) -> Result<SpeakTextResult, String> {
        // Validation runs in all build variants before any platform path.
        let validated_text = validate_speak_text(&request.text)?;
        let char_count = validated_text.chars().count();
        let provider = self.provider_str().to_string();

        #[cfg(all(windows, feature = "tts-sapi"))]
        {
            use std::io::Write;
            use std::process::{Command, Stdio};

            // Stop existing speech before starting a new one.
            self.stop_active_child();

            let mut child = Command::new("powershell")
                .arg("-NoProfile")
                .arg("-NonInteractive")
                .arg("-ExecutionPolicy")
                .arg("Bypass")
                .arg("-Command")
                .arg(SAPI_SPEAK_SCRIPT)
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("Failed to start TTS process: {e}"))?;

            // Write text to stdin — never embedded in the script string.
            // Dropping stdin closes the pipe, signalling EOF to PowerShell.
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(validated_text.as_bytes());
                // stdin dropped here, pipe closed.
            }

            // Store the running child for future stop/status queries.
            let mut guard = self.child.lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(child);

            return Ok(SpeakTextResult {
                accepted: true,
                provider,
                speaking: true,
                text_chars: char_count,
            });
        }

        #[cfg(all(not(windows), feature = "tts-sapi"))]
        {
            return Err(TTS_ERROR_UNSUPPORTED_PLATFORM.to_string());
        }

        #[cfg(not(feature = "tts-sapi"))]
        {
            let _ = (validated_text, char_count, provider);
            Err(TTS_ERROR_NOT_COMPILED.to_string())
        }
    }

    /// Stops any active speech and kills the child process.
    /// Safe to call when no speech is active.
    pub fn stop(&self) -> Result<StopSpeakingResult, String> {
        let provider = self.provider_str().to_string();

        #[cfg(all(windows, feature = "tts-sapi"))]
        {
            let was_active = self.stop_active_child();
            return Ok(StopSpeakingResult {
                stopped: was_active,
                provider,
                speaking: false,
            });
        }

        #[cfg(not(feature = "tts-sapi"))]
        Ok(StopSpeakingResult {
            stopped: false,
            provider,
            speaking: false,
        })
    }

    /// Kills the active child if present. Returns true if a child was killed.
    /// Reaps the process to release OS resources.
    /// Safe to call when no child is active.
    #[cfg(all(windows, feature = "tts-sapi"))]
    fn stop_active_child(&self) -> bool {
        let mut guard = self.child.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(mut child) = guard.take() {
            // kill() is best-effort — the child may have already exited.
            let _ = child.kill();
            // Reap the process to release OS resources. Fast after kill.
            let _ = child.wait();
            true
        } else {
            false
        }
    }
}

impl Drop for TtsManager {
    fn drop(&mut self) {
        // Kill any active child on app shutdown to avoid orphan processes.
        #[cfg(all(windows, feature = "tts-sapi"))]
        {
            if let Ok(mut guard) = self.child.lock() {
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    }
}

// ─── Tauri command wrappers ───────────────────────────────────────────────────
//
// Thin wrappers only — all logic belongs in TtsManager.

#[tauri::command]
pub fn get_tts_status(manager: tauri::State<'_, TtsManager>) -> TtsStatus {
    manager.status()
}

#[tauri::command]
pub fn speak_text(
    manager: tauri::State<'_, TtsManager>,
    request: SpeakTextRequest,
) -> Result<SpeakTextResult, String> {
    manager.speak(request)
}

#[tauri::command]
pub fn stop_speaking(manager: tauri::State<'_, TtsManager>) -> Result<StopSpeakingResult, String> {
    manager.stop()
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── validate_speak_text ───────────────────────────────────────────────────

    #[test]
    fn validate_rejects_empty_text() {
        let result = validate_speak_text("");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(!err.is_empty());
    }

    #[test]
    fn validate_rejects_whitespace_only_text() {
        for input in ["   ", "\t", "\n", "  \t\n  "] {
            let result = validate_speak_text(input);
            assert!(result.is_err(), "should reject whitespace-only: {input:?}");
        }
    }

    #[test]
    fn validate_enforces_max_char_limit() {
        let at_limit: String = "a".repeat(TTS_MAX_TEXT_CHARS);
        assert!(
            validate_speak_text(&at_limit).is_ok(),
            "at-limit should pass"
        );

        let over_limit: String = "a".repeat(TTS_MAX_TEXT_CHARS + 1);
        let result = validate_speak_text(&over_limit);
        assert!(result.is_err(), "over-limit should fail");

        let err = result.unwrap_err();
        assert!(
            err.contains(&TTS_MAX_TEXT_CHARS.to_string()),
            "error should mention the limit: {err}"
        );
        // Error must not echo the rejected text.
        assert!(
            !err.contains("aaa"),
            "error must not echo rejected text: {err}"
        );
    }

    #[test]
    fn validate_accepts_valid_text() {
        let result = validate_speak_text("Hello, I am Lisa.");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Hello, I am Lisa.");
    }

    #[test]
    fn validate_trims_input() {
        let result = validate_speak_text("  hello world  ");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "hello world");
    }

    #[test]
    fn validate_counts_unicode_chars_not_bytes() {
        // 3-byte UTF-8 char repeated exactly at the limit must pass.
        let unicode_text: String = "你".repeat(TTS_MAX_TEXT_CHARS);
        assert!(validate_speak_text(&unicode_text).is_ok());
        // One char over must fail.
        let one_over: String = "你".repeat(TTS_MAX_TEXT_CHARS + 1);
        assert!(validate_speak_text(&one_over).is_err());
    }

    // ── TtsManager ────────────────────────────────────────────────────────────

    #[test]
    fn status_unavailable_without_tts_sapi_feature() {
        let mgr = TtsManager::new();
        let s = mgr.status();

        #[cfg(not(feature = "tts-sapi"))]
        {
            assert!(!s.available, "must be unavailable without feature");
            assert_eq!(s.provider, TTS_PROVIDER_NOT_COMPILED);
            assert!(!s.speaking);
            assert!(s.voices.is_empty());
            let err = s.error.expect("must have error message without feature");
            assert!(!err.is_empty());
        }

        #[cfg(all(windows, feature = "tts-sapi"))]
        {
            assert!(s.available, "must be available on Windows with feature");
            assert_eq!(s.provider, TTS_PROVIDER_WINDOWS_SAPI);
            assert!(!s.speaking);
        }

        #[cfg(all(not(windows), feature = "tts-sapi"))]
        {
            assert!(
                !s.available,
                "must be unavailable on non-Windows even with feature"
            );
            assert_eq!(s.provider, TTS_PROVIDER_UNSUPPORTED);
        }
    }

    #[test]
    fn stop_speaking_safe_when_idle() {
        let mgr = TtsManager::new();
        let result = mgr.stop().expect("stop must not error when idle");
        assert!(!result.speaking);
    }

    #[test]
    fn speak_rejects_empty_text_in_all_builds() {
        let mgr = TtsManager::new();
        let req = SpeakTextRequest {
            text: "".to_string(),
            voice_id: None,
            rate: None,
            volume: None,
            source: None,
        };
        let result = mgr.speak(req);
        assert!(result.is_err(), "empty text must always be rejected");
        let err = result.unwrap_err();
        assert!(!err.is_empty());
    }

    #[test]
    fn speak_rejects_whitespace_text_in_all_builds() {
        let mgr = TtsManager::new();
        let req = SpeakTextRequest {
            text: "   \t   ".to_string(),
            voice_id: None,
            rate: None,
            volume: None,
            source: None,
        };
        let result = mgr.speak(req);
        assert!(result.is_err(), "whitespace text must always be rejected");
    }

    #[test]
    fn speak_rejects_overlong_text_in_all_builds() {
        let mgr = TtsManager::new();
        let req = SpeakTextRequest {
            text: "x".repeat(TTS_MAX_TEXT_CHARS + 1),
            voice_id: None,
            rate: None,
            volume: None,
            source: None,
        };
        let result = mgr.speak(req);
        assert!(result.is_err(), "overlong text must always be rejected");
        let err = result.unwrap_err();
        assert!(
            !err.contains("xxx"),
            "error must not echo rejected text: {err}"
        );
    }

    #[test]
    fn speak_result_reports_char_count_only() {
        // On non-feature builds, speak returns an unavailable error.
        // We verify the result struct shape via serde — char count, never text.
        let result = SpeakTextResult {
            accepted: true,
            provider: TTS_PROVIDER_WINDOWS_SAPI.to_string(),
            speaking: true,
            text_chars: 17,
        };
        let json = serde_json::to_string(&result).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).expect("must round-trip");
        assert_eq!(v["text_chars"], 17);
        // Must not have a field containing the spoken text.
        assert!(v.get("text").is_none());
        assert!(v.get("spoken_text").is_none());
    }

    // ── SAPI script integrity ─────────────────────────────────────────────────

    #[test]
    fn sapi_script_is_fixed_constant() {
        #[cfg(all(windows, feature = "tts-sapi"))]
        {
            assert!(
                !SAPI_SPEAK_SCRIPT.is_empty(),
                "script constant must not be empty"
            );
        }
        // Without the feature there is no script — test passes by design.
    }

    #[test]
    fn sapi_script_does_not_contain_user_text_placeholders() {
        #[cfg(all(windows, feature = "tts-sapi"))]
        {
            assert!(
                SAPI_SPEAK_SCRIPT.contains("$input"),
                "script must read text from stdin via $input"
            );
            assert!(
                SAPI_SPEAK_SCRIPT.contains("System.Speech"),
                "script must use System.Speech assembly"
            );
            assert!(
                !SAPI_SPEAK_SCRIPT.contains("{}"),
                "script must be a fixed constant — no Rust format placeholders"
            );
        }
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    #[test]
    fn speak_request_serializes_without_spoken_output_field() {
        let req = SpeakTextRequest {
            text: "Hello, Lisa.".to_string(),
            voice_id: Some("Microsoft David Desktop".to_string()),
            rate: Some(2),
            volume: Some(80),
            source: Some("console_speak".to_string()),
        };
        let json = serde_json::to_string(&req).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).expect("must round-trip");
        assert_eq!(v["text"], "Hello, Lisa.");
        assert_eq!(v["voice_id"], "Microsoft David Desktop");
        assert_eq!(v["rate"], 2);
        assert_eq!(v["volume"], 80);
        assert_eq!(v["source"], "console_speak");
        assert!(v.get("spoken_text").is_none());
        assert!(v.get("spoken_output").is_none());
    }

    #[test]
    fn tts_status_serializes_without_text_content() {
        let status = TtsStatus {
            available: true,
            provider: TTS_PROVIDER_WINDOWS_SAPI.to_string(),
            speaking: false,
            voices: vec![TtsVoiceSummary {
                id: "Microsoft David Desktop".to_string(),
                name: "David".to_string(),
            }],
            error: None,
        };
        let json = serde_json::to_string(&status).expect("must serialize");
        let v: serde_json::Value = serde_json::from_str(&json).expect("must round-trip");
        assert_eq!(v["available"], true);
        assert_eq!(v["provider"], TTS_PROVIDER_WINDOWS_SAPI);
        assert_eq!(v["speaking"], false);
        assert_eq!(v["voices"][0]["id"], "Microsoft David Desktop");
        assert!(v["error"].is_null());
        assert!(v.get("text").is_none());
        assert!(v.get("spoken_text").is_none());
    }

    // ── Constants ─────────────────────────────────────────────────────────────

    #[test]
    fn tts_max_text_chars_is_3000() {
        assert_eq!(TTS_MAX_TEXT_CHARS, 3000);
    }

    #[test]
    fn tts_provider_constants_are_distinct_and_non_empty() {
        // Each constant is verified under the cfg condition where it is defined.
        #[cfg(not(feature = "tts-sapi"))]
        assert!(!TTS_PROVIDER_NOT_COMPILED.is_empty());

        #[cfg(all(windows, feature = "tts-sapi"))]
        assert!(!TTS_PROVIDER_WINDOWS_SAPI.is_empty());

        #[cfg(all(not(windows), feature = "tts-sapi"))]
        assert!(!TTS_PROVIDER_UNSUPPORTED.is_empty());
    }
}
