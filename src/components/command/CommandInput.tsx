import React, { useState, useRef, useEffect } from "react";
import { useLisa } from "../../app/useLisa";
import { routeCommand, getDesktopActionGuardMessage, getVoiceCapabilityMessage } from "../../core/command-router";
import { createTestMission, applyApprovalDecision } from "../../core/mission-store";
import { createAuditEvent } from "../../core/audit-store";
import { getModeDisplayName } from "../../core/mode-store";
import { fetchRuntimeHealth } from "../../core/runtime-health";
import { buildOllamaMessages, trimConversationHistory, filterToolResultsByPolicy, TOOL_RESULT_CONTEXT_CAP } from "../../core/llm-context";
import type { LisaConversationTurn } from "../../core/llm-context";
import { MEMORY_NOTES_CAP, MEMORY_NOTE_CHAR_LIMIT } from "../../core/types";
import { classifyOllamaError } from "../../core/ollama-error";
import { getToolDefinition, getEnabledToolDefinitions, getAllToolDefinitions } from "../../core/tool-registry";
import { detectToolSuggestion, createToolRequestPair } from "../../core/tool-suggestions";
import { hasActiveToolRequest } from "../../core/tool-request-utils";
import type { ToolSuggestion } from "../../core/types";
import "./CommandInput.css";
import { VoiceInputControl } from "../voice/VoiceInputControl";
import { buildSpeakTextInvokeArgs, SpeakTextResult } from "../../core/tts";
import { shouldAutoSpeakVoiceReply } from "../../core/voice-conversation";

// ─── Pure formatter — exported for testing ────────────────────────────────────

export function formatMemoryNotesList(notes: Array<{ content: string }>): string {
  if (notes.length === 0) {
    return "No memory notes saved. Use 'remember that …' or Settings → Memory Notes to add one.\nConversation history and tool result context are stored separately.";
  }
  return `Memory notes (${notes.length}):\n${notes.map((n, i) => `${i + 1}. ${n.content}`).join("\n")}\nConversation history and recent tool result context are stored separately.`;
}

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
  const pendingMemoryClearRef = useRef<boolean>(false);
  const pendingMemoryClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    interactionId: string,
    interactionSource: "typed" | "voice"
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
    const { eligible, excluded, disabled } = filterToolResultsByPolicy(
      state.toolResults,
      getAllToolDefinitions(),
      state.settings.toolResultContextEnabled
    );
    const messages = buildOllamaMessages(trimmedHistory, raw, state.memoryNotes, eligible);
    const actuallyInjected = eligible.filter((r) => r.outputSummary).slice(-TOOL_RESULT_CONTEXT_CAP);
    if (actuallyInjected.length > 0) {
      addAudit({
        eventType: "llm_tool_context_injected",
        source: "command_input",
        summary: `Tool result context injected: ${actuallyInjected.length} result(s)`,
        details: `count=${actuallyInjected.length} tool_ids=${actuallyInjected.map((r) => r.toolId).join(",")}`,
        severity: "info",
      });
    }
    if (disabled) {
      const suppressedCount = state.toolResults.filter((r) => r.outputSummary).length;
      addAudit({
        eventType: "llm_tool_context_disabled",
        source: "command_input",
        summary: "Tool result context injection suppressed — global setting is off",
        details: `count=${suppressedCount}`,
        severity: "info",
      });
    }
    if (excluded.length > 0) {
      addAudit({
        eventType: "llm_tool_context_excluded",
        source: "command_input",
        summary: `Tool result context excluded by policy: ${excluded.length} result(s)`,
        details: `count=${excluded.length} tool_ids=${excluded.map((r) => r.toolId).join(",")} reason=policy`,
        severity: "info",
      });
    }

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
            // Attach deterministic tool suggestion if user input matches known patterns
            if (accumulatedResponse) {
              const suggestionCore = detectToolSuggestion(raw, getEnabledToolDefinitions(), state.toolRequests);
              if (suggestionCore) {
                const suggestion: ToolSuggestion = {
                  id: crypto.randomUUID(),
                  ...suggestionCore,
                  createdAt: now(),
                  originatingInteractionId: interactionId,
                  status: "visible",
                };
                dispatch({ type: "UPDATE_INTERACTION", payload: { id: interactionId, toolSuggestion: suggestion } });
                addAudit({
                  eventType: "tool_suggestion_shown",
                  source: "command_input",
                  summary: `Tool suggestion shown: "${suggestionCore.toolDisplayName}"`,
                  details: `tool_id=${suggestionCore.toolId} interaction_id=${interactionId}`,
                  severity: "info",
                });
              }
            }
            setTimeout(() => dispatch({ type: "SET_ORB_STATE", payload: "idle" }), 3000);

            // Voice reply auto-speak — fires only for voice-sourced interactions.
            if (accumulatedResponse && interactionSource === "voice") {
              const completedInteraction = {
                id: interactionId,
                kind: "local_ai" as const,
                prompt: raw,
                response: accumulatedResponse,
                status: "complete" as const,
                createdAt: now(),
                source: interactionSource,
              };
              const voiceReplyResult = shouldAutoSpeakVoiceReply(completedInteraction, {
                settings: state.settings,
                orbState: state.orbState,
                spokenInteractionIds: state.spokenInteractionIds,
              });
              if (voiceReplyResult.allowed) {
                const isTauriVoice = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
                if (isTauriVoice) {
                  dispatch({ type: "SET_TTS_SPEAKING", payload: { interactionId } });
                  dispatch({ type: "MARK_INTERACTION_SPOKEN", payload: interactionId });
                  addAudit({
                    eventType: "voice_reply_auto_speak_requested",
                    source: "command_input",
                    summary: "Voice reply auto-speak requested.",
                    details: `interaction_id=${interactionId} chars=${accumulatedResponse.length}`,
                    severity: "info",
                  });
                  void (async () => {
                    const { invoke: invokeSpeak } = await import("@tauri-apps/api/core");
                    const speakRes = await invokeSpeak<SpeakTextResult>("speak_text", buildSpeakTextInvokeArgs({
                      text: accumulatedResponse,
                      source: "auto_speak",
                    })).catch(() => null);
                    if (speakRes?.accepted && speakRes.speaking) {
                      const expireMs = Math.max(3000, Math.min(60_000, accumulatedResponse.length * 80));
                      setTimeout(() => dispatch({ type: "CLEAR_TTS_STATE" }), expireMs);
                    } else {
                      dispatch({ type: "CLEAR_TTS_STATE" });
                    }
                  })();
                }
              }
            }

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
            const friendlyMsg = classifyOllamaError(errMsg);
            cleanup();
            dispatch({ type: "SET_ORB_STATE", payload: "error" });
            dispatch({
              type: "UPDATE_INTERACTION",
              payload: { id: interactionId, status: "failed", error: friendlyMsg, completedAt: now() },
            });
            dispatch({ type: "SET_COMMAND_RESPONSE", payload: `LLM stream failed: ${friendlyMsg}` });
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

  async function submitUserInput(raw: string, source: "typed" | "voice"): Promise<void> {
    if (!raw || isProcessing) return;
    setIsProcessing(true);

    addAudit({
      eventType: "command_received",
      source: "command_input",
      summary: `Command received: "${raw}"`,
      details: `source=${source}`,
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

      case "add_memory_note": {
        const noteContent = typeof route.payload?.noteContent === "string" ? route.payload.noteContent.trim() : "";
        let addMsg: string;
        if (!noteContent) {
          addMsg = "Nothing to remember — the note was empty.";
        } else if (noteContent.length > MEMORY_NOTE_CHAR_LIMIT) {
          addMsg = `Memory note too long (${noteContent.length} chars, max ${MEMORY_NOTE_CHAR_LIMIT}).`;
        } else if (state.memoryNotes.length >= MEMORY_NOTES_CAP) {
          addMsg = `Memory notes are full (${MEMORY_NOTES_CAP} max). Delete a note in Settings or via "delete memory N".`;
        } else {
          dispatch({ type: "ADD_MEMORY_NOTE", payload: noteContent });
          addAudit({
            eventType: "memory_note_added",
            source: "command_input",
            summary: "Memory note added via command.",
            details: `chars=${noteContent.length}`,
            severity: "info",
          });
          addMsg = "Memory note saved.";
        }
        dispatch({ type: "SET_COMMAND_RESPONSE", payload: addMsg });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: addMsg, createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "list_memory_notes": {
        const listResponse = formatMemoryNotesList(state.memoryNotes);
        dispatch({ type: "SET_COMMAND_RESPONSE", payload: listResponse });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: listResponse, createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "delete_memory_note": {
        const noteIndex = typeof route.payload?.noteIndex === "number" ? route.payload.noteIndex : 0;
        const targetNote = noteIndex >= 1 && noteIndex <= state.memoryNotes.length ? state.memoryNotes[noteIndex - 1] : null;
        let deleteMsg: string;
        if (!targetNote) {
          deleteMsg =
            state.memoryNotes.length === 0
              ? "No memory notes saved."
              : `No note at position ${noteIndex}. You have ${state.memoryNotes.length} memory note${state.memoryNotes.length === 1 ? "" : "s"}.`;
        } else {
          dispatch({ type: "DELETE_MEMORY_NOTE", payload: targetNote.id });
          addAudit({
            eventType: "memory_note_deleted",
            source: "command_input",
            summary: "Memory note deleted via command.",
            details: `note_id=${targetNote.id} index=${noteIndex}`,
            severity: "info",
          });
          deleteMsg = `Deleted memory note ${noteIndex}.`;
        }
        dispatch({ type: "SET_COMMAND_RESPONSE", payload: deleteMsg });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: deleteMsg, createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "request_clear_memory_notes": {
        let clearPromptMsg: string;
        if (state.memoryNotes.length === 0) {
          clearPromptMsg = "No memory notes to clear.";
        } else {
          pendingMemoryClearRef.current = true;
          if (pendingMemoryClearTimerRef.current) clearTimeout(pendingMemoryClearTimerRef.current);
          pendingMemoryClearTimerRef.current = setTimeout(() => {
            pendingMemoryClearRef.current = false;
          }, 30_000);
          const n = state.memoryNotes.length;
          clearPromptMsg = `This deletes ${n} memory note${n === 1 ? "" : "s"} only. Conversation history and tool results are separate and will not be cleared. Type "confirm clear memory" to continue.`;
        }
        dispatch({ type: "SET_COMMAND_RESPONSE", payload: clearPromptMsg });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: clearPromptMsg, createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "confirm_clear_memory_notes": {
        let confirmedMsg: string;
        if (!pendingMemoryClearRef.current) {
          confirmedMsg = "No memory clear was pending.";
        } else {
          pendingMemoryClearRef.current = false;
          if (pendingMemoryClearTimerRef.current) {
            clearTimeout(pendingMemoryClearTimerRef.current);
            pendingMemoryClearTimerRef.current = null;
          }
          const countCleared = state.memoryNotes.length;
          dispatch({ type: "CLEAR_MEMORY_NOTES" });
          addAudit({
            eventType: "memory_notes_cleared",
            source: "command_input",
            summary: "All memory notes cleared via command.",
            details: `count=${countCleared}`,
            severity: "info",
          });
          confirmedMsg = `Cleared ${countCleared} memory note${countCleared === 1 ? "" : "s"}. Conversation history and tool results were not changed.`;
        }
        dispatch({ type: "SET_COMMAND_RESPONSE", payload: confirmedMsg });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: confirmedMsg, createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "request_tool": {
        const toolId = typeof route.payload?.toolId === "string" ? route.payload.toolId : "";
        const definition = toolId ? getToolDefinition(toolId) : undefined;
        if (!definition) {
          const unknownMsg = `Unknown tool: "${toolId}". No tool request created.`;
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: unknownMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: unknownMsg, createdAt: now(), completedAt: now() },
          });
          break;
        }
        if (!definition.enabled) {
          const disabledMsg = `Tool "${definition.displayName}" is currently disabled.`;
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: disabledMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: disabledMsg, createdAt: now(), completedAt: now() },
          });
          break;
        }
        const activeRequest = hasActiveToolRequest(state.toolRequests, toolId);
        if (activeRequest) {
          const dupMsg = `A request for "${definition.displayName}" is already ${activeRequest.status === "running" ? "running" : "pending"}. Review it in Approvals.`;
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: dupMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: dupMsg, createdAt: now(), completedAt: now() },
          });
          addAudit({
            eventType: "tool_request_duplicate_blocked",
            source: "command_input",
            summary: `Duplicate tool request blocked: "${definition.displayName}" is ${activeRequest.status}`,
            severity: "warning",
          });
          break;
        }
        const { request, approval: contract } = createToolRequestPair(definition, "user_command");
        dispatch({
          type: "CREATE_TOOL_REQUEST",
          payload: {
            request,
            approval: contract,
            auditEvent: createAuditEvent({
              eventType: "tool_request_created",
              source: "command_input",
              summary: `Tool request created: "${definition.displayName}"`,
              severity: "info",
            }),
          },
        });
        const toolRequestMsg = route.response ?? `Tool request created: "${definition.displayName}". Go to Approvals tab to approve.`;
        dispatch({ type: "SET_COMMAND_RESPONSE", payload: toolRequestMsg });
        dispatch({ type: "SET_ORB_STATE", payload: "waiting_approval" });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: toolRequestMsg, createdAt: now(), completedAt: now() },
        });
        addAudit({
          eventType: "tool_approval_contract_created",
          source: "command_input",
          summary: `Approval contract created for "${definition.displayName}"`,
          severity: "info",
        });
        break;
      }

      case "approve_tool_request": {
        const pendingContract = state.toolApprovals.find((a) => a.decision === null);
        const pendingRequest = pendingContract
          ? state.toolRequests.find((r) => r.id === pendingContract.requestId && r.status === "pending_approval")
          : undefined;
        if (!pendingContract || !pendingRequest) {
          const noToolMsg = "No pending tool request found.";
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: noToolMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: noToolMsg, createdAt: now(), completedAt: now() },
          });
          break;
        }
        const approveMsg = `Tool approval granted: "${pendingContract.toolDisplayName}". Execution starting — check Approvals tab.`;
        dispatch({ type: "SET_COMMAND_RESPONSE", payload: approveMsg });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: approveMsg, createdAt: now(), completedAt: now() },
        });
        addAudit({
          eventType: "tool_request_approved",
          source: "command_input",
          summary: `Tool approved via command: "${pendingContract.toolDisplayName}"`,
          severity: "info",
        });
        break;
      }

      case "reject_tool_request": {
        const pendingContract = state.toolApprovals.find((a) => a.decision === null);
        const pendingRequest = pendingContract
          ? state.toolRequests.find((r) => r.id === pendingContract.requestId)
          : undefined;
        if (!pendingContract || !pendingRequest) {
          const noToolMsg = "No pending tool request found.";
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: noToolMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: noToolMsg, createdAt: now(), completedAt: now() },
          });
          break;
        }
        const resolvedAt = now();
        dispatch({
          type: "OPERATOR_REJECT_TOOL",
          payload: {
            requestId: pendingRequest.id,
            resolvedAt,
            auditEvent: createAuditEvent({
              eventType: "tool_request_rejected",
              source: "command_input",
              summary: `Tool rejected via command: "${pendingContract.toolDisplayName}"`,
              severity: "warning",
            }),
          },
        });
        const rejectMsg = `Tool request rejected: "${pendingContract.toolDisplayName}".`;
        dispatch({ type: "SET_COMMAND_RESPONSE", payload: rejectMsg });
        dispatch({ type: "SET_ORB_STATE", payload: "idle" });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: rejectMsg, createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "tts_stop_speaking": {
        const isTauriTts = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
        if (isTauriTts) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("stop_speaking").catch(() => {});
        }
        dispatch({ type: "CLEAR_TTS_STATE" });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: route.response ?? "Speech stopped.", createdAt: now(), completedAt: now() },
        });
        addAudit({ eventType: "tts_speech_stopped", source: "command_input", summary: "Stop speaking command received.", severity: "info" });
        break;
      }

      case "tts_test_voice": {
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: "Use Settings → Voice Output → Test Voice to test local speech.", createdAt: now(), completedAt: now() },
        });
        addAudit({ eventType: "tts_test_started", source: "command_input", summary: "Test voice command received — redirected to Settings.", severity: "info" });
        break;
      }

      case "tts_enable": {
        dispatch({ type: "SET_SETTINGS", payload: { voiceOutputEnabled: true } });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: route.response ?? "Voice output enabled.", createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "tts_disable": {
        dispatch({ type: "SET_SETTINGS", payload: { voiceOutputEnabled: false } });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: route.response ?? "Voice output disabled.", createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "tts_auto_speak_on": {
        dispatch({ type: "SET_SETTINGS", payload: { voiceOutputAutoSpeak: true } });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: route.response ?? "Auto-speak enabled.", createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "tts_auto_speak_off": {
        dispatch({ type: "SET_SETTINGS", payload: { voiceOutputAutoSpeak: false } });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: route.response ?? "Auto-speak disabled.", createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "tts_speak_again": {
        const lastEligible = [...state.interactions].reverse().find(
          (ix) => ix.kind === "local_ai" && ix.status === "complete" && ix.response?.trim()
        );
        if (!lastEligible || !state.settings.voiceOutputEnabled) {
          const noMsg = !state.settings.voiceOutputEnabled
            ? "Voice output is disabled. Enable it in Settings → Voice Output first."
            : "No previous local AI response to repeat.";
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: noMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: noMsg, createdAt: now(), completedAt: now() },
          });
          break;
        }
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: route.response ?? "Repeating last response…", createdAt: now(), completedAt: now() },
        });
        dispatch({ type: "SET_TTS_SPEAKING", payload: { interactionId: lastEligible.id } });
        dispatch({ type: "MARK_INTERACTION_SPOKEN", payload: lastEligible.id });
        {
          const isTauriSpeak = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
          if (isTauriSpeak) {
            const { invoke } = await import("@tauri-apps/api/core");
            try {
              const speakResult = await invoke<SpeakTextResult>("speak_text", buildSpeakTextInvokeArgs({ text: lastEligible.response, source: "command_speak_again" }));
              if (speakResult.accepted && speakResult.speaking) {
                // Process confirmed running — keep speaking state, auto-expire as fallback.
                const expireMs = Math.max(3000, Math.min(60_000, lastEligible.response.length * 80));
                setTimeout(() => dispatch({ type: "CLEAR_TTS_STATE" }), expireMs);
                addAudit({
                  eventType: "tts_speech_started",
                  source: "command_input",
                  summary: "TTS speak-again started.",
                  severity: "info",
                });
              } else {
                dispatch({ type: "CLEAR_TTS_STATE" });
                addAudit({
                  eventType: "tts_speech_failed",
                  source: "command_input",
                  summary: "TTS speak-again not accepted.",
                  severity: "error",
                });
              }
            } catch (e: unknown) {
              dispatch({ type: "CLEAR_TTS_STATE" });
              addAudit({
                eventType: "tts_speech_failed",
                source: "command_input",
                summary: "TTS speak-again failed.",
                details: e instanceof Error ? e.message : String(e),
                severity: "error",
              });
            }
          }
        }
        break;
      }

      case "voice_conversation_enable": {
        dispatch({ type: "SET_SETTINGS", payload: { voiceConversationEnabled: true } });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: route.response ?? "Voice conversation enabled.", createdAt: now(), completedAt: now() },
        });
        break;
      }

      case "voice_conversation_disable": {
        dispatch({ type: "SET_SETTINGS", payload: { voiceConversationEnabled: false } });
        dispatch({
          type: "ADD_INTERACTION",
          payload: { id: makeId(), kind: "command", prompt: raw, status: "complete", response: route.response ?? "Voice conversation disabled.", createdAt: now(), completedAt: now() },
        });
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

        // Guard: answer voice capability questions deterministically before LLM.
        // Small local models ignore system-prompt boundaries; this ensures accurate answers.
        const voiceMsg = getVoiceCapabilityMessage(raw);
        if (voiceMsg) {
          dispatch({ type: "SET_COMMAND_RESPONSE", payload: voiceMsg });
          dispatch({
            type: "ADD_INTERACTION",
            payload: {
              id: makeId(), kind: "command", prompt: raw, status: "complete",
              response: voiceMsg, createdAt: now(), completedAt: now(),
            },
          });
          addAudit({
            eventType: "command_routed",
            source: "command_input",
            summary: "Voice capability question answered deterministically.",
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
              response: "", model: ollamaModel, createdAt: now(), source,
            },
          });
          await handleStreamingLlmQuery(raw, ollamaModel, maxContextTurns, interactionId, source);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = value.trim();
    if (!raw || isProcessing) return;

    historyRef.current = [raw, ...historyRef.current].slice(0, MAX_HISTORY);
    historyIndexRef.current = -1;
    setValue("");
    await submitUserInput(raw, "typed");
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

      <VoiceInputControl
        isProcessing={isProcessing}
        onSendTranscript={(t) => submitUserInput(t, "voice")}
      />

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
