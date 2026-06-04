import type {
  OrbState,
  LisaModeId,
  Mission,
  MissionStep,
  ApprovalRequest,
  AuditEvent,
  LisaSettings,
  RuntimeHealth,
  LisaInteraction,
  LisaConversationTurn,
  MemoryNote,
  MemoryNoteSource,
  ToolRequest,
  ToolResult,
  ToolApprovalContract,
  VoiceStatus,
} from "../core/types";
import {
  DEFAULT_SETTINGS,
  INTERACTION_CAP,
  CONVERSATION_HISTORY_CAP,
  MEMORY_NOTES_CAP,
  MEMORY_NOTE_CHAR_LIMIT,
  TOOL_REQUESTS_CAP,
  TOOL_RESULTS_CAP,
  TOOL_APPROVALS_CAP,
} from "../core/types";

const APPROVED_EXPIRY_MS = 5 * 60 * 1000;

// ─── State ────────────────────────────────────────────────────────────────────

export interface LisaState {
  orbState: OrbState;
  activeMode: LisaModeId;
  settings: LisaSettings;
  missions: Mission[];
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
  runtimeHealth: RuntimeHealth | null;
  isLoaded: boolean;
  commandResponse: string | null;
  interactions: LisaInteraction[];
  conversationHistory: LisaConversationTurn[];
  memoryNotes: MemoryNote[];
  toolRequests: ToolRequest[];
  toolResults: ToolResult[];
  toolApprovals: ToolApprovalContract[];
  // Voice transient state — not persisted
  voiceStatus: VoiceStatus;
  voiceTranscriptDraft: string | null;
  voiceError: string | null;
}

export const initialState: LisaState = {
  orbState: "idle",
  activeMode: "normal",
  settings: { ...DEFAULT_SETTINGS },
  missions: [],
  approvals: [],
  auditEvents: [],
  runtimeHealth: null,
  isLoaded: false,
  commandResponse: null,
  interactions: [],
  conversationHistory: [],
  memoryNotes: [],
  toolRequests: [],
  toolResults: [],
  toolApprovals: [],
  voiceStatus: "idle",
  voiceTranscriptDraft: null,
  voiceError: null,
};

// ─── Actions ──────────────────────────────────────────────────────────────────

export type LisaAction =
  | { type: "SET_ORB_STATE"; payload: OrbState }
  | { type: "SET_MODE"; payload: LisaModeId }
  | { type: "SET_SETTINGS"; payload: Partial<LisaSettings> }
  | { type: "ADD_MISSION"; payload: Mission }
  | { type: "UPDATE_MISSION"; payload: Mission }
  | { type: "ADD_APPROVAL"; payload: ApprovalRequest }
  | { type: "UPDATE_APPROVAL"; payload: ApprovalRequest }
  | { type: "ADD_AUDIT_EVENT"; payload: AuditEvent }
  | { type: "SET_RUNTIME_HEALTH"; payload: RuntimeHealth }
  | { type: "SET_COMMAND_RESPONSE"; payload: string | null }
  | { type: "EMERGENCY_STOP" }
  | { type: "CLEAR_EMERGENCY"; payload: { clearedAt: string; auditEvent: AuditEvent } }
  | { type: "ADD_INTERACTION"; payload: LisaInteraction }
  | { type: "UPDATE_INTERACTION"; payload: { id: string } & Partial<Omit<LisaInteraction, "id" | "createdAt">> }
  | { type: "APPEND_INTERACTION_CONTENT"; payload: { id: string; chunk: string } }
  | { type: "ABORT_INTERACTION"; payload: { id: string; completedAt: string; latencyMs?: number } }
  | { type: "APPEND_CONVERSATION_TURN"; payload: LisaConversationTurn }
  | { type: "CLEAR_CONVERSATION_HISTORY" }
  | { type: "ADD_MEMORY_NOTE"; payload: string | { content: string; source?: MemoryNoteSource } }
  | { type: "DELETE_MEMORY_NOTE"; payload: string }
  | { type: "CLEAR_MEMORY_NOTES" }
  | { type: "CLEAR_AUDIT_LOG"; payload: AuditEvent }
  | { type: "CLEAR_MISSION_HISTORY" }
  | {
      type: "CREATE_TOOL_REQUEST";
      payload: { request: ToolRequest; approval: ToolApprovalContract; auditEvent: AuditEvent };
    }
  | {
      type: "OPERATOR_APPROVE_TOOL";
      payload: { requestId: string; resolvedAt: string; auditEvent: AuditEvent };
    }
  | {
      type: "OPERATOR_REJECT_TOOL";
      payload: { requestId: string; resolvedAt: string; auditEvent: AuditEvent };
    }
  | {
      type: "START_TOOL_EXECUTION";
      payload: { requestId: string; startedAt: string; auditEvent: AuditEvent };
    }
  | {
      type: "COMPLETE_TOOL_EXECUTION";
      payload: { requestId: string; result: ToolResult; completedAt: string; auditEvent: AuditEvent };
    }
  | {
      type: "FAIL_TOOL_EXECUTION";
      payload: { requestId: string; error: string; completedAt: string; auditEvent: AuditEvent };
    }
  | {
      type: "CANCEL_TOOL_REQUEST";
      payload: { requestId: string; auditEvent: AuditEvent };
    }
  | {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE";
      payload: {
        requestId: string;
        result: ToolResult;
        completedAt: string;
        memoryNoteContent: string;
        auditEvent: AuditEvent;
        memoryNoteAuditEvent: AuditEvent;
      };
    }
  | { type: "SET_VOICE_STATUS"; payload: VoiceStatus }
  | { type: "SET_VOICE_TRANSCRIPT_DRAFT"; payload: string | null }
  | { type: "SET_VOICE_ERROR"; payload: string | null }
  | { type: "CLEAR_VOICE_STATE" }
  | { type: "DISMISS_TOOL_SUGGESTION"; payload: { interactionId: string } }
  | { type: "CONVERT_TOOL_SUGGESTION"; payload: { interactionId: string; requestId: string } }
  | {
      type: "LOAD_STATE";
      payload: {
        settings: LisaSettings;
        missions: Mission[];
        approvals: ApprovalRequest[];
        auditEvents: AuditEvent[];
        conversationHistory: LisaConversationTurn[];
        memoryNotes: MemoryNote[];
        toolRequests: ToolRequest[];
        toolResults: ToolResult[];
        toolApprovals: ToolApprovalContract[];
      };
    };

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function lisaReducer(state: LisaState, action: LisaAction): LisaState {
  switch (action.type) {
    case "SET_ORB_STATE":
      return { ...state, orbState: action.payload };

    case "SET_MODE":
      return {
        ...state,
        activeMode: action.payload,
        settings: { ...state.settings, activeMode: action.payload },
      };

    case "SET_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case "ADD_MISSION":
      return { ...state, missions: [action.payload, ...state.missions] };

    case "UPDATE_MISSION":
      return {
        ...state,
        missions: state.missions.map((m) =>
          m.id === action.payload.id ? action.payload : m
        ),
      };

    case "ADD_APPROVAL":
      return { ...state, approvals: [action.payload, ...state.approvals] };

    case "UPDATE_APPROVAL":
      return {
        ...state,
        approvals: state.approvals.map((a) =>
          a.id === action.payload.id ? action.payload : a
        ),
      };

    case "ADD_AUDIT_EVENT":
      return {
        ...state,
        auditEvents: [action.payload, ...state.auditEvents].slice(0, 500),
      };

    case "SET_RUNTIME_HEALTH":
      return { ...state, runtimeHealth: action.payload };

    case "SET_COMMAND_RESPONSE":
      return { ...state, commandResponse: action.payload };

    case "EMERGENCY_STOP": {
      const stoppedMissions = state.missions.map((m) =>
        m.status === "running" || m.status === "waiting_approval"
          ? { ...m, status: "emergency_stopped" as const }
          : m
      );
      const cancelledApprovals = state.approvals.map((a) =>
        a.status === "pending" ? { ...a, status: "cancelled" as const } : a
      );
      const cancelledToolRequests = state.toolRequests.map((r) =>
        r.status === "pending_approval" || r.status === "approved" || r.status === "running"
          ? { ...r, status: "cancelled" as const, completedAt: new Date().toISOString() }
          : r
      );
      const cancelledToolApprovals = state.toolApprovals.map((a) =>
        a.decision === null
          ? { ...a, decision: "rejected" as const, resolvedBy: "operator" as const, resolvedAt: new Date().toISOString() }
          : a
      );
      return {
        ...state,
        orbState: "emergency_stopped",
        missions: stoppedMissions,
        approvals: cancelledApprovals,
        toolRequests: cancelledToolRequests,
        toolApprovals: cancelledToolApprovals,
        commandResponse: "EMERGENCY STOP ACTIVATED. All active operations halted. System is safe.",
        voiceStatus: "idle" as VoiceStatus,
        voiceTranscriptDraft: null,
        voiceError: null,
      };
    }

    case "CLEAR_EMERGENCY": {
      const { clearedAt, auditEvent } = action.payload;
      const pausedMissions = state.missions.map((m): Mission => {
        if (m.status !== "emergency_stopped") return m;
        const explanationStep: MissionStep = {
          id: crypto.randomUUID(),
          label: "Emergency Cleared",
          description:
            "Emergency state cleared by wake command; mission remains paused and requires explicit user action to continue.",
          status: "skipped",
          startedAt: clearedAt,
          completedAt: clearedAt,
          notes: "Cleared via 'Lisa, wake up' command.",
        };
        return {
          ...m,
          status: "paused",
          steps: [...m.steps, explanationStep],
        };
      });
      return {
        ...state,
        orbState: "idle",
        missions: pausedMissions,
        auditEvents: [auditEvent, ...state.auditEvents].slice(0, 500),
        commandResponse: "Emergency lock cleared. Stopped missions are now paused and require explicit restart.",
      };
    }

    case "ADD_INTERACTION":
      return {
        ...state,
        interactions: [...state.interactions, action.payload].slice(-INTERACTION_CAP),
      };

    case "UPDATE_INTERACTION": {
      const { id, ...updates } = action.payload;
      return {
        ...state,
        interactions: state.interactions.map((i) =>
          i.id === id ? { ...i, ...updates } : i
        ),
      };
    }

    case "APPEND_INTERACTION_CONTENT": {
      const { id, chunk } = action.payload;
      return {
        ...state,
        interactions: state.interactions.map((i) =>
          i.id === id && i.status !== "cancelled" ? { ...i, response: i.response + chunk } : i
        ),
      };
    }

    case "ABORT_INTERACTION": {
      const { id, completedAt, latencyMs } = action.payload;
      return {
        ...state,
        orbState: "idle",
        interactions: state.interactions.map((i) =>
          i.id === id ? { ...i, status: "cancelled", completedAt, latencyMs } : i
        ),
      };
    }

    case "APPEND_CONVERSATION_TURN": {
      const cap = Math.min(state.settings.maxContextTurns, CONVERSATION_HISTORY_CAP);
      const updated = [...state.conversationHistory, action.payload];
      return {
        ...state,
        conversationHistory: updated.length > cap ? updated.slice(-cap) : updated,
      };
    }

    case "CLEAR_CONVERSATION_HISTORY":
      return { ...state, conversationHistory: [] };

    case "ADD_MEMORY_NOTE": {
      const raw = typeof action.payload === "string" ? action.payload : action.payload.content;
      const source: MemoryNoteSource =
        typeof action.payload === "string" ? "manual" : (action.payload.source ?? "manual");
      const content = raw.trim();
      if (!content || content.length > MEMORY_NOTE_CHAR_LIMIT) return state;
      const note: MemoryNote = {
        id: crypto.randomUUID(),
        content,
        createdAt: new Date().toISOString(),
        source,
      };
      const updated = [...state.memoryNotes, note];
      return {
        ...state,
        memoryNotes: updated.length > MEMORY_NOTES_CAP ? updated.slice(-MEMORY_NOTES_CAP) : updated,
      };
    }

    case "DELETE_MEMORY_NOTE":
      return {
        ...state,
        memoryNotes: state.memoryNotes.filter((n) => n.id !== action.payload),
      };

    case "CLEAR_MEMORY_NOTES":
      return { ...state, memoryNotes: [] };

    case "CLEAR_AUDIT_LOG":
      // Sentinel event is included as the payload — replace the log with only it.
      return { ...state, auditEvents: [action.payload] };

    case "CLEAR_MISSION_HISTORY": {
      const terminalStatuses = new Set([
        "completed",
        "failed",
        "cancelled",
        "paused",
        "emergency_stopped",
      ]);
      return {
        ...state,
        missions: state.missions.filter((m) => !terminalStatuses.has(m.status)),
      };
    }

    case "CREATE_TOOL_REQUEST": {
      const { request, approval, auditEvent } = action.payload;
      return {
        ...state,
        toolRequests: [request, ...state.toolRequests].slice(0, TOOL_REQUESTS_CAP),
        toolApprovals: [approval, ...state.toolApprovals].slice(0, TOOL_APPROVALS_CAP),
        auditEvents: [auditEvent, ...state.auditEvents].slice(0, 500),
      };
    }

    case "OPERATOR_APPROVE_TOOL": {
      const { requestId, resolvedAt, auditEvent } = action.payload;
      return {
        ...state,
        toolRequests: state.toolRequests.map((r) =>
          r.id === requestId && r.status === "pending_approval"
            ? {
                ...r,
                status: "approved" as const,
                approvedAt: resolvedAt,
                expiresAt: new Date(new Date(resolvedAt).getTime() + APPROVED_EXPIRY_MS).toISOString(),
              }
            : r
        ),
        toolApprovals: state.toolApprovals.map((a) =>
          a.requestId === requestId && a.decision === null
            ? { ...a, decision: "approved" as const, resolvedBy: "operator" as const, resolvedAt }
            : a
        ),
        auditEvents: [auditEvent, ...state.auditEvents].slice(0, 500),
      };
    }

    case "OPERATOR_REJECT_TOOL": {
      const { requestId, resolvedAt, auditEvent } = action.payload;
      return {
        ...state,
        toolRequests: state.toolRequests.map((r) =>
          r.id === requestId && r.status === "pending_approval"
            ? { ...r, status: "rejected" as const, completedAt: resolvedAt }
            : r
        ),
        toolApprovals: state.toolApprovals.map((a) =>
          a.requestId === requestId && a.decision === null
            ? { ...a, decision: "rejected" as const, resolvedBy: "operator" as const, resolvedAt }
            : a
        ),
        auditEvents: [auditEvent, ...state.auditEvents].slice(0, 500),
      };
    }

    case "START_TOOL_EXECUTION": {
      const { requestId, startedAt, auditEvent } = action.payload;
      // Triple-check gate: only transition if request is approved, contract is approved by operator.
      const req = state.toolRequests.find((r) => r.id === requestId);
      const contract = state.toolApprovals.find((a) => a.requestId === requestId);
      const gatePass =
        req?.status === "approved" &&
        contract?.decision === "approved" &&
        contract?.resolvedBy === "operator";
      if (!gatePass) return state;
      // Expiry check: approval window has passed — mark expired instead of starting.
      if (req!.expiresAt && startedAt > req!.expiresAt) {
        return {
          ...state,
          toolRequests: state.toolRequests.map((r) =>
            r.id === requestId ? { ...r, status: "expired" as const, completedAt: startedAt } : r
          ),
          auditEvents: [auditEvent, ...state.auditEvents].slice(0, 500),
        };
      }
      return {
        ...state,
        toolRequests: state.toolRequests.map((r) =>
          r.id === requestId ? { ...r, status: "running" as const, startedAt } : r
        ),
        auditEvents: [auditEvent, ...state.auditEvents].slice(0, 500),
      };
    }

    case "COMPLETE_TOOL_EXECUTION": {
      const { requestId, result, completedAt, auditEvent } = action.payload;
      // Guard: only transition from "running". Prevents EMERGENCY_STOP race and duplicate execution.
      const targetReq = state.toolRequests.find((r) => r.id === requestId);
      if (!targetReq || targetReq.status !== "running") return state;
      return {
        ...state,
        toolRequests: state.toolRequests.map((r) =>
          r.id === requestId
            ? { ...r, status: "succeeded" as const, completedAt, resultId: result.id }
            : r
        ),
        toolResults: [result, ...state.toolResults].slice(0, TOOL_RESULTS_CAP),
        auditEvents: [auditEvent, ...state.auditEvents].slice(0, 500),
      };
    }

    case "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE": {
      const { requestId, result, completedAt, memoryNoteContent, auditEvent, memoryNoteAuditEvent } = action.payload;
      // Guard: only transition from "running". Prevents stale/cancelled/emergency-stopped execution adding a note.
      const noteTarget = state.toolRequests.find((r) => r.id === requestId);
      if (!noteTarget || noteTarget.status !== "running") return state;

      const trimmed = memoryNoteContent.trim();
      const noteValid = trimmed.length > 0 && trimmed.length <= MEMORY_NOTE_CHAR_LIMIT;
      const newNote: MemoryNote | undefined = noteValid
        ? { id: crypto.randomUUID(), content: trimmed, createdAt: completedAt, source: "tool_result" }
        : undefined;
      const updatedNotes = newNote
        ? [...state.memoryNotes, newNote].slice(-MEMORY_NOTES_CAP)
        : state.memoryNotes;

      // Note content is never logged — only metadata appears in the audit event payload.
      const baseAudit = [auditEvent, ...state.auditEvents];
      const allAudit = newNote
        ? [memoryNoteAuditEvent, ...baseAudit].slice(0, 500)
        : baseAudit.slice(0, 500);

      return {
        ...state,
        toolRequests: state.toolRequests.map((r) =>
          r.id === requestId
            ? { ...r, status: "succeeded" as const, completedAt, resultId: result.id }
            : r
        ),
        toolResults: [result, ...state.toolResults].slice(0, TOOL_RESULTS_CAP),
        memoryNotes: updatedNotes,
        auditEvents: allAudit,
      };
    }

    case "FAIL_TOOL_EXECUTION": {
      const { requestId, error, completedAt, auditEvent } = action.payload;
      // Guard: only transition from "running". Prevents EMERGENCY_STOP race and duplicate failure.
      const failTarget = state.toolRequests.find((r) => r.id === requestId);
      if (!failTarget || failTarget.status !== "running") return state;
      return {
        ...state,
        toolRequests: state.toolRequests.map((r) =>
          r.id === requestId
            ? { ...r, status: "failed" as const, completedAt, error }
            : r
        ),
        auditEvents: [auditEvent, ...state.auditEvents].slice(0, 500),
      };
    }

    case "CANCEL_TOOL_REQUEST": {
      const { requestId, auditEvent } = action.payload;
      return {
        ...state,
        toolRequests: state.toolRequests.map((r) =>
          r.id === requestId && (r.status === "pending_approval" || r.status === "approved" || r.status === "running")
            ? { ...r, status: "cancelled" as const, completedAt: new Date().toISOString() }
            : r
        ),
        toolApprovals: state.toolApprovals.map((a) =>
          a.requestId === requestId && a.decision === null
            ? { ...a, decision: "rejected" as const, resolvedBy: "operator" as const, resolvedAt: new Date().toISOString() }
            : a
        ),
        auditEvents: [auditEvent, ...state.auditEvents].slice(0, 500),
      };
    }

    case "SET_VOICE_STATUS":
      return { ...state, voiceStatus: action.payload };

    case "SET_VOICE_TRANSCRIPT_DRAFT":
      return { ...state, voiceTranscriptDraft: action.payload };

    case "SET_VOICE_ERROR":
      return { ...state, voiceError: action.payload };

    case "CLEAR_VOICE_STATE":
      return {
        ...state,
        voiceStatus: "idle",
        voiceTranscriptDraft: null,
        voiceError: null,
        orbState: state.orbState === "listening" ? "idle" : state.orbState,
      };

    case "DISMISS_TOOL_SUGGESTION": {
      const { interactionId } = action.payload;
      return {
        ...state,
        interactions: state.interactions.map((i): LisaInteraction => {
          if (i.id !== interactionId) return i;
          if (!i.toolSuggestion || i.toolSuggestion.status !== "visible") return i;
          return { ...i, toolSuggestion: { ...i.toolSuggestion, status: "dismissed" as const } };
        }),
      };
    }

    case "CONVERT_TOOL_SUGGESTION": {
      const { interactionId } = action.payload;
      return {
        ...state,
        interactions: state.interactions.map((i): LisaInteraction => {
          if (i.id !== interactionId) return i;
          if (!i.toolSuggestion || i.toolSuggestion.status !== "visible") return i;
          return { ...i, toolSuggestion: { ...i.toolSuggestion, status: "converted" as const } };
        }),
      };
    }

    case "LOAD_STATE":
      return {
        ...state,
        settings: action.payload.settings,
        activeMode: action.payload.settings.activeMode,
        missions: action.payload.missions,
        approvals: action.payload.approvals,
        auditEvents: action.payload.auditEvents,
        conversationHistory: action.payload.conversationHistory,
        memoryNotes: action.payload.memoryNotes,
        toolRequests: action.payload.toolRequests,
        toolResults: action.payload.toolResults,
        toolApprovals: action.payload.toolApprovals,
        isLoaded: true,
      };

    default:
      return state;
  }
}
