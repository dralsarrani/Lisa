import React, { useState, useEffect, useCallback } from "react";
import type { LisaSettings, LisaModeId } from "../../core/types";
import { LISA_MODES } from "../../core/mode-store";
import { useLisa } from "../../app/useLisa";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  settings: LisaSettings;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings }) => {
  const { dispatch, addAudit } = useLisa();
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  // null = not yet probed, true = reachable, false = unreachable
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);

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
      const result = await invoke<{ models: Array<{ name: string }>; error: string | null }>(
        "list_ollama_models"
      );

      if (result.error) {
        setModelsError(result.error);
        setAvailableModels([]);
        setOllamaReachable(false);
      } else {
        const names = result.models.map((m) => m.name);
        setAvailableModels(names);
        setOllamaReachable(true);

        const currentModel = settings.ollamaModel;
        if (currentModel && !names.includes(currentModel)) {
          // Previously selected model is no longer installed — auto-select first or clear.
          dispatch({ type: "SET_SETTINGS", payload: { ollamaModel: names[0] ?? "" } });
        } else if (!currentModel && names.length > 0) {
          dispatch({ type: "SET_SETTINGS", payload: { ollamaModel: names[0] } });
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
                  onChange={(e) =>
                    dispatch({ type: "SET_SETTINGS", payload: { ollamaModel: e.target.value } })
                  }
                >
                  {!settings.ollamaModel && (
                    <option value="" disabled>
                      — select a model —
                    </option>
                  )}
                  {availableModels.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
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

            <div style={{ marginTop: "6px" }}>
              <button
                className="btn ai-refresh-btn"
                onClick={fetchModels}
                disabled={modelsFetching}
              >
                {modelsFetching ? "Refreshing…" : "Refresh Models"}
              </button>
            </div>

            <div className="settings-field" style={{ marginTop: "10px" }}>
              <span className="settings-field-label">Context turns</span>
              <span className="settings-field-value">{settings.maxContextTurns}</span>
            </div>
          </div>
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
          <span className="settings-toggle-label">Voice (Phase 1B)</span>
          <span className="settings-coming-soon">Not yet</span>
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

      {/* ── Build Info ── */}
      <div className="settings-section">
        <div className="settings-section-label">Build Info</div>
        <div className="settings-build-info">
          <div className="settings-field">
            <span className="settings-field-label">Phase</span>
            <span className="settings-field-value">1A — Local AI Runtime</span>
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
