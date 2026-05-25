import type { AuditEvent, AuditEventType, AuditSeverity } from "./types";

let _nextId = 1;

function generateId(): string {
  return `audit_${Date.now()}_${_nextId++}`;
}

export function createAuditEvent(params: {
  eventType: AuditEventType;
  source: string;
  summary: string;
  details?: string;
  missionId?: string;
  severity?: AuditSeverity;
}): AuditEvent {
  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    eventType: params.eventType,
    source: params.source,
    summary: params.summary,
    details: params.details,
    missionId: params.missionId,
    severity: params.severity ?? "info",
  };
}

export function severityForIntent(intent: string): AuditSeverity {
  if (intent === "emergency_stop") return "critical";
  if (intent === "error_occurred") return "error";
  if (intent === "command_unknown") return "warning";
  return "info";
}
