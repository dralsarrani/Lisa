import type {
  OrbState,
  LisaModeId,
  Mission,
  ApprovalRequest,
  AuditEvent,
  LisaSettings,
  RuntimeHealth,
} from "../core/types";
import { DEFAULT_SETTINGS } from "../core/types";

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
  | {
      type: "LOAD_STATE";
      payload: {
        settings: LisaSettings;
        missions: Mission[];
        approvals: ApprovalRequest[];
        auditEvents: AuditEvent[];
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

    case "LOAD_STATE":
      return {
        ...state,
        settings: action.payload.settings,
        activeMode: action.payload.settings.activeMode,
        missions: action.payload.missions,
        approvals: action.payload.approvals,
        auditEvents: action.payload.auditEvents,
        isLoaded: true,
      };

    default:
      return state;
  }
}
