import React, { useState, useEffect, useCallback, useRef } from "react";
import type { LisaSettings, LisaModeId } from "../../core/types";
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
            <span className="settings-field-value">3D — KeyV Microphone Capture Pipeline</span>
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
