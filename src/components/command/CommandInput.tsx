import React, { useState, useRef, useEffect } from "react";
import { useLisa } from "../../app/useLisa";
import { routeCommand } from "../../core/command-router";
import { createTestMission, applyApprovalDecision } from "../../core/mission-store";
import { createAuditEvent } from "../../core/audit-store";
import { getModeDisplayName } from "../../core/mode-store";
import { fetchRuntimeHealth } from "../../core/runtime-health";
import { buildOllamaMessages, trimConversationHistory } from "../../core/llm-context";
import type { LisaConversationTurn } from "../../core/llm-context";
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
const LLM_RESPONSE_DISMISS_MS = 30_000;
const MAX_HISTORY = 50;

function makeId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

export const CommandInput: React.FC = () => {
  const { state, dispatch, addAudit } = useLisa();
  const [value, setValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const conversationHistoryRef = useRef<LisaConversationTurn[]>([]);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLlmResponseRef = useRef(false);

  useEffect(() => {
    if (!state.commandResponse) return;
    const isEmergencyMessage =
      state.orbState === "emergency_stopped" ||
      state.commandResponse.startsWith("EMERGENCY STOP");
    if (isEmergencyMessage) return;

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    const delay = isLlmResponseRef.current ? LLM_RESPONSE_DISMISS_MS : RESPONSE_DISMISS_MS;
    dismissTimerRef.current = setTimeout(() => {
      isLlmResponseRef.current = false;
      dispatch({ type: "SET_COMMAND_RESPONSE", payload: null });
    }, delay);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [state.commandResponse, state.orbState, dispatch]);

  async function handleLlmQuery(
    raw: string,
    model: string,
    maxContextTurns: number,
    interactionId: string
  ) {
    const isInTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isInTauri) {
      const msg = "Local AI is only available in the desktop app (Tauri).";
      dispatch({ type: "SET_COMMAND_RESPONSE", payload: msg });
      dispatch({
        type: "UPDATE_INTERACTION",
        payload: { id: interactionId, status: "failed", error: msg, completedAt: now() },
      });
      return;
    }

    const trimmedHistory = trimConversationHistory(
      conversationHistoryRef.current,
      Math.max(0, maxContextTurns - 1)
    );
    const messages = buildOllamaMessages(trimmedHistory, raw);

    dispatch({ type: "SET_ORB_STATE", payload: "thinking" });
    isLlmResponseRef.current = false;

    addAudit({
      eventType: "llm_request_sent",
      source: "command_input",
      summary: `LLM request sent — model: "${model}"`,
      details: `prompt_chars=${raw.length} messages=${messages.length} history_turns=${trimmedHistory.length}`,
      severity: "info",
    });

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{
        response: string | null;
        error: string | null;
        model: string;
        latency_ms: number;
      }>("send_ollama_chat", {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      if (result.error || !result.response) {
        const errMsg = result.error ?? "No response received from model.";
        dispatch({ type: "SET_ORB_STATE", payload: "error" });
        dispatch({
          type: "UPDATE_INTERACTION",
          payload: { id: interactionId, status: "failed", error: errMsg, completedAt: now() },
        });
        dispatch({ type: "SET_COMMAND_RESPONSE", payload: `Lisa could not respond: ${errMsg}` });
        addAudit({
          eventType: "llm_request_failed",
          source: "command_input",
          summary: `LLM request failed — model: "${model}" in ${result.latency_ms}ms`,
          details: errMsg,
          severity: "error",
        });
        setTimeout(() => dispatch({ type: "SET_ORB_STATE", payload: "idle" }), 2000);
        return;
      }

      dispatch({ type: "SET_ORB_STATE", payload: "speaking" });
      dispatch({
        type: "UPDATE_INTERACTION",
        payload: {
          id: interactionId,
          status: "complete",
          response: result.response,
          completedAt: now(),
          latencyMs: result.latency_ms,
        },
      });
      isLlmResponseRef.current = true;
      dispatch({ type: "SET_COMMAND_RESPONSE", payload: result.response });

      addAudit({
        eventType: "llm_response_received",
        source: "command_input",
        summary: `LLM response received — model: "${model}" in ${result.latency_ms}ms`,
        details: `response_chars=${result.response.length} latency_ms=${result.latency_ms}`,
        severity: "info",
      });

      conversationHistoryRef.current = [
        ...trimmedHistory,
        {
          userInput: raw,
          assistantResponse: result.response,
          timestamp: now(),
          model,
        },
      ];

      setTimeout(() => dispatch({ type: "SET_ORB_STATE", payload: "idle" }), 3000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      dispatch({ type: "SET_ORB_STATE", payload: "error" });
      dispatch({
        type: "UPDATE_INTERACTION",
        payload: { id: interactionId, status: "failed", error: errMsg, completedAt: now() },
      });
      dispatch({ type: "SET_COMMAND_RESPONSE", payload: `LLM request failed: ${errMsg}` });
      addAudit({
        eventType: "llm_request_failed",
        source: "command_input",
        summary: "LLM request threw an unexpected error.",
        details: errMsg,
        severity: "error",
      });
      setTimeout(() => dispatch({ type: "SET_ORB_STATE", payload: "idle" }), 2000);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = value.trim();
    if (!raw || isProcessing) return;

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

    if (route.intent !== "unknown") {
      dispatch({ type: "SET_COMMAND_RESPONSE", payload: route.response ?? null });
    }

    switch (route.intent) {
      case "emergency_stop":
        dispatch({ type: "EMERGENCY_STOP" });
        dispatch({
          type: "ADD_INTERACTION",
          payload: {
            id: makeId(), kind: "system", prompt: raw, status: "complete",
            response: "EMERGENCY STOP ACTIVATED. All active operations halted. System is safe.",
            createdAt: now(), completedAt: now(),
          },
        });
        addAudit({
          eventType: "emergency_stop_activated",
          source: "command_input",
          summary: "Emergency stop triggered by user command.",
          severity: "critical",
        });
        break;

      case "stop":
        dispatch({ type: "SET_ORB_STATE", payload: "paused" });
        dispatch({
          type: "ADD_INTERACTION",
          payload: {
            id: makeId(), kind: "command", prompt: raw, status: "complete",
            response: route.response ?? "Active operations paused.",
            createdAt: now(), completedAt: now(),
          },
        });
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
        dispatch({
          type: "ADD_INTERACTION",
          payload: {
            id: makeId(), kind: "system", prompt: raw, status: "complete",
            response: route.response ?? "Entering sleep mode.",
            createdAt: now(), completedAt: now(),
          },
        });
        addAudit({
          eventType: "mode_changed",
          source: "command_input",
          summary: "Lisa entering sleep mode.",
          severity: "info",
        });
        break;

      case "wake": {
        const clearedAt = now();
        const isEmergency = state.orbState === "emergency_stopped";
        const wakeResponse = isEmergency
          ? "Emergency lock cleared. Stopped missions are now paused and require explicit restart."
          : "Lisa is awake.";
        if (isEmergency) {
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
        dispatch({
          type: "ADD_INTERACTION",
          payload: {
            id: makeId(), kind: "system", prompt: raw, status: "complete",
            response: wakeResponse, createdAt: clearedAt, completedAt: clearedAt,
          },
        });
        break;
      }

      case "mode_change": {
        const modeId = route.payload?.modeId as Parameters<typeof getModeDisplayName>[0];
        if (modeId) {
          const prevMode = state.activeMode;
          dispatch({ type: "SET_MODE", payload: modeId });
          dispatch({ type: "SET_ORB_STATE", payload: "idle" });
          const modeResponse = `Mode changed: ${getModeDisplayName(prevMode)} → ${getModeDisplayName(modeId)}`;
          dispatch({
            type: "ADD_INTERACTION",
            payload: {
              id: makeId(), kind: "command", prompt: raw, status: "complete",
              response: modeResponse, createdAt: now(), completedAt: now(),
            },
          });
          addAudit({
            eventType: "mode_changed",
            source: "command_input",
            summary: modeResponse,
            details: `New mode: ${modeId}`,
            severity: "info",
          });
        }
        break;
      }

      case "runtime_health": {
        const interactionId = makeId();
        const createdAt = now();
        dispatch({
          type: "ADD_INTERACTION",
          payload: {
            id: interactionId, kind: "command", prompt: raw,
            status: "thinking", response: "", createdAt,
          },
        });
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
          const summary = `Runtime: backend=${health.backendReachable ? "ok" : "offline"} · ollama=${health.ollamaStatus} · docker=${health.dockerStatus}`;
          dispatch({
            type: "UPDATE_INTERACTION",
            payload: { id: interactionId, status: "complete", response: summary, completedAt: now() },
          });
          addAudit({
            eventType: "runtime_health_checked",
            source: "runtime_checker",
            summary,
            severity: health.backendReachable ? "info" : "warning",
          });
        } catch (err) {
          const errMsg = String(err);
          dispatch({
            type: "UPDATE_INTERACTION",
            payload: { id: interactionId, status: "failed", error: errMsg, completedAt: now() },
          });
          addAudit({
            eventType: "error_occurred",
            source: "runtime_checker",
            summary: "Runtime health check failed.",
            details: errMsg,
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
        const missionResponse = `Mission created: "${mission.title}" · Approval required.`;
        dispatch({
          type: "ADD_INTERACTION",
          payload: {
            id: makeId(), kind: "command", prompt: raw, status: "complete",
            response: missionResponse, createdAt: now(), completedAt: now(),
          },
        });
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
            const approveResponse = `Approval granted. Mission "${mission.title}" completed.`;
            dispatch({ type: "SET_COMMAND_RESPONSE", payload: approveResponse });
            dispatch({
              type: "ADD_INTERACTION",
              payload: {
                id: makeId(), kind: "command", prompt: raw, status: "complete",
                response: approveResponse, createdAt: now(), completedAt: now(),
              },
            });
            addAudit({
              eventType: "approval_approved",
              source: "command_input",
              summary: `Approval granted: "${pending.title}"`,
              missionId: mission.id,
              severity: "info",
            });
          }
        } else {
          const noApprovalMsg = "No pending approval found.";
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: noApprovalMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: {
              id: makeId(), kind: "command", prompt: raw, status: "complete",
              response: noApprovalMsg, createdAt: now(), completedAt: now(),
            },
          });
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
            const rejectResponse = `Approval rejected. Mission "${mission.title}" cancelled.`;
            dispatch({ type: "SET_COMMAND_RESPONSE", payload: rejectResponse });
            dispatch({
              type: "ADD_INTERACTION",
              payload: {
                id: makeId(), kind: "command", prompt: raw, status: "complete",
                response: rejectResponse, createdAt: now(), completedAt: now(),
              },
            });
            addAudit({
              eventType: "approval_rejected",
              source: "command_input",
              summary: `Approval rejected: "${pending.title}"`,
              missionId: mission.id,
              severity: "warning",
            });
          }
        } else {
          const noApprovalMsg = "No pending approval found.";
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: noApprovalMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: {
              id: makeId(), kind: "command", prompt: raw, status: "complete",
              response: noApprovalMsg, createdAt: now(), completedAt: now(),
            },
          });
        }
        break;
      }

      default: {
        const { enableLocalAi, ollamaModel, maxContextTurns } = state.settings;

        if (enableLocalAi && ollamaModel) {
          const interactionId = makeId();
          dispatch({
            type: "ADD_INTERACTION",
            payload: {
              id: interactionId, kind: "local_ai", prompt: raw, status: "thinking",
              response: "", model: ollamaModel, createdAt: now(),
            },
          });
          await handleLlmQuery(raw, ollamaModel, maxContextTurns, interactionId);
        } else if (enableLocalAi && !ollamaModel) {
          const msg = "Local AI is enabled but no model is selected. Go to Settings → Local AI to choose a model.";
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: msg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: {
              id: makeId(), kind: "error", prompt: raw, status: "failed",
              response: msg, createdAt: now(), completedAt: now(),
            },
          });
          addAudit({
            eventType: "llm_disabled_fallback",
            source: "command_input",
            summary: "LLM fallback skipped — no model selected.",
            severity: "warning",
          });
        } else {
          const fallbackMsg = route.response ?? "Command not recognized. Enable Local AI in Settings to ask questions.";
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: fallbackMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: {
              id: makeId(), kind: "command", prompt: raw, status: "complete",
              response: fallbackMsg, createdAt: now(), completedAt: now(),
            },
          });
          addAudit({
            eventType: "llm_disabled_fallback",
            source: "command_input",
            summary: `Command not handled — local AI disabled: "${raw}"`,
            severity: "info",
          });
        }
        break;
      }
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
              : "Type a command or question… e.g. what is quantum entanglement?"
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
          {isProcessing ? <span className="command-spinner" /> : "SEND"}
        </button>
      </form>

      {state.commandResponse && (
        <div
          className={`command-response ${isEmergencyStopped ? "command-response-emergency" : ""}`}
        >
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
