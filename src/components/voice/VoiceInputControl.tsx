import React, { useEffect, useRef } from "react";
import type { VoiceStatus } from "../../core/types";
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
  if (voiceStatus === "preview" || voiceStatus === "error") return "restart";
  return "ignore"; // "recording" or "transcribing" — let the current cycle finish
}

// ── Component ────────────────────────────────────────────────────────────────────

interface VoiceInputControlProps {
  isProcessing: boolean;
}

export const VoiceInputControl: React.FC<VoiceInputControlProps> = ({
  isProcessing,
}) => {
  const { state, dispatch, addAudit } = useLisa();
  const { voiceStatus, voiceTranscriptDraft, voiceError } = state;
  const { voiceInputEnabled, sttEngineStatus, pushToTalkKey } = state.settings;
  const isEmergencyStopped = state.orbState === "emergency_stopped";
  const canRecord = voiceInputEnabled && !isEmergencyStopped && !isProcessing;
  const isPlaceholder = sttEngineStatus === "not_configured";

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

  const isPlaceholderRef = useRef(isPlaceholder);
  isPlaceholderRef.current = isPlaceholder;

  const voiceTranscriptDraftRef = useRef(voiceTranscriptDraft);
  voiceTranscriptDraftRef.current = voiceTranscriptDraft;

  // Tracks whether in-progress recording was keyboard-started.
  // KeyV keyup only stops a keyboard-started recording.
  const recordingSourceRef = useRef<"keyboard" | null>(null);

  // ── Action refs — updated each render after function definitions ──────────────
  const doBeginRef = useRef<() => void>(() => {});
  const doClearAndBeginRef = useRef<() => void>(() => {});
  const doTranscribeRef = useRef<() => Promise<void>>(async () => {});
  const doDiscardRef = useRef<() => void>(() => {});
  const doCancelRef = useRef<() => void>(() => {});

  // ── Stable keyboard + blur effect — registered once on mount ─────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (!voiceInputEnabledRef.current || isEmergencyStoppedRef.current) return;

      // Escape: cancel active recording, or clear preview/error
      if (e.key === "Escape") {
        if (voiceStatusRef.current === "recording") {
          doCancelRef.current();
        } else if (
          voiceStatusRef.current === "preview" ||
          voiceStatusRef.current === "error"
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
        if (action === "start") {
          doBeginRef.current();
        } else if (action === "restart") {
          // Clear old result and immediately begin a new recording cycle
          doClearAndBeginRef.current();
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
        doCancelRef.current();
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
  function beginRecording() {
    recordingSourceRef.current = "keyboard";
    dispatch({ type: "SET_VOICE_STATUS", payload: "recording" });
    dispatch({ type: "SET_ORB_STATE", payload: "listening" });
    addAudit({
      eventType: "voice_recording_started",
      source: "voice_control",
      summary: "Voice UI test started (push-to-talk).",
      details: "source=keyboard",
      severity: "info",
    });
  }

  // Clears a stale result/error card and immediately starts a new recording.
  // Used when the user presses KeyV while the result or error card is visible —
  // Option A: restart rather than require an explicit Discard first.
  function clearAndBeginRecording() {
    recordingSourceRef.current = "keyboard";
    dispatch({ type: "SET_VOICE_ERROR", payload: null });
    dispatch({ type: "SET_VOICE_TRANSCRIPT_DRAFT", payload: null });
    dispatch({ type: "SET_VOICE_STATUS", payload: "recording" });
    dispatch({ type: "SET_ORB_STATE", payload: "listening" });
    addAudit({
      eventType: "voice_recording_started",
      source: "voice_control",
      summary: "Voice UI test started (push-to-talk).",
      details: "source=keyboard",
      severity: "info",
    });
  }

  async function performTranscription() {
    recordingSourceRef.current = null;
    const startMs = Date.now();
    dispatch({ type: "SET_VOICE_STATUS", payload: "transcribing" });
    dispatch({ type: "SET_ORB_STATE", payload: "thinking" });
    addAudit({
      eventType: "voice_transcription_started",
      source: "voice_control",
      summary: "Voice UI test — checking STT state.",
      details: `engine=${isPlaceholderRef.current ? "placeholder" : "whisper"} source=keyboard`,
      severity: "info",
    });

    try {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let transcript: string | null = null;
      let engine = "placeholder";

      if (isTauri) {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<{ status: string; transcript: string | null; engine: string }>(
          "transcribe_voice_placeholder"
        );
        transcript = result.transcript;
        engine = result.engine;
      }

      const draftText = transcript
        ?? "Local STT is not configured, so no speech was transcribed and no command was sent.";
      const duration_ms = Date.now() - startMs;

      dispatch({ type: "SET_VOICE_TRANSCRIPT_DRAFT", payload: draftText });
      dispatch({ type: "SET_VOICE_STATUS", payload: "preview" });
      dispatch({ type: "SET_ORB_STATE", payload: "idle" });

      // Privacy: never log transcript_chars for placeholder text
      const details = transcript
        ? `transcript_chars=${transcript.length} engine=${engine} duration_ms=${duration_ms} source=keyboard`
        : `engine=${engine} duration_ms=${duration_ms} status=not_configured source=keyboard`;

      addAudit({
        eventType: "voice_transcription_completed",
        source: "voice_control",
        summary: "Voice UI test complete — STT not configured.",
        details,
        severity: "info",
      });
    } catch (err) {
      recordingSourceRef.current = null;
      const errMsg = err instanceof Error ? err.message : String(err);
      dispatch({ type: "SET_VOICE_ERROR", payload: errMsg });
      dispatch({ type: "SET_VOICE_STATUS", payload: "error" });
      dispatch({ type: "SET_ORB_STATE", payload: "idle" });
      addAudit({
        eventType: "voice_transcription_failed",
        source: "voice_control",
        summary: "Voice UI test failed.",
        details: `error=${errMsg} source=keyboard`,
        severity: "error",
      });
    }
  }

  function cancelRecording() {
    const src = recordingSourceRef.current ?? "unknown";
    recordingSourceRef.current = null;
    addAudit({
      eventType: "voice_recording_cancelled",
      source: "voice_control",
      summary: "Voice UI test recording cancelled.",
      details: `source=${src}`,
      severity: "info",
    });
    dispatch({ type: "CLEAR_VOICE_STATE" });
  }

  function discardVoice() {
    recordingSourceRef.current = null;
    const realChars =
      !isPlaceholderRef.current && voiceTranscriptDraftRef.current
        ? voiceTranscriptDraftRef.current.length
        : 0;
    addAudit({
      eventType: "voice_transcript_discarded",
      source: "voice_control",
      summary: "Voice UI test result discarded.",
      details: realChars > 0 ? `transcript_chars=${realChars}` : "engine=placeholder",
      severity: "info",
    });
    dispatch({ type: "CLEAR_VOICE_STATE" });
  }

  // ── Update action refs with latest implementations ────────────────────────────
  doBeginRef.current = beginRecording;
  doClearAndBeginRef.current = clearAndBeginRecording;
  doTranscribeRef.current = performTranscription;
  doDiscardRef.current = discardVoice;
  doCancelRef.current = cancelRecording;

  return (
    <div className="voice-input-control">

      {/* ── Idle: subtle KeyV hint ────────────────────────────────────────────── */}
      {voiceStatus === "idle" && !isEmergencyStopped && (
        <div className="voice-helper-hint">
          Voice UI Test: hold <kbd className="voice-kbd">{pushToTalkKey.replace("Key", "")}</kbd> when not typing.
        </div>
      )}

      {/* ── Active recording indicator ────────────────────────────────────────── */}
      {voiceStatus === "recording" && (
        <div className="voice-status-note">
          <span className="voice-status-recording">
            UI test active — release <kbd className="voice-kbd">{pushToTalkKey.replace("Key", "")}</kbd> or press <kbd className="voice-kbd">Esc</kbd> to cancel
          </span>
        </div>
      )}

      {/* ── Checking STT ─────────────────────────────────────────────────────── */}
      {voiceStatus === "transcribing" && (
        <div className="voice-status-note">
          <span className="voice-status-dim">Checking STT state…</span>
        </div>
      )}

      {/* ── Emergency stopped ─────────────────────────────────────────────────── */}
      {voiceStatus === "idle" && isEmergencyStopped && (
        <div className="voice-status-note">
          <span className="voice-status-error">Emergency stopped — voice UI test unavailable</span>
        </div>
      )}

      {/* ── Result card ──────────────────────────────────────────────────────── */}
      {voiceStatus === "preview" && (
        <div className="voice-preview-card">
          <div className="voice-preview-header">
            <span className="voice-preview-label">Voice UI test result</span>
            {isPlaceholder && (
              <span className="voice-preview-not-configured-badge">STT NOT CONFIGURED</span>
            )}
          </div>
          {isPlaceholder && (
            <div className="voice-preview-placeholder-msg">
              Local STT is not configured, so no speech was transcribed and no command was sent.
            </div>
          )}
          {!isPlaceholder && voiceTranscriptDraft && (
            <div className="voice-preview-transcript">
              {voiceTranscriptDraft}
            </div>
          )}
          <div className="voice-preview-actions">
            <button
              type="button"
              className="btn voice-discard-btn"
              onClick={discardVoice}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Error card ────────────────────────────────────────────────────────── */}
      {voiceStatus === "error" && (
        <div className="voice-preview-card voice-error-card">
          <div className="voice-preview-error">
            {voiceError ?? "Voice UI test failed."}
          </div>
          <div className="voice-preview-actions">
            <button
              type="button"
              className="btn voice-discard-btn"
              onClick={discardVoice}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceInputControl;
