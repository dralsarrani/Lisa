# Phase 4A — Screen Awareness Foundation

## Overview

Phase 4A adds manual, explicit, local-only screen capture to Lisa. This is a foundational capability — it captures metadata (resolution, timestamp) only, never raw pixels, base64, or OCR output. All capture is user-initiated; no background monitoring exists.

## Safety Rules (Non-Negotiable)

| Rule | Implementation |
|------|---------------|
| No background capture | No timers, observers, or periodic triggers. Every capture requires explicit user action. |
| No automatic capture | The backend never calls `capture_screen` without a user command or button press. |
| No pixel/image data to frontend | The Tauri command returns width, height, timestamp, and provider only. |
| No base64 or raw image in LLM | `llm-context.ts` injects metadata text only when `screenContextEnabledForPrompt` is on. |
| No screenshot upload | PowerShell writes to OS temp dir only. No network calls. |
| No OCR | Metadata only. Text extraction is a future phase. |
| User can always clear | `clear screen context` command and Settings button both invoke `clear_screen_capture`. |
| Privacy mode suppression | Capture is blocked in Sleep, Privacy, and Lockdown modes when `screenSuppressInPrivacyModes` is true. |
| Approval cannot unlock excluded features | Background capture, OCR, and cloud upload are excluded regardless of approval status. |

## Architecture

### Rust Backend (`src-tauri/src/screen.rs`)

Feature-gated with `screen-capture = []` in `Cargo.toml` (no new crate dependencies).

Three Tauri commands:
- `get_screen_capture_status` — returns `ScreenCaptureStatus` (available flag, provider, last capture metadata)
- `capture_screen` — on Windows+`screen-capture`: PowerShell captures primary screen to OS temp PNG, returns `ScreenCaptureResult` (width, height, timestamp, provider). On all other builds: returns `accepted: false`.
- `clear_screen_capture` — deletes temp file and clears `ScreenManager` state.

`ScreenManager` holds three `Mutex<Option<_>>` fields: `last_capture_id`, `last_capture_at`, `last_capture_path`. Registered via `.manage(screen::ScreenManager::new())` in `lib.rs`.

The PowerShell script outputs only `width=N` and `height=N` to stdout. No base64, no pixel data, no OCR.

### Frontend State (`src/app/lisa-reducer.ts`)

Transient screen state in `LisaState` — never persisted:

```ts
screenStatus: ScreenStatus;          // "idle" | "capturing" | "available" | "error"
screenCaptureId?: string;
screenCapturedAt?: number;           // Unix milliseconds
screenWidth?: number;
screenHeight?: number;
screenProvider?: string;
screenError?: string;
```

Two new actions:
- `SET_SCREEN_STATUS` — updates all fields from capture result
- `CLEAR_SCREEN_CONTEXT` — resets all fields to idle/undefined

`EMERGENCY_STOP` clears all screen fields.

### Settings (`src/core/types.ts`)

Four new fields in `LisaSettings` (backfilled via `DEFAULT_SETTINGS` spread — no `STATE_VERSION` bump needed):

```ts
screenAwarenessEnabled: boolean;                    // default: false
screenCaptureProvider: "windows_capture" | "none";  // default: "none"
screenContextEnabledForPrompt: boolean;             // default: false
screenSuppressInPrivacyModes: boolean;              // default: true
```

### Command Router (`src/core/command-router.ts`)

Deterministic routes:
- `capture screen`, `take screenshot`, `take a screenshot`, `look at my screen`, `look at the screen` → `capture_screen`
- `what can you see`, `what do you see`, `describe screen context` → `screen_what_can_you_see`
- `clear screen context`, `forget screen context`, `clear screen` → `clear_screen_context`
- `enable screen awareness`, `turn on screen awareness` → `screen_awareness_enable`
- `disable screen awareness`, `turn off screen awareness` → `screen_awareness_disable`

`getScreenCapabilityMessage()` provides canned honest answers for background watching, OCR, screenshot upload, and general capability questions.

`BLOCKED_DESKTOP_ACTIONS` no longer blocks `/capture.*screen/` — explicit Phase 4A capture is allowed. OCR-style `/read.*screen/` remains blocked.

### LLM Context (`src/core/llm-context.ts`)

Updated system prompt screen section (replaces old placeholder wording):
- Describes manual-only capture, metadata-only results, local-only storage
- States no background monitoring, no OCR, no cloud upload
- Instructs Lisa how to respond to "what can you see" with and without context
- States `clear screen context` command is available
- States capture is suppressed in privacy modes

### UI

**Settings Panel** (`src/components/settings/SettingsPanel.tsx`):
- Screen Awareness section (between Voice Conversation and Phase Flags)
- Enable/disable toggle
- Include-in-prompt toggle
- Suppress-in-privacy-modes toggle
- Status badge showing current `screenStatus`
- Capture button (disabled if already capturing or in suppressed mode)
- Clear button (shown when `screenStatus === "available"`)
- Captured-at display and error display

**Console Panel** (`src/components/console/ConsolePanel.tsx`):
- Screen context card shown when `screenStatus === "available"`
- Displays captured-at time, resolution (width x height), and provider
- "Metadata only · Local · No OCR · Not uploaded" safety note
- Card is above the interaction feed, below the header

## Tests Added

| File | Tests Added |
|------|------------|
| `command-router.test.ts` | `capture_screen`, `screen_what_can_you_see`, `clear_screen_context`, `screen_awareness_enable/disable` routing; `getScreenCapabilityMessage` for 4 query categories; guard passthrough for explicit capture |
| `llm-context.test.ts` | Phase 4A screen awareness boundary: manual capture, no background, metadata only, local only, `clear screen context` command, no stale wording |
| `lisa-reducer.test.ts` | `screenStatus` defaults, `SET_SCREEN_STATUS`, `CLEAR_SCREEN_CONTEXT`, `EMERGENCY_STOP` screen clearing |
| `persistence.test.ts` | `DEFAULT_SETTINGS` values, backfill of 4 screen fields from old state, round-trip persistence of `screenAwarenessEnabled` and `screenContextEnabledForPrompt` |

## Validation Results

```
npm run typecheck   — no errors
npm run build       — 335 modules transformed
npx vitest run      — 927 tests passed (18 files)
cargo check         — compiles clean
cargo test          — 108 tests passed
cargo check --features screen-capture  — compiles clean
cargo test --features screen-capture   — 107 tests passed
```

## What Phase 4A Does NOT Include

- OCR / text extraction from screenshots
- Cloud upload or sharing of screenshots
- Background or periodic capture
- LLM image understanding (no base64 sent to model)
- Desktop control
- Any screen content in audit logs
- Screenshot content injected into LLM text beyond metadata (width, height, timestamp)

These are explicitly excluded and cannot be unlocked by approval.

## Future Phases

- **Phase 4B**: OCR integration (extract text from captured PNG using local engine)
- **Phase 4C**: LLM vision integration (send screenshot to vision-capable model with strict consent gate)
- **Phase 4D**: Multi-monitor support, window-level capture
