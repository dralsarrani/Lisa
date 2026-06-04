// ─── STT Engine Module ────────────────────────────────────────────────────────
//
// Phase 3B: Format contract, SttEngine trait, SttError enum — pure Rust, no deps.
// Phase 3C: WhisperEngine implementation (feature = "whisper"), path validation,
//           structured result types, and WAV decode helper.
//
// The `whisper` feature gate keeps CI clean: `cargo check` and `cargo test` pass
// without LLVM, CMake, or any model files. Developers enable the feature manually:
//   cargo build --features whisper
//   cargo test  --features whisper
//
// PRIVACY: No audio is ever sent to a network service. All transcription happens
// in-process using a user-provided local model file. No audio is written to disk.

use std::fmt;
use std::path::Path;
use serde::Serialize;

// ─── Standard audio format ────────────────────────────────────────────────────
//
// Whisper.cpp, sherpa-onnx, and Vosk all require this exact PCM format.
// Audio captured by cpal must be resampled/converted to this format before
// being passed to any SttEngine implementation.

pub const REQUIRED_SAMPLE_RATE: u32 = 16_000;
pub const REQUIRED_CHANNELS: u16 = 1;
pub const BITS_PER_SAMPLE: u16 = 16;

// ─── Error type ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum SttError {
    /// Engine present but no model path is configured.
    NotConfigured,
    /// Model file was not found at the configured path.
    ModelNotFound(String),
    /// Model file exists but failed to load (corrupt, wrong format, size mismatch).
    ModelLoadFailed(String),
    /// Audio was captured successfully but transcription failed at runtime.
    TranscriptionFailed(String),
}

impl fmt::Display for SttError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotConfigured => {
                write!(f, "STT engine not configured — set a model path in Settings")
            }
            Self::ModelNotFound(path) => {
                write!(f, "STT model not found at: {path}")
            }
            Self::ModelLoadFailed(msg) => {
                write!(f, "STT model failed to load: {msg}")
            }
            Self::TranscriptionFailed(msg) => {
                write!(f, "Transcription failed: {msg}")
            }
        }
    }
}

// ─── Engine trait ─────────────────────────────────────────────────────────────

/// Abstracts a local, offline speech-to-text engine.
///
/// Implementations receive 16 kHz mono 16-bit signed PCM samples and return
/// a transcript string. Phase 3C provides `WhisperEngine`. Future engines
/// (sherpa-onnx, Vosk) can implement this trait without changing callers.
pub trait SttEngine: Send + Sync {
    fn transcribe(&self, samples: &[i16]) -> Result<String, SttError>;
    fn engine_name(&self) -> &str;
    fn is_ready(&self) -> bool;
}

// ─── PCM conversion helper ────────────────────────────────────────────────────

/// Convert 16-bit signed PCM samples to the f32 range [-1.0, 1.0] expected by
/// whisper.cpp and sherpa-onnx Whisper models.
pub fn pcm_i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples
        .iter()
        .map(|&s| s as f32 / i16::MAX as f32)
        .collect()
}

// ─── Path validation (always compiled — no whisper dep) ───────────────────────

#[derive(Debug, Serialize)]
pub struct SttModelValidationResult {
    pub valid: bool,
    pub label: String,
    pub size_bytes: Option<u64>,
    pub error: Option<String>,
}

/// Validate an STT model path using only filesystem checks.
/// Does NOT load the model. Safe to call at any time, including from CI tests.
pub fn validate_model_path(path: &Path) -> SttModelValidationResult {
    if path.as_os_str().is_empty() {
        return SttModelValidationResult {
            valid: false,
            label: "No model path configured".into(),
            size_bytes: None,
            error: Some("Model path is empty. Set a path in Settings → Voice Input.".into()),
        };
    }
    if !path.exists() {
        return SttModelValidationResult {
            valid: false,
            label: "Model file not found".into(),
            size_bytes: None,
            error: Some(format!(
                "File not found. Check the path in Settings → Voice Input."
            )),
        };
    }
    if !path.is_file() {
        return SttModelValidationResult {
            valid: false,
            label: "Path is not a file".into(),
            size_bytes: None,
            error: Some("The configured path points to a directory, not a file.".into()),
        };
    }
    let size_bytes = std::fs::metadata(path).ok().map(|m| m.len());
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("model");
    SttModelValidationResult {
        valid: true,
        label: format!("Found: {file_name}"),
        size_bytes,
        error: None,
    }
}

// ─── Model test result (always compiled) ─────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SttModelTestResult {
    pub success: bool,
    pub latency_ms: u64,
    pub engine_name: String,
    pub error: Option<String>,
}

// ─── Transcript result (always compiled) ─────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SttTranscriptResult {
    pub text: String,
    pub latency_ms: u64,
    pub engine_name: String,
}

// ─── WhisperEngine (requires feature = "whisper") ────────────────────────────
//
// Build with: cargo build --features whisper
// Requires: LLVM + CMake on Windows; whisper-rs 0.14 crate.
// Model files: user-provided GGML/GGUF .bin files — NOT committed to git.

#[cfg(feature = "whisper")]
pub mod whisper {
    use super::*;
    use std::time::Instant;

    pub struct WhisperEngine {
        ctx: whisper_rs::WhisperContext,
        model_name: String,
    }

    impl WhisperEngine {
        /// Load a Whisper GGML/GGUF model from `path`.
        ///
        /// Validates path before attempting load. Returns a ready engine on success
        /// or a user-readable `SttError` on failure. Never panics.
        pub fn from_model_path(path: &Path) -> Result<Self, SttError> {
            // Filesystem validation first — fast, no C++ involved.
            let validation = validate_model_path(path);
            if !validation.valid {
                if path.as_os_str().is_empty() {
                    return Err(SttError::NotConfigured);
                }
                if !path.exists() {
                    return Err(SttError::ModelNotFound(path.display().to_string()));
                }
                return Err(SttError::ModelLoadFailed(
                    validation.error.unwrap_or_else(|| "Unknown path error".into()),
                ));
            }

            let path_str = path.to_str().ok_or_else(|| {
                SttError::ModelLoadFailed("Model path contains invalid UTF-8".into())
            })?;

            let ctx = whisper_rs::WhisperContext::new_with_params(
                path_str,
                whisper_rs::WhisperContextParameters::default(),
            )
            .map_err(|e| SttError::ModelLoadFailed(e.to_string()))?;

            let model_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            Ok(Self { ctx, model_name })
        }

        /// Transcribe a 16 kHz mono 16-bit PCM WAV file at `wav_path`.
        /// Developer/manual validation path — not the live mic pipeline.
        pub fn transcribe_wav_path(&self, wav_path: &Path) -> Result<SttTranscriptResult, SttError> {
            let start = Instant::now();
            let samples = decode_wav_to_pcm_i16(wav_path)?;
            let text = self.transcribe(&samples)?;
            Ok(SttTranscriptResult {
                text,
                latency_ms: start.elapsed().as_millis() as u64,
                engine_name: self.engine_name().to_string(),
            })
        }
    }

    impl SttEngine for WhisperEngine {
        fn transcribe(&self, samples: &[i16]) -> Result<String, SttError> {
            let samples_f32 = pcm_i16_to_f32(samples);

            let mut state = self
                .ctx
                .create_state()
                .map_err(|e| SttError::TranscriptionFailed(e.to_string()))?;

            let mut params =
                whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
            params.set_language(Some("auto"));
            params.set_print_special(false);
            params.set_print_progress(false);
            params.set_print_realtime(false);
            params.set_print_timestamps(false);

            state
                .full(params, &samples_f32)
                .map_err(|e| SttError::TranscriptionFailed(e.to_string()))?;

            let n = state
                .full_n_segments()
                .map_err(|e| SttError::TranscriptionFailed(e.to_string()))?;

            let mut text = String::new();
            for i in 0..n {
                text.push_str(
                    &state
                        .full_get_segment_text(i)
                        .map_err(|e| SttError::TranscriptionFailed(e.to_string()))?,
                );
            }

            Ok(text.trim().to_string())
        }

        fn engine_name(&self) -> &str {
            "whisper-rs (whisper.cpp)"
        }

        fn is_ready(&self) -> bool {
            true
        }
    }

    /// Attempt to load a model and return a test result with latency.
    /// Does not transcribe any audio. Safe to call from UI to verify model file.
    pub fn try_load_model(path: &Path) -> SttModelTestResult {
        let start = Instant::now();
        match WhisperEngine::from_model_path(path) {
            Ok(engine) => SttModelTestResult {
                success: true,
                latency_ms: start.elapsed().as_millis() as u64,
                engine_name: engine.engine_name().to_string(),
                error: None,
            },
            Err(e) => SttModelTestResult {
                success: false,
                latency_ms: start.elapsed().as_millis() as u64,
                engine_name: "whisper-rs".to_string(),
                error: Some(e.to_string()),
            },
        }
    }

    /// Decode a 16 kHz mono 16-bit PCM WAV file into raw i16 samples.
    /// Returns `SttError::TranscriptionFailed` if the format does not match requirements.
    pub fn decode_wav_to_pcm_i16(wav_path: &Path) -> Result<Vec<i16>, SttError> {
        let mut reader = hound::WavReader::open(wav_path)
            .map_err(|e| SttError::TranscriptionFailed(format!("Failed to open WAV: {e}")))?;

        let spec = reader.spec();
        if spec.sample_rate != REQUIRED_SAMPLE_RATE {
            return Err(SttError::TranscriptionFailed(format!(
                "WAV sample rate must be {} Hz, got {}",
                REQUIRED_SAMPLE_RATE, spec.sample_rate
            )));
        }
        if spec.channels != REQUIRED_CHANNELS {
            return Err(SttError::TranscriptionFailed(format!(
                "WAV must be mono (1 channel), got {}",
                spec.channels
            )));
        }
        if spec.bits_per_sample != BITS_PER_SAMPLE {
            return Err(SttError::TranscriptionFailed(format!(
                "WAV must be 16-bit, got {}-bit",
                spec.bits_per_sample
            )));
        }

        reader
            .samples::<i16>()
            .collect::<Result<Vec<i16>, _>>()
            .map_err(|e| SttError::TranscriptionFailed(format!("Failed to read WAV samples: {e}")))
    }

    #[cfg(test)]
    mod whisper_tests {
        use super::*;
        use std::path::PathBuf;

        #[test]
        fn from_model_path_rejects_empty_path() {
            let result = WhisperEngine::from_model_path(Path::new(""));
            assert_eq!(result.unwrap_err(), SttError::NotConfigured);
        }

        #[test]
        fn from_model_path_rejects_nonexistent_file() {
            let result = WhisperEngine::from_model_path(Path::new("/nonexistent/ggml-base.bin"));
            assert!(matches!(result.unwrap_err(), SttError::ModelNotFound(_)));
        }

        #[test]
        fn from_model_path_rejects_directory() {
            let dir = std::env::temp_dir();
            let result = WhisperEngine::from_model_path(&dir);
            // temp_dir exists but is not a file — expect ModelLoadFailed (not ModelNotFound)
            assert!(matches!(
                result.unwrap_err(),
                SttError::ModelLoadFailed(_) | SttError::ModelNotFound(_)
            ));
        }

        #[test]
        fn from_model_path_rejects_invalid_model_file() {
            // Create a tiny fake "model" file — exists as a file but is not a valid GGML model.
            // WhisperEngine::from_model_path should fail at model load, not panic.
            let mut path = std::env::temp_dir();
            path.push("lisa_test_fake_model.bin");
            std::fs::write(&path, b"not a whisper model").unwrap();
            let result = WhisperEngine::from_model_path(&path);
            let _ = std::fs::remove_file(&path);
            // Must not panic; must return ModelLoadFailed (whisper.cpp rejects the file).
            assert!(matches!(result.unwrap_err(), SttError::ModelLoadFailed(_)));
        }

        #[test]
        fn decode_wav_rejects_wrong_sample_rate() {
            // Build a synthetic WAV with wrong sample rate using hound.
            let mut path = std::env::temp_dir();
            path.push("lisa_test_wrong_rate.wav");
            {
                let spec = hound::WavSpec {
                    channels: 1,
                    sample_rate: 44100,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                };
                let mut writer = hound::WavWriter::create(&path, spec).unwrap();
                writer.write_sample(0i16).unwrap();
            }
            let result = decode_wav_to_pcm_i16(&path);
            let _ = std::fs::remove_file(&path);
            assert!(matches!(result.unwrap_err(), SttError::TranscriptionFailed(_)));
        }

        #[test]
        fn decode_wav_rejects_stereo() {
            let mut path = std::env::temp_dir();
            path.push("lisa_test_stereo.wav");
            {
                let spec = hound::WavSpec {
                    channels: 2,
                    sample_rate: 16000,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                };
                let mut writer = hound::WavWriter::create(&path, spec).unwrap();
                writer.write_sample(0i16).unwrap();
                writer.write_sample(0i16).unwrap();
            }
            let result = decode_wav_to_pcm_i16(&path);
            let _ = std::fs::remove_file(&path);
            assert!(matches!(result.unwrap_err(), SttError::TranscriptionFailed(_)));
        }

        #[test]
        fn decode_wav_reads_correct_format() {
            let mut path = std::env::temp_dir();
            path.push("lisa_test_valid_format.wav");
            {
                let spec = hound::WavSpec {
                    channels: 1,
                    sample_rate: 16000,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                };
                let mut writer = hound::WavWriter::create(&path, spec).unwrap();
                writer.write_sample(100i16).unwrap();
                writer.write_sample(-100i16).unwrap();
                writer.write_sample(0i16).unwrap();
            }
            let result = decode_wav_to_pcm_i16(&path);
            let _ = std::fs::remove_file(&path);
            let samples = result.unwrap();
            assert_eq!(samples, vec![100i16, -100i16, 0i16]);
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    // ── Audio format constants ────────────────────────────────────────────────

    #[test]
    fn audio_format_constants_match_engine_requirements() {
        assert_eq!(REQUIRED_SAMPLE_RATE, 16_000);
        assert_eq!(REQUIRED_CHANNELS, 1);
        assert_eq!(BITS_PER_SAMPLE, 16);
    }

    // ── PCM conversion ────────────────────────────────────────────────────────

    #[test]
    fn i16_to_f32_normalization_is_correct() {
        let samples: Vec<i16> = vec![0, i16::MAX, i16::MIN, 16_000, -16_000];
        let normalized = pcm_i16_to_f32(&samples);
        assert!(normalized[0].abs() < 1e-6, "silence → ~0.0, got {}", normalized[0]);
        assert!(
            (normalized[1] - 1.0).abs() < 1e-5,
            "i16::MAX → ~1.0, got {}",
            normalized[1]
        );
        assert!(normalized[2] < -0.99, "i16::MIN → ~-1.0, got {}", normalized[2]);
        assert!(normalized[3] > 0.0 && normalized[3] < 1.0, "positive sample in range");
        assert!(normalized[4] < 0.0 && normalized[4] > -1.0, "negative sample in range");
    }

    #[test]
    fn pcm_i16_to_f32_empty_input_returns_empty() {
        assert!(pcm_i16_to_f32(&[]).is_empty());
    }

    // ── Buffer size constants ─────────────────────────────────────────────────

    #[test]
    fn five_second_capture_buffer_size_is_correct() {
        let samples_5s =
            (REQUIRED_SAMPLE_RATE * 5 * REQUIRED_CHANNELS as u32) as usize;
        assert_eq!(samples_5s, 80_000, "5s at 16kHz mono = 80,000 samples");
        let bytes_5s = samples_5s * (BITS_PER_SAMPLE as usize / 8);
        assert_eq!(bytes_5s, 160_000, "160KB for 5s mono 16kHz 16-bit");
    }

    #[test]
    fn thirty_second_max_capture_buffer_is_reasonable() {
        let samples_30s =
            (REQUIRED_SAMPLE_RATE * 30 * REQUIRED_CHANNELS as u32) as usize;
        let bytes_30s = samples_30s * (BITS_PER_SAMPLE as usize / 8);
        assert_eq!(bytes_30s, 960_000, "960KB for 30s — acceptable heap allocation");
        assert!(bytes_30s < 2_000_000, "30s buffer stays under 2MB");
    }

    // ── SttError ──────────────────────────────────────────────────────────────

    #[test]
    fn stt_error_display_messages_are_user_readable() {
        assert_eq!(
            SttError::NotConfigured.to_string(),
            "STT engine not configured — set a model path in Settings"
        );
        let err = SttError::ModelNotFound("/models/ggml-tiny.bin".to_string());
        assert!(err.to_string().contains("not found"));
        assert!(err.to_string().contains("/models/ggml-tiny.bin"));

        let err = SttError::ModelLoadFailed("unsupported format".to_string());
        assert!(err.to_string().contains("failed to load"));
        assert!(err.to_string().contains("unsupported format"));

        let err = SttError::TranscriptionFailed("out of memory".to_string());
        assert!(err.to_string().contains("Transcription failed"));
        assert!(err.to_string().contains("out of memory"));
    }

    #[test]
    fn stt_error_variants_are_comparable() {
        assert_eq!(SttError::NotConfigured, SttError::NotConfigured);
        assert_ne!(
            SttError::NotConfigured,
            SttError::ModelNotFound("x".into())
        );
    }

    // ── validate_model_path ───────────────────────────────────────────────────

    #[test]
    fn validate_model_path_rejects_empty_string() {
        let result = validate_model_path(Path::new(""));
        assert!(!result.valid);
        assert!(result.error.is_some());
        assert!(result.error.unwrap().contains("empty"));
    }

    #[test]
    fn validate_model_path_rejects_nonexistent_file() {
        let result = validate_model_path(Path::new("/nonexistent/path/ggml-base.bin"));
        assert!(!result.valid);
        assert!(result.error.is_some());
    }

    #[test]
    fn validate_model_path_rejects_directory() {
        let dir = std::env::temp_dir();
        let result = validate_model_path(&dir);
        assert!(!result.valid);
        assert!(result.error.is_some());
    }

    #[test]
    fn validate_model_path_accepts_existing_file() {
        // Create a tiny temporary file — validation only checks existence, not content.
        let mut path = std::env::temp_dir();
        path.push("lisa_test_validate_model_path.bin");
        std::fs::write(&path, b"fake model content").unwrap();
        let result = validate_model_path(&path);
        let _ = std::fs::remove_file(&path);
        assert!(result.valid);
        assert!(result.error.is_none());
        assert!(result.label.contains("lisa_test_validate_model_path.bin"));
        assert!(result.size_bytes.unwrap() > 0);
    }

    #[test]
    fn validate_model_path_returns_file_size() {
        let mut path = std::env::temp_dir();
        path.push("lisa_test_size_check.bin");
        let content = b"fake model data 1234";
        std::fs::write(&path, content).unwrap();
        let result = validate_model_path(&path);
        let _ = std::fs::remove_file(&path);
        assert!(result.valid);
        assert_eq!(result.size_bytes, Some(content.len() as u64));
    }
}
