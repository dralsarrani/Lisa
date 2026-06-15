import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState } from "../core/persistence";
import { createAuditEvent } from "../core/audit-store";
import { DEFAULT_SETTINGS, STATE_VERSION, CONVERSATION_HISTORY_CAP, MEMORY_NOTES_CAP, MEMORY_NOTE_CHAR_LIMIT, TOOL_REQUESTS_CAP, TOOL_RESULTS_CAP, TOOL_APPROVALS_CAP } from "../core/types";
import type { LisaConversationTurn, MemoryNote, ToolRequest, ToolResult, ToolApprovalContract } from "../core/types";

const EMPTY_TOOLS: { toolRequests: ToolRequest[]; toolResults: ToolResult[]; toolApprovals: ToolApprovalContract[] } = { toolRequests: [], toolResults: [], toolApprovals: [] };

beforeEach(() => {
  localStorage.clear();
});

describe("loadState — empty storage", () => {
  it("returns default state when nothing is stored", async () => {
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.settings).toMatchObject(DEFAULT_SETTINGS);
    expect(state.missions).toEqual([]);
    expect(state.approvals).toEqual([]);
    expect(state.auditEvents).toEqual([]);
  });

  it("savedAt is a valid ISO timestamp", async () => {
    const state = await loadState();
    expect(() => new Date(state.savedAt)).not.toThrow();
    expect(new Date(state.savedAt).toISOString()).toBe(state.savedAt);
  });
});

describe("loadState — invalid JSON", () => {
  it("returns default state when stored JSON is malformed", async () => {
    localStorage.setItem("lisa_state_v1", "not-json{{{");
    const state = await loadState();
    expect(state.missions).toEqual([]);
    expect(state.settings).toMatchObject(DEFAULT_SETTINGS);
  });
});

describe("Phase 4C — STATE_VERSION is 10", () => {
  it("STATE_VERSION constant equals 10", () => {
    expect(STATE_VERSION).toBe(10);
  });
});

describe("Phase 3C — v8→v9 migration adds sttModelPath", () => {
  it("v8 state without sttModelPath gets empty string default", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: 8,
      settings: { voiceInputEnabled: true, pushToTalkKey: "KeyV" },
    }));
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.settings.sttModelPath).toBe("");
  });

  it("v8 state preserves existing settings during migration", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: 8,
      settings: { voiceInputEnabled: true, ollamaModel: "llama3.2:1b", sttEngineStatus: "not_configured" },
      missions: [],
    }));
    const state = await loadState();
    expect(state.settings.voiceInputEnabled).toBe(true);
    expect(state.settings.ollamaModel).toBe("llama3.2:1b");
    expect(state.settings.sttEngineStatus).toBe("not_configured");
    expect(state.settings.sttModelPath).toBe("");
  });

  it("default state includes sttModelPath as empty string", async () => {
    const state = await loadState();
    expect(state.settings.sttModelPath).toBe("");
    expect(state.settings.sttEngineStatus).toBe("not_configured");
  });
});

describe("Phase 2K — v6→v7 migration backfills source: manual", () => {
  it("note without source field gets source: manual", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: 6,
      memoryNotes: [{ id: "n1", content: "old note", createdAt: "2025-01-01T00:00:00.000Z" }],
    }));
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.memoryNotes[0].source).toBe("manual");
    expect(state.memoryNotes[0].content).toBe("old note");
    expect(state.memoryNotes[0].id).toBe("n1");
  });

  it("note with source: tool_result in v6 state is preserved", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: 6,
      memoryNotes: [{ id: "n2", content: "tool note", createdAt: "2025-01-01T00:00:00.000Z", source: "tool_result" }],
    }));
    const state = await loadState();
    expect(state.memoryNotes[0].source).toBe("tool_result");
  });

  it("unknown source value is normalized to manual", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: 7,
      memoryNotes: [{ id: "n3", content: "weird note", createdAt: "2025-01-01T00:00:00.000Z", source: "imported_from_elsewhere" }],
    }));
    const state = await loadState();
    expect(state.memoryNotes[0].source).toBe("manual");
  });

  it("conversationHistory is preserved during v6→v7 migration", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: 6,
      conversationHistory: [{ userInput: "q", assistantResponse: "a", timestamp: "2025-01-01T00:00:00.000Z", model: "llama3" }],
      memoryNotes: [{ id: "n4", content: "a note", createdAt: "2025-01-01T00:00:00.000Z" }],
    }));
    const state = await loadState();
    expect(state.conversationHistory).toHaveLength(1);
    expect(state.memoryNotes).toHaveLength(1);
  });
});

describe("Phase 3A — v7→v8 migration adds voice settings", () => {
  it("v7 state migrates to v8 with voice defaults applied", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: 7,
      settings: { activeMode: "focus", enableLocalAi: false, ollamaModel: "" },
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: [],
      memoryNotes: [],
      toolRequests: [],
      toolResults: [],
      toolApprovals: [],
    }));
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.settings.activeMode).toBe("focus");
    expect(state.settings.voiceInputEnabled).toBe(false);
    expect(state.settings.pushToTalkKey).toBe("KeyV");
    expect(state.settings.sttEngineStatus).toBe("not_configured");
  });

  it("v7 state preserves existing settings while adding voice defaults", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: 7,
      settings: { activeMode: "cyber", developerMode: true, ollamaModel: "llama3.2:1b" },
    }));
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.settings.activeMode).toBe("cyber");
    expect(state.settings.developerMode).toBe(true);
    expect(state.settings.ollamaModel).toBe("llama3.2:1b");
    expect(state.settings.voiceInputEnabled).toBe(false);
    expect(state.settings.sttEngineStatus).toBe("not_configured");
  });

  it("memoryNotes are preserved during v7→v8 migration", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: 7,
      memoryNotes: [{ id: "mn1", content: "keep this", createdAt: "2025-01-01T00:00:00.000Z", source: "manual" }],
    }));
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.memoryNotes).toHaveLength(1);
    expect(state.memoryNotes[0].content).toBe("keep this");
    expect(state.memoryNotes[0].source).toBe("manual");
  });
});

describe("Phase 2K — v7 source round-trip", () => {
  it("manual and tool_result sources survive save+load", async () => {
    const notes: MemoryNote[] = [
      { id: "r1", content: "manual note", createdAt: "2025-01-01T00:00:00.000Z", source: "manual" },
      { id: "r2", content: "tool note", createdAt: "2025-01-01T00:00:00.000Z", source: "tool_result" },
    ];
    await saveState({ settings: DEFAULT_SETTINGS, missions: [], approvals: [], auditEvents: [], conversationHistory: [], memoryNotes: notes, ...EMPTY_TOOLS });
    const state = await loadState();
    expect(state.memoryNotes[0].source).toBe("manual");
    expect(state.memoryNotes[1].source).toBe("tool_result");
  });
});

describe("loadState — migration", () => {
  it("migrates old state (version 0) and preserves partial settings", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({ version: 0, settings: { activeMode: "focus" } })
    );
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.settings.activeMode).toBe("focus");
    expect(state.missions).toEqual([]);
  });
});

describe("saveState + loadState round-trip", () => {
  it("persists and reloads settings", async () => {
    await saveState({
      settings: { ...DEFAULT_SETTINGS, activeMode: "focus", developerMode: true },
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: [],
      memoryNotes: [],
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.settings.activeMode).toBe("focus");
    expect(loaded.settings.developerMode).toBe(true);
  });

  it("persists and reloads empty arrays", async () => {
    await saveState({
      settings: DEFAULT_SETTINGS,
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: [],
      memoryNotes: [],
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.missions).toEqual([]);
    expect(loaded.approvals).toEqual([]);
    expect(loaded.auditEvents).toEqual([]);
  });

  it("caps auditEvents at 500 on save", async () => {
    const events = Array.from({ length: 600 }, (_, i) =>
      createAuditEvent({ eventType: "app_started", source: "test", summary: `event ${i}` })
    );
    await saveState({ settings: DEFAULT_SETTINGS, missions: [], approvals: [], auditEvents: events, conversationHistory: [], memoryNotes: [], ...EMPTY_TOOLS });
    const loaded = await loadState();
    expect(loaded.auditEvents.length).toBe(500);
  });

  it("caps auditEvents at 500 on load when bypassing saveState", async () => {
    const events = Array.from({ length: 600 }, (_, i) =>
      createAuditEvent({ eventType: "app_started", source: "test", summary: `event ${i}` })
    );
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: events,
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.auditEvents.length).toBe(500);
  });

  it("merges saved settings with defaults for forward-compat (partial settings object)", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: { activeMode: "cyber" },
        missions: [],
        approvals: [],
        auditEvents: [],
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.settings.activeMode).toBe("cyber");
    expect(loaded.settings.orbSize).toBe(DEFAULT_SETTINGS.orbSize);
  });
});

describe("loadState — v1 to v2 migration", () => {
  it("adds Phase 1A settings with defaults when migrating from STATE_VERSION 1", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 1,
        settings: { activeMode: "focus", developerMode: true },
        missions: [],
        approvals: [],
        auditEvents: [],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.settings.activeMode).toBe("focus");
    expect(state.settings.developerMode).toBe(true);
    expect(state.settings.enableLocalAi).toBe(false);
    expect(state.settings.ollamaModel).toBe("");
    expect(state.settings.maxContextTurns).toBe(20);
  });

  it("preserves missions and audit events across migration", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 1,
        settings: {},
        missions: [{ id: "m1", title: "Old mission" }],
        approvals: [],
        auditEvents: [{ id: "e1", summary: "old event" }],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.missions).toHaveLength(1);
    expect(state.auditEvents).toHaveLength(1);
  });
});

function makeTurn(n: number): LisaConversationTurn {
  return {
    userInput: `question ${n}`,
    assistantResponse: `answer ${n}`,
    timestamp: new Date().toISOString(),
    model: "llama3.2:1b",
  };
}

describe("loadState — v2 to v3 migration (Phase 1D)", () => {
  it("adds conversationHistory: [] when migrating from version 2", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 2,
        settings: { activeMode: "focus" },
        missions: [],
        approvals: [],
        auditEvents: [],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.conversationHistory).toEqual([]);
    expect(state.settings.activeMode).toBe("focus");
  });

  it("preserves missions and settings across v2→v3 migration", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 2,
        settings: { developerMode: true },
        missions: [{ id: "m1", title: "Migrated" }],
        approvals: [],
        auditEvents: [],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.settings.developerMode).toBe(true);
    expect(state.missions).toHaveLength(1);
  });
});

describe("conversationHistory — round-trip persistence (Phase 1D)", () => {
  it("persists and reloads conversation turns", async () => {
    const turns = [makeTurn(1), makeTurn(2)];
    await saveState({
      settings: DEFAULT_SETTINGS,
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: turns,
      memoryNotes: [],
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.conversationHistory).toHaveLength(2);
    expect(loaded.conversationHistory[0].userInput).toBe("question 1");
    expect(loaded.conversationHistory[1].assistantResponse).toBe("answer 2");
  });

  it("returns [] when conversationHistory is missing from stored state", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.conversationHistory).toEqual([]);
  });

  it("returns [] when conversationHistory is not an array", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: "bad-value",
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.conversationHistory).toEqual([]);
  });

  it("drops malformed turns and keeps valid ones", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [
          makeTurn(1),
          { userInput: 42, assistantResponse: "bad", timestamp: "x", model: "y" },
          makeTurn(3),
          null,
        ],
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.conversationHistory).toHaveLength(2);
    expect(loaded.conversationHistory[0].userInput).toBe("question 1");
    expect(loaded.conversationHistory[1].userInput).toBe("question 3");
  });

  it("cleared conversationHistory persists and loads as []", async () => {
    await saveState({
      settings: DEFAULT_SETTINGS,
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: [makeTurn(1), makeTurn(2)],
      memoryNotes: [],
      ...EMPTY_TOOLS,
    });
    await saveState({
      settings: DEFAULT_SETTINGS,
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: [],
      memoryNotes: [],
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.conversationHistory).toEqual([]);
  });

  it("caps conversationHistory at CONVERSATION_HISTORY_CAP on save", async () => {
    const turns = Array.from({ length: CONVERSATION_HISTORY_CAP + 10 }, (_, i) => makeTurn(i));
    await saveState({
      settings: DEFAULT_SETTINGS,
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: turns,
      memoryNotes: [],
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.conversationHistory.length).toBe(CONVERSATION_HISTORY_CAP);
    expect(loaded.conversationHistory[0].userInput).toBe(`question ${10}`);
  });
});

// ─── memoryNotes — round-trip persistence (Phase 1F) ─────────────────────────

function makeNote(i: number, content?: string): MemoryNote {
  return {
    id: `note-${i}`,
    content: content ?? `memory note ${i}`,
    createdAt: new Date().toISOString(),
    source: "manual",
  };
}

describe("memoryNotes — round-trip persistence (Phase 1F)", () => {
  it("persists and reloads memory notes", async () => {
    const notes = [makeNote(1), makeNote(2)];
    await saveState({
      settings: DEFAULT_SETTINGS,
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: [],
      memoryNotes: notes,
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.memoryNotes).toHaveLength(2);
    expect(loaded.memoryNotes[0].content).toBe("memory note 1");
    expect(loaded.memoryNotes[1].id).toBe("note-2");
  });

  it("returns [] when memoryNotes is missing from stored state", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.memoryNotes).toEqual([]);
  });

  it("returns [] when memoryNotes is not an array", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: "bad-value",
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.memoryNotes).toEqual([]);
  });

  it("drops notes with content exceeding MEMORY_NOTE_CHAR_LIMIT", async () => {
    const overLimit = makeNote(99, "x".repeat(MEMORY_NOTE_CHAR_LIMIT + 1));
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [makeNote(1), overLimit, makeNote(3)],
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.memoryNotes).toHaveLength(2);
    expect(loaded.memoryNotes[0].content).toBe("memory note 1");
    expect(loaded.memoryNotes[1].content).toBe("memory note 3");
  });

  it("drops notes with empty content", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [makeNote(1), makeNote(2, "   "), makeNote(3)],
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.memoryNotes).toHaveLength(2);
  });

  it("caps memoryNotes at MEMORY_NOTES_CAP on save", async () => {
    const notes = Array.from({ length: MEMORY_NOTES_CAP + 5 }, (_, i) => makeNote(i));
    await saveState({
      settings: DEFAULT_SETTINGS,
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: [],
      memoryNotes: notes,
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.memoryNotes.length).toBe(MEMORY_NOTES_CAP);
    expect(loaded.memoryNotes[MEMORY_NOTES_CAP - 1].id).toBe(`note-${MEMORY_NOTES_CAP + 4}`);
  });

  it("v3→v4 migration adds memoryNotes: [] for old state", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 3,
        settings: { activeMode: "focus" },
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.memoryNotes).toEqual([]);
    expect(state.settings.activeMode).toBe("focus");
  });
});

// ─── Tool persistence ─────────────────────────────────────────────────────────

const NOW = "2025-01-01T00:00:00.000Z";

function makeToolRequest(id: string, status: ToolRequest["status"] = "pending_approval"): ToolRequest {
  return {
    id,
    toolId: "conversation-stats",
    toolDisplayName: "Conversation Stats",
    params: {},
    status,
    source: "user_command",
    consequences: "Safe diagnostic only.",
    createdAt: NOW,
  };
}

function makeToolResult(id: string, requestId: string): ToolResult {
  return {
    id,
    requestId,
    toolId: "conversation-stats",
    outputSummary: "Turns: 1",
    succeededAt: NOW,
  };
}

function makeToolApproval(id: string, requestId: string, decision: ToolApprovalContract["decision"] = null): ToolApprovalContract {
  return {
    id,
    requestId,
    toolId: "conversation-stats",
    toolDisplayName: "Conversation Stats",
    consequences: "Safe diagnostic only.",
    decision,
    resolvedBy: decision !== null ? "operator" : null,
    createdAt: NOW,
  };
}

const BASE_SAVE = {
  settings: DEFAULT_SETTINGS,
  missions: [],
  approvals: [],
  auditEvents: [],
  conversationHistory: [],
  memoryNotes: [],
};

describe("tool persistence — round trip", () => {
  it("persists and reloads tool requests", async () => {
    const requests = [makeToolRequest("req-1"), makeToolRequest("req-2"), makeToolRequest("req-3")];
    await saveState({ ...BASE_SAVE, toolRequests: requests, toolResults: [], toolApprovals: [] });
    const loaded = await loadState();
    expect(loaded.toolRequests).toHaveLength(3);
    expect(loaded.toolRequests.map((r) => r.id)).toEqual(["req-1", "req-2", "req-3"]);
  });

  it("persists and reloads tool results", async () => {
    const requests = [makeToolRequest("req-1", "succeeded"), makeToolRequest("req-2", "succeeded")];
    const results = [makeToolResult("res-1", "req-1"), makeToolResult("res-2", "req-2")];
    await saveState({ ...BASE_SAVE, toolRequests: requests, toolResults: results, toolApprovals: [] });
    const loaded = await loadState();
    expect(loaded.toolResults).toHaveLength(2);
    expect(loaded.toolResults[0].id).toBe("res-1");
  });

  it("persists and reloads tool approvals", async () => {
    const requests = [makeToolRequest("req-1"), makeToolRequest("req-2"), makeToolRequest("req-3")];
    const approvals = [
      makeToolApproval("apv-1", "req-1", null),
      makeToolApproval("apv-2", "req-2", "approved"),
      makeToolApproval("apv-3", "req-3", "rejected"),
    ];
    await saveState({ ...BASE_SAVE, toolRequests: requests, toolResults: [], toolApprovals: approvals });
    const loaded = await loadState();
    expect(loaded.toolApprovals).toHaveLength(3);
    expect(loaded.toolApprovals[0].decision).toBeNull();
    expect(loaded.toolApprovals[1].decision).toBe("approved");
    expect(loaded.toolApprovals[2].decision).toBe("rejected");
  });

  it("two pending tool requests coexist after round trip", async () => {
    const requests = [makeToolRequest("req-a", "pending_approval"), makeToolRequest("req-b", "pending_approval")];
    const approvals = [makeToolApproval("apv-a", "req-a"), makeToolApproval("apv-b", "req-b")];
    await saveState({ ...BASE_SAVE, toolRequests: requests, toolResults: [], toolApprovals: approvals });
    const loaded = await loadState();
    const pending = loaded.toolRequests.filter((r) => r.status === "pending_approval");
    expect(pending).toHaveLength(2);
  });
});

describe("tool persistence — restart policy", () => {
  it("pending_approval survives restart unchanged", async () => {
    await saveState({
      ...BASE_SAVE,
      toolRequests: [makeToolRequest("req-1", "pending_approval")],
      toolResults: [],
      toolApprovals: [makeToolApproval("apv-1", "req-1")],
    });
    const loaded = await loadState();
    expect(loaded.toolRequests[0].status).toBe("pending_approval");
  });

  it("running becomes cancelled on restart", async () => {
    await saveState({ ...BASE_SAVE, toolRequests: [makeToolRequest("req-1", "running")], toolResults: [], toolApprovals: [] });
    const loaded = await loadState();
    expect(loaded.toolRequests[0].status).toBe("cancelled");
  });

  it("approved becomes expired on restart", async () => {
    await saveState({ ...BASE_SAVE, toolRequests: [makeToolRequest("req-1", "approved")], toolResults: [], toolApprovals: [] });
    const loaded = await loadState();
    expect(loaded.toolRequests[0].status).toBe("expired");
  });

  it("terminal statuses survive restart unchanged", async () => {
    const terminals: ToolRequest["status"][] = ["succeeded", "failed", "rejected", "cancelled", "expired"];
    for (const status of terminals) {
      localStorage.clear();
      await saveState({ ...BASE_SAVE, toolRequests: [makeToolRequest("req-1", status)], toolResults: [], toolApprovals: [] });
      const loaded = await loadState();
      expect(loaded.toolRequests[0].status).toBe(status);
    }
  });

  it("mixed statuses: pending survives, running→cancelled, approved→expired", async () => {
    const requests = [
      makeToolRequest("req-pending", "pending_approval"),
      makeToolRequest("req-running", "running"),
      makeToolRequest("req-approved", "approved"),
      makeToolRequest("req-done", "succeeded"),
    ];
    await saveState({
      ...BASE_SAVE,
      toolRequests: requests,
      toolResults: [],
      toolApprovals: [makeToolApproval("apv-pending", "req-pending")],
    });
    const loaded = await loadState();
    const byId = Object.fromEntries(loaded.toolRequests.map((r) => [r.id, r.status]));
    expect(byId["req-pending"]).toBe("pending_approval");
    expect(byId["req-running"]).toBe("cancelled");
    expect(byId["req-approved"]).toBe("expired");
    expect(byId["req-done"]).toBe("succeeded");
  });
});

describe("tool persistence — caps", () => {
  it(`caps toolRequests at ${TOOL_REQUESTS_CAP} on save`, async () => {
    const requests = Array.from({ length: TOOL_REQUESTS_CAP + 5 }, (_, i) =>
      makeToolRequest(`req-${i}`)
    );
    await saveState({ ...BASE_SAVE, toolRequests: requests, toolResults: [], toolApprovals: [] });
    const loaded = await loadState();
    expect(loaded.toolRequests).toHaveLength(TOOL_REQUESTS_CAP);
    expect(loaded.toolRequests[0].id).toBe("req-0");
  });

  it(`caps toolResults at ${TOOL_RESULTS_CAP} on save`, async () => {
    const requests = Array.from({ length: TOOL_RESULTS_CAP + 5 }, (_, i) =>
      makeToolRequest(`req-${i}`, "succeeded")
    );
    const results = Array.from({ length: TOOL_RESULTS_CAP + 5 }, (_, i) =>
      makeToolResult(`res-${i}`, `req-${i}`)
    );
    await saveState({ ...BASE_SAVE, toolRequests: requests, toolResults: results, toolApprovals: [] });
    const loaded = await loadState();
    expect(loaded.toolResults).toHaveLength(TOOL_RESULTS_CAP);
  });

  it(`caps toolApprovals at ${TOOL_APPROVALS_CAP} on save`, async () => {
    const requests = Array.from({ length: TOOL_APPROVALS_CAP + 5 }, (_, i) =>
      makeToolRequest(`req-${i}`)
    );
    const approvals = Array.from({ length: TOOL_APPROVALS_CAP + 5 }, (_, i) =>
      makeToolApproval(`apv-${i}`, `req-${i}`)
    );
    await saveState({ ...BASE_SAVE, toolRequests: requests, toolResults: [], toolApprovals: approvals });
    const loaded = await loadState();
    expect(loaded.toolApprovals).toHaveLength(TOOL_APPROVALS_CAP);
  });
});

// ─── Phase 2E — STATE_VERSION and toolResultContextEnabled ───────────────────

describe("Phase 2E — STATE_VERSION and toolResultContextEnabled defaults", () => {
  it("STATE_VERSION is 10", () => {
    expect(STATE_VERSION).toBe(10);
  });

  it("DEFAULT_SETTINGS.toolResultContextEnabled is true", () => {
    expect(DEFAULT_SETTINGS.toolResultContextEnabled).toBe(true);
  });

  it("default state includes toolResultContextEnabled: true", async () => {
    const state = await loadState();
    expect(state.settings.toolResultContextEnabled).toBe(true);
  });

  it("round-trip persists toolResultContextEnabled: false", async () => {
    await saveState({
      ...BASE_SAVE,
      settings: { ...DEFAULT_SETTINGS, toolResultContextEnabled: false },
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.settings.toolResultContextEnabled).toBe(false);
  });
});

describe("Phase 2E — v5→v6 migration", () => {
  it("migrates from version 5 and preserves tool collections", async () => {
    const req = makeToolRequest("req-v5");
    const res = makeToolResult("res-v5", "req-v5");
    const apv = makeToolApproval("apv-v5", "req-v5", "approved");
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 5,
        settings: { activeMode: "focus" },
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [req],
        toolResults: [res],
        toolApprovals: [apv],
        savedAt: NOW,
      })
    );
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.toolRequests).toHaveLength(1);
    expect(state.toolResults).toHaveLength(1);
    expect(state.toolApprovals).toHaveLength(1);
    expect(state.toolRequests[0].id).toBe("req-v5");
    expect(state.toolResults[0].id).toBe("res-v5");
    expect(state.toolApprovals[0].id).toBe("apv-v5");
  });

  it("v5→v6 migration preserves settings and adds toolResultContextEnabled default", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 5,
        settings: { activeMode: "cyber", developerMode: true },
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [],
        toolResults: [],
        toolApprovals: [],
        savedAt: NOW,
      })
    );
    const state = await loadState();
    expect(state.settings.activeMode).toBe("cyber");
    expect(state.settings.developerMode).toBe(true);
    expect(state.settings.toolResultContextEnabled).toBe(true);
  });

  it("v5→v6 migration with missing tool collections produces empty arrays", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 5,
        settings: {},
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        savedAt: NOW,
      })
    );
    const state = await loadState();
    expect(state.toolRequests).toEqual([]);
    expect(state.toolResults).toEqual([]);
    expect(state.toolApprovals).toEqual([]);
  });
});

describe("tool persistence — validation", () => {
  it("drops tool requests missing required fields", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [
          { id: "req-valid", toolId: "conversation-stats", status: "pending_approval", createdAt: NOW },
          { toolId: "conversation-stats", status: "pending_approval", createdAt: NOW }, // missing id
          { id: "req-no-tool", status: "pending_approval", createdAt: NOW }, // missing toolId
        ],
        toolResults: [],
        toolApprovals: [],
        savedAt: NOW,
      })
    );
    const loaded = await loadState();
    expect(loaded.toolRequests).toHaveLength(1);
    expect(loaded.toolRequests[0].id).toBe("req-valid");
  });

  it("drops tool approvals with invalid decision value", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [
          { id: "req-1", toolId: "t", toolDisplayName: "T", params: {}, status: "pending_approval", source: "user_command", consequences: "x", createdAt: NOW },
        ],
        toolResults: [],
        toolApprovals: [
          { id: "apv-valid", requestId: "req-1", toolId: "t", createdAt: NOW, decision: null },
          { id: "apv-bad", requestId: "req-2", toolId: "t", createdAt: NOW, decision: "banana" },
        ],
        savedAt: NOW,
      })
    );
    const loaded = await loadState();
    expect(loaded.toolApprovals).toHaveLength(1);
    expect(loaded.toolApprovals[0].id).toBe("apv-valid");
  });
});

// ─── Phase 2F — cleanOrphans ──────────────────────────────────────────────────

const NOW_2F = new Date().toISOString();

function makeStoredRequest(id: string, status: ToolRequest["status"]): ToolRequest {
  return {
    id,
    toolId: "runtime-snapshot",
    toolDisplayName: "Runtime Snapshot",
    params: {},
    status,
    source: "user_command",
    consequences: "test",
    createdAt: NOW_2F,
  };
}

function makeStoredApproval(id: string, requestId: string): ToolApprovalContract {
  return {
    id,
    requestId,
    toolId: "runtime-snapshot",
    toolDisplayName: "Runtime Snapshot",
    consequences: "test",
    decision: null,
    resolvedBy: null,
    createdAt: NOW_2F,
  };
}

function makeStoredResult(id: string, requestId: string): ToolResult {
  return {
    id,
    requestId,
    toolId: "runtime-snapshot",
    outputSummary: "ok",
    succeededAt: NOW_2F,
  };
}

describe("Phase 2F — cleanOrphans on loadState", () => {
  it("removes approval with no matching request", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [makeStoredRequest("req-1", "pending_approval")],
        toolApprovals: [
          makeStoredApproval("apv-1", "req-1"),
          makeStoredApproval("apv-orphan", "req-999"),
        ],
        toolResults: [],
        savedAt: NOW_2F,
      })
    );
    const loaded = await loadState();
    expect(loaded.toolApprovals).toHaveLength(1);
    expect(loaded.toolApprovals[0].id).toBe("apv-1");
  });

  it("removes result with no matching request", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [makeStoredRequest("req-1", "succeeded")],
        toolApprovals: [makeStoredApproval("apv-1", "req-1")],
        toolResults: [
          makeStoredResult("res-1", "req-1"),
          makeStoredResult("res-orphan", "req-999"),
        ],
        savedAt: NOW_2F,
      })
    );
    const loaded = await loadState();
    expect(loaded.toolResults).toHaveLength(1);
    expect(loaded.toolResults[0].id).toBe("res-1");
  });

  it("cancels a pending_approval request missing its approval contract", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [makeStoredRequest("req-orphan", "pending_approval")],
        toolApprovals: [],
        toolResults: [],
        savedAt: NOW_2F,
      })
    );
    const loaded = await loadState();
    expect(loaded.toolRequests[0].status).toBe("cancelled");
  });

  it("approved request without contract becomes expired (restart policy runs before orphan cleanup)", async () => {
    // safeToolRequests converts approved→expired on restart; cleanOrphans then sees expired, not approved
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [makeStoredRequest("req-orphan", "approved")],
        toolApprovals: [],
        toolResults: [],
        savedAt: NOW_2F,
      })
    );
    const loaded = await loadState();
    expect(loaded.toolRequests[0].status).toBe("expired");
  });

  it("does not cancel a succeeded request missing its contract", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [makeStoredRequest("req-done", "succeeded")],
        toolApprovals: [],
        toolResults: [],
        savedAt: NOW_2F,
      })
    );
    const loaded = await loadState();
    expect(loaded.toolRequests[0].status).toBe("succeeded");
  });

  it("clean state passes through without modification", async () => {
    const req = makeStoredRequest("req-1", "pending_approval");
    const apv = makeStoredApproval("apv-1", "req-1");
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [req],
        toolApprovals: [apv],
        toolResults: [],
        savedAt: NOW_2F,
      })
    );
    const loaded = await loadState();
    expect(loaded.toolRequests[0].status).toBe("pending_approval");
    expect(loaded.toolApprovals[0].id).toBe("apv-1");
  });
});

// ─── Phase 4A — screen awareness settings migration ───────────────────────────

describe("Phase 4A — screen awareness DEFAULT_SETTINGS", () => {
  it("DEFAULT_SETTINGS.screenAwarenessEnabled is false", () => {
    expect(DEFAULT_SETTINGS.screenAwarenessEnabled).toBe(false);
  });

  it("DEFAULT_SETTINGS.screenCaptureProvider is 'none'", () => {
    expect(DEFAULT_SETTINGS.screenCaptureProvider).toBe("none");
  });

  it("DEFAULT_SETTINGS.screenContextEnabledForPrompt is false", () => {
    expect(DEFAULT_SETTINGS.screenContextEnabledForPrompt).toBe(false);
  });

  it("DEFAULT_SETTINGS.screenSuppressInPrivacyModes is true", () => {
    expect(DEFAULT_SETTINGS.screenSuppressInPrivacyModes).toBe(true);
  });

  it("default state includes all four screen settings", async () => {
    const state = await loadState();
    expect(state.settings.screenAwarenessEnabled).toBe(false);
    expect(state.settings.screenCaptureProvider).toBe("none");
    expect(state.settings.screenContextEnabledForPrompt).toBe(false);
    expect(state.settings.screenSuppressInPrivacyModes).toBe(true);
  });
});

describe("Phase 4A — screen settings backfill via DEFAULT_SETTINGS spread", () => {
  it("v9 state without screenAwarenessEnabled gets false default", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: STATE_VERSION,
      settings: { ollamaModel: "llama3.2:1b" },
      missions: [], approvals: [], auditEvents: [],
      conversationHistory: [], memoryNotes: [],
      toolRequests: [], toolApprovals: [], toolResults: [],
      savedAt: new Date().toISOString(),
    }));
    const state = await loadState();
    expect(state.settings.screenAwarenessEnabled).toBe(false);
  });

  it("v9 state without screenCaptureProvider gets 'none' default", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: STATE_VERSION,
      settings: { ollamaModel: "llama3.2:1b" },
      missions: [], approvals: [], auditEvents: [],
      conversationHistory: [], memoryNotes: [],
      toolRequests: [], toolApprovals: [], toolResults: [],
      savedAt: new Date().toISOString(),
    }));
    const state = await loadState();
    expect(state.settings.screenCaptureProvider).toBe("none");
  });

  it("v9 state without screenSuppressInPrivacyModes gets true default", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: STATE_VERSION,
      settings: { ollamaModel: "llama3.2:1b" },
      missions: [], approvals: [], auditEvents: [],
      conversationHistory: [], memoryNotes: [],
      toolRequests: [], toolApprovals: [], toolResults: [],
      savedAt: new Date().toISOString(),
    }));
    const state = await loadState();
    expect(state.settings.screenSuppressInPrivacyModes).toBe(true);
  });

  it("existing settings are preserved when screen fields are added by spread", async () => {
    localStorage.setItem("lisa_state_v1", JSON.stringify({
      version: STATE_VERSION,
      settings: { activeMode: "cyber", developerMode: true, ollamaModel: "llama3.2:1b" },
      missions: [], approvals: [], auditEvents: [],
      conversationHistory: [], memoryNotes: [],
      toolRequests: [], toolApprovals: [], toolResults: [],
      savedAt: new Date().toISOString(),
    }));
    const state = await loadState();
    expect(state.settings.activeMode).toBe("cyber");
    expect(state.settings.developerMode).toBe(true);
    expect(state.settings.ollamaModel).toBe("llama3.2:1b");
    expect(state.settings.screenAwarenessEnabled).toBe(false);
  });

  it("round-trip persists screenAwarenessEnabled: true", async () => {
    await saveState({
      ...BASE_SAVE,
      settings: { ...DEFAULT_SETTINGS, screenAwarenessEnabled: true },
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.settings.screenAwarenessEnabled).toBe(true);
  });

  it("round-trip persists screenContextEnabledForPrompt: true", async () => {
    await saveState({
      ...BASE_SAVE,
      settings: { ...DEFAULT_SETTINGS, screenContextEnabledForPrompt: true },
      ...EMPTY_TOOLS,
    });
    const loaded = await loadState();
    expect(loaded.settings.screenContextEnabledForPrompt).toBe(true);
  });
});

describe("Phase 3E — voice output settings migration", () => {
  it("state without voiceOutputEnabled gets false default", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: { ollamaModel: "llama3.2:1b" },
        missions: [], approvals: [], auditEvents: [],
        conversationHistory: [], memoryNotes: [],
        toolRequests: [], toolApprovals: [], toolResults: [],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.settings.voiceOutputEnabled).toBe(false);
  });

  it("state without voiceOutputAutoSpeak gets false default", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: { ollamaModel: "llama3.2:1b" },
        missions: [], approvals: [], auditEvents: [],
        conversationHistory: [], memoryNotes: [],
        toolRequests: [], toolApprovals: [], toolResults: [],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.settings.voiceOutputAutoSpeak).toBe(false);
  });

  it("state without voiceOutputSuppressInPrivacyModes gets true default", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: { ollamaModel: "llama3.2:1b" },
        missions: [], approvals: [], auditEvents: [],
        conversationHistory: [], memoryNotes: [],
        toolRequests: [], toolApprovals: [], toolResults: [],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.settings.voiceOutputSuppressInPrivacyModes).toBe(true);
  });

  it("default state includes voice output settings", async () => {
    const state = await loadState();
    expect(state.settings.voiceOutputEnabled).toBe(false);
    expect(state.settings.voiceOutputAutoSpeak).toBe(false);
    expect(state.settings.voiceOutputProvider).toBe("windows");
    expect(state.settings.voiceOutputSuppressInPrivacyModes).toBe(true);
  });
});

describe("Phase 4C — OCR settings defaults", () => {
  it("STATE_VERSION is 10", () => {
    expect(STATE_VERSION).toBe(10);
  });

  it("DEFAULT_SETTINGS has screenOcrEnabled false", () => {
    expect(DEFAULT_SETTINGS.screenOcrEnabled).toBe(false);
  });

  it("DEFAULT_SETTINGS has screenTextEnabledForPrompt false", () => {
    expect(DEFAULT_SETTINGS.screenTextEnabledForPrompt).toBe(false);
  });

  it("DEFAULT_SETTINGS has screenOcrSuppressInPrivacyModes true", () => {
    expect(DEFAULT_SETTINGS.screenOcrSuppressInPrivacyModes).toBe(true);
  });

  it("DEFAULT_SETTINGS has showScreenTextPreview true", () => {
    expect(DEFAULT_SETTINGS.showScreenTextPreview).toBe(true);
  });

  it("state without screenOcrEnabled gets false default on load", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: { ollamaModel: "llama3.2:1b" },
        missions: [], approvals: [], auditEvents: [],
        conversationHistory: [], memoryNotes: [],
        toolRequests: [], toolApprovals: [], toolResults: [],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.settings.screenOcrEnabled).toBe(false);
    expect(state.settings.screenTextEnabledForPrompt).toBe(false);
    expect(state.settings.screenOcrSuppressInPrivacyModes).toBe(true);
    expect(state.settings.showScreenTextPreview).toBe(true);
  });

  it("OCR state is not persisted — loaded state has no screenOcrStatus field", async () => {
    const state = await loadState();
    expect((state as unknown as Record<string, unknown>).screenOcrStatus).toBeUndefined();
  });
});

describe("Phase 4D — grounded screen reasoning remains transient", () => {
  it("does not persist transient OCR text passed alongside saveable state", async () => {
    await saveState({
      ...BASE_SAVE,
      ...EMPTY_TOOLS,
      screenOcrText: "SENSITIVE OCR BODY",
    } as Parameters<typeof saveState>[0] & { screenOcrText: string });
    const raw = localStorage.getItem("lisa_state_v1") ?? "";
    expect(raw).not.toContain("SENSITIVE OCR BODY");
    expect(raw).not.toContain("screenOcrText");
  });
});
