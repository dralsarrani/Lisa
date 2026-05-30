import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState } from "../core/persistence";
import { createAuditEvent } from "../core/audit-store";
import { DEFAULT_SETTINGS, STATE_VERSION, CONVERSATION_HISTORY_CAP, MEMORY_NOTES_CAP, MEMORY_NOTE_CHAR_LIMIT } from "../core/types";
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
