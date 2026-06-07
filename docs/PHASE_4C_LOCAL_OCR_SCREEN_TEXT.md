# Phase 4C — Local OCR / Screen Text Understanding

## Summary

Phase 4C adds manual, local-only screen text extraction to Lisa using the Windows built-in WinRT OCR engine (via PowerShell subprocess). No new Cargo dependencies are required. OCR is always manual and explicit — it never runs in the background, never uploads anything, and never activates automatically.

## What Was Built

### Rust Backend (`src-tauri/src/ocr.rs`)

- `OcrStatus` — reports availability (not_compiled / not_configured / available)
- `OcrResult` — carries accepted, provider, text, chars, lines, error
- `OcrManager` — mutex-guarded state: last OCR text, chars, lines, provider, timestamp
- `is_lisa_managed_screenshot(path)` — path safety validator: only `lisa_screen_*.png` files in OS temp dir are accepted; rejects path traversal, wrong prefixes, wrong extensions
- `get_ocr_status` Tauri command — returns current engine availability
- `run_screen_ocr(image_path)` Tauri command — validates path, runs WinRT OCR via PowerShell
- `clear_screen_text` Tauri command — zeros all OcrManager fields
- Feature-gated: `#[cfg(all(windows, feature = "ocr"))]`
- 15+ inline unit tests

### Cargo Feature (`src-tauri/Cargo.toml`)

```toml
ocr = []
```

Build with: `cargo build --features ocr`

### Frontend State (`src/app/lisa-reducer.ts`)

New transient (non-persisted) state fields on `LisaState`:

- `screenOcrStatus: ScreenOcrStatus` — "idle" | "running" | "available" | "error"
- `screenOcrText?: string`
- `screenOcrChars?: number`
- `screenOcrLines?: number`
- `screenOcrProvider?: string`
- `screenOcrError?: string`
- `screenOcrCapturedAt?: number`

New actions:

- `SET_SCREEN_OCR_STATUS` — updates all OCR fields from payload
- `CLEAR_SCREEN_TEXT` — zeros all OCR state
- `EMERGENCY_STOP` now also clears all OCR state
- `CLEAR_SCREEN_CONTEXT` now also clears all OCR state

### Frontend Types (`src/core/types.ts`)

New settings on `LisaSettings`:

- `screenOcrEnabled: boolean` — master OCR enable toggle
- `screenOcrProvider: "windows_ocr" | "not_configured" | "none"`
- `screenTextEnabledForPrompt: boolean` — inject OCR text into local AI context
- `screenOcrSuppressInPrivacyModes: boolean` — block OCR in Sleep/Privacy/Lockdown
- `showScreenTextPreview: boolean` — show OCR text card in Console

New audit event types: `ocr_started`, `ocr_completed`, `ocr_failed`, `screen_text_cleared`

New command intents: `run_screen_ocr`, `screen_what_can_you_read`, `clear_screen_text`, `check_ocr_status`

New type: `ScreenOcrStatus`

`STATE_VERSION` bumped 9 → 10 (triggers migration so older persisted states get OCR setting defaults).

### Command Router (`src/core/command-router.ts`)

Four new deterministic command routes (before LLM fallback):

| Phrases | Intent |
|---------|--------|
| "read screen text", "run ocr", "extract screen text", "scan screen text", "ocr screen" | `run_screen_ocr` |
| "what can you read", "what text is on my screen", "what text can you see", "read screen", "show screen text" | `screen_what_can_you_read` |
| "clear screen text", "forget screen text", "delete screen text" | `clear_screen_text` |
| "check ocr", "check ocr status", "ocr status" | `check_ocr_status` |

New exported helper `formatOcrResponse(ocrState)` — grounded deterministic response with OCR text excerpt (capped at 500 chars); never invokes LLM.

### LLM Context (`src/core/llm-context.ts`)

- System prompt updated with Phase 4B/4C screen awareness section: manual OCR, imperfection disclaimer, "what can you see" vs "what can you read" distinction, suppression in privacy modes, OCR text cap
- `formatOcrTextForContext(text)` — wraps OCR text in delimiters, caps at 4000 chars
- `buildOllamaMessages()` extended with `ocrText` and `includeOcrText` parameters
- OCR text only injected when user has enabled "Include Screen Text in Local AI" (`screenTextEnabledForPrompt`)

### Settings UI (`src/components/settings/SettingsPanel.tsx`)

New OCR section under Screen Awareness:

- Enable OCR toggle
- Show Screen Text Preview toggle
- Include Screen Text in Local AI toggle (injects into local Ollama context only)
- OCR result status field (idle / running / available / error)
- "Read Screen Text" button — runs OCR on last captured screenshot
- "Clear Screen Text" button — clears extracted text
- Safety note updated to mention OCR commands

### Console Panel (`src/components/console/ConsolePanel.tsx` + `ConsolePanel.css`)

- New OCR text preview card rendered when `screenOcrStatus === "available" && showScreenTextPreview`
- Shows: Lines, Characters, Provider, OCR text excerpt (500 char cap), note about local-only imperfect OCR
- Indigo color variant (distinct from cyan screen context card)

## Safety Constraints

1. **No cloud upload** — all OCR is local Windows WinRT; no network requests
2. **No background OCR** — OCR only runs when explicitly invoked by user command or Settings button
3. **No automatic OCR** — there is no periodic, scheduled, or trigger-based OCR
4. **Path injection prevention** — `is_lisa_managed_screenshot()` validates: path must be in OS temp dir AND filename must match `lisa_screen_*.png`
5. **Audit safety** — OCR text body never appears in audit log details; only `chars=N lines=N provider=...` metadata is logged
6. **OCR state is transient** — not included in `PersistedState`; clears on restart, emergency stop, and clear screen context
7. **Privacy mode suppression** — OCR is blocked in Sleep, Privacy, and Lockdown modes
8. **Imperfection acknowledged** — system prompt and response helpers explicitly note OCR may be imperfect

## Build Instructions

```sh
# Frontend only
npm run build

# Tauri with OCR enabled
cargo build --features "screen-capture ocr"

# All features
cargo build --features "voice-live tts-sapi screen-capture ocr"
```

## User Commands

| Command | Action |
|---------|--------|
| `capture screen` | Capture screen metadata + screenshot (Phase 4B) |
| `read screen text` | Run OCR on last captured screenshot |
| `what can you read` | Show extracted OCR text (grounded, no LLM) |
| `clear screen text` | Clear extracted OCR text |
| `check ocr` | Show OCR engine status |
| `clear screen context` | Clear all screen state including OCR |

## Testing

- Vitest: 1026/1026 (includes OCR command routing, reducer state, persistence defaults, LLM context injection)
- Rust: 121/121 with `--features "screen-capture ocr"` (includes path validation, manager state, serialization, line counting)

## Phase Gate

Tag: `phase-4c-local-ocr-screen-text`
