import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { VoiceStatus, TtsUiStatus } from "../../core/types";
import { useLisa } from "../../app/useLisa";
import "./VoiceInputControl.css";

// ── Pure state-machine helper — exported for regression tests ─────────────────
//
// Returns the action the KeyV keydown handler should take given the current
// voice status and whether recording is allowed.
//
// "start"   → begin a new recording from idle
// "restart" → clear the existing result/error and begin a new recording
// "ignore"  → do nothing (recording/transcribing in progress, or cannot record)

export type KeyVAction = "start" | "restart" | "ignore";

export function getKeyVAction(
  voiceStatus: VoiceStatus,
  canRecord: boolean
): KeyVAction {
  if (!canRecord) return "ignore";
  if (voiceStatus === "idle") return "start";
  if (voiceStatus === "preview" || voiceStatus === "error" || voiceStatus === "no_transcript") return "restart";
  return "ignore"; // "recording" or "transcribing" — let the current cycle finish
}

// ── Transcription helpers — exported for tests ────────────────────────────────

export const TRANSCRIPTION_TIMEOUT_MS = 90_000;

export type TranscriptionInvokeResult = {
  success: boolean;
  transcript: string | null;
  duration_ms: number;
  error: string | null;
};

export type TranscriptionResolved =
  | { action: "preview"; transcript: string }
  | { action: "no_speech" }
  | { action: "error"; message: string };

export function resolveTranscriptionResult(
  result: TranscriptionInvokeResult
): TranscriptionResolved {
  if (!result.success || result.error) {
    return { action: "error", message: result.error ?? "Transcription failed" };
  }
  const t = result.transcript;
  if (t && t.trim().length > 0) {
    return { action: "preview", transcript: t };
  }
  return { action: "no_speech" };
}

// ── Model gate — exported for regression tests ────────────────────────────────
//
// Three states determine what happens when the user presses KeyV:
//   "no_model"    → path is empty — show the missing-model error
//   "model_error" → path is set but last load attempt failed — show load-failed error
//   "ready"       → path is set and status is ok — allow recording

export type ModelGateResult = "no_model" | "model_error" | "ready";

// ── Review card string constants — exported for regression tests ──────────────

export const VOICE_REVIEW_TITLE = "Voice Transcript Ready";
export const VOICE_REVIEW_SUBTITLE = "Review before sending";
export const VOICE_REVIEW_NOTE = "Not sent yet — click Send Transcript to submit.";
export const VOICE_NO_TRANSCRIPT_TITLE = "No Transcript Produced";
export const VOICE_ERROR_TITLE = "Voice Capture Error";

// CSS class names for the fixed HUD overlay — exported for regression tests
export const VOICE_HUD_OVERLAY_CLASS = "voice-hud-overlay";
export const VOICE_HUD_CARD_CLASS = "voice-hud-card";

export function resolveModelGate(
  sttModelPath: string,
  sttEngineStatus: "not_configured" | "ready" | "error"
): ModelGateResult {
  if (!sttModelPath.trim()) return "no_model";
  if (sttEngineStatus === "error") return "model_error";
  return "ready";
}

// ── Component ────────────────────────────────────────────────────────────────────

interface VoiceInputControlProps {
  isProcessing: boolean;
  onSendTranscript: (transcript: string) => Promise<void>;
}

export const VoiceInputControl: React.FC<VoiceInputControlProps> = ({
  isProcessing,
  onSendTranscript,
}) => {
  const { state, dispatch, addAudit } = useLisa();
  const { voiceStatus, voiceTranscriptDraft, voiceError, ttsUiStatus } = state;
  const { voiceInputEnabled, sttEngineStatus, pushToTalkKey, sttModelPath } = state.settings;
  const isEmergencyStopped = state.orbState === "emergency_stopped";
  const canRecord = voiceInputEnabled && !isEmergencyStopped && !isProcessing;
  const modelConfigured = sttModelPath.trim() !== "";

  // ── State refs ────────────────────────────────────────────────────────────────
  const voiceStatusRef = useRef(voiceStatus);
  voiceStatusRef.current = voiceStatus;

  const canRecordRef = useRef(canRecord);
  canRecordRef.current = canRecord;

  const voiceInputEnabledRef = useRef(voiceInputEnabled);
  voiceInputEnabledRef.current = voiceInputEnabled;

  const isEmergencyStoppedRef = useRef(isEmergencyStopped);
  isEmergencyStoppedRef.current = isEmergencyStopped;

  const pushToTalkKeyRef = useRef(pushToTalkKey);
  pushToTalkKeyRef.current = pushToTalkKey;

  const modelConfiguredRef = useRef(modelConfigured);
  modelConfiguredRef.current = modelConfigured;

  const sttEngineStatusRef = useRef(sttEngineStatus);
  sttEngineStatusRef.current = sttEngineStatus;

  const sttModelPathRef = useRef(sttModelPath);
  sttModelPathRef.current = sttModelPath;

  const voiceTranscriptDraftRef = useRef(voiceTranscriptDraft);
  voiceTranscriptDraftRef.current = voiceTranscriptDraft;

  const ttsUiStatusRef = useRef<TtsUiStatus>(ttsUiStatus);
  ttsUiStatusRef.current = ttsUiStatus;

  // Tracks whether in-progress recording was keyboard-started.
  // KeyV keyup only stops a keyboard-started recording.
  const recordingSourceRef = useRef<"keyboard" | null>(null);

  // ── Action refs — updated each render after function definitions ──────────────
  const doBeginRef = useRef<() => Promise<void>>(async () => {});
  const doClearAndBeginRef = useRef<() => Promise<void>>(async () => {});
  const doTranscribeRef = useRef<() => Promise<void>>(async () => {});
  const doDiscardRef = useRef<() => void>(() => {});
  const doCancelRef = useRef<() => Promise<void>>(async () => {});
  const doStopTtsIfSpeakingRef = useRef<() => void>(() => {});

  // ── Stable keyboard + blur effect — registered once on mount ─────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (!voiceInputEnabledRef.current || isEmergencyStoppedRef.current) return;

      // Escape: cancel active recording, or clear preview/error
      if (e.key === "Escape") {
        if (voiceStatusRef.current === "recording") {
          void doCancelRef.current();
        } else if (
          voiceStatusRef.current === "preview" ||
          voiceStatusRef.current === "error" ||
          voiceStatusRef.current === "no_transcript"
        ) {
          doDiscardRef.current();
        }
        return;
      }

      // Block push-to-talk only while user is actively typing in a text field
      const target = e.target as HTMLElement;
      const tag = target.tagName.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      ) return;

      if (e.code === pushToTalkKeyRef.current) {
        const action = getKeyVAction(voiceStatusRef.current, canRecordRef.current);
        if (action === "start" || action === "restart") {
          // Stop TTS first if Lisa is speaking — prevents audio overlap
          doStopTtsIfSpeakingRef.current();
          if (action === "start") {
            void doBeginRef.current();
          } else {
            void doClearAndBeginRef.current();
          }
        }
        // "ignore" → recording or transcribing in progress; do nothing
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (!voiceInputEnabledRef.current) return;
      // Only stop if this recording was started by the keyboard
      if (
        e.code === pushToTalkKeyRef.current &&
        voiceStatusRef.current === "recording" &&
        recordingSourceRef.current === "keyboard"
      ) {
        void doTranscribeRef.current();
      }
    }

    // If window loses focus while keyboard-started recording is active, cancel safely
    function onWindowBlur() {
      if (
        voiceStatusRef.current === "recording" &&
        recordingSourceRef.current === "keyboard"
      ) {
        void doCancelRef.current();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hide entirely when voice input is disabled ────────────────────────────────
  if (!voiceInputEnabled) return null;

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function beginRecording() {
    const gate = resolveModelGate(sttModelPathRef.current, sttEngineStatusRef.current);
    if (gate === "no_model") {
      dispatch({
        type: "SET_VOICE_ERROR",
        payload: "No Whisper model configured. Set a model path in Settings → Voice Input before recording.",
      });
      dispatch({ type: "SET_VOICE_STATUS", payload: "error" });
      return;
    }
    if (gate === "model_error") {
      dispatch({
        type: "SET_VOICE_ERROR",
        payload: "Whisper model failed to load — verify the path in Settings → Voice Input.",
      });
      dispatch({ type: "SET_VOICE_STATUS", payload: "error" });
      return;
    }

    recordingSourceRef.current = "keyboard";
    dispatch({ type: "SET_VOICE_STATUS", payload: "recording" });
    dispatch({ type: "SET_ORB_STATE", payload: "listening" });

    try {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (isTauri) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("start_voice_capture");
      }
      addAudit({
        eventType: "voice_recording_started",
        source: "voice_control",
        summary: "Voice recording started (push-to-talk).",
        details: "source=keyboard",
        severity: "info",
      });
    } catch (err) {
      recordingSourceRef.current = null;
      const errMsg = err instanceof Error ? err.message : String(err);
      dispatch({ type: "SET_VOICE_ERROR", payload: errMsg });
      dispatch({ type: "SET_VOICE_STATUS", payload: "error" });
      dispatch({ type: "SET_ORB_STATE", payload: "idle" });
      addAudit({
        eventType: "voice_recording_failed",
        source: "voice_control",
        summary: "Failed to start voice recording.",
        details: `error=${errMsg} source=keyboard`,
        severity: "error",
      });
    }
  }

  // Clears a stale result/error card and immediately starts a new recording.
  async function clearAndBeginRecording() {
    dispatch({ type: "SET_VOICE_ERROR", payload: null });
    dispatch({ type: "SET_VOICE_TRANSCRIPT_DRAFT", payload: null });
    dispatch({ type: "SET_VOICE_STATUS", payload: "idle" });
    await beginRecording();
  }

  async function performTranscription() {
    recordingSourceRef.current = null;
    const startMs = Date.now();
    dispatch({ type: "SET_VOICE_STATUS", payload: "transcribing" });
    dispatch({ type: "SET_ORB_STATE", payload: "thinking" });
    addAudit({
      eventType: "voice_transcription_started",
      source: "voice_control",
      summary: "Transcribing captured audio locally.",
      details: "engine=whisper source=keyboard",
      severity: "info",
    });

    try {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let invokeResult: TranscriptionInvokeResult | null = null;

      if (isTauri) {
        const { invoke } = await import("@tauri-apps/api/core");
        const invokePromise = invoke<TranscriptionInvokeResult>(
          "stop_voice_capture_and_transcribe",
          { modelPath: sttModelPathRef.current }
        );
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Transcription timed out after 90 s")),
            TRANSCRIPTION_TIMEOUT_MS
          )
        );
        invokeResult = await Promise.race([invokePromise, timeoutPromise]);
      }

      const duration_ms = Date.now() - startMs;
      const resolved: TranscriptionResolved = invokeResult
        ? resolveTranscriptionResult(invokeResult)
        : { action: "no_speech" };

      if (resolved.action === "preview") {
        dispatch({ type: "SET_VOICE_TRANSCRIPT_DRAFT", payload: resolved.transcript });
        dispatch({ type: "SET_VOICE_STATUS", payload: "preview" });
        dispatch({ type: "SET_ORB_STATE", payload: "idle" });
        addAudit({
          eventType: "voice_transcription_completed",
          source: "voice_control",
          summary: "Voice transcription complete.",
          details: `transcript_chars=${resolved.transcript.length} duration_ms=${duration_ms} source=keyboard`,
          severity: "info",
        });
      } else if (resolved.action === "no_speech") {
        dispatch({ type: "SET_VOICE_STATUS", payload: "no_transcript" });
        dispatch({ type: "SET_ORB_STATE", payload: "idle" });
        addAudit({
          eventType: "voice_transcription_completed",
          source: "voice_control",
          summary: "Voice transcription returned empty result.",
          details: `duration_ms=${duration_ms} source=keyboard`,
          severity: "info",
        });
      } else {
        throw new Error(resolved.message);
      }
    } catch (err) {
      recordingSourceRef.current = null;
      const errMsg = err instanceof Error ? err.message : String(err);
      dispatch({ type: "SET_VOICE_ERROR", payload: errMsg });
      dispatch({ type: "SET_VOICE_STATUS", payload: "error" });
      dispatch({ type: "SET_ORB_STATE", payload: "idle" });
      addAudit({
        eventType: "voice_transcription_failed",
        source: "voice_control",
        summary: "Voice transcription failed.",
        details: `error=${errMsg} source=keyboard`,
        severity: "error",
      });
    }
  }

  async function cancelRecording() {
    const src = recordingSourceRef.current ?? "unknown";
    recordingSourceRef.current = null;

    try {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (isTauri) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("cancel_voice_capture");
      }
    } catch {
      // cancel is best-effort; always reset UI state regardless
    }

    addAudit({
      eventType: "voice_recording_cancelled",
      source: "voice_control",
      summary: "Voice recording cancelled.",
      details: `source=${src}`,
      severity: "info",
    });
    dispatch({ type: "CLEAR_VOICE_STATE" });
  }

  function discardVoice() {
    recordingSourceRef.current = null;
    addAudit({
      eventType: "voice_transcript_discarded",
      source: "voice_control",
      summary: "Voice transcript discarded.",
      details: "source=keyboard",
      severity: "info",
    });
    dispatch({ type: "CLEAR_VOICE_STATE" });
  }

  async function sendTranscript() {
    const draft = voiceTranscriptDraftRef.current;
    if (!draft || draft.trim().length === 0) return;
    dispatch({ type: "CLEAR_VOICE_STATE" });
    await onSendTranscript(draft.trim());
  }

  function stopTtsIfSpeaking(): void {
    if (ttsUiStatusRef.current !== "speaking") return;
    dispatch({ type: "CLEAR_TTS_STATE" });
    const isTauriStop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauriStop) {
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("stop_speaking").catch(() => {}));
    }
    addAudit({
      eventType: "tts_speech_stopped",
      source: "keyvptt_conflict",
      summary: "TTS stopped: KeyV push-to-talk requested during speech.",
      severity: "info",
    });
  }

  // ── Update action refs with latest implementations ────────────────────────────
  doBeginRef.current = beginRecording;
  doClearAndBeginRef.current = clearAndBeginRecording;
  doTranscribeRef.current = performTranscription;
  doDiscardRef.current = discardVoice;
  doCancelRef.current = cancelRecording;
  doStopTtsIfSpeakingRef.current = stopTtsIfSpeaking;

  const keyLabel = pushToTalkKey.replace("Key", "");

  return (
    <>
      {/* ── Rail: idle / active state indicators (stay in left rail) ─────────── */}
      <div className="voice-input-control">

        {/* ── Idle: push-to-talk hint ─────────────────────────────────────────── */}
        {voiceStatus === "idle" && !isEmergencyStopped && (
          <div className="voice-helper-hint">
            {modelConfigured
              ? sttEngineStatus === "error"
                ? <>Whisper model failed to load — verify the path in Settings → Voice Input.</>
                : <>Hold <kbd className="voice-kbd">{keyLabel}</kbd> to record, release to transcribe.</>
              : <>Voice input enabled — configure a Whisper model in Settings to begin recording.</>
            }
          </div>
        )}

        {/* ── Active recording indicator ───────────────────────────────────────── */}
        {voiceStatus === "recording" && (
          <div className="voice-recording-bar" role="status">
            <span className="voice-recording-dot" />
            <span className="voice-recording-label">Recording</span>
            <span className="voice-recording-hint">
              Release <kbd className="voice-kbd">{keyLabel}</kbd> to transcribe &nbsp;·&nbsp; <kbd className="voice-kbd">Esc</kbd> to cancel
            </span>
          </div>
        )}

        {/* ── Transcribing ────────────────────────────────────────────────────── */}
        {voiceStatus === "transcribing" && (
          <div className="voice-transcribing-bar" role="status">
            <div className="voice-transcribing-dots" aria-hidden="true">
              <span className="voice-transcribing-dot" />
              <span className="voice-transcribing-dot" />
              <span className="voice-transcribing-dot" />
            </div>
            <span className="voice-transcribing-label">Transcribing locally…</span>
          </div>
        )}

        {/* ── Emergency stopped ───────────────────────────────────────────────── */}
        {voiceStatus === "idle" && isEmergencyStopped && (
          <div className="voice-status-note">
            <span className="voice-status-error">Emergency stopped — voice input unavailable</span>
          </div>
        )}
      </div>

      {/* ── Portal HUD: result states render into document.body, bypassing rail clipping ── */}

      {/* ── Transcript preview ──────────────────────────────────────────────── */}
      {voiceStatus === "preview" && voiceTranscriptDraft &&
        typeof document !== "undefined" && document.body &&
        createPortal(
          <div className={VOICE_HUD_OVERLAY_CLASS}>
            <div className={VOICE_HUD_CARD_CLASS}>
              <div className="voice-hud-header">
                <span className="voice-hud-title">{VOICE_REVIEW_TITLE}</span>
                <span className="voice-hud-subtitle">{VOICE_REVIEW_SUBTITLE}</span>
              </div>
              <div className="voice-transcript-box voice-hud-transcript">
                {voiceTranscriptDraft}
              </div>
              <p className="voice-hud-note">{VOICE_REVIEW_NOTE}</p>
              <div className="voice-hud-actions">
                <button
                  type="button"
                  className="btn voice-hud-send-btn"
                  onClick={() => void sendTranscript()}
                  disabled={isProcessing}
                >
                  Send Transcript
                </button>
                <button
                  type="button"
                  className="btn voice-hud-discard-btn"
                  onClick={discardVoice}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* ── No transcript ───────────────────────────────────────────────────── */}
      {voiceStatus === "no_transcript" &&
        typeof document !== "undefined" && document.body &&
        createPortal(
          <div className={VOICE_HUD_OVERLAY_CLASS}>
            <div className={`${VOICE_HUD_CARD_CLASS} voice-hud-card-no-transcript`}>
              <div className="voice-hud-header">
                <span className="voice-hud-title voice-hud-title-dim">{VOICE_NO_TRANSCRIPT_TITLE}</span>
              </div>
              <p className="voice-hud-body">
                Lisa captured audio, but Whisper did not produce final text. Try speaking louder or hold{" "}
                <kbd className="voice-kbd">{keyLabel}</kbd> a little longer.
              </p>
              <div className="voice-hud-actions">
                <button
                  type="button"
                  className="btn voice-hud-retry-btn"
                  onClick={() => void clearAndBeginRecording()}
                >
                  Try Again
                </button>
                <button
                  type="button"
                  className="btn voice-hud-discard-btn"
                  onClick={discardVoice}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {voiceStatus === "error" &&
        typeof document !== "undefined" && document.body &&
        createPortal(
          <div className={VOICE_HUD_OVERLAY_CLASS}>
            <div className={`${VOICE_HUD_CARD_CLASS} voice-hud-card-error`}>
              <div className="voice-hud-header">
                <span className="voice-hud-title voice-hud-title-error">{VOICE_ERROR_TITLE}</span>
              </div>
              <p className="voice-hud-body voice-hud-error-body">
                {voiceError ?? "Voice recording failed."}
              </p>
              <div className="voice-hud-actions">
                <button
                  type="button"
                  className="btn voice-hud-discard-btn"
                  onClick={discardVoice}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      }
    </>
  );
};

export default VoiceInputControl;
