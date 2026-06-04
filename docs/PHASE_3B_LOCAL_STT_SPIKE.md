# Phase 3B — Local STT Integration Spike

**Status:** Research Complete — Awaiting Approval to Begin Phase 3C  
**Date:** 2026-06-05  
**Phase:** 3B (Engineering Decision Document)  
**Predecessor:** Phase 3A — Voice Input Foundation  
**Successor:** Phase 3C — WhisperEngine Implementation  

---

## Executive Summary

This document is the primary deliverable of Phase 3B. It captures the research, evaluation, and architectural decisions for integrating local, offline speech-to-text (STT) into Lisa on Windows/Tauri.

**Decision:** Use **whisper-rs** (Rust bindings to whisper.cpp) as the STT engine, **cpal** for in-process audio capture, and a **record-then-transcribe** architecture gated on KeyV push-to-talk. All audio stays on-device. No cloud services. No persistent microphone access.

A Rust proof of concept — the `SttEngine` trait abstraction in `src-tauri/src/stt.rs` — was produced as part of this spike. It compiles with zero warnings and 6 deterministic tests pass without any new Cargo dependencies, model files, or hardware.

---

## PRD Alignment Check

### From PRD_Lisa.md — Voice Requirements

| PRD Requirement | Phase 3B Position |
|---|---|
| Voice-first desktop companion | STT is the foundational layer; no TTS or cloud in scope |
| Local, privacy-first | All audio processed on-device; no network calls |
| KeyV push-to-talk | Confirmed as the trigger model; hold to record, release to transcribe |
| Arabic + English | whisper-rs (`ggml-base` model) supports both natively |
| Settings-driven | Model path, language, and max duration stored in LisaSettings |
| Audit log integration | All voice events already defined in AuditEventType (Phase 3A) |
| Emergency stop | STT respects emergency stop state via existing canRecord guard |

### Phase 3A Handoff State

Phase 3A delivered:
- `VoiceStatus` state machine (`idle → recording → transcribing → preview → error`)
- `VoiceInputControl.tsx` with KeyV push-to-talk, action refs, and `getKeyVAction` pure helper
- `SttEngineStatus` in `LisaSettings`
- 7 voice audit event types including `voice_transcript_submitted`
- 698/698 tests pass

Phase 3B does not modify any Phase 3A files. The `SttEngine` trait and `SttError` enum are defined in a new module (`stt.rs`) and declared with `#[allow(dead_code)]` until Phase 3C wires them to the command layer.

---

## Engine Evaluation

### Candidates Evaluated

| Engine | Crate | Rust Binding Quality | Windows Support | Arabic | Notes |
|---|---|---|---|---|---|
| whisper-rs | `whisper-rs` | Excellent — wraps whisper.cpp via bindgen | Yes — requires LLVM + CMake on Windows | Excellent | Best multilingual quality; most mature |
| sherpa-onnx | `sherpa-onnx` | Good — downloads prebuilt static lib at build time | Yes — no C++ compilation needed | Good | Whisper ONNX models available; viable fallback |
| Vosk | `vosk` v0.3.1 | Minimal | Yes — requires vosk.dll at runtime | Poor | ~50MB Arabic model; lowest quality |
| faster-whisper | (none) | None — Python only | Sidecar only | Good | Eliminated: requires Python sidecar; not pure Rust |

### Detailed Evaluation

#### whisper-rs

- Wraps [whisper.cpp](https://github.com/ggerganov/whisper.cpp) via Rust bindgen
- Minimum Rust: **1.88** (confirmed via crate metadata)
- Windows build requirements: **LLVM + CMake** (one-time developer setup)
- `WHISPER_DONT_GENERATE_BINDINGS=1` env var skips bindgen and uses pre-generated bindings — reduces build friction on Windows
- Model format: **GGML** (`.bin` files)
- Arabic quality: **Excellent** — whisper.cpp is the reference implementation for Whisper models
- First recommended model: `ggml-base` (~147MB, balanced), or quantized `ggml-base-q5_1` (~81MB, small quality loss)
- Production recommendation: whisper-rs is the Phase 3C implementation target

#### sherpa-onnx

- Official Rust crate from the k2-fsa project
- Prebuilt static libraries downloaded at build time — **no C++ compilation required on Windows**
- Model format: **ONNX** (Whisper-compatible models available)
- Arabic quality: Good — uses Whisper ONNX models, comparable to whisper-rs for the same model size
- Recommended as **fallback** if whisper-rs build setup proves too complex for a user's Windows environment
- Larger model zoo; useful if multilingual ONNX models are preferred

#### Vosk

- `vosk` crate v0.3.1
- Requires `vosk.dll` at runtime (Windows) — user must place DLL alongside executable or in PATH
- Arabic model: ~50MB; quality is notably lower than Whisper
- **Not recommended** — DLL distribution complexity and inferior quality

#### faster-whisper / CTranslate2

- Python-based; no native Rust crate
- Would require a Python sidecar invoked via Tauri's shell plugin
- **Eliminated** — adds Python runtime dependency, sidecar IPC overhead, and a second language runtime

### Engine Decision

**Primary:** `whisper-rs`  
**Fallback:** `sherpa-onnx`  
**Eliminated:** Vosk, faster-whisper

---

## Audio Capture Evaluation

### Candidates Evaluated

| Option | Crate / Plugin | Windows Backend | Actively Maintained | Notes |
|---|---|---|---|---|
| cpal (direct) | `cpal` | WASAPI | Yes (March 2026) | Standard Rust audio I/O; used by both community Tauri plugins internally |
| tauri-plugin-mic-recorder | Community Tauri 2.x plugin | cpal internally | Unknown | Wraps cpal; adds a JS layer; limited documentation |
| tauri-plugin-audio-recorder | Community Tauri 2.x plugin | cpal internally | Unknown | Similar to above; less adoption |

### Audio Capture Decision

**Use `cpal` directly in Rust** — not the community Tauri plugins.

Reasons:
1. Both community plugins wrap `cpal` internally; using cpal directly eliminates the JS layer and gives full control over the PCM format
2. Community plugins have unknown maintenance status and limited Windows-specific documentation
3. cpal is actively maintained (last commit March 2026) and is the de facto standard Rust audio I/O crate
4. Direct cpal usage lets Phase 3C control the exact sample rate, channel count, and buffer size required by whisper.cpp

**Required audio format** (all engines agree):
- Sample rate: **16,000 Hz**
- Channels: **1 (mono)**
- Sample format: **16-bit signed PCM (i16)**

These constants are now defined in `src-tauri/src/stt.rs`:
```rust
pub const REQUIRED_SAMPLE_RATE: u32 = 16_000;
pub const REQUIRED_CHANNELS: u16 = 1;
pub const BITS_PER_SAMPLE: u16 = 16;
```

---

## Recommended Architecture

### Overview

```
KeyV Hold
    │
    ▼
cpal input stream (WASAPI, 16kHz mono i16)
    │  accumulates samples in ring buffer (max 30s = 960KB)
    │
KeyV Release
    │
    ▼
Tauri command: transcribe_audio(samples: Vec<i16>)
    │
    ▼
SttEngine::transcribe(&self, samples: &[i16]) -> Result<String, SttError>
    │
    ▼
WhisperEngine (whisper-rs / whisper.cpp)
    │  normalizes i16 → f32, invokes full_default, extracts text
    │
    ▼
Tauri event: voice_transcript_result { text, duration_ms }
    │
    ▼
Frontend: VoiceInputControl "preview" state
    │
    ▼
User confirms → command submitted → audit log
```

### Pattern: Record-then-Transcribe

Audio is accumulated in memory during the KeyV hold and transcribed in a single batch on release. This matches the existing state machine (`recording → transcribing → preview`) and is simpler than streaming.

**Maximum recording duration:** 30 seconds (enforced by ring buffer size, not a timer — the buffer stops accepting samples when full)

**Why not streaming?** Streaming STT requires a different engine API (partial results, endpointing) and does not fit the push-to-talk interaction model. Record-then-transcribe is sufficient for command input.

### SttEngine Trait (Phase 3B Proof)

```rust
pub trait SttEngine: Send + Sync {
    fn transcribe(&self, samples: &[i16]) -> Result<String, SttError>;
    fn engine_name(&self) -> &str;
    fn is_ready(&self) -> bool;
}
```

Phase 3C will provide `WhisperEngine: SttEngine`. Future phases may add `SherpaOnnxEngine` without changing any calling code.

### State Machine Integration

The existing `VoiceStatus` machine requires no changes:

| State | Trigger | Action |
|---|---|---|
| `idle` | KeyV down | Start cpal stream, begin accumulating |
| `recording` | KeyV up | Stop stream, invoke `transcribe_audio` command |
| `transcribing` | Command in flight | Show spinner |
| `preview` | Command returns Ok | Show transcript for confirmation |
| `error` | Command returns Err | Show error message, allow retry |

`canRecord` already guards all transitions, so emergency stop is automatically respected.

---

## Model Storage and Delivery

### Phase 3C: User-Provided Path

No model files are committed to git. The user downloads a model separately and sets the path in Lisa's Settings panel.

New settings fields (Phase 3C, requires `STATE_VERSION` bump from 8 → 9):
```typescript
sttModelPath: string | null;   // absolute path to .bin model file
sttLanguage: string;           // default "auto"; e.g. "ar", "en"
sttMaxDurationSecs: number;    // default 30
```

The Settings panel will show:
- File path input (or Browse button via Tauri dialog)
- Language selector
- Max duration slider
- Model status indicator (not loaded / loaded / error)

### Phase 3D: In-App Downloader (Future)

A future phase may add a built-in model downloader that fetches models from the Hugging Face whisper.cpp model hub and stores them in the app's data directory. This is out of scope for Phase 3C.

### Recommended First Model

| Model | File | Size | Quality | Use Case |
|---|---|---|---|---|
| `ggml-base` | `ggml-base.bin` | ~147MB | Good | Default recommendation |
| `ggml-base-q5_1` | `ggml-base-q5_1.bin` | ~81MB | Good (quantized) | Lower-memory systems |
| `ggml-small` | `ggml-small.bin` | ~244MB | Better | Higher accuracy |
| `ggml-tiny` | `ggml-tiny.bin` | ~77MB | Fair | Fast, lowest accuracy |

Source: [ggerganov/whisper.cpp GGML models](https://huggingface.co/ggerganov/whisper.cpp)

---

## Privacy Model

| Guarantee | Implementation |
|---|---|
| No audio leaves the device | whisper-rs runs whisper.cpp in-process; no network calls |
| No persistent microphone access | cpal stream opens only during KeyV hold, closes immediately on release |
| No audio written to disk | PCM accumulates in heap memory (Vec<i16>); released after transcription |
| No background listening | cpal stream is not started until KeyV down; there is no always-on path |
| No wake word | Not implemented; would require always-on listening which is excluded |
| Settings are local | Model path stored in app's local settings file, not synced anywhere |

---

## Audit Model

All voice events are already defined in `AuditEventType` (Phase 3A). Phase 3C will emit:

| Event | When | Details |
|---|---|---|
| `voice_record_start` | KeyV down, cpal stream opened | — |
| `voice_record_stop` | KeyV up, stream closed | `duration_ms` |
| `voice_transcribe_start` | `transcribe_audio` command begins | `engine`, `sample_count` |
| `voice_transcribe_done` | Transcription successful | `text_length`, `duration_ms` |
| `voice_transcribe_error` | SttError returned | `error` (user-readable message) |
| `voice_transcript_submitted` | User confirms transcript | `text` |
| `voice_transcript_discarded` | User discards | — |

No raw audio or transcript text is stored in audit logs — only metadata.

---

## Testing Strategy

### What Can Be Tested Without Hardware or Model Files

These tests already pass (Phase 3B proof, 6 tests in `src-tauri/src/stt.rs`):

1. `audio_format_constants_match_engine_requirements` — REQUIRED_SAMPLE_RATE, REQUIRED_CHANNELS, BITS_PER_SAMPLE
2. `i16_to_f32_normalization_is_correct` — normalization formula validation
3. `five_second_capture_buffer_size_is_correct` — 80,000 samples, 160KB
4. `thirty_second_max_capture_buffer_is_reasonable` — 960KB, under 2MB
5. `stt_error_display_messages_are_user_readable` — all four SttError variants
6. `stt_error_variants_are_comparable` — PartialEq derivation

### Phase 3C Tests (Plan)

#### Rust unit tests (no hardware, no model)

- `WhisperEngine::new` returns `SttError::NotConfigured` when model path is None
- `WhisperEngine::new` returns `SttError::ModelNotFound` when path does not exist
- `WhisperEngine::is_ready()` returns false when model not loaded
- `WhisperEngine::engine_name()` returns expected string constant
- Ring buffer stops accepting samples at `max_duration_secs * REQUIRED_SAMPLE_RATE`

#### Integration tests (require model file, run manually or in CI with model present)

- `WhisperEngine` transcribes a known PCM test vector (sine wave silence → empty/short result)
- `WhisperEngine` transcribes a pre-recorded WAV (decode to i16, compare transcript to expected)

#### TypeScript/frontend tests (vitest, no hardware)

- Settings panel renders model path input
- `sttModelPath: null` shows "not configured" status
- Model status indicator shows correct state for each `SttEngineStatus` value

#### Test isolation guarantee

All Phase 3C tests that require a model file check for an env var `LISA_STT_TEST_MODEL` and skip with `#[ignore]` if not set. CI runs without the model; manual validation runs with it.

---

## Manual Validation Plan

After Phase 3C implementation, validate manually on Windows:

1. Install LLVM and CMake (one-time developer setup for whisper-rs)
2. Download `ggml-base.bin` from Hugging Face
3. Set model path in Lisa Settings → Voice
4. Hold KeyV, speak a command in English → release
5. Verify transcript appears in preview
6. Confirm transcript → verify it is submitted as a command
7. Repeat with Arabic speech
8. Hold KeyV, speak for >30 seconds → verify buffer clamps at 30s
9. Attempt voice with no model set → verify `SttError::NotConfigured` is shown gracefully
10. Trigger emergency stop mid-recording → verify recording is cancelled

---

## Phase 3C Implementation Plan

### New Files

| File | Purpose |
|---|---|
| `src-tauri/src/stt/whisper_engine.rs` | `WhisperEngine: SttEngine` implementation |
| `src-tauri/src/audio/capture.rs` | cpal stream management; PCM ring buffer |
| `src-tauri/src/commands/voice.rs` | `transcribe_audio` Tauri command |

### Modified Files

| File | Change |
|---|---|
| `src-tauri/src/stt.rs` | Promote to `stt/mod.rs`; add `whisper_engine` submodule |
| `src-tauri/src/lib.rs` | Remove `#[allow(dead_code)]`; wire `transcribe_audio` command; add `audio` module |
| `src-tauri/Cargo.toml` | Add `whisper-rs`, `cpal` dependencies |
| `src/core/types.ts` | Ensure new settings fields present |
| `src/core/persistence.ts` | Bump `STATE_VERSION` 8 → 9; add migration |
| `src/components/settings/SettingsPanel.tsx` | Add Voice section with model path, language, max duration |
| `src-tauri/tauri.conf.json` | Add microphone capability (requires explicit review) |

### New Cargo Dependencies (Phase 3C)

```toml
whisper-rs = { version = "0.13", features = ["metal"] }
cpal = "0.15"
```

> The `metal` feature is macOS-only and is a no-op on Windows; it allows the same dep declaration to work cross-platform.

### Build Time Note

whisper-rs compiles whisper.cpp from source. First build after adding the dependency will take several minutes. Subsequent builds use incremental compilation. Developers on Windows must have LLVM and CMake installed.

If build complexity becomes a blocker, switch to `sherpa-onnx` (fallback decision) which downloads a prebuilt static library and requires no C++ toolchain.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| whisper-rs Windows build fails (missing LLVM/CMake) | Medium | High | Document setup steps clearly; sherpa-onnx is a drop-in fallback |
| whisper-rs Rust 1.88 requirement causes toolchain upgrade | Low | Low | Tauri 2.x already requires Rust 1.77+; 1.88 is a minor increment |
| cpal WASAPI latency causes perceptible delay on start | Low | Low | cpal opens stream only on KeyV down; latency is for the first buffer only |
| Model file is large (147MB); user frustrated by manual download | Medium | Medium | Phase 3D adds an in-app downloader; clear Settings UI reduces friction |
| whisper.cpp transcription is slow on low-end hardware | Medium | Medium | Quantized models (q5_1 ~81MB) are ~2x faster with small quality loss; expose model choice in Settings |
| Microphone Tauri permission addition breaks existing CI | Low | Medium | Add permission only after explicit review; test build in CI before merging |
| Arabic transcription quality below expectation | Low | Medium | `ggml-small` or `ggml-medium` models improve accuracy; expose model choice |

---

## Open Questions for Phase 3C

1. **Model download UX:** Should Phase 3C include a "Download recommended model" button, or strictly keep model path as a manual user-provided path? (Phase 3D defers this, but the Settings UI design should leave room for it.)

2. **Language detection:** Should the default language be `"auto"` (whisper.cpp detects automatically) or require explicit selection? Auto-detection adds ~100ms latency per transcription.

3. **Partial result display:** Should the UI show "Transcribing..." with a spinner during the whisper.cpp call, or a progress bar? The call is synchronous and duration depends on model size and recording length.

4. **Async vs blocking:** `WhisperEngine::transcribe` is CPU-bound and may take 1–5 seconds. Should Phase 3C run it on a Tokio `spawn_blocking` thread, or in a dedicated OS thread managed by cpal?

5. **Minimum model requirement:** Should Lisa enforce a minimum model size in Settings validation, or allow any `.bin` file including `ggml-tiny` (which has lower accuracy)?

---

## Final Recommendation

### Chosen Architecture

| Decision Point | Choice | Rationale |
|---|---|---|
| STT engine | `whisper-rs` (whisper.cpp) | Best multilingual quality; Arabic support; most mature Rust binding |
| Engine fallback | `sherpa-onnx` | No C++ compilation; prebuilt libs; Whisper ONNX quality equivalent |
| Audio capture | `cpal` (direct, in-process) | Both community Tauri plugins wrap cpal; direct use gives full PCM control |
| Capture model | Record-then-transcribe | Matches existing state machine; simpler than streaming for push-to-talk |
| Model delivery (3C) | User-provided path in Settings | No model committed to git; no auto-download during build |
| Model delivery (3D) | In-app downloader | Future phase; deferred |
| First recommended model | `ggml-base.bin` (~147MB) | Balanced quality/size; fits typical developer machines |
| Privacy | All on-device | No audio leaves the machine at any point |

### What Phase 3B Proved

The `SttEngine` trait abstraction in `src-tauri/src/stt.rs` demonstrates:
- The trait boundary is implementable in pure Rust with zero new dependencies
- The `SttError` variants cover all failure modes (not configured, model not found, load failed, transcription failed)
- The audio format constants are correct for all candidate engines
- The buffer size math is correct and the 30-second ceiling is safe (960KB heap)
- All 6 tests pass; 40/40 total Rust tests pass; 698/698 frontend tests pass

Phase 3C can begin implementation directly from this document. No further research is required.

---

## Appendix: Phase 3B Proof — stt.rs

The proof code at `src-tauri/src/stt.rs` defines the format contract and trait boundary. It requires no new Cargo dependencies and validates without audio hardware or model files.

**`cargo check` result:** 0 errors, 0 warnings  
**`cargo test -- stt::tests`:** 6/6 pass  
**Total Rust tests:** 40/40 pass  
**Total frontend tests:** 698/698 pass  

The module is declared with `#[allow(dead_code)]` in `lib.rs` because `SttEngine` and `SttError` are not yet used by any production code path. The attribute will be removed in Phase 3C when `WhisperEngine` is wired to the `transcribe_audio` command.
