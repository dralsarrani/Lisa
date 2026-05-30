import type { PersistedState, LisaSettings, Mission, ApprovalRequest, AuditEvent, LisaConversationTurn } from "./types";
import { DEFAULT_SETTINGS, STATE_VERSION, CONVERSATION_HISTORY_CAP } from "./types";

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

    return {
      version: STATE_VERSION,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      missions: parsed.missions ?? [],
      approvals: parsed.approvals ?? [],
      auditEvents: (parsed.auditEvents ?? []).slice(-MAX_AUDIT_EVENTS),
      conversationHistory: safeConversationHistory(parsed.conversationHistory),
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
}): Promise<void> {
  const persisted: PersistedState = {
    version: STATE_VERSION,
    settings: state.settings,
    missions: state.missions,
    approvals: state.approvals,
    auditEvents: state.auditEvents.slice(-MAX_AUDIT_EVENTS),
    conversationHistory: state.conversationHistory.slice(-CONVERSATION_HISTORY_CAP),
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
    savedAt: new Date().toISOString(),
  };
}

function migrateState(old: Partial<PersistedState>): PersistedState {
  return {
    ...defaultState(),
    settings: { ...DEFAULT_SETTINGS, ...(old.settings ?? {}) },
    missions: old.missions ?? [],
    approvals: old.approvals ?? [],
    auditEvents: old.auditEvents ?? [],
    conversationHistory: safeConversationHistory(old.conversationHistory),
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
