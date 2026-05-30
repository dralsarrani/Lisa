import { useState, useCallback, useEffect, useRef } from "react";
import { useLisa } from "./app/useLisa";
import { LisaOrb } from "./components/orb/LisaOrb";
import { CommandInput } from "./components/command/CommandInput";
import { MissionPanel } from "./components/missions/MissionPanel";
import { ApprovalCenter } from "./components/approvals/ApprovalCenter";
import { AuditLog } from "./components/audit/AuditLog";
import { RuntimeHealth } from "./components/runtime/RuntimeHealth";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { Header } from "./components/layout/Header";
import { ConsolePanel } from "./components/console/ConsolePanel";
import { getModeDisplayName } from "./core/mode-store";
import type { RuntimeHealth as RuntimeHealthData } from "./core/types";
import "./App.css";

type TabId = "console" | "missions" | "approvals" | "audit" | "runtime" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "console",   label: "Console" },
  { id: "missions",  label: "Missions" },
  { id: "approvals", label: "Approvals" },
  { id: "audit",     label: "Audit Log" },
  { id: "runtime",   label: "Runtime" },
  { id: "settings",  label: "Settings" },
];

function App() {
  const { state, dispatch, addAudit } = useLisa();
  const [activeTab, setActiveTab] = useState<TabId>("console");
  const prevInteractionsLengthRef = useRef(0);

  const pendingApprovals = state.approvals.filter((a) => a.status === "pending");

  useEffect(() => {
    if (state.interactions.length > prevInteractionsLengthRef.current) {
      prevInteractionsLengthRef.current = state.interactions.length;
      setActiveTab("console");
    }
  }, [state.interactions.length]);

  const handleEmergencyStop = useCallback(() => {
    dispatch({ type: "EMERGENCY_STOP" });
    addAudit({
      eventType: "emergency_stop_activated",
      source: "emergency_stop_button",
      summary: "Emergency stop triggered via button.",
      severity: "critical",
    });
  }, [dispatch, addAudit]);

  const handleCancelStream = useCallback(async (interactionId: string) => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("cancel_ollama_stream", { interactionId }).catch(() => {});
  }, []);

  const handleRuntimeRefresh = useCallback(async () => {
    dispatch({ type: "SET_ORB_STATE", payload: "acting" });
    addAudit({ eventType: "runtime_health_checked", source: "runtime_panel", summary: "Health check initiated.", severity: "info" });

    try {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let health: RuntimeHealthData;

      if (isTauri) {
        const { invoke } = await import("@tauri-apps/api/core");
        const raw = await invoke<{
          backend_reachable: boolean; app_version: string; os_type: string;
          os_version: string; arch: string; timestamp: string;
          ollama_status: string; docker_status: string;
        }>("get_runtime_health");
        health = {
          backendReachable: raw.backend_reachable,
          appVersion: raw.app_version,
          osType: raw.os_type,
          osVersion: raw.os_version,
          arch: raw.arch,
          timestamp: raw.timestamp,
          ollamaStatus: raw.ollama_status as RuntimeHealthData["ollamaStatus"],
          dockerStatus: raw.docker_status as RuntimeHealthData["dockerStatus"],
          lastChecked: new Date().toISOString(),
        };
      } else {
        health = {
          backendReachable: false,
          appVersion: "0.1.0-dev",
          osType: navigator.platform || "browser",
          osVersion: navigator.userAgent.slice(0, 80),
          arch: "unknown",
          timestamp: new Date().toISOString(),
          ollamaStatus: "not_configured",
          dockerStatus: "not_configured",
          lastChecked: new Date().toISOString(),
        };
      }

      dispatch({ type: "SET_RUNTIME_HEALTH", payload: health });
      addAudit({
        eventType: "runtime_health_checked",
        source: "runtime_panel",
        summary: `Health: backend=${health.backendReachable ? "ok" : "offline"} ollama=${health.ollamaStatus} docker=${health.dockerStatus}`,
        severity: health.backendReachable ? "info" : "warning",
      });
    } catch (err) {
      addAudit({ eventType: "error_occurred", source: "runtime_panel", summary: "Health check failed.", details: String(err), severity: "error" });
    }

    dispatch({ type: "SET_ORB_STATE", payload: "idle" });
  }, [dispatch, addAudit]);

  if (!state.isLoaded) {
    return (
      <div className="app-loading">
        <div className="app-loading-orb" />
        <span className="app-loading-text">INITIALIZING LISA…</span>
      </div>
    );
  }

  const isEmergencyStopped = state.orbState === "emergency_stopped";

  return (
    <div className={`app-root ${isEmergencyStopped ? "app-emergency" : ""}`}>
      {/* HUD scan line */}
      <div className="hud-scanline" />

      {/* Header */}
      <Header
        orbState={state.orbState}
        activeMode={state.activeMode}
        onEmergencyStop={handleEmergencyStop}
      />

      {/* Main layout */}
      <div className="app-body">
        {/* LEFT COLUMN: Orb + Command */}
        <div className="app-left-col">
          {/* Orb chamber — frameless presence surface */}
          <div className="orb-chamber">
            <div className="orb-chamber-mode">{getModeDisplayName(state.activeMode)}</div>
            <div className="app-orb-body">
              <LisaOrb state={state.orbState} size="large" mode={state.activeMode} />
              {isEmergencyStopped && (
                <div className="emergency-overlay">
                  <div className="emergency-overlay-text">EMERGENCY STOPPED</div>
                  <div className="emergency-overlay-sub">All operations halted · System safe</div>
                  <div className="emergency-overlay-hint">
                    Type "Lisa, wake up" to clear
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Command rail — primary interaction surface */}
          <div className="command-rail">
            <CommandInput />
          </div>

          {/* Pending approvals quick-action */}
          {pendingApprovals.length > 0 && (
            <div className="panel app-pending-alert">
              <div className="pending-alert-content">
                <span className="pending-alert-icon">⚠</span>
                <span className="pending-alert-text">
                  {pendingApprovals.length} approval{pendingApprovals.length > 1 ? "s" : ""} waiting
                </span>
                <button
                  className="btn btn-primary pending-alert-btn"
                  onClick={() => setActiveTab("approvals")}
                >
                  Review
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Tab panel */}
        <div className="app-right-col">
          <div className="app-tab-panel">
            {/* Tab navigation */}
            <div className="app-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`app-tab ${activeTab === tab.id ? "app-tab-active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tab.id === "approvals" && pendingApprovals.length > 0 && (
                    <span className="app-tab-badge">{pendingApprovals.length}</span>
                  )}
                  {tab.id === "audit" && (
                    <span className="app-tab-count">{state.auditEvents.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="app-tab-content">
              {activeTab === "console" && (
                <ConsolePanel
                  interactions={state.interactions}
                  orbState={state.orbState}
                  settings={state.settings}
                  onCancelStream={handleCancelStream}
                />
              )}
              {activeTab === "missions" && (
                <MissionPanel missions={state.missions} />
              )}
              {activeTab === "approvals" && (
                <ApprovalCenter approvals={state.approvals} />
              )}
              {activeTab === "audit" && (
                <AuditLog events={state.auditEvents} />
              )}
              {activeTab === "runtime" && (
                <RuntimeHealth health={state.runtimeHealth} onRefresh={handleRuntimeRefresh} />
              )}
              {activeTab === "settings" && (
                <SettingsPanel settings={state.settings} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
