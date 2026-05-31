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

// ─── Tools ───────────────────────────────────────────────────────────────────

export type ToolRiskLevel = "safe" | "low" | "medium" | "high" | "critical";
export type ToolCategory = "diagnostic" | "information" | "file" | "system" | "network" | "automation";

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
  defaultValue?: string | number | boolean;
}

export interface ToolDefinition {
  id: string;
  displayName: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  parameters: ToolParameter[];
  consequences: string;
  enabled: boolean;
  // Every tool must explicitly declare its LLM context injection policy.
  // Future tools that may output sensitive data should use "no_inject" until a redaction layer exists.
  contextPolicy: ToolContextPolicy;
}

export type ToolRequestStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export interface ToolSuggestion {
  id: string;
  toolId: string;
  toolDisplayName: string;
  reason: string;
  source: "user_intent_detected";
  createdAt: string;
  originatingInteractionId: string;
  status: "visible" | "dismissed" | "converted";
}

export interface ToolRequest {
  id: string;
  toolId: string;
  toolDisplayName: string;
  params: Record<string, string | number | boolean>;
  status: ToolRequestStatus;
  source: "user_command" | "suggestion_converted";
  consequences: string;
  createdAt: string;
  approvedAt?: string;
  startedAt?: string;
  completedAt?: string;
  resultId?: string;
  error?: string;
}

export interface ToolResult {
  id: string;
  requestId: string;
  toolId: string;
  outputSummary: string;
  succeededAt: string;
}

export interface ToolApprovalContract {
  id: string;
  requestId: string;
  toolId: string;
  toolDisplayName: string;
  consequences: string;
  decision: "approved" | "rejected" | null;
  resolvedBy: "operator" | null;
  createdAt: string;
  resolvedAt?: string;
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
  | "llm_stream_aborted"
  | "clear_conversation_history"
  | "memory_note_added"
  | "memory_note_deleted"
  | "memory_notes_cleared"
  | "ollama_model_test_started"
  | "ollama_model_test_passed"
  | "ollama_model_test_failed"
  | "tool_request_created"
  | "tool_request_approved"
  | "tool_request_rejected"
  | "tool_request_cancelled"
  | "tool_request_expired"
  | "tool_execution_started"
  | "tool_execution_succeeded"
  | "tool_execution_failed"
  | "tool_approval_contract_created"
  | "tool_suggestion_shown"
  | "tool_suggestion_converted"
  | "tool_suggestion_dismissed"
  | "llm_tool_context_injected"
  | "llm_tool_context_disabled"
  | "llm_tool_context_excluded";

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
  toolResultContextEnabled: boolean;
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
  toolResultContextEnabled: true,
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
  | "add_memory_note"
  | "list_memory_notes"
  | "delete_memory_note"
  | "request_clear_memory_notes"
  | "confirm_clear_memory_notes"
  | "request_tool"
  | "approve_tool_request"
  | "reject_tool_request"
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

export type InteractionKind = "command" | "local_ai" | "error" | "system" | "tool_request" | "tool_result";
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
  toolSuggestion?: ToolSuggestion;
}

export const INTERACTION_CAP = 25;
export const CONVERSATION_HISTORY_CAP = 50;
export const MEMORY_NOTES_CAP = 20;
export const MEMORY_NOTE_CHAR_LIMIT = 200;
export const TOOL_REQUESTS_CAP = 50;
export const TOOL_RESULTS_CAP = 50;
export const TOOL_APPROVALS_CAP = 50;

// ─── Persisted State ──────────────────────────────────────────────────────────

import type { LisaConversationTurn, MemoryNote, ToolContextPolicy } from "./llm-context";
export type { LisaConversationTurn, MemoryNote, ToolContextPolicy };

export interface PersistedState {
  version: number;
  settings: LisaSettings;
  missions: Mission[];
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
  conversationHistory: LisaConversationTurn[];
  memoryNotes: MemoryNote[];
  toolRequests: ToolRequest[];
  toolResults: ToolResult[];
  toolApprovals: ToolApprovalContract[];
  savedAt: string;
}

export const STATE_VERSION = 6;
