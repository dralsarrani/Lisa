import React, { useState, useRef, useEffect } from "react";
import { useLisa } from "../../app/useLisa";
import { routeCommand } from "../../core/command-router";
import { createTestMission, applyApprovalDecision } from "../../core/mission-store";
import { createAuditEvent } from "../../core/audit-store";
import { getModeDisplayName } from "../../core/mode-store";
import { fetchRuntimeHealth } from "../../core/runtime-health";
import "./CommandInput.css";

const SUGGESTIONS = [
  "Lisa, create test mission",
  "Lisa, check local runtime",
  "Lisa, activate Focus Mode",
  "Lisa, activate Cyber Mode",
  "Lisa, emergency stop",
  "Lisa, wake up",
];

const RESPONSE_DISMISS_MS = 8_000;
const MAX_HISTORY = 50;

export const CommandInput: React.FC = () => {
  const { state, dispatch, addAudit } = useLisa();
  const [value, setValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss commandResponse after RESPONSE_DISMISS_MS,
  // unless it is an emergency-stop message (that persists until wake).
  useEffect(() => {
    if (!state.commandResponse) return;
    const isEmergencyMessage =
      state.orbState === "emergency_stopped" ||
      state.commandResponse.startsWith("EMERGENCY STOP");
    if (isEmergencyMessage) return;

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      dispatch({ type: "SET_COMMAND_RESPONSE", payload: null });
    }, RESPONSE_DISMISS_MS);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [state.commandResponse, state.orbState, dispatch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = value.trim();
    if (!raw || isProcessing) return;

    // Prepend to history, cap at MAX_HISTORY.
    historyRef.current = [raw, ...historyRef.current].slice(0, MAX_HISTORY);
    historyIndexRef.current = -1;

    setValue("");
    setIsProcessing(true);

    addAudit({
      eventType: "command_received",
      source: "command_input",
      summary: `Command received: "${raw}"`,
      severity: "info",
    });

    const route = routeCommand(raw);

    addAudit({
      eventType: route.intent === "unknown" ? "command_unknown" : "command_routed",
      source: "command_router",
      summary: `Routed to: ${route.intent}`,
      details: `raw="${raw}" normalized="${route.normalized}" confidence=${route.confidence}`,
      severity: route.intent === "unknown" ? "warning" : "info",
    });

    dispatch({ type: "SET_COMMAND_RESPONSE", payload: route.response ?? null });

    switch (route.intent) {
      case "emergency_stop":
        dispatch({ type: "EMERGENCY_STOP" });
        addAudit({
          eventType: "emergency_stop_activated",
          source: "command_input",
          summary: "Emergency stop triggered by user command.",
          severity: "critical",
        });
        break;

      case "stop":
        dispatch({ type: "SET_ORB_STATE", payload: "paused" });
        addAudit({
          eventType: "mission_paused",
          source: "command_input",
          summary: "Stop command received. Active operations paused.",
          severity: "warning",
        });
        break;

      case "sleep":
        dispatch({ type: "SET_MODE", payload: "sleep" });
        dispatch({ type: "SET_ORB_STATE", payload: "paused" });
        addAudit({
          eventType: "mode_changed",
          source: "command_input",
          summary: "Lisa entering sleep mode.",
          severity: "info",
        });
        break;

      case "wake": {
        const clearedAt = new Date().toISOString();
        if (state.orbState === "emergency_stopped") {
          // Emergency clear path: orb unlocked, stopped missions set to paused
          // with an explanation step. The audit event is embedded in the action
          // payload so the reducer can prepend it atomically.
          const auditEvent = createAuditEvent({
            eventType: "emergency_stop_cleared",
            source: "command_input",
            summary:
              "Emergency lock cleared via wake command. All stopped missions set to paused — explicit restart required.",
            severity: "warning",
          });
          dispatch({ type: "CLEAR_EMERGENCY", payload: { clearedAt, auditEvent } });
        } else {
          dispatch({ type: "SET_ORB_STATE", payload: "idle" });
          addAudit({
            eventType: "orb_state_changed",
            source: "command_input",
            summary: "Lisa woke from sleep or paused state.",
            severity: "info",
          });
        }
        break;
      }

      case "mode_change": {
        const modeId = route.payload?.modeId as Parameters<typeof getModeDisplayName>[0];
        if (modeId) {
          const prevMode = state.activeMode;
          dispatch({ type: "SET_MODE", payload: modeId });
          dispatch({ type: "SET_ORB_STATE", payload: "idle" });
          addAudit({
            eventType: "mode_changed",
            source: "command_input",
            summary: `Mode changed: ${getModeDisplayName(prevMode)} → ${getModeDisplayName(modeId)}`,
            details: `New mode: ${modeId}`,
            severity: "info",
          });
        }
        break;
      }

      case "runtime_health": {
        dispatch({ type: "SET_ORB_STATE", payload: "acting" });
        addAudit({
          eventType: "runtime_health_checked",
          source: "command_input",
          summary: "Runtime health check requested.",
          severity: "info",
        });
        try {
          const health = await fetchRuntimeHealth();
          dispatch({ type: "SET_RUNTIME_HEALTH", payload: health });
          addAudit({
            eventType: "runtime_health_checked",
            source: "runtime_checker",
            summary: `Runtime: backend=${health.backendReachable ? "ok" : "offline"} ollama=${health.ollamaStatus} docker=${health.dockerStatus}`,
            severity: health.backendReachable ? "info" : "warning",
          });
        } catch (err) {
          addAudit({
            eventType: "error_occurred",
            source: "runtime_checker",
            summary: "Runtime health check failed.",
            details: String(err),
            severity: "error",
          });
        }
        dispatch({ type: "SET_ORB_STATE", payload: "idle" });
        break;
      }

      case "create_test_mission": {
        const { mission, approval } = createTestMission(state.activeMode);
        dispatch({ type: "ADD_MISSION", payload: mission });
        dispatch({ type: "ADD_APPROVAL", payload: approval });
        dispatch({ type: "SET_ORB_STATE", payload: "waiting_approval" });
        addAudit({
          eventType: "mission_created",
          source: "command_input",
          summary: `Mission created: "${mission.title}"`,
          missionId: mission.id,
          severity: "info",
        });
        addAudit({
          eventType: "approval_requested",
          source: "mission_engine",
          summary: `Approval required: "${approval.title}"`,
          missionId: mission.id,
          severity: "warning",
        });
        break;
      }

      case "approve_test_action": {
        const pending = state.approvals.find((a) => a.status === "pending");
        if (pending) {
          const mission = state.missions.find((m) => m.id === pending.missionId);
          if (mission) {
            const { mission: updated, approval: updatedApproval } = applyApprovalDecision(
              mission, pending, "approved"
            );
            dispatch({ type: "UPDATE_MISSION", payload: updated });
            dispatch({ type: "UPDATE_APPROVAL", payload: updatedApproval });
            dispatch({ type: "SET_ORB_STATE", payload: "idle" });
            addAudit({
              eventType: "approval_approved",
              source: "command_input",
              summary: `Approval granted: "${pending.title}"`,
              missionId: mission.id,
              severity: "info",
            });
            dispatch({
              type: "SET_COMMAND_RESPONSE",
              payload: `Approval granted. Mission "${mission.title}" completed.`,
            });
          }
        } else {
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: "No pending approval found." });
        }
        break;
      }

      case "reject_test_action": {
        const pending = state.approvals.find((a) => a.status === "pending");
        if (pending) {
          const mission = state.missions.find((m) => m.id === pending.missionId);
          if (mission) {
            const { mission: updated, approval: updatedApproval } = applyApprovalDecision(
              mission, pending, "rejected"
            );
            dispatch({ type: "UPDATE_MISSION", payload: updated });
            dispatch({ type: "UPDATE_APPROVAL", payload: updatedApproval });
            dispatch({ type: "SET_ORB_STATE", payload: "idle" });
            addAudit({
              eventType: "approval_rejected",
              source: "command_input",
              summary: `Approval rejected: "${pending.title}"`,
              missionId: mission.id,
              severity: "warning",
            });
            dispatch({
              type: "SET_COMMAND_RESPONSE",
              payload: `Approval rejected. Mission "${mission.title}" cancelled.`,
            });
          }
        } else {
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: "No pending approval found." });
        }
        break;
      }

      default:
        break;
    }

    setIsProcessing(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = historyIndexRef.current + 1;
      if (next < historyRef.current.length) {
        historyIndexRef.current = next;
        setValue(historyRef.current[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = historyIndexRef.current - 1;
      if (next < 0) {
        historyIndexRef.current = -1;
        setValue("");
      } else {
        historyIndexRef.current = next;
        setValue(historyRef.current[next]);
      }
    }
  }

  function handleSuggestion(s: string) {
    setValue(s);
    historyIndexRef.current = -1;
    inputRef.current?.focus();
  }

  const isEmergencyStopped = state.orbState === "emergency_stopped";

  return (
    <div className="command-input-container">
      <form className="command-form" onSubmit={handleSubmit}>
        <div className="command-prefix">
          <span className="command-prefix-text">LISA</span>
          <span className="command-prefix-chevron">&rsaquo;</span>
        </div>
        <input
          ref={inputRef}
          className="command-field"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            historyIndexRef.current = -1;
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isEmergencyStopped
              ? "Emergency stopped — type 'Lisa, wake up' to clear"
              : isProcessing
              ? "Processing..."
              : "Type a command… e.g. Lisa, create test mission"
          }
          disabled={isProcessing}
          autoComplete="off"
          spellCheck={false}
          aria-label="Lisa command input"
        />
        <button
          type="submit"
          className="btn btn-primary command-submit"
          disabled={!value.trim() || isProcessing}
        >
          {isProcessing ? (
            <span className="command-spinner" />
          ) : (
            "SEND"
          )}
        </button>
      </form>

      {state.commandResponse && (
        <div className={`command-response ${isEmergencyStopped ? "command-response-emergency" : ""}`}>
          <span className="command-response-icon">›</span>
          {state.commandResponse}
        </div>
      )}

      <div className="command-suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="command-suggestion-chip"
            type="button"
            onClick={() => handleSuggestion(s)}
            disabled={isEmergencyStopped && !s.includes("wake")}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CommandInput;
