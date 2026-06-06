// ─── Audio Processing Module ──────────────────────────────────────────────────
//
// Phase 3D: Pure signal-processing helpers (always compiled, hardware-free) plus
// an optional cpal microphone capture module (feature = "audio-capture").
//
// Design principles:
//   • All pure functions take raw sample slices — no device access, fully testable in CI.
//   • The capture submodule is feature-gated and holds live WASAPI state.
//   • Audio buffers are heap-only: no disk writes, no network, cleared after transcription.
//   • Resampler uses linear interpolation — sufficient quality for Whisper speech recognition.
//
// PRIVACY: No audio is ever persisted to disk or sent over the network.
// All capture happens in-process; buffers are dropped immediately after transcription.
//
// The helpers below are all live when `audio-capture` is enabled (the capture submodule
// imports them via `use super::*`). Without that feature they appear dead to the lint
// because tests don't count as callers for dead_code analysis.
#![cfg_attr(not(feature = "audio-capture"), allow(dead_code))]

use serde::Serialize;

// ─── Constants ────────────────────────────────────────────────────────────────

pub const TARGET_SAMPLE_RATE: u32 = 16_000;

/// Maximum push-to-talk duration: 30 seconds at 16 kHz mono.
pub const MAX_CAPTURE_DURATION_SECS: u32 = 30;

/// Maximum sample count accepted after resampling/downmix.
pub const MAX_CAPTURE_SAMPLES: usize = (TARGET_SAMPLE_RATE * MAX_CAPTURE_DURATION_SECS) as usize;

// ─── Sample conversion helpers (always compiled) ──────────────────────────────

/// Clamp an f32 audio sample to the valid range [-1.0, 1.0].
#[inline]
pub fn clamp_f32(s: f32) -> f32 {
    s.clamp(-1.0, 1.0)
}

/// Convert a signed 16-bit PCM sample to f32 in range [-1.0, 1.0].
#[inline]
pub fn i16_to_f32(s: i16) -> f32 {
    s as f32 / i16::MAX as f32
}

/// Convert an unsigned 16-bit PCM sample to f32 in range [-1.0, 1.0].
#[inline]
pub fn u16_to_f32(s: u16) -> f32 {
    (s as f32 / u16::MAX as f32) * 2.0 - 1.0
}

// ─── Channel downmix (always compiled) ───────────────────────────────────────

/// Downmix interleaved multi-channel f32 audio to mono by averaging channels.
///
/// Input: `[ch0_frame0, ch1_frame0, ..., ch0_frame1, ch1_frame1, ...]`
/// Output: `[mono_frame0, mono_frame1, ...]`
///
/// If `channels` is 1, returns a copy of the input. If `samples` is empty or
/// `channels` is 0, returns an empty `Vec`.
pub fn downmix_to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels == 0 || samples.is_empty() {
        return Vec::new();
    }
    if channels == 1 {
        return samples.to_vec();
    }
    let ch = channels as usize;
    let frames = samples.len() / ch;
    let mut mono = Vec::with_capacity(frames);
    for frame in 0..frames {
        let start = frame * ch;
        let sum: f32 = samples[start..start + ch].iter().sum();
        mono.push(sum / ch as f32);
    }
    mono
}

// ─── Resampler (always compiled) ─────────────────────────────────────────────

/// Resample mono f32 audio from `source_rate` to 16 000 Hz using linear interpolation.
///
/// Linear interpolation is sufficient for Whisper speech recognition — the model is
/// robust to minor quantization artifacts. No external crate required.
///
/// If `source_rate` is already 16 000, returns a clamped copy without resampling.
pub fn resample_to_16k(samples: &[f32], source_rate: u32) -> Vec<f32> {
    if samples.is_empty() {
        return Vec::new();
    }
    if source_rate == TARGET_SAMPLE_RATE {
        return samples.iter().map(|&s| clamp_f32(s)).collect();
    }
    let ratio = source_rate as f64 / TARGET_SAMPLE_RATE as f64;
    let output_len = (samples.len() as f64 / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);
    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let src_idx = src_pos as usize;
        let frac = (src_pos - src_idx as f64) as f32;
        let s0 = samples.get(src_idx).copied().unwrap_or(0.0);
        let s1 = samples.get(src_idx + 1).copied().unwrap_or(s0);
        output.push(clamp_f32(s0 + (s1 - s0) * frac));
    }
    output
}

// ─── End-to-end capture → Whisper conversion (always compiled) ───────────────

/// Convert raw captured f32 samples (any rate/channels) to Whisper-ready format:
/// 16 kHz mono f32 in range [-1.0, 1.0].
///
/// Pipeline:
///   1. Downmix multi-channel → mono
///   2. Resample source_rate → 16 000 Hz
///   3. Enforce MAX_CAPTURE_SAMPLES limit
///
/// Returns `Err` if the input is empty or source_rate is zero.
pub fn process_capture_to_whisper(
    raw_samples: Vec<f32>,
    source_rate: u32,
    channels: u16,
) -> Result<Vec<f32>, String> {
    if source_rate == 0 {
        return Err("Invalid source sample rate: 0".to_string());
    }
    if raw_samples.is_empty() {
        return Err("No audio captured — buffer is empty".to_string());
    }

    let mono = downmix_to_mono(&raw_samples, channels);
    let resampled = resample_to_16k(&mono, source_rate);

    // Enforce max duration silently — truncate rather than error
    let final_samples = if resampled.len() > MAX_CAPTURE_SAMPLES {
        resampled[..MAX_CAPTURE_SAMPLES].to_vec()
    } else {
        resampled
    };

    if final_samples.is_empty() {
        return Err("Processed audio is empty — nothing to transcribe".to_string());
    }

    Ok(final_samples)
}

/// Convert f32 samples in [-1.0, 1.0] to i16 PCM (required by `SttEngine::transcribe`).
pub fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|&s| (clamp_f32(s) * i16::MAX as f32) as i16)
        .collect()
}

// ─── Audio device status (always compiled) ────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AudioInputStatus {
    pub available: bool,
    pub device_label: Option<String>,
    pub message: String,
}

// ─── Live capture submodule (requires feature = "audio-capture") ──────────────

#[cfg(feature = "audio-capture")]
pub mod capture {
    use super::*;
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use std::sync::{Arc, Mutex};

    /// Live capture session — holds the cpal stream alive while recording.
    /// Dropping this struct stops the audio callback and releases the stream.
    pub struct ActiveCapture {
        /// Samples collected by the cpal callback (raw device format, converted to f32).
        /// Shared with the capture callback via its own lock — separate from the outer state lock.
        pub samples: Arc<Mutex<Vec<f32>>>,
        /// Sample rate reported by the device (e.g. 44100 or 48000).
        pub device_sample_rate: u32,
        /// Channel count reported by the device (e.g. 1 or 2).
        pub device_channels: u16,
        /// Human-readable device name for diagnostics and audit events.
        pub device_label: String,
        /// Held to keep the cpal stream alive. Dropped (stream stopped) when
        /// ActiveCapture is dropped. The callback will not fire after drop completes.
        _stream: cpal::Stream,
    }

    // SAFETY: cpal::Stream is Send on Windows WASAPI (background thread is managed
    // by the OS audio session). ActiveCapture is always accessed via a Mutex, so Sync
    // is not required directly — Mutex<Option<ActiveCapture>> provides the necessary
    // synchronization.
    unsafe impl Send for ActiveCapture {}

    #[derive(Debug)]
    pub struct StartResult {
        pub device_label: String,
        pub sample_rate: u32,
        pub channels: u16,
    }

    /// Open the default audio input device and begin accumulating f32 samples.
    ///
    /// Returns `Err` if:
    ///   - A capture session is already active (double-start guard)
    ///   - No default input device is available
    ///   - The device stream cannot be opened
    pub fn start(state: &Arc<Mutex<Option<ActiveCapture>>>) -> Result<StartResult, String> {
        let mut guard = state.lock().map_err(|e| format!("Capture lock poisoned: {e}"))?;
        if guard.is_some() {
            return Err(
                "A voice capture session is already active. Release KeyV first.".to_string(),
            );
        }

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No audio input device found. Check that a microphone is connected and enabled in Windows Settings → Privacy → Microphone.".to_string())?;

        let device_label = device
            .name()
            .unwrap_or_else(|_| "Unknown microphone".to_string());

        let config = device
            .default_input_config()
            .map_err(|e| format!("Could not get microphone configuration: {e}"))?;

        let device_sample_rate = config.sample_rate().0;
        let device_channels = config.channels();
        let sample_format = config.sample_format();
        let stream_config: cpal::StreamConfig = config.into();

        let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
        let samples_cb = samples.clone();

        let stream = build_input_stream_for_format(
            &device,
            &stream_config,
            sample_format,
            samples_cb,
        )?;
        stream
            .play()
            .map_err(|e| format!("Failed to start microphone stream: {e}"))?;

        *guard = Some(ActiveCapture {
            samples,
            device_sample_rate,
            device_channels,
            device_label: device_label.clone(),
            _stream: stream,
        });

        Ok(StartResult {
            device_label,
            sample_rate: device_sample_rate,
            channels: device_channels,
        })
    }

    /// Stop the active capture session and return the raw samples plus device info.
    ///
    /// Dropping the `ActiveCapture` drops `_stream`, which stops the cpal callback.
    /// Samples are read after the stream is stopped, so no concurrent write can occur.
    ///
    /// Returns `Err` if no capture is active.
    pub fn stop_and_get_samples(
        state: &Arc<Mutex<Option<ActiveCapture>>>,
    ) -> Result<(Vec<f32>, u32, u16), String> {
        let mut guard = state.lock().map_err(|e| format!("Capture lock poisoned: {e}"))?;
        let capture = guard
            .take()
            .ok_or_else(|| "No active voice capture to stop. Was recording started?".to_string())?;

        let device_sample_rate = capture.device_sample_rate;
        let device_channels = capture.device_channels;
        let samples_arc = capture.samples.clone();
        // Dropping capture stops the stream and therefore the callback.
        drop(capture);

        let samples = samples_arc
            .lock()
            .map_err(|e| format!("Samples lock poisoned: {e}"))?
            .clone();

        Ok((samples, device_sample_rate, device_channels))
    }

    /// Cancel the active capture session, discarding all accumulated samples.
    ///
    /// Idempotent — safe to call when no session is active.
    pub fn cancel(state: &Arc<Mutex<Option<ActiveCapture>>>) {
        if let Ok(mut guard) = state.lock() {
            *guard = None; // drops ActiveCapture → drops _stream → stops callback
        }
    }

    /// Probe whether a default input device is available without opening a stream.
    pub fn query_status() -> AudioInputStatus {
        let host = cpal::default_host();
        match host.default_input_device() {
            Some(device) => {
                let label = device.name().ok();
                AudioInputStatus {
                    available: true,
                    device_label: label.clone(),
                    message: format!(
                        "Microphone ready: {}",
                        label.as_deref().unwrap_or("Unknown device")
                    ),
                }
            }
            None => AudioInputStatus {
                available: false,
                device_label: None,
                message: "No audio input device found. Connect a microphone and check Windows Settings → Privacy → Microphone.".to_string(),
            },
        }
    }

    // ─── Internal: build input stream for any supported sample format ─────────

    fn build_input_stream_for_format(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        sample_format: cpal::SampleFormat,
        samples: Arc<Mutex<Vec<f32>>>,
    ) -> Result<cpal::Stream, String> {
        let err_fn = |e: cpal::StreamError| {
            // Stderr only — never exposed to UI or audit log.
            eprintln!("[Lisa audio] Input stream error: {e}");
        };

        match sample_format {
            cpal::SampleFormat::F32 => {
                let s = samples.clone();
                device
                    .build_input_stream(
                        config,
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            if let Ok(mut buf) = s.lock() {
                                buf.extend(data.iter().map(|&v| clamp_f32(v)));
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| format!("Failed to open F32 input stream: {e}"))
            }
            cpal::SampleFormat::I16 => {
                let s = samples.clone();
                device
                    .build_input_stream(
                        config,
                        move |data: &[i16], _: &cpal::InputCallbackInfo| {
                            if let Ok(mut buf) = s.lock() {
                                buf.extend(data.iter().map(|&v| i16_to_f32(v)));
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| format!("Failed to open I16 input stream: {e}"))
            }
            cpal::SampleFormat::U16 => {
                let s = samples.clone();
                device
                    .build_input_stream(
                        config,
                        move |data: &[u16], _: &cpal::InputCallbackInfo| {
                            if let Ok(mut buf) = s.lock() {
                                buf.extend(data.iter().map(|&v| u16_to_f32(v)));
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| format!("Failed to open U16 input stream: {e}"))
            }
            other => Err(format!(
                "Unsupported audio sample format: {other:?}. Expected F32, I16, or U16."
            )),
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── clamp_f32 ────────────────────────────────────────────────────────────

    #[test]
    fn clamp_f32_keeps_valid_range() {
        assert!((clamp_f32(0.5) - 0.5).abs() < 1e-6);
        assert!((clamp_f32(-0.5) + 0.5).abs() < 1e-6);
        assert!(clamp_f32(0.0).abs() < 1e-6);
    }

    #[test]
    fn clamp_f32_clips_above_one() {
        assert!((clamp_f32(1.5) - 1.0).abs() < 1e-6);
        assert!((clamp_f32(100.0) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn clamp_f32_clips_below_minus_one() {
        assert!((clamp_f32(-1.5) + 1.0).abs() < 1e-6);
        assert!((clamp_f32(-100.0) + 1.0).abs() < 1e-6);
    }

    // ── i16_to_f32 ───────────────────────────────────────────────────────────

    #[test]
    fn i16_to_f32_silence_is_zero() {
        assert!(i16_to_f32(0).abs() < 1e-6);
    }

    #[test]
    fn i16_to_f32_max_is_one() {
        assert!((i16_to_f32(i16::MAX) - 1.0).abs() < 1e-4);
    }

    #[test]
    fn i16_to_f32_min_is_near_minus_one() {
        assert!(i16_to_f32(i16::MIN) < -0.99);
    }

    #[test]
    fn i16_to_f32_mid_positive_in_range() {
        let v = i16_to_f32(16_000);
        assert!(v > 0.0 && v < 1.0);
    }

    // ── u16_to_f32 ───────────────────────────────────────────────────────────

    #[test]
    fn u16_to_f32_zero_is_minus_one() {
        assert!((u16_to_f32(0) + 1.0).abs() < 1e-4);
    }

    #[test]
    fn u16_to_f32_max_is_one() {
        assert!((u16_to_f32(u16::MAX) - 1.0).abs() < 1e-4);
    }

    #[test]
    fn u16_to_f32_midpoint_near_zero() {
        let v = u16_to_f32(u16::MAX / 2);
        assert!(v.abs() < 0.01, "mid u16 should be ~0.0, got {v}");
    }

    // ── f32_to_i16 ───────────────────────────────────────────────────────────

    #[test]
    fn f32_to_i16_silence_is_zero() {
        assert_eq!(f32_to_i16(&[0.0])[0], 0);
    }

    #[test]
    fn f32_to_i16_positive_one_is_max() {
        assert_eq!(f32_to_i16(&[1.0])[0], i16::MAX);
    }

    #[test]
    fn f32_to_i16_clips_over_range() {
        let out = f32_to_i16(&[1.5, -1.5]);
        assert_eq!(out[0], i16::MAX);
        // -1.0 * i16::MAX as i16 cast
        assert!(out[1] < 0);
    }

    #[test]
    fn f32_to_i16_roundtrip_preserves_sign() {
        let input: Vec<i16> = vec![1000, -1000, 0, i16::MAX / 2];
        let f32s: Vec<f32> = input.iter().map(|&s| i16_to_f32(s)).collect();
        let back = f32_to_i16(&f32s);
        for (orig, got) in input.iter().zip(back.iter()) {
            assert!(
                (orig - got).abs() <= 1,
                "roundtrip error: orig={orig} got={got}"
            );
        }
    }

    // ── downmix_to_mono ───────────────────────────────────────────────────────

    #[test]
    fn downmix_mono_passthrough() {
        let samples = vec![0.1f32, 0.2, 0.3];
        let out = downmix_to_mono(&samples, 1);
        assert_eq!(out, samples);
    }

    #[test]
    fn downmix_stereo_averages_channels() {
        // Frames: [L=0.5, R=-0.5], [L=0.4, R=0.0]
        let samples = vec![0.5f32, -0.5, 0.4, 0.0];
        let out = downmix_to_mono(&samples, 2);
        assert_eq!(out.len(), 2);
        assert!(out[0].abs() < 1e-6, "(0.5 + -0.5) / 2 = 0.0, got {}", out[0]);
        assert!((out[1] - 0.2).abs() < 1e-5, "(0.4 + 0.0) / 2 = 0.2, got {}", out[1]);
    }

    #[test]
    fn downmix_empty_input_returns_empty() {
        assert!(downmix_to_mono(&[], 2).is_empty());
    }

    #[test]
    fn downmix_zero_channels_returns_empty() {
        assert!(downmix_to_mono(&[0.1, 0.2], 0).is_empty());
    }

    #[test]
    fn downmix_four_channels_averages_correctly() {
        // One frame: [0.4, 0.2, 0.0, -0.4] → avg = 0.05
        let samples = vec![0.4f32, 0.2, 0.0, -0.4];
        let out = downmix_to_mono(&samples, 4);
        assert_eq!(out.len(), 1);
        assert!((out[0] - 0.05).abs() < 1e-5, "got {}", out[0]);
    }

    // ── resample_to_16k ───────────────────────────────────────────────────────

    #[test]
    fn resample_same_rate_returns_clamped_copy() {
        let input = vec![0.1f32, 0.5, -0.3];
        let out = resample_to_16k(&input, TARGET_SAMPLE_RATE);
        assert_eq!(out.len(), input.len());
        for (a, b) in input.iter().zip(out.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }

    #[test]
    fn resample_empty_returns_empty() {
        assert!(resample_to_16k(&[], 44100).is_empty());
    }

    #[test]
    fn resample_48k_to_16k_exact_ratio() {
        // 48000 / 16000 = 3.0 exactly
        let input: Vec<f32> = (0..3000).map(|i| i as f32 / 3000.0).collect();
        let out = resample_to_16k(&input, 48_000);
        assert_eq!(out.len(), 1000, "3000 @ 48kHz → 1000 @ 16kHz");
        assert!(out.iter().all(|s| *s >= -1.0 && *s <= 1.0));
    }

    #[test]
    fn resample_44100_to_16k_output_size() {
        // 44100 samples = 1 second @ 44.1 kHz → ≈16000 samples @ 16kHz
        let input = vec![0.0f32; 44100];
        let out = resample_to_16k(&input, 44_100);
        assert!(
            (out.len() as i64 - 16_000).abs() <= 2,
            "expected ~16000, got {}",
            out.len()
        );
    }

    #[test]
    fn resample_output_all_in_valid_range() {
        let input = vec![1.0f32, -1.0, 0.9, -0.9, 0.0];
        let out = resample_to_16k(&input, 32_000);
        assert!(out.iter().all(|s| *s >= -1.0 && *s <= 1.0));
    }

    // ── process_capture_to_whisper ────────────────────────────────────────────

    #[test]
    fn process_capture_converts_stereo_48k_to_mono_16k() {
        // 0.5 s stereo 48 kHz: 48000 * 0.5 * 2 channels = 48000 interleaved samples
        let input = vec![0.1f32; 48_000];
        let out = process_capture_to_whisper(input, 48_000, 2).unwrap();
        // Expected: ~8000 mono samples @ 16kHz (0.5 s)
        assert!(
            (out.len() as i64 - 8_000).abs() <= 2,
            "expected ~8000, got {}",
            out.len()
        );
    }

    #[test]
    fn process_capture_rejects_zero_sample_rate() {
        let err = process_capture_to_whisper(vec![0.1], 0, 1).unwrap_err();
        assert!(err.contains("sample rate"));
    }

    #[test]
    fn process_capture_rejects_empty_buffer() {
        assert!(process_capture_to_whisper(vec![], 44100, 1).is_err());
    }

    #[test]
    fn process_capture_enforces_max_duration() {
        // 60 s of mono 16 kHz = 960 000 samples → truncated to MAX_CAPTURE_SAMPLES
        let input = vec![0.1f32; 16_000 * 60];
        let out = process_capture_to_whisper(input, 16_000, 1).unwrap();
        assert!(out.len() <= MAX_CAPTURE_SAMPLES);
    }

    #[test]
    fn process_capture_mono_16k_passthrough() {
        let input = vec![0.3f32; 1600]; // 0.1 s @ 16kHz mono
        let out = process_capture_to_whisper(input.clone(), 16_000, 1).unwrap();
        assert_eq!(out.len(), input.len());
    }

    // ── Constants ─────────────────────────────────────────────────────────────

    #[test]
    fn target_sample_rate_is_16k() {
        assert_eq!(TARGET_SAMPLE_RATE, 16_000);
    }

    #[test]
    fn max_capture_duration_is_30_seconds() {
        assert_eq!(MAX_CAPTURE_DURATION_SECS, 30);
    }

    #[test]
    fn max_capture_samples_is_480k() {
        assert_eq!(MAX_CAPTURE_SAMPLES, 480_000);
        // 30 s at 16 kHz mono = 480 000 samples = 1.92 MB as f32
        assert_eq!(
            MAX_CAPTURE_SAMPLES,
            (TARGET_SAMPLE_RATE * MAX_CAPTURE_DURATION_SECS) as usize
        );
    }
}
