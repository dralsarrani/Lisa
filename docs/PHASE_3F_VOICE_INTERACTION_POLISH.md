# Phase 3F — Voice Interaction Polish / Session Control

## Summary

Phase 3F closes the gaps between the TTS (Phase 3E) and KeyV push-to-talk (Phase 3D) systems, adds reliable Stop Speaking from all surfaces, and routes all TTS text commands through the deterministic command router instead of falling through to the LLM.

## Deliverables

### 1. TTS–KeyV Conflict Resolution

**File**: `src/components/voice/VoiceInputControl.tsx`

When the user presses KeyV while Lisa is speaking, the component now:
1. Dispatches `CLEAR_TTS_STATE` immediately (optimistic UI update)
2. Fires `invoke("stop_speaking")` asynchronously (terminates SAPI process)
3. Audits `tts_speech_stopped` with `source=keyvptt_conflict`
4. Proceeds with `beginRecording()` or `clearAndBeginRecording()`

Implementation: `stopTtsIfSpeaking()` function, updated via `doStopTtsIfSpeakingRef` each render. Called from the stable keydown handler before beginning any recording action. No prop changes — reads `state.ttsUiStatus` from `useLisa()` directly.

### 2. Stop Speaking from All Surfaces

| Surface | How |
|---|---|
| KeyV press while speaking | `VoiceInputControl.stopTtsIfSpeaking()` |
| Console "■ Stop" button | `ConsolePanel` → `handleStopSpeaking` from App.tsx |
| "stop speaking" text command | `CommandInput` `tts_stop_speaking` case |
| Settings "Stop Speaking" button | `SettingsPanel` local handler (existed in Phase 3E) |
| Emergency Stop | `EMERGENCY_STOP` reducer clears TTS state (existed in Phase 3E) |

### 3. TTS Command Intent Handlers

**File**: `src/components/command/CommandInput.tsx`

Added explicit `case` handlers before `default:` so these intents no longer fall through to the LLM:

| Intent | Command example | Action |
|---|---|---|
| `tts_stop_speaking` | "stop speaking", "be quiet", "shh" | Invokes `stop_speaking`, dispatches `CLEAR_TTS_STATE` |
| `tts_test_voice` | "test voice" | Redirects to Settings UI |
| `tts_enable` | "enable voice output" | `SET_SETTINGS { voiceOutputEnabled: true }` |
| `tts_disable` | "disable voice output" | `SET_SETTINGS { voiceOutputEnabled: false }` |
| `tts_auto_speak_on` | "turn on auto speak" | `SET_SETTINGS { voiceOutputAutoSpeak: true }` |
| `tts_auto_speak_off` | "turn off auto speak" | `SET_SETTINGS { voiceOutputAutoSpeak: false }` |
| `tts_speak_again` | "speak again", "repeat that" | Finds last eligible local_ai interaction, speaks it |

### 4. Console Speaking UX

**Files**: `src/components/console/ConsolePanel.tsx`, `ConsolePanel.css`

- Added `onStopSpeaking?: () => void` prop through `ConsolePanel` → `InteractionCard` → `CompleteResponse`
- While `isSpeaking` is true for an interaction, a "■ Stop" button appears alongside the "Speaking…" indicator
- Clicking it calls `handleStopSpeaking` from App.tsx
- Speaking indicator renders even when `speakEligible` is false (guard condition relaxed to `isSpeaking || speakEligible`)

### 5. Speak Eligibility During Transcription

**File**: `src/core/tts.ts`

`isInteractionSpeakEligible` now blocks when `voiceStatus === "transcribing"` in addition to `"recording"`. This prevents the Speak button from appearing while Whisper is processing audio locally.

## Safety Invariants (unchanged)

- No cloud TTS, no remote API, no API keys
- No audio files generated or persisted
- No spoken text in audit logs — metadata only
- Emergency Stop clears TTS state, keeps orbState = "emergency_stopped"
- Auto-speak deduplication via `autoSpeakCheckedRef` + `spokenInteractionIds` unchanged

## What Was NOT Implemented

- Wake word or always-on listening
- Cloud STT or TTS
- Voice cloning or emotional voice packs
- Speech-to-speech streaming loop
- Screen awareness, desktop/mouse/keyboard control
- Background listening
- Agents, mission planner, semantic memory, secrets vault

## Test Results

- **Frontend**: 798/798 tests pass (5 new tests across `tts.test.ts` and `voice-button.test.ts`)
- **Rust**: 6 feature combinations — all `cargo check` and `cargo test` pass, 0 warnings

## Commit

`Add Phase 3F voice interaction polish`
Tag: `phase-3f-voice-interaction-polish`
