import React, { useState, useRef, useEffect } from "react";
import { useLisa } from "../../app/useLisa";
import { routeCommand, getDesktopActionGuardMessage } from "../../core/command-router";
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

  // Seed conversation history ref once when persisted state is loaded.
  useEffect(() => {
    if (state.isLoaded) {
      conversationHistoryRef.current = state.conversationHistory;
    }
  }, [state.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync ref when history is externally cleared (e.g. from Settings panel).
  // Only fires when length drops to 0 — does not interfere with normal turn appends.
  useEffect(() => {
    if (state.isLoaded && state.conversationHistory.length === 0) {
      conversationHistoryRef.current = [];
    }
  }, [state.isLoaded, state.conversationHistory.length]);

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

  async function handleStreamingLlmQuery(
    raw: string,
    model: string,
    maxContextTurns: number,
    interactionId: string
  ): Promise<void> {
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
      eventType: "llm_stream_started",
      source: "command_input",
      summary: `LLM stream started — model: "${model}"`,
      details: `prompt_chars=${raw.length} messages=${messages.length} history_turns=${trimmedHistory.length}`,
      severity: "info",
    });

    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");

    let accumulatedResponse = "";
    let firstChunk = true;
    const unsub = { chunk: () => {}, done: () => {}, error: () => {}, abort: () => {} } as {
      chunk: () => void;
      done: () => void;
      error: () => void;
      abort: () => void;
    };
    const cleanup = () => {
      unsub.chunk();
      unsub.done();
      unsub.error();
      unsub.abort();
    };

    await new Promise<void>((resolve) => {
      Promise.all([
        listen<{ id: string; chunk: string }>("lisa-stream-chunk", (ev) => {
          if (ev.payload.id !== interactionId) return;
          if (firstChunk) {
            firstChunk = false;
            dispatch({ type: "SET_ORB_STATE", payload: "speaking" });
            dispatch({
              type: "UPDATE_INTERACTION",
              payload: { id: interactionId, status: "streaming" },
            });
          }
          accumulatedResponse += ev.payload.chunk;
          dispatch({
            type: "APPEND_INTERACTION_CONTENT",
            payload: { id: interactionId, chunk: ev.payload.chunk },
          });
        }),
        listen<{ id: string; model: string; latency_ms: number }>(
          "lisa-stream-done",
          (ev) => {
            if (ev.payload.id !== interactionId) return;
            cleanup();
            dispatch({
              type: "UPDATE_INTERACTION",
              payload: {
                id: interactionId,
                status: "complete",
                completedAt: now(),
                latencyMs: ev.payload.latency_ms,
              },
            });
            if (accumulatedResponse) {
              isLlmResponseRef.current = true;
              dispatch({ type: "SET_COMMAND_RESPONSE", payload: accumulatedResponse });
            }
            addAudit({
              eventType: "llm_stream_completed",
              source: "command_input",
              summary: `LLM stream completed — model: "${model}" in ${ev.payload.latency_ms}ms`,
              details: `response_chars=${accumulatedResponse.length} latency_ms=${ev.payload.latency_ms}`,
              severity: "info",
            });
            const completedTurn = { userInput: raw, assistantResponse: accumulatedResponse, timestamp: now(), model };
            conversationHistoryRef.current = [...trimmedHistory, completedTurn];
            dispatch({ type: "APPEND_CONVERSATION_TURN", payload: completedTurn });
            setTimeout(() => dispatch({ type: "SET_ORB_STATE", payload: "idle" }), 3000);
            resolve();
          }
        ),
        listen<{ id: string; error: string; latency_ms: number }>(
          "lisa-stream-error",
          (ev) => {
            if (ev.payload.id !== interactionId) return;
            cleanup();
            dispatch({ type: "SET_ORB_STATE", payload: "error" });
            dispatch({
              type: "UPDATE_INTERACTION",
              payload: {
                id: interactionId,
                status: "failed",
                error: ev.payload.error,
                completedAt: now(),
              },
            });
            dispatch({
              type: "SET_COMMAND_RESPONSE",
              payload: `Lisa could not respond: ${ev.payload.error}`,
            });
            addAudit({
              eventType: "llm_stream_failed",
              source: "command_input",
              summary: `LLM stream failed — model: "${model}" in ${ev.payload.latency_ms}ms`,
              details: ev.payload.error,
              severity: "error",
            });
            setTimeout(() => dispatch({ type: "SET_ORB_STATE", payload: "idle" }), 2000);
            resolve();
          }
        ),
        listen<{ id: string; model: string; latency_ms: number; response_chars: number }>(
          "lisa-stream-aborted",
          (ev) => {
            if (ev.payload.id !== interactionId) return;
            cleanup();
            dispatch({
              type: "ABORT_INTERACTION",
              payload: { id: interactionId, completedAt: now(), latencyMs: ev.payload.latency_ms },
            });
            addAudit({
              eventType: "llm_stream_aborted",
              source: "command_input",
              summary: `LLM stream aborted — model: "${model}" at ${ev.payload.latency_ms}ms`,
              details: `request_id=${interactionId} model=${model} latency_ms=${ev.payload.latency_ms} response_chars=${ev.payload.response_chars}`,
              severity: "warning",
            });
            resolve();
          }
        ),
      ])
        .then(([unChunk, unDone, unError, unAbort]) => {
          unsub.chunk = unChunk;
          unsub.done = unDone;
          unsub.error = unError;
          unsub.abort = unAbort;
          invoke("stream_ollama_chat", {
            interactionId,
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }).catch((err: unknown) => {
            const errMsg = err instanceof Error ? err.message : String(err);
            cleanup();
            dispatch({ type: "SET_ORB_STATE", payload: "error" });
            dispatch({
              type: "UPDATE_INTERACTION",
              payload: { id: interactionId, status: "failed", error: errMsg, completedAt: now() },
            });
            dispatch({ type: "SET_COMMAND_RESPONSE", payload: `LLM stream failed: ${errMsg}` });
            addAudit({
              eventType: "llm_stream_failed",
              source: "command_input",
              summary: "LLM stream invoke failed.",
              details: errMsg,
              severity: "error",
            });
            setTimeout(() => dispatch({ type: "SET_ORB_STATE", payload: "idle" }), 2000);
            resolve();
          });
        })
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          dispatch({ type: "SET_ORB_STATE", payload: "error" });
          dispatch({
            type: "UPDATE_INTERACTION",
            payload: { id: interactionId, status: "failed", error: errMsg, completedAt: now() },
          });
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: `LLM stream setup failed: ${errMsg}` });
          addAudit({
            eventType: "llm_stream_failed",
            source: "command_input",
            summary: "LLM stream listener setup failed.",
            details: errMsg,
            severity: "error",
          });
          setTimeout(() => dispatch({ type: "SET_ORB_STATE", payload: "idle" }), 2000);
          resolve();
        });
    });
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
        // Guard: block desktop-action commands before they reach the LLM.
        const guardMsg = getDesktopActionGuardMessage(raw);
        if (guardMsg) {
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: guardMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: {
              id: makeId(), kind: "system", prompt: raw, status: "complete",
              response: guardMsg, createdAt: now(), completedAt: now(),
            },
          });
          addAudit({
            eventType: "command_unknown",
            source: "command_input",
            summary: "LLM fallback blocked — action-like command detected.",
            details: `input_chars=${raw.length}`,
            severity: "info",
          });
          break;
        }

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
          await handleStreamingLlmQuery(raw, ollamaModel, maxContextTurns, interactionId);
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
