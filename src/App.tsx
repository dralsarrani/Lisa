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
import { getToolDefinition } from "./core/tool-registry";
import { hasActiveToolRequestForParams } from "./core/tool-request-utils";
import { createAuditEvent } from "./core/audit-store";
import { shouldAutoSpeakInteraction, buildTtsSpeechAuditDetails } from "./core/tts";
import type { RuntimeHealth as RuntimeHealthData, ToolRequest, ToolApprovalContract, LisaInteraction } from "./core/types";
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
  const pendingToolApprovals = state.toolApprovals.filter((a) => a.decision === null);
  const totalPending = pendingApprovals.length + pendingToolApprovals.length;

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

  const handlePrepareMemoryNoteSave = useCallback((resultId: string) => {
    const toolDef = getToolDefinition("save-tool-result-memory-note");
    if (!toolDef) return;

    const existing = hasActiveToolRequestForParams(
      state.toolRequests,
      "save-tool-result-memory-note",
      { sourceResultId: resultId }
    );
    if (existing) {
      setActiveTab("approvals");
      return;
    }

    const requestId = crypto.randomUUID();
    const contractId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const request: ToolRequest = {
      id: requestId,
      toolId: "save-tool-result-memory-note",
      toolDisplayName: toolDef.displayName,
      params: { sourceResultId: resultId },
      status: "pending_approval",
      source: "result_action",
      consequences: toolDef.consequences,
      createdAt,
    };

    const approval: ToolApprovalContract = {
      id: contractId,
      requestId,
      toolId: "save-tool-result-memory-note",
      toolDisplayName: toolDef.displayName,
      consequences: toolDef.consequences,
      decision: null,
      resolvedBy: null,
      createdAt,
    };

    dispatch({
      type: "CREATE_TOOL_REQUEST",
      payload: {
        request,
        approval,
        auditEvent: createAuditEvent({
          eventType: "tool_request_created",
          source: "console_result_action",
          summary: `Tool request created: "${toolDef.displayName}"`,
          severity: "info",
        }),
      },
    });

    setActiveTab("approvals");
  }, [state.toolRequests, dispatch]);

  const handleStopSpeaking = useCallback(async () => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_speaking").catch(() => {});
    }
    dispatch({ type: "CLEAR_TTS_STATE" });
    addAudit({
      eventType: "tts_speech_stopped",
      source: "console_stop_button",
      summary: "TTS stopped by user.",
      severity: "info",
    });
  }, [dispatch, addAudit]);

  const handleSpeak = useCallback(async (interaction: LisaInteraction) => {
    if (!interaction.response?.trim()) return;
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;
    dispatch({ type: "SET_TTS_SPEAKING", payload: { interactionId: interaction.id } });
    dispatch({ type: "MARK_INTERACTION_SPOKEN", payload: interaction.id });
    addAudit({
      eventType: "tts_speech_started",
      source: "console_speak_button",
      summary: "TTS speech started.",
      details: buildTtsSpeechAuditDetails({
        interactionId: interaction.id,
        charCount: interaction.response.length,
        provider: "windows_sapi",
        source: "manual",
      }),
      severity: "info",
    });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ success: boolean; error?: string }>("speak_text", { text: interaction.response });
      dispatch({ type: "CLEAR_TTS_STATE" });
      addAudit({
        eventType: result.success ? "tts_speech_completed" : "tts_speech_failed",
        source: "console_speak_button",
        summary: result.success ? "TTS speech completed." : "TTS speech failed.",
        details: result.success
          ? buildTtsSpeechAuditDetails({ interactionId: interaction.id, charCount: interaction.response.length, provider: "windows_sapi", source: "manual" })
          : (result.error ?? "unknown error"),
        severity: result.success ? "info" : "error",
      });
    } catch (err) {
      dispatch({ type: "CLEAR_TTS_STATE" });
      addAudit({
        eventType: "tts_speech_failed",
        source: "console_speak_button",
        summary: "TTS speech failed.",
        details: err instanceof Error ? err.message : String(err),
        severity: "error",
      });
    }
  }, [dispatch, addAudit]);

  // Auto-speak: fire once per new completed local_ai interaction when allowed.
  const autoSpeakCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state.settings.voiceOutputAutoSpeak || !state.settings.voiceOutputEnabled) return;
    const last = [...state.interactions].reverse().find(
      (ix) => ix.kind === "local_ai" && ix.status === "complete"
    );
    if (!last || autoSpeakCheckedRef.current === last.id) return;
    autoSpeakCheckedRef.current = last.id;
    const result = shouldAutoSpeakInteraction(last, {
      settings: state.settings,
      orbState: state.orbState,
      voiceStatus: state.voiceStatus,
      activeMode: state.settings.activeMode,
      spokenInteractionIds: state.spokenInteractionIds,
    });
    if (result.allowed) {
      handleSpeak(last);
    } else if (result.reason) {
      addAudit({
        eventType: "tts_auto_speak_blocked",
        source: "auto_speak_effect",
        summary: `Auto-speak blocked: ${result.reason}`,
        severity: "info",
      });
    }
  }, [state.interactions, state.settings, state.orbState, state.voiceStatus, state.spokenInteractionIds, handleSpeak, addAudit]);

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
          {totalPending > 0 && (
            <div className="panel app-pending-alert">
              <div className="pending-alert-content">
                <span className="pending-alert-icon">⚠</span>
                <span className="pending-alert-text">
                  {totalPending} approval{totalPending > 1 ? "s" : ""} waiting
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
                  {tab.id === "approvals" && totalPending > 0 && (
                    <span className="app-tab-badge">{totalPending}</span>
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
                  toolResults={state.toolResults}
                  toolRequests={state.toolRequests}
                  onPrepareMemoryNoteSave={handlePrepareMemoryNoteSave}
                  ttsUiStatus={state.ttsUiStatus}
                  ttsSpeakingInteractionId={state.ttsSpeakingInteractionId}
                  voiceStatus={state.voiceStatus}
                  onSpeak={state.settings.voiceOutputEnabled ? handleSpeak : undefined}
                  onStopSpeaking={state.settings.voiceOutputEnabled ? handleStopSpeaking : undefined}
                />
              )}
              {activeTab === "missions" && (
                <MissionPanel missions={state.missions} />
              )}
              {activeTab === "approvals" && (
                <ApprovalCenter
                  approvals={state.approvals}
                  toolApprovals={state.toolApprovals}
                  toolRequests={state.toolRequests}
                />
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
