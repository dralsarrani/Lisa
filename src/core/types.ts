// ─────────────────────────────────────────────────────────────────────────────
// Lisa Phase 0 — Core Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

// ─── Orb ─────────────────────────────────────────────────────────────────────

export type OrbState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "acting"
  | "waiting_approval"
  | "paused"
  | "error"
  | "emergency_stopped";

// ─── Modes ───────────────────────────────────────────────────────────────────

export type LisaModeId =
  | "normal"
  | "focus"
  | "study"
  | "work"
  | "meeting"
  | "privacy"
  | "lockdown"
  | "sleep"
  | "presentation"
  | "cyber"
  | "design"
  | "gaming"
  | "coding"
  | "tutor"
  | "companion";

export interface LisaMode {
  id: LisaModeId;
  name: string;
  description: string;
  orbTheme: string;
  behaviorSummary: string;
}

// ─── Missions ─────────────────────────────────────────────────────────────────

export type MissionStatus =
  | "idle"
  | "planned"
  | "running"
  | "waiting_approval"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "emergency_stopped";

export type MissionStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface MissionStep {
  id: string;
  label: string;
  description: string;
  status: MissionStepStatus;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  status: MissionStatus;
  steps: MissionStep[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  approvalId?: string;
  source: "user_command" | "system" | "scheduled";
  mode?: LisaModeId;
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired";

export type ApprovalActionType =
  | "mission_start"
  | "file_operation"
  | "system_change"
  | "network_action"
  | "communication"
  | "skill_install"
  | "credential_use"
  | "test_action";

export interface ApprovalRequest {
  id: string;
  missionId?: string;
  title: string;
  description: string;
  actionType: ApprovalActionType;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  decision?: "approved" | "rejected";
  resolvedBy?: string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export type AuditEventType =
  | "app_started"
  | "app_shutdown"
  | "command_received"
  | "command_routed"
  | "command_unknown"
  | "mode_changed"
  | "orb_state_changed"
  | "mission_created"
  | "mission_started"
  | "mission_completed"
  | "mission_failed"
  | "mission_cancelled"
  | "mission_paused"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "runtime_health_checked"
  | "emergency_stop_activated"
  | "emergency_stop_cleared"
  | "audit_log_cleared"
  | "error_occurred"
  | "persistence_saved"
  | "persistence_loaded"
  | "system_info"
  | "llm_request_sent"
  | "llm_response_received"
  | "llm_request_failed"
  | "llm_disabled_fallback"
  | "llm_stream_started"
  | "llm_stream_completed"
  | "llm_stream_failed"
  | "llm_stream_aborted";

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  source: string;
  summary: string;
  details?: string;
  missionId?: string;
  severity: AuditSeverity;
}

// ─── Runtime Health ───────────────────────────────────────────────────────────

export type ServiceStatus =
  | "available"
  | "not_configured"
  | "unavailable"
  | "checking"
  | "error";

export interface RuntimeHealth {
  backendReachable: boolean;
  appVersion: string;
  osType: string;
  osVersion: string;
  arch: string;
  timestamp: string;
  ollamaStatus: ServiceStatus;
  dockerStatus: ServiceStatus;
  lastChecked?: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface LisaSettings {
  activeMode: LisaModeId;
  orbSize: "small" | "medium" | "large";
  soundEnabled: boolean;
  voiceEnabled: boolean;
  persistAuditLog: boolean;
  maxAuditEvents: number;
  theme: "dark" | "darker";
  language: string;
  developerMode: boolean;
  enableLocalAi: boolean;
  ollamaModel: string;
  maxContextTurns: number;
}

export const DEFAULT_SETTINGS: LisaSettings = {
  activeMode: "normal",
  orbSize: "medium",
  soundEnabled: false,
  voiceEnabled: false,
  persistAuditLog: true,
  maxAuditEvents: 500,
  theme: "darker",
  language: "en",
  developerMode: false,
  enableLocalAi: false,
  ollamaModel: "",
  maxContextTurns: 20,
};

// ─── Command Router ───────────────────────────────────────────────────────────

export type CommandIntent =
  | "emergency_stop"
  | "stop"
  | "sleep"
  | "wake"
  | "mode_change"
  | "runtime_health"
  | "create_test_mission"
  | "approve_test_action"
  | "reject_test_action"
  | "unknown";

export interface CommandRouteResult {
  intent: CommandIntent;
  raw: string;
  normalized: string;
  payload?: Record<string, unknown>;
  confidence: "high" | "medium" | "low";
  response?: string;
}

// ─── Interactions (session-only, not persisted) ───────────────────────────────

export type InteractionKind = "command" | "local_ai" | "error" | "system";
export type InteractionStatus = "thinking" | "streaming" | "complete" | "failed" | "cancelled";

export interface LisaInteraction {
  id: string;
  kind: InteractionKind;
  prompt: string;
  response: string;
  model?: string;
  status: InteractionStatus;
  createdAt: string;
  completedAt?: string;
  latencyMs?: number;
  error?: string;
}

export const INTERACTION_CAP = 25;
export const CONVERSATION_HISTORY_CAP = 50;

// ─── Persisted State ──────────────────────────────────────────────────────────

import type { LisaConversationTurn } from "./llm-context";
export type { LisaConversationTurn };

export interface PersistedState {
  version: number;
  settings: LisaSettings;
  missions: Mission[];
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
  conversationHistory: LisaConversationTurn[];
  savedAt: string;
}

export const STATE_VERSION = 3;
