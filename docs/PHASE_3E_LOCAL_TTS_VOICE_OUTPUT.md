# Phase 3E — Local TTS Voice Output Foundation

## Overview

Phase 3E adds local text-to-speech (TTS) voice output to Lisa. All speech is synthesized on-device using Windows built-in SAPI via a PowerShell stdin pipe. No audio is stored, no cloud services are contacted, and spoken text is never logged.

## What Was Built

### Backend (Rust / Tauri)

- `src-tauri/src/tts.rs` — TTS engine: `speak_text`, `stop_speaking`, `get_tts_status` commands; Windows SAPI via `powershell -Command -` stdin pipe; `feature = "tts-sapi"` cfg-gated; 6 dead-code warnings eliminated
- `src-tauri/src/lib.rs` — TTS commands registered; `TtsManager` state managed
- `src-tauri/Cargo.toml` — `tts-sapi = []` feature flag

### Frontend Types (`src/core/types.ts`)

New `LisaSettings` fields:
- `voiceOutputEnabled: boolean` — master toggle (default: `false`)
- `voiceOutputAutoSpeak: boolean` — auto-speak after each AI response (default: `false`)
- `voiceOutputProvider: "windows" | "piper" | "none"` (default: `"windows"`)
- `voiceOutputVoiceId?: string`
- `voiceOutputRate?: number`
- `voiceOutputVolume?: number`
- `voiceOutputSuppressInPrivacyModes: boolean` (default: `true`)

New types:
- `TtsUiStatus = "idle" | "checking" | "available" | "unavailable" | "speaking" | "error"`

New `AuditEventType` values: `tts_status_checked`, `tts_test_started`, `tts_test_completed`, `tts_test_failed`, `tts_speech_started`, `tts_speech_completed`, `tts_speech_stopped`, `tts_speech_failed`, `tts_auto_speak_blocked`

New `CommandIntent` values: `tts_test_voice`, `tts_stop_speaking`, `tts_enable`, `tts_disable`, `tts_auto_speak_on`, `tts_auto_speak_off`, `tts_speak_again`

`STATE_VERSION` stays at 9 — `DEFAULT_SETTINGS` spread in `persistence.ts` fills new fields for all existing persisted state.

### TTS Helper (`src/core/tts.ts`)

Pure side-effect-free functions:
- `isTtsSuppressedMode(modeId)` — true for sleep, privacy, lockdown
- `isInteractionSpeakEligible(interaction, opts)` — checks kind, status, response, voiceOutputEnabled, orbState, voiceStatus
- `shouldAutoSpeakInteraction(interaction, opts)` — checks auto-speak setting, eligibility, mode suppression, deduplication
- `buildTtsSpeechAuditDetails(opts)` — metadata only, no spoken text
- `buildTtsTestAuditDetails(opts)` — metadata only

### Reducer (`src/app/lisa-reducer.ts`)

New TTS transient state (not persisted):
- `ttsUiStatus: TtsUiStatus`
- `ttsProvider: string | null`
- `ttsError: string | null`
- `ttsSpeakingInteractionId: string | null`
- `spokenInteractionIds: string[]`

New actions: `SET_TTS_STATUS`, `SET_TTS_SPEAKING`, `CLEAR_TTS_STATE`, `MARK_INTERACTION_SPOKEN`

`EMERGENCY_STOP` clears TTS UI state and speaking interaction ID but does NOT clear `spokenInteractionIds` (historical deduplication record preserved).

`SET_TTS_SPEAKING` with `interactionId !== null` transitions `orbState` to `"speaking"`. With null, restores to `"idle"` only if orbState was `"speaking"`.

### Settings UI (`src/components/settings/SettingsPanel.tsx`)

Voice Output section:
- TTS engine status badge + Check button (invokes `get_tts_status`)
- Enable Voice Output toggle
- Auto-Speak Responses toggle (disabled when voice output off)
- Suppress in Sleep/Privacy/Lockdown toggle (disabled when voice output off)
- Test Voice button (speaks "Hello, I am Lisa." via `speak_text`)
- Stop Speaking button (invokes `stop_speaking`, dispatches `CLEAR_TTS_STATE`)
- Phase 3E privacy note (no stored audio, metadata-only audit)

### Console UI (`src/components/console/ConsolePanel.tsx`)

- Speak button on eligible completed `local_ai` interactions (calls `isInteractionSpeakEligible`, shown only when `onSpeak` prop is provided)
- Speaking indicator (pulsing "Speaking…" text) when `ttsSpeakingInteractionId === interaction.id`

### App Integration (`src/App.tsx`)

- `handleSpeak(interaction)` — invokes `speak_text`, dispatches `SET_TTS_SPEAKING` + `MARK_INTERACTION_SPOKEN`, adds audit metadata, dispatches `CLEAR_TTS_STATE` on complete/fail
- Auto-speak `useEffect` — watches `state.interactions`, calls `shouldAutoSpeakInteraction` on the latest completed `local_ai` interaction, calls `handleSpeak` if allowed; deduplicates via `autoSpeakCheckedRef`

### Command Router (`src/core/command-router.ts`)

New commands: `test voice`, `stop speaking`, `enable/disable voice output`, `auto speak on/off`, `silent mode`, `speak again`, `repeat that`

TTS capability QA response updated to Phase 3E language (no longer says "not implemented").

### LLM Context (`src/core/llm-context.ts`)

System prompt updated: replaced "TTS NOT YET IMPLEMENTED" with Phase 3E description — Settings → Voice Output, Windows SAPI, suppression in privacy modes, no cloud TTS.

## Safety Constraints

- No spoken text in audit logs, errors, or tool results — metadata only
- No cloud TTS, no remote APIs, no API keys, no generated audio files
- User text passed through PowerShell stdin only — never embedded in the script string
- Voice output suppressed in Sleep, Privacy, and Lockdown modes (when suppression enabled)
- Emergency Stop clears TTS speaking state immediately; orbState stays `emergency_stopped`
- Auto-speak never fires when microphone is recording (voice input takes priority)
- Auto-speak deduplication prevents repeat-on-rerender via `spokenInteractionIds` state + `autoSpeakCheckedRef`

## Not Implemented (Explicit Boundaries)

- Wake word / always-on listening
- Speech-to-speech loop
- Emotional voice packs / voice cloning
- Cloud TTS
- Voice output in non-Windows builds (feature-gated)
- Piper or other local TTS engines (provider field reserved for future)

## Validation

- `npm run typecheck` — clean (0 errors)
- `npm run build` — clean (0 warnings)
- `npx vitest run` — 793 tests, all passing (793/793)
- `cargo check` — clean
- `cargo check --features tts-sapi` — clean
- `cargo test` — 97 tests, all passing
- `cargo test --features tts-sapi` — 97 tests, all passing (1 pre-existing dead_code warning on `TTS_PROVIDER_NOT_COMPILED` under test+tts-sapi feature combo)
