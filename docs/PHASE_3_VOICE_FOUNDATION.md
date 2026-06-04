# Phase 3A — Push-to-Talk Voice Input Foundation

## Summary

Phase 3A adds the voice input UI layer to Lisa: push-to-talk trigger, transcript preview, and honest placeholder state while local STT is not yet configured.

## What was built

### Types and State (`src/core/types.ts`)
- `VoiceStatus`: `"idle" | "recording" | "transcribing" | "preview" | "error"`
- `SttEngineStatus`: `"not_configured" | "ready" | "error"`
- Voice settings on `LisaSettings`: `voiceInputEnabled`, `pushToTalkKey`, `sttEngineStatus`, `sttEngineLabel`
- 7 voice audit event types added to `AuditEventType`
- `STATE_VERSION` bumped 7 → 8

### Reducer (`src/app/lisa-reducer.ts`)
- Transient voice state added to `LisaState` (not persisted): `voiceStatus`, `voiceTranscriptDraft`, `voiceError`
- New actions: `SET_VOICE_STATUS`, `SET_VOICE_TRANSCRIPT_DRAFT`, `SET_VOICE_ERROR`, `CLEAR_VOICE_STATE`
- `EMERGENCY_STOP` now clears all voice state
- `CLEAR_VOICE_STATE` resets `orbState` from `"listening"` → `"idle"` only (leaves `"thinking"` / `"speaking"` untouched)

### Persistence (`src/core/persistence.ts`)
- v7 → v8 migration: additive only; `DEFAULT_SETTINGS` spread supplies new voice defaults

### Voice UI (`src/components/voice/VoiceInputControl.tsx`, `.css`)
- KeyV-only push-to-talk component: no visible mic button; idle state shows a subtle helper hint only
- Idle hint: `Voice UI Test: hold V when not typing.`
- State machine: `idle → recording → transcribing → preview` (or `error`)
- Only trigger: hold KeyV when focus is outside the command input — no button, no click-to-record
- `recordingSourceRef` tracks keyboard-started recordings — KeyV keyup only stops keyboard-started recordings
- Window blur cancels keyboard-started recording safely
- Escape cancels recording or dismisses preview/error card
- Result card title: "Voice UI test result"; STT NOT CONFIGURED badge; body states no speech transcribed and no command sent
- No Send transcript button — no submission path for placeholder text
- No Re-record button — user presses KeyV again after discarding
- 7 audit events emitted; transcript content never logged for placeholder (`engine=placeholder, status=not_configured`)

### CommandInput integration (`src/components/command/CommandInput.tsx`)
- `VoiceInputControl` rendered below suggestions with `isProcessing` prop only — no `onSubmitVoice`

### Settings UI (`src/components/settings/SettingsPanel.tsx`)
- New Voice Input section: enable toggle, STT engine status badge, push-to-talk key display, privacy disclaimer
- Removed stale "Voice (Phase 1B) — Not yet" flag stub
- Build Info updated to Phase 3A

### Rust backend (`src-tauri/src/lib.rs`)
- `SttResult` struct: `{ status, transcript, engine }`
- `transcribe_voice_placeholder` command: returns `{ status: "not_configured", transcript: null, engine: "placeholder" }` — no audio capture, no network
- Registered in `invoke_handler`

## Local AI prompt boundary

The system prompt in `src/core/llm-context.ts` accurately describes Phase 3A voice state to the local model:

- Voice input UI exists (Phase 3A push-to-talk foundation)
- Push-to-talk via KeyV only — no visible mic button; hold KeyV when command box is not focused
- Lisa does not listen in the background; no wake word; no always-on listening
- No audio sent to any network service; no cloud STT
- Local STT is NOT YET CONFIGURED — placeholder only; real transcription unavailable
- Voice output (TTS) NOT YET IMPLEMENTED
- Model is instructed not to claim real transcription is working

### Deterministic capability guard (`src/core/command-router.ts`)

`getVoiceCapabilityMessage()` intercepts voice-related questions before the LLM fallback. Small local models (e.g. llama3.2:1b) ignore system-prompt boundaries; this guard ensures accurate answers regardless of model quality. Covers:

1. General voice capability — routes to Phase 3A description with KeyV as the only trigger
2. Background listening — denies; push-to-talk only
3. Wake word — denies; KeyV push-to-talk only
4. TTS / speak back — denies; text-only responses
5. No mic button / "there is no mic button" — confirms KeyV-only; Phase 3A has no visible mic button
6. KeyV not working / worked once then stopped — explains command-box focus blocks shortcut
7. Nothing happened / why didn't Lisa answer voice — explains Phase 3A is UI test only, no transcription
8. Voice not working (general) — explains KeyV flow and focus requirement

## Privacy guarantees

- No audio is ever captured or transmitted (placeholder only)
- No always-on listening; voice only activates on explicit KeyV hold
- Audit logs record only `transcript_chars=N`, never transcript content

## What is NOT in Phase 3A

- Real microphone capture (requires Tauri plugin integration)
- Real local STT engine (Whisper.cpp or similar)
- Wake word / hotkey activation
- TTS / voice output

## Known root causes fixed in this session

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Mic button not visible | `background: rgba(8,14,28,0.92)` — near-black on dark HUD; 48%-opacity border; 0.70rem text; no min-height | `background: rgba(26,159,255,0.13)`, `border: 1.5px solid rgba(26,159,255,0.70)`, `min-height: 40px`, `font-size: 0.78rem`, stronger glow |
| 2 | KeyV stops after typing | `CommandInput.tsx:1002` `inputRef.current?.focus()` refocuses text input after every command; `tag === "INPUT"` blocks KeyV silently | Click-primary UX documented; shortcut hint added; Settings label updated to "works only when command box is not focused" |
| 3 | User expects real transcription | Labels "Start Voice Test"/"Listening…"/"Voice test result" implied real speech processing | Renamed to "Start Voice UI Test"/"Checking STT…"/"Voice UI test result"; result body explicitly says no speech transcribed and no command sent |
| 4 | Placeholder submission | Already guarded by `handleSend` and hidden Send button | Verified safe; added `STT: Not configured` badge to idle state |
| 5 | "there is no mic button" not intercepted | Old regex didn't cover `there is no mic` phrase | Added `\bthere\s+is\s+no\s+mic` pattern to VOICE_CAPABILITY_QA |
| 6 | "KeyV worked once then stopped" not intercepted | Old regex didn't cover `worked.*stopped` | Added `worked.*stopped\|stopped\s+working` to KeyV pattern |

## Validation

```
npm run typecheck   → clean
npm run build       → 333 modules, clean
npx vitest run      → 691/691 passed
cargo check         → clean
cargo test          → clean
```
