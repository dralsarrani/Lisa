import React, { useState, useEffect, useCallback, useRef } from "react";
import type { LisaSettings, LisaModeId } from "../../core/types";
import { buildSpeakTextInvokeArgs, SpeakTextResult, buildTtsStatusLabel } from "../../core/tts";
import { CONVERSATION_HISTORY_CAP, MEMORY_NOTES_CAP, MEMORY_NOTE_CHAR_LIMIT } from "../../core/types";
import { LISA_MODES } from "../../core/mode-store";
import { useLisa } from "../../app/useLisa";
import { getAllToolDefinitions } from "../../core/tool-registry";
import "./SettingsPanel.css";

interface OllamaModelInfo {
  name: string;
  size?: number;
}

interface ModelTestResult {
  success: boolean;
  latency_ms: number;
  error?: string;
}

const RECOMMENDED_MODELS = ["llama3.2:1b", "qwen2.5-coder:1.5b", "deepseek-r1:1.5b"];
const HEAVY_MODEL_BYTES = 4_000_000_000;

function formatModelSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

interface SettingsPanelProps {
  settings: LisaSettings;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings }) => {
  const { state, dispatch, addAudit } = useLisa();
  const [availableModels, setAvailableModels] = useState<OllamaModelInfo[]>([]);
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelTestResult, setModelTestResult] = useState<ModelTestResult | null>(null);
  const [modelTestLoading, setModelTestLoading] = useState(false);
  // null = not yet probed, true = reachable, false = unreachable
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newNoteInput, setNewNoteInput] = useState("");
  const [confirmingClearNotes, setConfirmingClearNotes] = useState(false);
  const confirmNotesClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sttModelPathInput, setSttModelPathInput] = useState(settings.sttModelPath ?? "");
  const [sttTestResult, setSttTestResult] = useState<{ success: boolean; latency_ms: number; engine_name: string; error?: string } | null>(null);
  const [sttTesting, setSttTesting] = useState(false);
  const [sttValidating, setSttValidating] = useState(false);

  // TTS local state
  const [ttsStatusInfo, setTtsStatusInfo] = useState<{ available: boolean; provider: string; label: string } | null>(null);
  const [ttsTesting, setTtsTesting] = useState(false);
  const [ttsTestResult, setTtsTestResult] = useState<{ accepted: boolean; error?: string } | null>(null);
  const [ttsStopping, setTtsStopping] = useState(false);

  // Screen awareness local state
  const [screenCapturing, setScreenCapturing] = useState(false);
  const [screenCaptureError, setScreenCaptureError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (confirmResetRef.current) clearTimeout(confirmResetRef.current);
      if (confirmNotesClearRef.current) clearTimeout(confirmNotesClearRef.current);
    };
  }, []);

  function handleAddNote() {
    const content = newNoteInput.trim();
    if (!content || content.length > MEMORY_NOTE_CHAR_LIMIT || state.memoryNotes.length >= MEMORY_NOTES_CAP) return;
    dispatch({ type: "ADD_MEMORY_NOTE", payload: content });
    addAudit({
      eventType: "memory_note_added",
      source: "settings_panel",
      summary: "Memory note added.",
      details: `chars=${content.length}`,
      severity: "info",
    });
    setNewNoteInput("");
  }

  function handleDeleteNote(id: string) {
    dispatch({ type: "DELETE_MEMORY_NOTE", payload: id });
    addAudit({
      eventType: "memory_note_deleted",
      source: "settings_panel",
      summary: "Memory note deleted.",
      details: `note_id=${id}`,
      severity: "info",
    });
  }

  function handleClearNotes() {
    if (!confirmingClearNotes) {
      setConfirmingClearNotes(true);
      confirmNotesClearRef.current = setTimeout(() => setConfirmingClearNotes(false), 5000);
      return;
    }
    if (confirmNotesClearRef.current) clearTimeout(confirmNotesClearRef.current);
    const clearedCount = state.memoryNotes.length;
    dispatch({ type: "CLEAR_MEMORY_NOTES" });
    addAudit({
      eventType: "memory_notes_cleared",
      source: "settings_panel",
      summary: "All memory notes cleared.",
      details: `Cleared ${clearedCount} note${clearedCount === 1 ? "" : "s"}.`,
      severity: "info",
    });
    setConfirmingClearNotes(false);
  }

  const fetchModels = useCallback(async () => {
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isInTauri) {
      setModelsError("Model discovery requires the desktop app (Tauri).");
      setOllamaReachable(false);
      return;
    }

    setModelsFetching(true);
    setModelsError(null);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{
        models: Array<{ name: string; size?: number }>;
        error: string | null;
      }>("list_ollama_models");

      if (result.error) {
        setModelsError(result.error);
        setAvailableModels([]);
        setOllamaReachable(false);
      } else {
        const models: OllamaModelInfo[] = result.models.map((m) => ({
          name: m.name,
          size: m.size,
        }));
        setAvailableModels(models);
        setOllamaReachable(true);
        setModelTestResult(null);

        const currentModel = settings.ollamaModel;
        const modelNames = models.map((m) => m.name);
        if (currentModel && !modelNames.includes(currentModel)) {
          dispatch({ type: "SET_SETTINGS", payload: { ollamaModel: modelNames[0] ?? "" } });
        } else if (!currentModel && modelNames.length > 0) {
          dispatch({ type: "SET_SETTINGS", payload: { ollamaModel: modelNames[0] } });
        }
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err));
      setAvailableModels([]);
      setOllamaReachable(false);
    }

    setModelsFetching(false);
  }, [dispatch, settings.ollamaModel]);

  // Run on mount if Local AI is already enabled, and whenever the toggle turns on.
  useEffect(() => {
    if (settings.enableLocalAi) {
      fetchModels();
    }
  // fetchModels is stable (useCallback); settings.enableLocalAi is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enableLocalAi]);

  async function testModel() {
    const model = settings.ollamaModel;
    if (!model || modelTestLoading) return;
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isInTauri) {
      setModelTestResult({ success: false, latency_ms: 0, error: "Model test requires the desktop app." });
      return;
    }
    setModelTestLoading(true);
    setModelTestResult(null);
    addAudit({
      eventType: "ollama_model_test_started",
      source: "settings_panel",
      summary: `Model test started — model: "${model}"`,
      severity: "info",
    });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<ModelTestResult>("test_ollama_model", { model });
      setModelTestResult(result);
      addAudit({
        eventType: result.success ? "ollama_model_test_passed" : "ollama_model_test_failed",
        source: "settings_panel",
        summary: result.success
          ? `Model test passed — model: "${model}" in ${result.latency_ms}ms`
          : `Model test failed — model: "${model}" in ${result.latency_ms}ms`,
        details: result.error ?? undefined,
        severity: result.success ? "info" : "error",
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setModelTestResult({ success: false, latency_ms: 0, error });
      addAudit({
        eventType: "ollama_model_test_failed",
        source: "settings_panel",
        summary: `Model test failed — model: "${model}"`,
        details: error,
        severity: "error",
      });
    }
    setModelTestLoading(false);
  }

  async function handleValidateSttPath() {
    const path = sttModelPathInput.trim();
    dispatch({ type: "SET_SETTINGS", payload: { sttModelPath: path } });
    if (!path) {
      dispatch({ type: "SET_SETTINGS", payload: { sttEngineStatus: "not_configured", sttEngineLabel: "Not configured" } });
      setSttTestResult(null);
      return;
    }
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isInTauri) { setSttTestResult({ success: false, latency_ms: 0, engine_name: "", error: "Requires desktop app." }); return; }
    setSttValidating(true);
    setSttTestResult(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ valid: boolean; label: string; size_bytes?: number; error?: string }>("validate_stt_model_path", { modelPath: path });
      dispatch({ type: "SET_SETTINGS", payload: { sttEngineStatus: result.valid ? "not_configured" : "error", sttEngineLabel: result.label } });
      setSttTestResult({ success: result.valid, latency_ms: 0, engine_name: result.label, error: result.error });
    } catch (err) {
      setSttTestResult({ success: false, latency_ms: 0, engine_name: "", error: err instanceof Error ? err.message : String(err) });
    }
    setSttValidating(false);
  }

  async function handleTestWhisperModel() {
    const path = sttModelPathInput.trim();
    if (!path) return;
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isInTauri) { setSttTestResult({ success: false, latency_ms: 0, engine_name: "", error: "Requires desktop app." }); return; }
    setSttTesting(true);
    setSttTestResult(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ success: boolean; latency_ms: number; engine_name: string; error?: string }>("test_whisper_model", { modelPath: path });
      setSttTestResult(result);
      dispatch({ type: "SET_SETTINGS", payload: {
        sttEngineStatus: result.success ? "ready" : "error",
        sttEngineLabel: result.success ? `${result.engine_name} (${result.latency_ms}ms)` : result.error ?? "Load failed",
        sttModelLastTestedAt: new Date().toISOString(),
      }});
    } catch (err) {
      setSttTestResult({ success: false, latency_ms: 0, engine_name: "", error: err instanceof Error ? err.message : String(err) });
    }
    setSttTesting(false);
  }

  async function checkTtsStatus() {
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isInTauri) {
      setTtsStatusInfo({ available: false, provider: "none", label: "Requires desktop app." });
      return;
    }
    dispatch({ type: "SET_TTS_STATUS", payload: { status: "checking" } });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ available: boolean; provider: string; speaking: boolean; error?: string }>("get_tts_status");
      const label = buildTtsStatusLabel(result.available, result.provider, result.speaking);
      setTtsStatusInfo({ available: result.available, provider: result.provider, label });
      dispatch({ type: "SET_TTS_STATUS", payload: { status: result.available ? (result.speaking ? "speaking" : "available") : "unavailable", provider: result.provider } });
      addAudit({
        eventType: "tts_status_checked",
        source: "settings_panel",
        summary: `TTS status checked — ${label}`,
        details: `provider=${result.provider} available=${result.available} speaking=${result.speaking}`,
        severity: "info",
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setTtsStatusInfo({ available: false, provider: "none", label: "Status check failed." });
      dispatch({ type: "SET_TTS_STATUS", payload: { status: "unavailable", error } });
    }
  }

  async function handleTestVoice() {
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isInTauri) {
      setTtsTestResult({ accepted: false, error: "Requires desktop app." });
      return;
    }
    setTtsTesting(true);
    setTtsTestResult(null);
    const testPhrase = "Hello, I am Lisa.";
    addAudit({
      eventType: "tts_test_started",
      source: "settings_panel",
      summary: "TTS test started.",
      details: `chars=${testPhrase.length} provider=windows_sapi source=test_voice`,
      severity: "info",
    });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<SpeakTextResult>("speak_text", buildSpeakTextInvokeArgs({ text: testPhrase, source: "settings_test_voice" }));
      setTtsTestResult({ accepted: result.accepted });
      addAudit({
        eventType: result.accepted ? "tts_test_started" : "tts_test_failed",
        source: "settings_panel",
        summary: result.accepted ? "TTS test started." : "TTS test failed.",
        details: result.accepted ? `chars=${testPhrase.length} provider=${result.provider} source=test_voice` : `provider=${result.provider}`,
        severity: result.accepted ? "info" : "error",
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setTtsTestResult({ accepted: false, error });
      addAudit({
        eventType: "tts_test_failed",
        source: "settings_panel",
        summary: "TTS test failed.",
        details: error,
        severity: "error",
      });
    }
    setTtsTesting(false);
  }

  async function handleStopSpeaking() {
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isInTauri) return;
    setTtsStopping(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_speaking");
      dispatch({ type: "CLEAR_TTS_STATE" });
      addAudit({
        eventType: "tts_speech_stopped",
        source: "settings_panel",
        summary: "TTS speech stopped via settings.",
        severity: "info",
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      dispatch({ type: "SET_TTS_STATUS", payload: { status: "error", error } });
    }
    setTtsStopping(false);
  }

  async function handleCaptureScreen() {
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    const privacyModes = ["sleep", "privacy", "lockdown"];
    if (settings.screenSuppressInPrivacyModes && privacyModes.includes(settings.activeMode)) {
      setScreenCaptureError("Screen capture is suppressed in Sleep, Privacy, and Lockdown modes.");
      return;
    }
    if (!settings.screenAwarenessEnabled) {
      setScreenCaptureError("Enable Screen Awareness first.");
      return;
    }
    setScreenCapturing(true);
    setScreenCaptureError(null);
    dispatch({ type: "SET_SCREEN_STATUS", payload: { status: "capturing" } });
    addAudit({
      eventType: "screen_capture_started",
      source: "settings_panel",
      summary: "Screen capture started.",
      details: "source=manual_command",
      severity: "info",
    });
    if (!isInTauri) {
      dispatch({ type: "SET_SCREEN_STATUS", payload: { status: "error", error: "Screen capture requires the desktop app." } });
      setScreenCaptureError("Screen capture requires the desktop app.");
      setScreenCapturing(false);
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{
        accepted: boolean;
        capture_id: string;
        width: number | null;
        height: number | null;
        captured_at: number;
        provider: string;
        error: string | null;
      }>("capture_screen");
      if (result.accepted) {
        dispatch({
          type: "SET_SCREEN_STATUS",
          payload: {
            status: "available",
            captureId: result.capture_id,
            capturedAt: result.captured_at,
            width: result.width ?? undefined,
            height: result.height ?? undefined,
            provider: result.provider,
          },
        });
        dispatch({ type: "SET_SETTINGS", payload: { screenCaptureProvider: "windows_capture" } });
        addAudit({
          eventType: "screen_capture_completed",
          source: "settings_panel",
          summary: "Screen capture completed.",
          details: `width=${result.width ?? "?"} height=${result.height ?? "?"} provider=${result.provider} source=manual_command`,
          severity: "info",
        });
      } else {
        dispatch({ type: "SET_SCREEN_STATUS", payload: { status: "error", error: result.error ?? "Capture failed." } });
        setScreenCaptureError(result.error ?? "Capture failed.");
        addAudit({
          eventType: "screen_capture_failed",
          source: "settings_panel",
          summary: "Screen capture failed.",
          details: result.error ?? "unknown error",
          severity: "warning",
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      dispatch({ type: "SET_SCREEN_STATUS", payload: { status: "error", error } });
      setScreenCaptureError(error);
      addAudit({
        eventType: "screen_capture_failed",
        source: "settings_panel",
        summary: "Screen capture failed.",
        details: error,
        severity: "warning",
      });
    }
    setScreenCapturing(false);
  }

  async function handleClearScreenContext() {
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isInTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("clear_screen_capture");
      } catch {
        // Temp file cleanup failure is non-fatal — state is still cleared.
      }
    }
    dispatch({ type: "CLEAR_SCREEN_CONTEXT" });
    setScreenCaptureError(null);
    addAudit({
      eventType: "screen_context_cleared",
      source: "settings_panel",
      summary: "Screen context cleared.",
      details: "source=manual_clear",
      severity: "info",
    });
  }

  function handleClearHistory() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      confirmResetRef.current = setTimeout(() => setConfirmingClear(false), 5000);
      return;
    }
    if (confirmResetRef.current) clearTimeout(confirmResetRef.current);
    const clearedCount = state.conversationHistory.length;
    dispatch({ type: "CLEAR_CONVERSATION_HISTORY" });
    addAudit({
      eventType: "clear_conversation_history",
      source: "settings_panel",
      summary: "Conversation history cleared.",
      details: `Cleared ${clearedCount} turn${clearedCount === 1 ? "" : "s"}.`,
      severity: "info",
    });
    setConfirmingClear(false);
  }

  function setMode(id: LisaModeId) {
    dispatch({ type: "SET_MODE", payload: id });
    addAudit({
      eventType: "mode_changed",
      source: "settings_panel",
      summary: `Mode changed to ${LISA_MODES[id].name} via settings.`,
      severity: "info",
    });
  }

  function toggleLocalAi() {
    const next = !settings.enableLocalAi;
    dispatch({ type: "SET_SETTINGS", payload: { enableLocalAi: next } });
    if (!next) {
      // Reset detection state so re-enabling shows a fresh probe, not stale data.
      setOllamaReachable(null);
      setAvailableModels([]);
      setModelsError(null);
    }
  }

  const ollamaDisplayStatus = modelsFetching
    ? "checking"
    : ollamaReachable === true
    ? "online"
    : ollamaReachable === false
    ? "offline"
    : "not_configured";

  const ollamaStatusLabel: Record<string, string> = {
    online: "Online",
    not_configured: "Not detected",
    offline: "Offline",
    checking: "Checking…",
  };

  const ollamaStatusClass: Record<string, string> = {
    online: "ai-status-online",
    not_configured: "ai-status-offline",
    offline: "ai-status-offline",
    checking: "ai-status-checking",
  };

  return (
    <div className="settings-panel">
      {/* ── Active Mode ── */}
      <div className="settings-section">
        <div className="settings-section-label">Active Mode</div>
        <div className="settings-mode-grid">
          {(Object.keys(LISA_MODES) as LisaModeId[]).map((id) => {
            const mode = LISA_MODES[id];
            return (
              <button
                key={id}
                className={`settings-mode-btn ${settings.activeMode === id ? "settings-mode-active" : ""}`}
                onClick={() => setMode(id)}
                title={mode.description}
              >
                {mode.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Current Mode Detail ── */}
      <div className="settings-section">
        <div className="settings-section-label">Current Mode</div>
        <div className="settings-mode-detail">
          <div className="settings-field">
            <span className="settings-field-label">Mode</span>
            <span className="settings-field-value">{LISA_MODES[settings.activeMode].name}</span>
          </div>
          <div className="settings-field">
            <span className="settings-field-label">Description</span>
            <span className="settings-field-value settings-field-desc">
              {LISA_MODES[settings.activeMode].description}
            </span>
          </div>
          <div className="settings-field">
            <span className="settings-field-label">Behavior</span>
            <span className="settings-field-value settings-field-desc">
              {LISA_MODES[settings.activeMode].behaviorSummary}
            </span>
          </div>
        </div>
      </div>

      {/* ── Orb Size ── */}
      <div className="settings-section">
        <div className="settings-section-label">Orb Size</div>
        <div style={{ display: "flex", gap: "5px" }}>
          {(["small", "medium", "large"] as const).map((s) => (
            <button
              key={s}
              className={`settings-mode-btn ${settings.orbSize === s ? "settings-mode-active" : ""}`}
              onClick={() => dispatch({ type: "SET_SETTINGS", payload: { orbSize: s } })}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Local AI Runtime ── */}
      <div className="settings-section">
        <div className="settings-section-label">Local AI Runtime</div>

        <div className="settings-field" style={{ marginBottom: "10px" }}>
          <span className="settings-field-label">Ollama</span>
          <span
            className={`ai-status-badge ${ollamaStatusClass[ollamaDisplayStatus] ?? "ai-status-offline"}`}
          >
            {ollamaStatusLabel[ollamaDisplayStatus] ?? ollamaDisplayStatus}
          </span>
        </div>

        <div className="settings-toggle-row">
          <span className="settings-toggle-label">Enable Local AI</span>
          <button
            className={`settings-toggle ${settings.enableLocalAi ? "settings-toggle-on" : ""}`}
            onClick={toggleLocalAi}
            aria-pressed={settings.enableLocalAi}
          >
            {settings.enableLocalAi ? "ON" : "OFF"}
          </button>
        </div>

        {settings.enableLocalAi && (
          <div className="ai-model-section">
            <div className="settings-field" style={{ marginTop: "8px" }}>
              <span className="settings-field-label">Model</span>
              {modelsFetching ? (
                <span className="ai-status-badge ai-status-checking">Loading…</span>
              ) : ollamaReachable === false ? (
                <span
                  className="ai-status-badge ai-status-error"
                  title={modelsError ?? "Ollama not reachable"}
                >
                  {modelsError ? "Error" : "Offline"}
                </span>
              ) : ollamaReachable === null ? (
                <span className="ai-status-badge ai-status-offline">Detecting…</span>
              ) : availableModels.length === 0 ? (
                <span className="ai-status-badge ai-status-offline">No models</span>
              ) : (
                <select
                  className="ai-model-select"
                  value={settings.ollamaModel}
                  onChange={(e) => {
                    dispatch({ type: "SET_SETTINGS", payload: { ollamaModel: e.target.value } });
                    setModelTestResult(null);
                  }}
                >
                  {!settings.ollamaModel && (
                    <option value="" disabled>
                      — select a model —
                    </option>
                  )}
                  {availableModels.map(({ name, size }) => {
                    const isRec = RECOMMENDED_MODELS.includes(name);
                    const isHeavy = size !== undefined && size > HEAVY_MODEL_BYTES;
                    const sizeStr = size !== undefined ? ` (${formatModelSize(size)})` : "";
                    const badge = isRec ? " ⭐" : isHeavy ? " ⚠" : "";
                    return (
                      <option key={name} value={name}>
                        {name}{sizeStr}{badge}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {ollamaReachable === false && (
              <div className="ai-offline-guidance">
                <div className="ai-guidance-line">Ollama is not running or not installed.</div>
                <div className="ai-guidance-line">
                  1. Install from <span className="ai-guidance-code">ollama.com</span>
                </div>
                <div className="ai-guidance-line">
                  2. <span className="ai-guidance-code">ollama pull llama3.2</span>
                </div>
                <div className="ai-guidance-line">
                  3. <span className="ai-guidance-code">ollama serve</span>
                </div>
                <div className="ai-guidance-line">
                  4. Click <span className="ai-guidance-code">Refresh Models</span> below.
                </div>
              </div>
            )}

            {ollamaReachable === true && availableModels.length === 0 && !modelsFetching && (
              <div className="ai-offline-guidance">
                <div className="ai-guidance-line">Ollama is running but has no models.</div>
                <div className="ai-guidance-line">
                  Run: <span className="ai-guidance-code">ollama pull llama3.2</span>
                </div>
              </div>
            )}

            {(() => {
              const selected = availableModels.find((m) => m.name === settings.ollamaModel);
              const isHeavy = selected?.size !== undefined && selected.size > HEAVY_MODEL_BYTES;
              const isRec = selected ? RECOMMENDED_MODELS.includes(selected.name) : false;
              return (
                <>
                  {isRec && (
                    <div className="ai-model-hint ai-model-hint-good">
                      ⭐ Recommended — fast, low memory usage.
                    </div>
                  )}
                  {isHeavy && !isRec && (
                    <div className="ai-model-hint ai-model-hint-warn">
                      ⚠ Large model — requires significant RAM. If it fails to load, try llama3.2:1b, qwen2.5-coder:1.5b, or deepseek-r1:1.5b.
                    </div>
                  )}
                </>
              );
            })()}

            <div style={{ marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                className="btn ai-refresh-btn"
                onClick={fetchModels}
                disabled={modelsFetching}
              >
                {modelsFetching ? "Refreshing…" : "Refresh Models"}
              </button>
              {ollamaReachable === true && settings.ollamaModel && (
                <button
                  className="btn ai-test-btn"
                  onClick={testModel}
                  disabled={modelTestLoading}
                >
                  {modelTestLoading ? "Testing…" : "Test Model"}
                </button>
              )}
            </div>

            {modelTestResult && (
              <div
                className={`ai-test-result ${modelTestResult.success ? "ai-test-result-pass" : "ai-test-result-fail"}`}
              >
                {modelTestResult.success
                  ? `✓ Model responded in ${modelTestResult.latency_ms}ms`
                  : `✗ ${modelTestResult.error ?? "Test failed"}`}
              </div>
            )}

            <div className="settings-field" style={{ marginTop: "10px" }}>
              <span className="settings-field-label">Context turns</span>
              <span className="settings-field-value">{settings.maxContextTurns}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Conversation History ── */}
      <div className="settings-section">
        <div className="settings-section-label">Conversation History</div>
        {(() => {
          const historyCount = state.conversationHistory.length;
          const isStreaming = state.orbState === "thinking" || state.orbState === "speaking";
          return (
            <>
              <div className="history-meta-row">
                <div className="history-meta-item">
                  <span className="settings-field-label">Stored turns</span>
                  <span className="settings-field-value">{historyCount}</span>
                </div>
                <div className="history-meta-item">
                  <span className="settings-field-label">Context limit</span>
                  <span className="settings-field-value">{settings.maxContextTurns}</span>
                </div>
                <div className="history-meta-item">
                  <span className="settings-field-label">Hard cap</span>
                  <span className="settings-field-value">{CONVERSATION_HISTORY_CAP}</span>
                </div>
              </div>
              <p className="history-note">
                Recent completed local AI turns are kept for continuity across restarts. This is session continuity — not semantic memory. It is separate from memory notes and tool result context. Clearing this does not delete memory notes.
              </p>
              <button
                className={`history-clear-btn${confirmingClear ? " history-clear-confirm" : ""}`}
                onClick={handleClearHistory}
                disabled={historyCount === 0 || isStreaming}
                title={isStreaming ? "Unavailable during active response" : historyCount === 0 ? "No history to clear" : undefined}
              >
                {confirmingClear ? "Confirm Clear" : "Clear Conversation History"}
              </button>
              {confirmingClear && (
                <span className="history-session-note">This cannot be undone. Click again to confirm.</span>
              )}
              <span className="history-session-note">Console messages remain for this session.</span>
            </>
          );
        })()}
      </div>

      {/* ── Memory Notes ── */}
      <div className="settings-section">
        <div className="settings-section-label">Memory Notes</div>
        {(() => {
          const noteCount = state.memoryNotes.length;
          const isAtCap = noteCount >= MEMORY_NOTES_CAP;
          const isOverLimit = newNoteInput.length > MEMORY_NOTE_CHAR_LIMIT;
          const addDisabled = !newNoteInput.trim() || isOverLimit || isAtCap;
          return (
            <>
              <div className="history-meta-row">
                <div className="history-meta-item">
                  <span className="settings-field-label">Memory Notes</span>
                  <span className="settings-field-value">{noteCount} / {MEMORY_NOTES_CAP}</span>
                </div>
              </div>
              <p className="history-note">
                Memory notes are explicit facts you deliberately saved. They may be included in the local AI system prompt until deleted. They are separate from conversation history and tool result context. Clearing memory notes does not clear conversation history.
              </p>
              {isAtCap && (
                <div className="memory-cap-msg">
                  Memory note limit reached ({MEMORY_NOTES_CAP}). Delete a note before adding another.
                </div>
              )}
              <div className="memory-add-row">
                <input
                  className="memory-note-input"
                  type="text"
                  value={newNoteInput}
                  onChange={(e) => setNewNoteInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !addDisabled) handleAddNote(); }}
                  placeholder="e.g. I prefer TypeScript over JavaScript"
                  disabled={isAtCap}
                  aria-label="New memory note"
                />
                <span className={`memory-char-count${isOverLimit ? " memory-char-over" : ""}`}>
                  {newNoteInput.length}/{MEMORY_NOTE_CHAR_LIMIT}
                </span>
                <button className="btn ai-refresh-btn" onClick={handleAddNote} disabled={addDisabled}>
                  Add
                </button>
              </div>
              {noteCount === 0 ? (
                <div className="memory-notes-empty">
                  No memory notes saved. Use <span className="memory-notes-empty-cmd">'remember that …'</span> or save an approved tool result as a memory note.
                </div>
              ) : (
                <ul className="memory-notes-list">
                  {state.memoryNotes.map((note, idx) => (
                    <li key={note.id} className="memory-note-item">
                      <span className="memory-note-index">{idx + 1}.</span>
                      <span className={`memory-note-source memory-note-source-${note.source ?? "manual"}`}>
                        {note.source === "tool_result" ? "TOOL" : "MANUAL"}
                      </span>
                      <span className="memory-note-body">
                        <span className="memory-note-content">{note.content}</span>
                        <span className="memory-note-meta">
                          <span className="memory-note-chars">{note.content.length} chars</span>
                          <span className="memory-note-meta-sep">·</span>
                          <span className="memory-note-date">
                            {new Date(note.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </span>
                      </span>
                      <button
                        className="memory-note-delete"
                        onClick={() => handleDeleteNote(note.id)}
                        title="Delete note"
                        aria-label="Delete note"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className={`history-clear-btn${confirmingClearNotes ? " history-clear-confirm" : ""}`}
                onClick={handleClearNotes}
                disabled={noteCount === 0}
                title={noteCount === 0 ? "No notes to clear" : undefined}
              >
                {confirmingClearNotes ? "Confirm Clear All" : "Clear All Notes"}
              </button>
              {confirmingClearNotes && (
                <span className="history-session-note">This cannot be undone. Click again to confirm.</span>
              )}
            </>
          );
        })()}
      </div>

      {/* ── Voice Input ── */}
      <div className="settings-section">
        <div className="settings-section-label">Voice Input</div>
        <div className="settings-toggle-row">
          <span className="settings-toggle-label">Enable Voice Input</span>
          <button
            className={`settings-toggle ${settings.voiceInputEnabled ? "settings-toggle-on" : ""}`}
            onClick={() =>
              dispatch({ type: "SET_SETTINGS", payload: { voiceInputEnabled: !settings.voiceInputEnabled } })
            }
            aria-pressed={settings.voiceInputEnabled}
          >
            {settings.voiceInputEnabled ? "ON" : "OFF"}
          </button>
        </div>
        <div className="settings-field" style={{ marginTop: "8px" }}>
          <span className="settings-field-label">STT Engine</span>
          <span
            className={`ai-status-badge ${settings.sttEngineStatus === "ready" ? "ai-status-online" : settings.sttEngineStatus === "error" ? "ai-status-error" : "ai-status-offline"}`}
          >
            {settings.sttEngineLabel ?? "Not configured"}
          </span>
        </div>
        <div className="settings-field">
          <span className="settings-field-label">Keyboard shortcut</span>
          <span className="settings-field-value settings-field-mono">{settings.pushToTalkKey} — works only when the command box is not focused</span>
        </div>

        {/* STT Model Path — Phase 3C */}
        <div className="settings-field" style={{ marginTop: "10px", flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
          <span className="settings-field-label">Whisper Model Path</span>
          <div style={{ display: "flex", gap: "6px", width: "100%", flexWrap: "wrap" }}>
            <input
              className="memory-note-input"
              type="text"
              value={sttModelPathInput}
              onChange={(e) => { setSttModelPathInput(e.target.value); setSttTestResult(null); }}
              placeholder="e.g. C:\models\ggml-base.bin"
              aria-label="Whisper model file path"
              style={{ flex: 1, minWidth: "200px" }}
            />
            <button
              className="btn ai-refresh-btn"
              onClick={handleValidateSttPath}
              disabled={sttValidating || sttTesting}
            >
              {sttValidating ? "Checking…" : "Validate Path"}
            </button>
            <button
              className="btn ai-test-btn"
              onClick={handleTestWhisperModel}
              disabled={sttTesting || sttValidating || !sttModelPathInput.trim()}
              title="Attempts to load the model. Requires Lisa built with --features whisper."
            >
              {sttTesting ? "Loading…" : "Test Model"}
            </button>
            {settings.sttModelPath && (
              <button
                className="btn"
                style={{ opacity: 0.7 }}
                onClick={() => {
                  setSttModelPathInput("");
                  setSttTestResult(null);
                  dispatch({ type: "SET_SETTINGS", payload: { sttModelPath: "", sttEngineStatus: "not_configured", sttEngineLabel: "Not configured" } });
                }}
              >
                Clear
              </button>
            )}
          </div>
          {sttTestResult && (
            <div className={`ai-test-result ${sttTestResult.success ? "ai-test-result-pass" : "ai-test-result-fail"}`}>
              {sttTestResult.success
                ? `✓ ${sttTestResult.engine_name}${sttTestResult.latency_ms > 0 ? ` — loaded in ${sttTestResult.latency_ms}ms` : ""}`
                : `✗ ${sttTestResult.error ?? "Failed"}`}
            </div>
          )}
        </div>

        <p className="history-note" style={{ marginTop: "8px" }}>
          Phase 3D — Local Voice Pipeline. Set a local Whisper GGML model path above (e.g. ggml-base.bin), then hold <kbd style={{ fontSize: "0.85em", padding: "1px 4px", borderRadius: "3px", border: "1px solid #555", background: "#222" }}>V</kbd> outside the command box to record from your microphone. Release to transcribe locally with Whisper, then review the transcript and click Send Transcript to submit, or Discard to cancel. Lisa never listens in the background and never sends audio to any network service. Windows may show a microphone permission prompt on first use — this is normal.
        </p>
        {settings.sttModelLastTestedAt && (
          <p className="history-note" style={{ marginTop: "2px" }}>
            Last tested: {new Date(settings.sttModelLastTestedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* ── Voice Output ── */}
      <div className="settings-section">
        <div className="settings-section-label">Voice Output</div>

        {/* Backend status */}
        <div className="settings-toggle-row">
          <span className="settings-toggle-label">TTS Engine</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {state.ttsUiStatus === "checking" ? (
              <span className="ai-status-badge ai-status-checking">Checking…</span>
            ) : ttsStatusInfo ? (
              <span className={`ai-status-badge ${ttsStatusInfo.available ? "ai-status-online" : "ai-status-offline"}`}>
                {ttsStatusInfo.label}
              </span>
            ) : (
              <span className="ai-status-badge ai-status-offline">Not checked</span>
            )}
            <button className="btn ai-refresh-btn" onClick={checkTtsStatus} disabled={state.ttsUiStatus === "checking"}>
              {state.ttsUiStatus === "checking" ? "Checking…" : "Check"}
            </button>
          </div>
        </div>

        {/* Enable Voice Output */}
        <div className="settings-toggle-row">
          <span className="settings-toggle-label">Enable Voice Output</span>
          <button
            className={`settings-toggle ${settings.voiceOutputEnabled ? "settings-toggle-on" : ""}`}
            onClick={() => dispatch({ type: "SET_SETTINGS", payload: { voiceOutputEnabled: !settings.voiceOutputEnabled } })}
            aria-pressed={settings.voiceOutputEnabled}
          >
            {settings.voiceOutputEnabled ? "ON" : "OFF"}
          </button>
        </div>

        {/* Auto-Speak */}
        <div className={`settings-toggle-row ${!settings.voiceOutputEnabled ? "settings-toggle-row-disabled" : ""}`}>
          <span className="settings-toggle-label">Auto-Speak Responses</span>
          <button
            className={`settings-toggle ${settings.voiceOutputAutoSpeak ? "settings-toggle-on" : ""}`}
            onClick={() => dispatch({ type: "SET_SETTINGS", payload: { voiceOutputAutoSpeak: !settings.voiceOutputAutoSpeak } })}
            aria-pressed={settings.voiceOutputAutoSpeak}
            disabled={!settings.voiceOutputEnabled}
          >
            {settings.voiceOutputAutoSpeak ? "ON" : "OFF"}
          </button>
        </div>

        {/* Suppress in privacy modes */}
        <div className={`settings-toggle-row ${!settings.voiceOutputEnabled ? "settings-toggle-row-disabled" : ""}`}>
          <span className="settings-toggle-label">Suppress in Sleep / Privacy / Lockdown</span>
          <button
            className={`settings-toggle ${settings.voiceOutputSuppressInPrivacyModes ? "settings-toggle-on" : ""}`}
            onClick={() => dispatch({ type: "SET_SETTINGS", payload: { voiceOutputSuppressInPrivacyModes: !settings.voiceOutputSuppressInPrivacyModes } })}
            aria-pressed={settings.voiceOutputSuppressInPrivacyModes}
            disabled={!settings.voiceOutputEnabled}
          >
            {settings.voiceOutputSuppressInPrivacyModes ? "ON" : "OFF"}
          </button>
        </div>

        {/* Test Voice / Stop Speaking */}
        <div className="settings-action-row" style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            className="btn ai-test-btn"
            onClick={handleTestVoice}
            disabled={ttsTesting || !settings.voiceOutputEnabled || state.ttsUiStatus === "speaking"}
            title='Speaks "Hello, I am Lisa." using Windows SAPI. Requires Voice Output enabled.'
          >
            {ttsTesting ? "Speaking…" : "Test Voice"}
          </button>
          <button
            className="btn"
            onClick={handleStopSpeaking}
            disabled={ttsStopping || state.ttsUiStatus !== "speaking"}
            style={{ opacity: state.ttsUiStatus === "speaking" ? 1 : 0.5 }}
            title="Stop current TTS speech immediately."
          >
            {ttsStopping ? "Stopping…" : "Stop Speaking"}
          </button>
        </div>

        {ttsTestResult && (
          <div className={`ai-test-result ${ttsTestResult.accepted ? "ai-test-result-pass" : "ai-test-result-fail"}`}>
            {ttsTestResult.accepted ? "✓ Voice request accepted." : `✗ ${ttsTestResult.error ?? "Test failed"}`}
          </div>
        )}

        <p className="history-note" style={{ marginTop: "8px" }}>
          Phase 3E — Local Voice Output. Uses Windows built-in SAPI speech engine. No audio is stored or sent to any network service. Audit logs record metadata only — spoken text is never logged. Voice output is suppressed in Sleep, Privacy, and Lockdown modes when suppression is enabled.
        </p>
      </div>

      {/* ── Voice Conversation ── */}
      <div className="settings-section">
        <div className="settings-section-label">Voice Conversation</div>

        <div className="settings-toggle-row">
          <span className="settings-toggle-label">Enable Voice Conversation</span>
          <button
            className={`settings-toggle ${settings.voiceConversationEnabled ? "settings-toggle-on" : ""}`}
            onClick={() => dispatch({ type: "SET_SETTINGS", payload: { voiceConversationEnabled: !settings.voiceConversationEnabled } })}
            aria-pressed={settings.voiceConversationEnabled}
          >
            {settings.voiceConversationEnabled ? "ON" : "OFF"}
          </button>
        </div>

        <div className={`settings-field settings-vc-mode-row${!settings.voiceConversationEnabled ? " settings-toggle-row-disabled" : ""}`}>
          <span className="settings-field-label">Mode</span>
          <div className="settings-vc-mode-btns">
            {(["manual_review", "confirm", "auto_send"] as const).map((m) => {
              const label = m === "manual_review" ? "Manual Review" : m === "confirm" ? "Confirm" : "Auto-Send";
              return (
                <button
                  key={m}
                  className={`settings-mode-btn${settings.voiceConversationMode === m ? " settings-mode-active" : ""}`}
                  onClick={() => dispatch({ type: "SET_SETTINGS", payload: { voiceConversationMode: m } })}
                  disabled={!settings.voiceConversationEnabled}
                  title={
                    m === "manual_review"
                      ? "Preview card shown — click Send Transcript to submit."
                      : m === "confirm"
                      ? "Preview card shown — click Send, then Lisa auto-speaks the reply."
                      : "Transcript auto-submits on release. Lisa auto-speaks the reply."
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`settings-toggle-row${!settings.voiceConversationEnabled ? " settings-toggle-row-disabled" : ""}`}>
          <span className="settings-toggle-label">Auto-Speak Voice Replies</span>
          <button
            className={`settings-toggle ${settings.voiceAutoSpeakReplies ? "settings-toggle-on" : ""}`}
            onClick={() => dispatch({ type: "SET_SETTINGS", payload: { voiceAutoSpeakReplies: !settings.voiceAutoSpeakReplies } })}
            aria-pressed={settings.voiceAutoSpeakReplies}
            disabled={!settings.voiceConversationEnabled || !settings.voiceOutputEnabled}
          >
            {settings.voiceAutoSpeakReplies ? "ON" : "OFF"}
          </button>
        </div>
        {settings.voiceConversationEnabled && !settings.voiceOutputEnabled && (
          <p className="history-note" style={{ marginTop: "4px", color: "var(--color-warn, #f59e0b)" }}>
            Voice Output must be enabled for auto-speak replies to work.
          </p>
        )}

        <div className={`settings-toggle-row${!settings.voiceConversationEnabled ? " settings-toggle-row-disabled" : ""}`}>
          <span className="settings-toggle-label">No-Transcript Action</span>
          <div style={{ display: "flex", gap: "5px" }}>
            {(["clarify", "silent"] as const).map((a) => (
              <button
                key={a}
                className={`settings-mode-btn${settings.voiceNoTranscriptAction === a ? " settings-mode-active" : ""}`}
                onClick={() => dispatch({ type: "SET_SETTINGS", payload: { voiceNoTranscriptAction: a } })}
                disabled={!settings.voiceConversationEnabled}
                title={a === "clarify" ? 'Lisa speaks "Can you say that again?" when no speech is detected.' : "Silently show the no-transcript state."}
              >
                {a === "clarify" ? "Clarify" : "Silent"}
              </button>
            ))}
          </div>
        </div>

        <div className={`settings-toggle-row${!settings.voiceConversationEnabled ? " settings-toggle-row-disabled" : ""}`}>
          <span className="settings-toggle-label">Suppress in Sleep / Privacy / Lockdown</span>
          <button
            className={`settings-toggle ${settings.voiceConversationSuppressInPrivacyModes ? "settings-toggle-on" : ""}`}
            onClick={() => dispatch({ type: "SET_SETTINGS", payload: { voiceConversationSuppressInPrivacyModes: !settings.voiceConversationSuppressInPrivacyModes } })}
            aria-pressed={settings.voiceConversationSuppressInPrivacyModes}
            disabled={!settings.voiceConversationEnabled}
          >
            {settings.voiceConversationSuppressInPrivacyModes ? "ON" : "OFF"}
          </button>
        </div>

        <p className="history-note" style={{ marginTop: "8px" }}>
          Phase 3G — Voice Conversation. Hold V to speak, release to transcribe. In Auto-Send mode the transcript submits automatically and Lisa speaks the reply. The microphone never opens automatically — hold V again for each new turn. No wake word, no background listening. Commands: "enable voice conversation" / "disable voice conversation".
        </p>
      </div>

      {/* ── Screen Awareness ── */}
      <div className="settings-section">
        <div className="settings-section-label">Screen Awareness</div>

        <div className="settings-toggle-row">
          <span className="settings-toggle-label">Enable Screen Awareness</span>
          <button
            className={`settings-toggle ${settings.screenAwarenessEnabled ? "settings-toggle-on" : ""}`}
            onClick={() => {
              const next = !settings.screenAwarenessEnabled;
              dispatch({ type: "SET_SETTINGS", payload: { screenAwarenessEnabled: next } });
              addAudit({
                eventType: next ? "screen_awareness_enabled" : "screen_awareness_disabled",
                source: "settings_panel",
                summary: next ? "Screen awareness enabled." : "Screen awareness disabled.",
                severity: "info",
              });
            }}
            aria-pressed={settings.screenAwarenessEnabled}
          >
            {settings.screenAwarenessEnabled ? "ON" : "OFF"}
          </button>
        </div>

        {settings.screenAwarenessEnabled && (
          <>
            <div className="settings-toggle-row" style={{ marginTop: "10px" }}>
              <span className="settings-toggle-label">Include Screen Context in Local AI</span>
              <button
                className={`settings-toggle ${settings.screenContextEnabledForPrompt ? "settings-toggle-on" : ""}`}
                onClick={() =>
                  dispatch({ type: "SET_SETTINGS", payload: { screenContextEnabledForPrompt: !settings.screenContextEnabledForPrompt } })
                }
                aria-pressed={settings.screenContextEnabledForPrompt}
              >
                {settings.screenContextEnabledForPrompt ? "ON" : "OFF"}
              </button>
            </div>

            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Suppress in Sleep / Privacy / Lockdown</span>
              <button
                className={`settings-toggle ${settings.screenSuppressInPrivacyModes ? "settings-toggle-on" : ""}`}
                onClick={() =>
                  dispatch({ type: "SET_SETTINGS", payload: { screenSuppressInPrivacyModes: !settings.screenSuppressInPrivacyModes } })
                }
                aria-pressed={settings.screenSuppressInPrivacyModes}
              >
                {settings.screenSuppressInPrivacyModes ? "ON" : "OFF"}
              </button>
            </div>

            <div className="settings-field" style={{ marginTop: "12px" }}>
              <span className="settings-field-label">Status</span>
              <span className={`ai-status-badge ${
                state.screenStatus === "available" ? "ai-status-online" :
                state.screenStatus === "capturing" ? "ai-status-checking" :
                state.screenStatus === "error" ? "ai-status-error" :
                "ai-status-offline"
              }`}>
                {state.screenStatus === "available"
                  ? `Captured — ${state.screenWidth ?? "?"}×${state.screenHeight ?? "?"}`
                  : state.screenStatus === "capturing"
                  ? "Capturing…"
                  : state.screenStatus === "error"
                  ? "Error"
                  : "No capture"}
              </span>
            </div>

            {state.screenStatus === "available" && state.screenCapturedAt && (
              <div className="settings-field">
                <span className="settings-field-label">Captured at</span>
                <span className="settings-field-value">
                  {new Date(state.screenCapturedAt).toLocaleTimeString()}
                </span>
              </div>
            )}

            {screenCaptureError && (
              <div className="stt-test-result stt-test-failed" style={{ marginTop: "8px" }}>
                {screenCaptureError}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button
                className="settings-action-btn"
                onClick={handleCaptureScreen}
                disabled={screenCapturing}
              >
                {screenCapturing ? "Capturing…" : "Capture Screen"}
              </button>
              {state.screenStatus === "available" && (
                <button
                  className="settings-action-btn"
                  onClick={handleClearScreenContext}
                >
                  Clear Screen Context
                </button>
              )}
            </div>
          </>
        )}

        <p className="history-note" style={{ marginTop: "12px" }}>
          Screen capture is manual only. Lisa does not watch your screen in the background. Screenshots are local and are not sent to any network service. No OCR or image understanding in Phase 4A. Commands: "capture screen" / "clear screen context" / "what can you see".
        </p>
      </div>

      {/* ── Phase Flags ── */}
      <div className="settings-section">
        <div className="settings-section-label">Phase Flags</div>
        <div className="settings-toggle-row">
          <span className="settings-toggle-label">Developer Mode</span>
          <button
            className={`settings-toggle ${settings.developerMode ? "settings-toggle-on" : ""}`}
            onClick={() =>
              dispatch({ type: "SET_SETTINGS", payload: { developerMode: !settings.developerMode } })
            }
            aria-pressed={settings.developerMode}
          >
            {settings.developerMode ? "ON" : "OFF"}
          </button>
        </div>
        <div className="settings-toggle-row">
          <span className="settings-toggle-label">Persist Audit Log</span>
          <button
            className={`settings-toggle ${settings.persistAuditLog ? "settings-toggle-on" : ""}`}
            onClick={() =>
              dispatch({
                type: "SET_SETTINGS",
                payload: { persistAuditLog: !settings.persistAuditLog },
              })
            }
            aria-pressed={settings.persistAuditLog}
          >
            {settings.persistAuditLog ? "ON" : "OFF"}
          </button>
        </div>
        <div className="settings-toggle-row settings-toggle-row-disabled">
          <span className="settings-toggle-label">Screen Awareness (Phase 2)</span>
          <span className="settings-coming-soon">Phase 2</span>
        </div>
        <div className="settings-toggle-row settings-toggle-row-disabled">
          <span className="settings-toggle-label">Desktop Control (Phase 2)</span>
          <span className="settings-coming-soon">Phase 2</span>
        </div>
        <div className="settings-toggle-row settings-toggle-row-disabled">
          <span className="settings-toggle-label">Vault (Post-Phase 0)</span>
          <span className="settings-coming-soon">Not yet</span>
        </div>
      </div>

      {/* ── Tool Framework ── */}
      <div className="settings-section">
        <div className="settings-section-label">Tool Framework</div>
        <div className="settings-tool-framework-note">
          Tools are approval-gated. Tool enable/disable controls are not implemented yet.
        </div>

        {/* Tool Result Context toggle */}
        <div className="settings-tool-context-block">
          <div className="settings-toggle-row">
            <span className="settings-toggle-label">Include safe tool results in local AI context</span>
            <button
              className={`settings-toggle ${settings.toolResultContextEnabled ? "settings-toggle-on" : ""}`}
              onClick={() =>
                dispatch({ type: "SET_SETTINGS", payload: { toolResultContextEnabled: !settings.toolResultContextEnabled } })
              }
              aria-pressed={settings.toolResultContextEnabled}
            >
              {settings.toolResultContextEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <p className="settings-tool-context-note">
            {settings.toolResultContextEnabled
              ? "Results from tools marked safe for context are added to Lisa's local AI prompt as read-only context. This is separate from memory notes — disabling this does not delete tool results. Tool execution still requires approval."
              : "Tool results remain visible in Console but will not be sent to the local model. This does not affect memory notes or conversation history."}
          </p>
        </div>

        {/* Per-tool list */}
        {getAllToolDefinitions().map((tool) => {
          const policyLabel =
            tool.contextPolicy === "inject"
              ? "INJECT"
              : tool.contextPolicy === "no_inject"
              ? "NO INJECT"
              : "RESERVED";
          return (
            <div key={tool.id} className="settings-tool-row">
              <div className="settings-tool-header">
                <span className="settings-tool-name">{tool.displayName}</span>
                <span className={`settings-tool-risk settings-tool-risk-${tool.riskLevel}`}>
                  {tool.riskLevel.toUpperCase()}
                </span>
                <span className={`settings-tool-policy settings-tool-policy-${tool.contextPolicy}`}>
                  {policyLabel}
                </span>
              </div>
              <div className="settings-tool-meta">
                <span className="settings-tool-id">{tool.id}</span>
                <span className="settings-tool-sep">·</span>
                <span className="settings-tool-category">{tool.category}</span>
                <span className="settings-tool-sep">·</span>
                <span className="settings-tool-flag">{tool.enabled ? "enabled" : "disabled"}</span>
                <span className="settings-tool-sep">·</span>
                <span className="settings-tool-flag">{tool.requiresApproval ? "approval required" : "no approval"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Build Info ── */}
      <div className="settings-section">
        <div className="settings-section-label">Build Info</div>
        <div className="settings-build-info">
          <div className="settings-field">
            <span className="settings-field-label">Phase</span>
            <span className="settings-field-value">3G — Voice-First Conversation Flow</span>
          </div>
          <div className="settings-field">
            <span className="settings-field-label">Version</span>
            <span className="settings-field-value">0.1.0</span>
          </div>
          <div className="settings-field">
            <span className="settings-field-label">Stack</span>
            <span className="settings-field-value">Tauri v2 · React 18 · TypeScript · Ollama</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
