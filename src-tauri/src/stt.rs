// ─── Phase 3B Spike: STT Engine Abstraction ──────────────────────────────────
//
// This module defines the format contract and trait boundary that Phase 3C
// will build on. No audio hardware, no model files, and no new Cargo
// dependencies are required — the types here are pure Rust.
//
// All real STT engine implementations (whisper-rs, sherpa-onnx, etc.) will
// implement `SttEngine` and receive audio in the standard format below.

use std::fmt;

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
/// Implementations receive 16kHz mono 16-bit signed PCM samples captured
/// during a KeyV push-to-talk hold and return a transcript string.
///
/// Phase 3C will provide a `WhisperEngine` implementation. The trait allows
/// future engines (sherpa-onnx, Vosk) to be swapped in without changing
/// the audio capture or command layer.
pub trait SttEngine: Send + Sync {
    /// Transcribe raw 16kHz mono 16-bit signed PCM samples.
    ///
    /// `samples` contains the full recording captured during the KeyV hold.
    /// Returns the transcript, or an `SttError` describing the failure.
    fn transcribe(&self, samples: &[i16]) -> Result<String, SttError>;

    /// Human-readable engine identifier emitted in audit log `details` fields.
    fn engine_name(&self) -> &str;

    /// True if the engine has a model loaded and can accept audio for transcription.
    fn is_ready(&self) -> bool;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_format_constants_match_engine_requirements() {
        // Whisper.cpp, sherpa-onnx Whisper models, and Vosk all require:
        // 16kHz, mono, 16-bit signed PCM.
        assert_eq!(REQUIRED_SAMPLE_RATE, 16_000);
        assert_eq!(REQUIRED_CHANNELS, 1);
        assert_eq!(BITS_PER_SAMPLE, 16);
    }

    #[test]
    fn i16_to_f32_normalization_is_correct() {
        // Whisper.cpp ingests f32 samples in [-1.0, 1.0].
        // sherpa-onnx Whisper models use the same float range.
        // Normalization: sample as f32 / i16::MAX as f32
        let samples: Vec<i16> = vec![0, i16::MAX, i16::MIN, 16_000, -16_000];
        let normalized: Vec<f32> = samples
            .iter()
            .map(|&s| s as f32 / i16::MAX as f32)
            .collect();
        assert!(normalized[0].abs() < 1e-6, "silence → ~0.0, got {}", normalized[0]);
        assert!(
            (normalized[1] - 1.0).abs() < 1e-5,
            "i16::MAX → ~1.0, got {}",
            normalized[1]
        );
        assert!(normalized[2] < -0.99, "i16::MIN → ~-1.0, got {}", normalized[2]);
        assert!(
            normalized[3] > 0.0 && normalized[3] < 1.0,
            "positive sample in range"
        );
        assert!(
            normalized[4] < 0.0 && normalized[4] > -1.0,
            "negative sample in range"
        );
    }

    #[test]
    fn five_second_capture_buffer_size_is_correct() {
        // Validate the expected buffer sizes for cpal capture planning.
        let samples_5s =
            (REQUIRED_SAMPLE_RATE * 5 * REQUIRED_CHANNELS as u32) as usize;
        assert_eq!(samples_5s, 80_000, "5s at 16kHz mono = 80,000 samples");
        let bytes_5s = samples_5s * (BITS_PER_SAMPLE as usize / 8);
        assert_eq!(bytes_5s, 160_000, "160KB for 5s mono 16kHz 16-bit");
    }

    #[test]
    fn thirty_second_max_capture_buffer_is_reasonable() {
        // Push-to-talk sessions are typically <30s.
        // Verifies the memory ceiling before we choose a ring-buffer size.
        let samples_30s =
            (REQUIRED_SAMPLE_RATE * 30 * REQUIRED_CHANNELS as u32) as usize;
        let bytes_30s = samples_30s * (BITS_PER_SAMPLE as usize / 8);
        assert_eq!(bytes_30s, 960_000, "960KB for 30s — acceptable heap allocation");
        assert!(bytes_30s < 2_000_000, "30s buffer stays under 2MB");
    }

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
}
