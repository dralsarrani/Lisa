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
} from "../core/types";
import { DEFAULT_SETTINGS, INTERACTION_CAP, CONVERSATION_HISTORY_CAP } from "../core/types";

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
  | { type: "CLEAR_AUDIT_LOG"; payload: AuditEvent }
  | { type: "CLEAR_MISSION_HISTORY" }
  | {
      type: "LOAD_STATE";
      payload: {
        settings: LisaSettings;
        missions: Mission[];
        approvals: ApprovalRequest[];
        auditEvents: AuditEvent[];
        conversationHistory: LisaConversationTurn[];
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
      return {
        ...state,
        orbState: "emergency_stopped",
        missions: stoppedMissions,
        approvals: cancelledApprovals,
        commandResponse: "EMERGENCY STOP ACTIVATED. All active operations halted. System is safe.",
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

    case "LOAD_STATE":
      return {
        ...state,
        settings: action.payload.settings,
        activeMode: action.payload.settings.activeMode,
        missions: action.payload.missions,
        approvals: action.payload.approvals,
        auditEvents: action.payload.auditEvents,
        conversationHistory: action.payload.conversationHistory,
        isLoaded: true,
      };

    default:
      return state;
  }
}
