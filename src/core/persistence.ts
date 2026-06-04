import type {
  PersistedState,
  LisaSettings,
  Mission,
  ApprovalRequest,
  AuditEvent,
  LisaConversationTurn,
  MemoryNote,
  ToolRequest,
  ToolResult,
  ToolApprovalContract,
} from "./types";
import {
  DEFAULT_SETTINGS,
  STATE_VERSION,
  CONVERSATION_HISTORY_CAP,
  MEMORY_NOTES_CAP,
  MEMORY_NOTE_CHAR_LIMIT,
  TOOL_REQUESTS_CAP,
  TOOL_RESULTS_CAP,
  TOOL_APPROVALS_CAP,
} from "./types";

const STORAGE_KEY = "lisa_state_v1";
const MAX_AUDIT_EVENTS = 500;

// ─── Tauri bridge ─────────────────────────────────────────────────────────────

async function isTauri(): Promise<boolean> {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function tauriReadState(): Promise<string | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("read_app_state");
  } catch {
    return null;
  }
}

async function tauriWriteState(json: string): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_app_state", { stateJson: json });
  } catch {
    // Silently fall back to localStorage.
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadState(): Promise<PersistedState> {
  try {
    let raw: string | null = null;

    if (await isTauri()) {
      raw = await tauriReadState();
    }

    if (!raw) {
      raw = localStorage.getItem(STORAGE_KEY);
    }

    if (!raw) {
      return defaultState();
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;

    if (!parsed.version || parsed.version < STATE_VERSION) {
      return migrateState(parsed);
    }

    const rawRequests = safeToolRequests(parsed.toolRequests);
    const rawApprovals = safeToolApprovals(parsed.toolApprovals);
    const rawResults = safeToolResults(parsed.toolResults);
    const clean = cleanOrphans(rawRequests, rawApprovals, rawResults);
    return {
      version: STATE_VERSION,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      missions: parsed.missions ?? [],
      approvals: parsed.approvals ?? [],
      auditEvents: (parsed.auditEvents ?? []).slice(-MAX_AUDIT_EVENTS),
      conversationHistory: safeConversationHistory(parsed.conversationHistory),
      memoryNotes: safeMemoryNotes(parsed.memoryNotes),
      toolRequests: clean.requests,
      toolResults: clean.results,
      toolApprovals: clean.approvals,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveState(state: {
  settings: LisaSettings;
  missions: Mission[];
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
  conversationHistory: LisaConversationTurn[];
  memoryNotes: MemoryNote[];
  toolRequests: ToolRequest[];
  toolResults: ToolResult[];
  toolApprovals: ToolApprovalContract[];
}): Promise<void> {
  const persisted: PersistedState = {
    version: STATE_VERSION,
    settings: state.settings,
    missions: state.missions,
    approvals: state.approvals,
    auditEvents: state.auditEvents.slice(-MAX_AUDIT_EVENTS),
    conversationHistory: state.conversationHistory.slice(-CONVERSATION_HISTORY_CAP),
    memoryNotes: state.memoryNotes.slice(-MEMORY_NOTES_CAP),
    toolRequests: state.toolRequests.slice(0, TOOL_REQUESTS_CAP),
    toolResults: state.toolResults.slice(0, TOOL_RESULTS_CAP),
    toolApprovals: state.toolApprovals.slice(0, TOOL_APPROVALS_CAP),
    savedAt: new Date().toISOString(),
  };

  const json = JSON.stringify(persisted, null, 2);

  // Always save to localStorage as primary fallback.
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // localStorage may be unavailable in some Tauri builds.
  }

  // Also attempt Tauri backend write if available.
  if (await isTauri()) {
    await tauriWriteState(json);
  }
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function defaultState(): PersistedState {
  return {
    version: STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    missions: [],
    approvals: [],
    auditEvents: [],
    conversationHistory: [],
    memoryNotes: [],
    toolRequests: [],
    toolResults: [],
    toolApprovals: [],
    savedAt: new Date().toISOString(),
  };
}

function migrateState(old: Partial<PersistedState>): PersistedState {
  // v5 → v7 / v6 → v7: additive migrations — preserve all tool collections.
  // v6→v7 adds MemoryNote.source; safeMemoryNotes backfills "manual" for notes without source.
  if (old.version === 5 || old.version === 6) {
    const migRequests = safeToolRequests(old.toolRequests);
    const migApprovals = safeToolApprovals(old.toolApprovals);
    const migResults = safeToolResults(old.toolResults);
    const migClean = cleanOrphans(migRequests, migApprovals, migResults);
    return {
      version: STATE_VERSION,
      settings: { ...DEFAULT_SETTINGS, ...(old.settings ?? {}) },
      missions: old.missions ?? [],
      approvals: old.approvals ?? [],
      auditEvents: (old.auditEvents ?? []).slice(-MAX_AUDIT_EVENTS),
      conversationHistory: safeConversationHistory(old.conversationHistory),
      memoryNotes: safeMemoryNotes(old.memoryNotes),
      toolRequests: migClean.requests,
      toolResults: migClean.results,
      toolApprovals: migClean.approvals,
      savedAt: old.savedAt ?? new Date().toISOString(),
    };
  }
  // versions < 5: tool collections used incompatible data models — reset them.
  return {
    ...defaultState(),
    settings: { ...DEFAULT_SETTINGS, ...(old.settings ?? {}) },
    missions: old.missions ?? [],
    approvals: old.approvals ?? [],
    auditEvents: old.auditEvents ?? [],
    conversationHistory: safeConversationHistory(old.conversationHistory),
    memoryNotes: safeMemoryNotes(old.memoryNotes),
    toolRequests: [],
    toolResults: [],
    toolApprovals: [],
  };
}

// ─── Orphan cleanup ───────────────────────────────────────────────────────────

function cleanOrphans(
  toolRequests: ToolRequest[],
  toolApprovals: ToolApprovalContract[],
  toolResults: ToolResult[]
): { requests: ToolRequest[]; approvals: ToolApprovalContract[]; results: ToolResult[] } {
  const requestIds = new Set(toolRequests.map((r) => r.id));
  const approvalRequestIds = new Set(toolApprovals.map((a) => a.requestId));
  return {
    requests: toolRequests.map((r) => {
      if (
        !approvalRequestIds.has(r.id) &&
        (r.status === "pending_approval" || r.status === "approved")
      ) {
        return { ...r, status: "cancelled" as const, completedAt: new Date().toISOString() };
      }
      return r;
    }),
    approvals: toolApprovals.filter((a) => requestIds.has(a.requestId)),
    results: toolResults.filter((r) => requestIds.has(r.requestId)),
  };
}

function safeConversationHistory(raw: unknown): LisaConversationTurn[] {
  if (!Array.isArray(raw)) return [];
  return (raw as LisaConversationTurn[])
    .filter(
      (t) =>
        t !== null &&
        typeof t === "object" &&
        typeof t.userInput === "string" &&
        typeof t.assistantResponse === "string" &&
        typeof t.timestamp === "string" &&
        typeof t.model === "string"
    )
    .slice(-CONVERSATION_HISTORY_CAP);
}

function safeMemoryNotes(raw: unknown): MemoryNote[] {
  if (!Array.isArray(raw)) return [];
  type RawNote = Record<string, unknown>;
  return (raw as RawNote[])
    .filter(
      (n) =>
        n !== null &&
        typeof n === "object" &&
        typeof n["id"] === "string" &&
        typeof n["content"] === "string" &&
        typeof n["createdAt"] === "string" &&
        (n["content"] as string).trim().length > 0 &&
        (n["content"] as string).trim().length <= MEMORY_NOTE_CHAR_LIMIT
    )
    .map((n): MemoryNote => ({
      id: n["id"] as string,
      content: (n["content"] as string).trim(),
      createdAt: n["createdAt"] as string,
      source: n["source"] === "tool_result" ? "tool_result" : "manual",
    }))
    .slice(-MEMORY_NOTES_CAP);
}

// Restart policy: running → cancelled; approved (not yet started) → expired.
// pending_approval, rejected, succeeded, failed, cancelled, expired survive as-is.
function safeToolRequests(raw: unknown): ToolRequest[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ToolRequest[])
    .filter(
      (r) =>
        r !== null &&
        typeof r === "object" &&
        typeof r.id === "string" &&
        typeof r.toolId === "string" &&
        typeof r.status === "string" &&
        typeof r.createdAt === "string"
    )
    .map((r) => {
      if (r.status === "running") {
        return { ...r, status: "cancelled" as const, completedAt: new Date().toISOString() };
      }
      if (r.status === "approved") {
        return { ...r, status: "expired" as const, completedAt: new Date().toISOString() };
      }
      return r;
    })
    .slice(0, TOOL_REQUESTS_CAP);
}

function safeToolResults(raw: unknown): ToolResult[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ToolResult[])
    .filter(
      (r) =>
        r !== null &&
        typeof r === "object" &&
        typeof r.id === "string" &&
        typeof r.requestId === "string" &&
        typeof r.toolId === "string" &&
        typeof r.outputSummary === "string" &&
        typeof r.succeededAt === "string"
    )
    .slice(0, TOOL_RESULTS_CAP);
}

function safeToolApprovals(raw: unknown): ToolApprovalContract[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ToolApprovalContract[])
    .filter(
      (a) =>
        a !== null &&
        typeof a === "object" &&
        typeof a.id === "string" &&
        typeof a.requestId === "string" &&
        typeof a.toolId === "string" &&
        typeof a.createdAt === "string" &&
        (a.decision === null || a.decision === "approved" || a.decision === "rejected")
    )
    .slice(0, TOOL_APPROVALS_CAP);
}
