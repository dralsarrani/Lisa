import React from "react";
import type { LisaSettings, LisaModeId } from "../../core/types";
import { LISA_MODES } from "../../core/mode-store";
import { useLisa } from "../../app/useLisa";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  settings: LisaSettings;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings }) => {
  const { dispatch, addAudit } = useLisa();

  function setMode(id: LisaModeId) {
    dispatch({ type: "SET_MODE", payload: id });
    addAudit({
      eventType: "mode_changed",
      source: "settings_panel",
      summary: `Mode changed to ${LISA_MODES[id].name} via settings.`,
      severity: "info",
    });
  }

  function toggleDeveloperMode() {
    dispatch({
      type: "SET_SETTINGS",
      payload: { developerMode: !settings.developerMode },
    });
  }

  return (
    <div className="settings-panel">
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

      <div className="settings-section">
        <div className="settings-section-label">Phase 0 Flags</div>
        <div className="settings-toggle-row">
          <span className="settings-toggle-label">Developer Mode</span>
          <button
            className={`settings-toggle ${settings.developerMode ? "settings-toggle-on" : ""}`}
            onClick={toggleDeveloperMode}
            aria-pressed={settings.developerMode}
          >
            {settings.developerMode ? "ON" : "OFF"}
          </button>
        </div>
        <div className="settings-toggle-row settings-toggle-row-disabled">
          <span className="settings-toggle-label">Voice (Phase 1)</span>
          <span className="settings-coming-soon">Phase 1</span>
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
          <span className="settings-toggle-label">Local LLM / Ollama (Phase 1)</span>
          <span className="settings-coming-soon">Phase 1</span>
        </div>
        <div className="settings-toggle-row settings-toggle-row-disabled">
          <span className="settings-toggle-label">Vault (Post-Phase 0)</span>
          <span className="settings-coming-soon">Not yet</span>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">Build Info</div>
        <div className="settings-build-info">
          <div className="settings-field">
            <span className="settings-field-label">Phase</span>
            <span className="settings-field-value">0 — Local Lisa Shell</span>
          </div>
          <div className="settings-field">
            <span className="settings-field-label">Version</span>
            <span className="settings-field-value">0.1.0</span>
          </div>
          <div className="settings-field">
            <span className="settings-field-label">Stack</span>
            <span className="settings-field-value">Tauri v2 · React 18 · TypeScript · Vite</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
