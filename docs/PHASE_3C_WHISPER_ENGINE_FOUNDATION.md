# Phase 3C — Whisper Engine Foundation

**Status:** Complete — Awaiting Approval to Commit  
**Date:** 2026-06-05  
**Tag:** `phase-3c-whisper-engine-foundation`  
**Predecessor:** Phase 3B — Local STT Integration Spike  
**Successor:** Phase 3D — cpal Microphone Capture + KeyV Live Pipeline  

---

## Scope

Phase 3C implements the first real local STT engine boundary for Lisa:

- `WhisperEngine` struct backed by whisper-rs (whisper.cpp)
- Model path validation via filesystem-only checks (always compiled)
- Model load test command (feature-gated — no CI impact)
- Optional developer `transcribe_local_audio_file` command
- Settings UI: model path input, Validate Path, Test Model, Clear buttons
- `sttModelPath` settings field + `STATE_VERSION` 8 → 9 migration
- No live microphone capture — that is Phase 3D
- No model files committed to git

---

## PRD Alignment

| PRD Requirement | Phase 3C Status |
|---|---|
| Local, offline STT | WhisperEngine loads user-provided model; no network calls |
| Privacy-first | Audio never leaves device; no persistent mic access |
| Settings-driven model config | `sttModelPath` field; Validate/Test UI in Settings |
| Audit trail | Existing voice audit events unchanged; no raw transcript in logs |
| KeyV push-to-talk | Still shows "mic capture not implemented" — Phase 3D |
| Arabic + multilingual | whisper-rs `set_language(Some("auto"))` — engine supports it |
| Emergency stop | `canRecord` guard already respected by KeyV layer |

---

## Feature Flag

whisper-rs requires a C++ toolchain (LLVM + CMake on Windows). To keep CI clean:

```toml
[features]
default = []
whisper = ["dep:whisper-rs", "dep:hound"]
```

- `cargo check` / `cargo test` — pass with zero new deps compiled
- `cargo build --features whisper` — enables WhisperEngine + WAV decode
- CI remains green without LLVM or model files

---

## Backend Commands

### `validate_stt_model_path(model_path: String) -> SttModelValidationResult`

Always compiled. Pure filesystem check — does not load the model.

```json
{ "valid": true, "label": "Found: ggml-base.bin", "size_bytes": 147964928, "error": null }
{ "valid": false, "label": "Model file not found", "size_bytes": null, "error": "File not found..." }
```

### `test_whisper_model(model_path: String) -> SttModelTestResult`

Feature-gated. Attempts to load the model; returns load latency. No audio transcribed.

```json
{ "success": true, "latency_ms": 342, "engine_name": "whisper-rs (whisper.cpp)", "error": null }
{ "success": false, "latency_ms": 0, "engine_name": "whisper-rs", "error": "STT model failed to load: ..." }
```

Without `--features whisper`, returns `success: false` with a clear message — does not crash.

### `transcribe_local_audio_file(model_path, audio_path) -> Result<SttTranscriptResult, String>`

Developer/manual validation only. Requires `--features whisper` and a 16 kHz mono 16-bit WAV file. Audio path not logged. Transcript returned to caller only.

---

## Settings Fields (STATE_VERSION 9)

| Field | Type | Default | Purpose |
|---|---|---|---|
| `sttModelPath` | `string` | `""` | Absolute path to GGML/GGUF model file |
| `sttModelLastTestedAt` | `string?` | `undefined` | ISO timestamp of last successful Test Model |
| `sttEngineStatus` | existing | unchanged | `not_configured \| ready \| error` |
| `sttEngineLabel` | existing | unchanged | Human-readable status string |

Migration: v8 → v9 is additive. `{ ...DEFAULT_SETTINGS, ...old.settings }` backfills `sttModelPath: ""` automatically.

---

## Privacy and Audit Behavior

| Guarantee | Implementation |
|---|---|
| No audio to network | whisper-rs runs in-process; no HTTP calls |
| No persistent mic access | cpal not added yet; mic is Phase 3D |
| No audio written to disk | PCM in heap only; no temp files |
| No transcript in audit log | Transcript returned to caller; not emitted as audit event |
| Model path not logged | Path shown in Settings UI only; not in audit trail |

---

## Tests Added

### Rust (46 total, +6 from Phase 3B baseline of 40)

In `stt.rs` (always compiled — no whisper dep):
- `validate_model_path_rejects_empty_string`
- `validate_model_path_rejects_nonexistent_file`
- `validate_model_path_rejects_directory`
- `validate_model_path_accepts_existing_file` (temp file, no model needed)
- `validate_model_path_returns_file_size`
- `pcm_i16_to_f32_empty_input_returns_empty`

In `stt::whisper` (compiled only with `--features whisper`):
- `from_model_path_rejects_empty_path`
- `from_model_path_rejects_nonexistent_file`
- `from_model_path_rejects_directory`
- `from_model_path_rejects_invalid_model_file` (temp fake .bin — tests load failure without panic)
- `decode_wav_rejects_wrong_sample_rate`
- `decode_wav_rejects_stereo`
- `decode_wav_reads_correct_format`

### TypeScript (701 total, +3 from Phase 3A baseline of 698)

In `persistence.test.ts`:
- `STATE_VERSION constant equals 9`
- `v8 state without sttModelPath gets empty string default`
- `v8 state preserves existing settings during migration`
- `default state includes sttModelPath as empty string`

---

## Manual Validation Checklist

**Without a real model (always works):**
- [ ] Settings → Voice Input shows model path input field
- [ ] Empty path + "Validate Path" → clear error, no crash
- [ ] Empty path + "Test Model" button is disabled
- [ ] Create a tiny `.bin` text file → "Validate Path" returns valid (file exists)
- [ ] Same fake file + "Test Model" → load fails with user-readable error, no crash
- [ ] Clear button resets path and engine status

**With a real Whisper model (requires `cargo build --features whisper`):**
- [ ] Paste path to `ggml-base.bin` → Validate Path succeeds
- [ ] Test Model → success, latency shown, engine status becomes "ready"
- [ ] `sttModelLastTestedAt` timestamp appears below section
- [ ] KeyV still says microphone capture not implemented (Phase 3D)

---

## Windows Developer Prerequisites (--features whisper)

Building with `--features whisper` requires a C++ toolchain on Windows. One-time setup:

### Required tools

| Tool | Version tested | Download |
|---|---|---|
| Visual Studio 2022 with "Desktop development with C++" workload | 17.x | visualstudio.microsoft.com |
| LLVM | 18.x | releases.llvm.org |
| CMake | 3.x | cmake.org |

### Environment variables

Set before `cargo build --features whisper` (or add to your shell profile):

```powershell
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
$env:Path = "C:\Program Files\CMake\bin;" + $env:Path
```

### Build and test commands

```powershell
# Check only (no binary produced — fastest CI-equivalent check)
cargo check --features whisper

# Full test suite including whisper-gated tests
cargo test --features whisper

# Release binary
cargo build --release --features whisper
```

CI runs `cargo check` and `cargo test` without the feature flag — no LLVM or CMake required.

---

## Windows Build Fix: whisper-rs 0.16 Upgrade (2026-06-05)

### Root cause

`whisper-rs-sys v0.13.1` (used by whisper-rs 0.14) ships Linux-only pre-generated bindings.
On Windows, bindgen runs but fails to parse C++ headers, generating `whisper_full_params` as a
1-byte struct instead of 264 bytes. The layout test then panics:

```
error[E0080]: attempt to compute `1_usize - 264_usize`, which would overflow
```

Setting `WHISPER_DONT_GENERATE_BINDINGS=1` does **not** fix this — it forces whisper-rs-sys to
use those same Linux-specific pre-generated bindings, which embed glibc types (`_G_fpos_t`,
`_IO_FILE`) with sizes that do not match MSVC's C runtime. Different layout failure, same result.

### Fix applied

Upgraded `whisper-rs` from `0.14` → `0.16` in `Cargo.toml`. This pulls in:

- `whisper-rs-sys v0.15.0` — generates Windows-native bindings via bindgen at build time
- `bindgen v0.72.1` — supports MSVC targets without Linux type contamination

Two API call sites in `stt.rs` were updated for the 0.16 API:

| whisper-rs 0.14 | whisper-rs 0.16 |
|---|---|
| `state.full_n_segments()?` → `Result<i32, _>` | `state.full_n_segments()` → `i32` directly |
| `state.full_get_segment_text(i)?` → `Result<String, _>` | `state.get_segment(i)` → `Option<WhisperSegment>`, then `.to_str()?` |

`WhisperEngine` also gained `#[derive(Debug)]` required by `unwrap_err()` in tests (previously
not surfaced because `cargo test` without `--features whisper` skips the whisper module).

### Validated on

- Windows 11 Home, x86_64-pc-windows-msvc
- LLVM 18, CMake 3.x, Visual Studio 2022 17.x
- `cargo check --features whisper` — pass
- `cargo test --features whisper` — 53/53 pass
- `cargo check` / `cargo test` (no feature) — 46/46 pass
- `npm run typecheck`, `npm run build`, `npx vitest run` — 701/701 pass

---

## Known Limitations

- Live microphone capture not connected — KeyV still shows placeholder status
- `--features whisper` not in default build; developer must opt in
- No in-app model downloader — user provides path manually (Phase 3D adds downloader)
- `transcribe_local_audio_file` accepts only pre-converted 16 kHz mono WAV files

---

## Phase 3D Plan

Phase 3D will connect the WhisperEngine to live microphone capture:

1. Add `cpal` dependency for WASAPI audio capture on Windows
2. Open cpal input stream on KeyV down; accumulate PCM into `Vec<i16>` ring buffer (max 30s)
3. On KeyV release: invoke `WhisperEngine::transcribe(&samples)` on a blocking thread
4. Emit Tauri event `voice_transcript_result` to frontend
5. Frontend transitions `voiceStatus` from `transcribing` → `preview`
6. User confirms → transcript submitted as command
7. Add `microphone` capability to `tauri.conf.json` after explicit review
