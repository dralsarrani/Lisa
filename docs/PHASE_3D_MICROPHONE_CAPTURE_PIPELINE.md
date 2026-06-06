# Phase 3D — cpal Microphone Capture + KeyV Live Pipeline

## What was built

A fully local, keyboard-driven voice input pipeline. The user holds **KeyV** outside the command box to record microphone audio, releases to transcribe locally via Whisper, reviews the transcript, then manually clicks **Send Transcript** or **Discard**. Nothing is sent to any network. No audio is persisted to disk. No transcript content is written to audit logs.

## Pipeline

```
Hold KeyV
  └─► start_voice_capture (Tauri command)
        └─► cpal default_input_device → build_input_stream (WASAPI on Windows)
              └─► f32 samples accumulated in Arc<Mutex<Vec<f32>>>

Release KeyV
  └─► stop_voice_capture_and_transcribe (Tauri command, model_path arg)
        ├─► stop_and_get_samples → raw f32 buffer
        ├─► process_capture_to_whisper (downmix + resample to 16 kHz)
        ├─► f32_to_i16 conversion
        └─► WhisperEngine::from_model_path(model_path).transcribe(&i16_samples)
              └─► transcript String → frontend preview

User clicks "Send Transcript"
  └─► submitUserInput(transcript, "voice") → existing LLM/command pipeline
```

Escape at any point calls `cancel_voice_capture`.

## Feature flags

| Flag | Enables |
|---|---|
| `audio-capture` | cpal microphone capture |
| `whisper` | WhisperEngine (whisper-rs/whisper.cpp) |
| `voice-live` | Both of the above together |

All three paths compile and test clean without the flags — fallback commands return a `"not configured"` error string so the frontend can display a friendly message.

## New Tauri commands

| Command | Feature gate | Purpose |
|---|---|---|
| `start_voice_capture` | audio-capture | Open mic stream, begin accumulating samples |
| `stop_voice_capture_and_transcribe` | voice-live | Stop stream, resample, run Whisper, return transcript |
| `cancel_voice_capture` | audio-capture | Stop stream, discard buffer |
| `audio_input_status` | audio-capture | Query whether capture is active |

## New Rust modules

- **`src-tauri/src/audio.rs`** — pure signal processing (always compiled, no deps beyond std) + `pub mod capture` (cpal, feature-gated). Contains `downmix_to_mono`, `resample_to_16k` (linear interpolation, 44100/48000→16000 Hz), `process_capture_to_whisper`, `f32_to_i16`, and 32 unit tests.
- **`VoiceCaptureManager`** — Tauri managed state holding an `Option<ActiveCapture>`; empty struct when `audio-capture` is disabled.

## Frontend changes

- **`VoiceInputControl.tsx`** — full rewrite for Phase 3D: model-path guard before recording, async begin/cancel/transcribe, preview card with "Send Transcript" / "Discard" buttons, idle hint adapts when no model is configured.
- **`CommandInput.tsx`** — wires `onSendTranscript={(t) => submitUserInput(t, "voice")}` prop.
- **`command-router.ts`** — all 8 `VOICE_CAPABILITY_QA` entries updated to Phase 3D language (keyboard-only, Whisper model requirement, no auto-submit, no background listening, no wake word, no TTS).
- **`SettingsPanel.tsx`** — Voice Input description updated to Phase 3D flow.

## What is explicitly not present

- No wake word / always-on listening
- No background or passive capture
- No cloud STT / no audio sent over network
- No auto-submit (user must click "Send Transcript")
- No audio persisted to disk
- No raw transcript content in audit logs
- No TTS
- No desktop control

## Model requirement

The user must provide a local Whisper GGML model file path in **Settings → Voice Input** (e.g. `ggml-base.bin`). On first use, Windows may show a microphone permission prompt — this is expected WASAPI behavior.

## Test coverage

| Suite | Count | Status |
|---|---|---|
| Vitest (TS) | 705 | ✓ all pass |
| cargo test (base) | 78 | ✓ all pass |
| cargo test --features whisper | 85 | ✓ all pass |
| cargo test --features audio-capture | 78 | ✓ all pass |
| cargo test --features voice-live | 85 | ✓ all pass |
| npx tsc --noEmit | — | ✓ clean |
