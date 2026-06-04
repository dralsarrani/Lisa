import { describe, it, expect } from "vitest";
import { lisaReducer, initialState } from "../app/lisa-reducer";
import { INTERACTION_CAP, CONVERSATION_HISTORY_CAP, MEMORY_NOTES_CAP, MEMORY_NOTE_CHAR_LIMIT } from "../core/types";
import type { LisaInteraction, LisaConversationTurn } from "../core/types";

function makeInteraction(
  id: string,
  overrides: Partial<LisaInteraction> = {}
): LisaInteraction {
  return {
    id,
    kind: "local_ai",
    prompt: "test prompt",
    response: "",
    status: "thinking",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── ADD_INTERACTION ──────────────────────────────────────────────────────────

describe("ADD_INTERACTION", () => {
  it("adds an interaction to the end of the list", () => {
    const ix = makeInteraction("id-1");
    const next = lisaReducer(initialState, { type: "ADD_INTERACTION", payload: ix });
    expect(next.interactions).toHaveLength(1);
    expect(next.interactions[0].id).toBe("id-1");
  });

  it("appends in order — newest is last", () => {
    let state = initialState;
    state = lisaReducer(state, { type: "ADD_INTERACTION", payload: makeInteraction("id-a") });
    state = lisaReducer(state, { type: "ADD_INTERACTION", payload: makeInteraction("id-b") });
    expect(state.interactions[0].id).toBe("id-a");
    expect(state.interactions[1].id).toBe("id-b");
  });

  it(`caps interactions at INTERACTION_CAP (${INTERACTION_CAP}) — oldest are dropped`, () => {
    let state = initialState;
    for (let i = 0; i < INTERACTION_CAP + 5; i++) {
      state = lisaReducer(state, {
        type: "ADD_INTERACTION",
        payload: makeInteraction(`id-${i}`),
      });
    }
    expect(state.interactions).toHaveLength(INTERACTION_CAP);
    expect(state.interactions[INTERACTION_CAP - 1].id).toBe(`id-${INTERACTION_CAP + 4}`);
    expect(state.interactions[0].id).toBe("id-5");
  });

  it("does not mutate initialState", () => {
    const ix = makeInteraction("id-1");
    lisaReducer(initialState, { type: "ADD_INTERACTION", payload: ix });
    expect(initialState.interactions).toHaveLength(0);
  });

  it("preserves all fields of the added interaction", () => {
    const ix = makeInteraction("id-full", {
      kind: "command",
      prompt: "activate focus mode",
      response: "Mode changed.",
      status: "complete",
      model: "llama3.2:1b",
      latencyMs: 1234,
    });
    const next = lisaReducer(initialState, { type: "ADD_INTERACTION", payload: ix });
    const stored = next.interactions[0];
    expect(stored.kind).toBe("command");
    expect(stored.response).toBe("Mode changed.");
    expect(stored.latencyMs).toBe(1234);
  });
});

// ─── UPDATE_INTERACTION ───────────────────────────────────────────────────────

describe("UPDATE_INTERACTION", () => {
  it("updates status and response of an existing interaction", () => {
    let state = lisaReducer(initialState, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-1"),
    });
    state = lisaReducer(state, {
      type: "UPDATE_INTERACTION",
      payload: { id: "id-1", status: "complete", response: "Here is your answer." },
    });
    const updated = state.interactions.find((i) => i.id === "id-1");
    expect(updated?.status).toBe("complete");
    expect(updated?.response).toBe("Here is your answer.");
  });

  it("marks an interaction as failed with an error field", () => {
    let state = lisaReducer(initialState, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-fail"),
    });
    state = lisaReducer(state, {
      type: "UPDATE_INTERACTION",
      payload: { id: "id-fail", status: "failed", error: "Ollama timed out." },
    });
    const updated = state.interactions.find((i) => i.id === "id-fail");
    expect(updated?.status).toBe("failed");
    expect(updated?.error).toBe("Ollama timed out.");
  });

  it("records latencyMs on completion", () => {
    let state = lisaReducer(initialState, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-latency"),
    });
    state = lisaReducer(state, {
      type: "UPDATE_INTERACTION",
      payload: { id: "id-latency", status: "complete", response: "Done", latencyMs: 4200 },
    });
    expect(state.interactions.find((i) => i.id === "id-latency")?.latencyMs).toBe(4200);
  });

  it("does not affect other interactions", () => {
    let state = initialState;
    state = lisaReducer(state, { type: "ADD_INTERACTION", payload: makeInteraction("id-a") });
    state = lisaReducer(state, { type: "ADD_INTERACTION", payload: makeInteraction("id-b") });
    state = lisaReducer(state, {
      type: "UPDATE_INTERACTION",
      payload: { id: "id-a", status: "complete", response: "Done" },
    });
    expect(state.interactions.find((i) => i.id === "id-b")?.status).toBe("thinking");
  });

  it("is a no-op when the id is unknown", () => {
    let state = lisaReducer(initialState, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-1"),
    });
    state = lisaReducer(state, {
      type: "UPDATE_INTERACTION",
      payload: { id: "no-such-id", status: "complete" },
    });
    expect(state.interactions).toHaveLength(1);
    expect(state.interactions[0].status).toBe("thinking");
  });

  it("preserves immutability — original interaction object is not mutated", () => {
    const ix = makeInteraction("id-immut");
    const state = lisaReducer(initialState, { type: "ADD_INTERACTION", payload: ix });
    lisaReducer(state, {
      type: "UPDATE_INTERACTION",
      payload: { id: "id-immut", status: "complete", response: "New text" },
    });
    expect(ix.status).toBe("thinking");
  });
});

// ─── APPEND_INTERACTION_CONTENT ───────────────────────────────────────────────

describe("APPEND_INTERACTION_CONTENT", () => {
  it("appends chunk to a streaming interaction", () => {
    let state = lisaReducer(initialState, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-1", { status: "streaming" }),
    });
    state = lisaReducer(state, {
      type: "APPEND_INTERACTION_CONTENT",
      payload: { id: "id-1", chunk: "Hello " },
    });
    state = lisaReducer(state, {
      type: "APPEND_INTERACTION_CONTENT",
      payload: { id: "id-1", chunk: "world" },
    });
    expect(state.interactions[0].response).toBe("Hello world");
  });

  it("does not append chunk to a cancelled interaction", () => {
    let state = lisaReducer(initialState, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-1", { status: "streaming", response: "Partial" }),
    });
    state = lisaReducer(state, {
      type: "ABORT_INTERACTION",
      payload: { id: "id-1", completedAt: new Date().toISOString() },
    });
    state = lisaReducer(state, {
      type: "APPEND_INTERACTION_CONTENT",
      payload: { id: "id-1", chunk: " stale chunk" },
    });
    expect(state.interactions[0].response).toBe("Partial");
  });
});

// ─── ABORT_INTERACTION ────────────────────────────────────────────────────────

describe("ABORT_INTERACTION", () => {
  it("marks the interaction as cancelled", () => {
    const completedAt = new Date().toISOString();
    let state = lisaReducer(initialState, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-1", { status: "streaming" }),
    });
    state = lisaReducer(state, {
      type: "ABORT_INTERACTION",
      payload: { id: "id-1", completedAt },
    });
    const ix = state.interactions.find((i) => i.id === "id-1");
    expect(ix?.status).toBe("cancelled");
    expect(ix?.completedAt).toBe(completedAt);
  });

  it("records latencyMs when provided", () => {
    let state = lisaReducer(initialState, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-1", { status: "streaming" }),
    });
    state = lisaReducer(state, {
      type: "ABORT_INTERACTION",
      payload: { id: "id-1", completedAt: new Date().toISOString(), latencyMs: 3200 },
    });
    expect(state.interactions[0].latencyMs).toBe(3200);
  });

  it("resets orbState to idle", () => {
    let state = lisaReducer(initialState, { type: "SET_ORB_STATE", payload: "speaking" });
    state = lisaReducer(state, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-1"),
    });
    state = lisaReducer(state, {
      type: "ABORT_INTERACTION",
      payload: { id: "id-1", completedAt: new Date().toISOString() },
    });
    expect(state.orbState).toBe("idle");
  });

  it("does not affect other interactions", () => {
    let state = initialState;
    state = lisaReducer(state, { type: "ADD_INTERACTION", payload: makeInteraction("id-a") });
    state = lisaReducer(state, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-b", { status: "streaming" }),
    });
    state = lisaReducer(state, {
      type: "ABORT_INTERACTION",
      payload: { id: "id-b", completedAt: new Date().toISOString() },
    });
    expect(state.interactions.find((i) => i.id === "id-a")?.status).toBe("thinking");
    expect(state.interactions.find((i) => i.id === "id-b")?.status).toBe("cancelled");
  });

  it("is a no-op when id is unknown", () => {
    let state = lisaReducer(initialState, {
      type: "ADD_INTERACTION",
      payload: makeInteraction("id-1"),
    });
    state = lisaReducer(state, {
      type: "ABORT_INTERACTION",
      payload: { id: "no-such-id", completedAt: new Date().toISOString() },
    });
    expect(state.interactions[0].status).toBe("thinking");
  });
});

// ─── APPEND_CONVERSATION_TURN ─────────────────────────────────────────────────

function makeTurn(n: number): LisaConversationTurn {
  return {
    userInput: `q${n}`,
    assistantResponse: `a${n}`,
    timestamp: new Date().toISOString(),
    model: "llama3.2:1b",
  };
}

describe("APPEND_CONVERSATION_TURN", () => {
  it("appends a turn to an empty history", () => {
    const turn = makeTurn(1);
    const next = lisaReducer(initialState, { type: "APPEND_CONVERSATION_TURN", payload: turn });
    expect(next.conversationHistory).toHaveLength(1);
    expect(next.conversationHistory[0].userInput).toBe("q1");
  });

  it("appends turns in order", () => {
    let state = lisaReducer(initialState, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(1) });
    state = lisaReducer(state, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(2) });
    expect(state.conversationHistory[0].userInput).toBe("q1");
    expect(state.conversationHistory[1].userInput).toBe("q2");
  });

  it("does not mutate the previous state", () => {
    const turn = makeTurn(1);
    const before = initialState.conversationHistory;
    lisaReducer(initialState, { type: "APPEND_CONVERSATION_TURN", payload: turn });
    expect(before).toHaveLength(0);
  });

  it("trims oldest turns when CONVERSATION_HISTORY_CAP is exceeded", () => {
    let state = initialState;
    for (let i = 0; i < CONVERSATION_HISTORY_CAP + 5; i++) {
      state = lisaReducer(state, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(i) });
    }
    const cap = Math.min(state.settings.maxContextTurns, CONVERSATION_HISTORY_CAP);
    expect(state.conversationHistory.length).toBeLessThanOrEqual(cap);
    expect(state.conversationHistory[state.conversationHistory.length - 1].userInput).toBe(
      `q${CONVERSATION_HISTORY_CAP + 4}`
    );
  });
});

// ─── CLEAR_CONVERSATION_HISTORY ───────────────────────────────────────────────

describe("CLEAR_CONVERSATION_HISTORY", () => {
  it("clears non-empty conversation history", () => {
    let state = lisaReducer(initialState, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(1) });
    state = lisaReducer(state, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(2) });
    expect(state.conversationHistory).toHaveLength(2);
    const cleared = lisaReducer(state, { type: "CLEAR_CONVERSATION_HISTORY" });
    expect(cleared.conversationHistory).toEqual([]);
  });

  it("is safe when history is already empty", () => {
    const next = lisaReducer(initialState, { type: "CLEAR_CONVERSATION_HISTORY" });
    expect(next.conversationHistory).toEqual([]);
  });

  it("does not mutate previous state", () => {
    const state = lisaReducer(initialState, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(1) });
    const before = state.conversationHistory;
    lisaReducer(state, { type: "CLEAR_CONVERSATION_HISTORY" });
    expect(before).toHaveLength(1);
  });

  it("leaves interactions untouched", () => {
    const ix = makeInteraction("ix-clear");
    let state = lisaReducer(initialState, { type: "ADD_INTERACTION", payload: ix });
    state = lisaReducer(state, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(1) });
    const cleared = lisaReducer(state, { type: "CLEAR_CONVERSATION_HISTORY" });
    expect(cleared.conversationHistory).toEqual([]);
    expect(cleared.interactions).toHaveLength(1);
    expect(cleared.interactions[0].id).toBe("ix-clear");
  });
});

// ─── INTERACTION_CAP constant ─────────────────────────────────────────────────

describe("INTERACTION_CAP", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(INTERACTION_CAP)).toBe(true);
    expect(INTERACTION_CAP).toBeGreaterThan(0);
  });

  it("is at most 50 to keep memory bounded", () => {
    expect(INTERACTION_CAP).toBeLessThanOrEqual(50);
  });
});

// ─── ADD_MEMORY_NOTE ──────────────────────────────────────────────────────────

describe("ADD_MEMORY_NOTE", () => {
  it("adds a note to an empty list", () => {
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "prefer TypeScript" });
    expect(next.memoryNotes).toHaveLength(1);
    expect(next.memoryNotes[0].content).toBe("prefer TypeScript");
    expect(typeof next.memoryNotes[0].id).toBe("string");
    expect(typeof next.memoryNotes[0].createdAt).toBe("string");
  });

  it("trims whitespace from the note content", () => {
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "  trimmed  " });
    expect(next.memoryNotes[0].content).toBe("trimmed");
  });

  it("rejects empty or whitespace-only content", () => {
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "   " });
    expect(next.memoryNotes).toHaveLength(0);
  });

  it(`rejects content over MEMORY_NOTE_CHAR_LIMIT (${MEMORY_NOTE_CHAR_LIMIT} chars)`, () => {
    const over = "x".repeat(MEMORY_NOTE_CHAR_LIMIT + 1);
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: over });
    expect(next.memoryNotes).toHaveLength(0);
  });

  it(`accepts content exactly at MEMORY_NOTE_CHAR_LIMIT`, () => {
    const exact = "a".repeat(MEMORY_NOTE_CHAR_LIMIT);
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: exact });
    expect(next.memoryNotes).toHaveLength(1);
  });

  it(`caps notes at MEMORY_NOTES_CAP (${MEMORY_NOTES_CAP}) — oldest are dropped`, () => {
    let state = initialState;
    for (let i = 0; i < MEMORY_NOTES_CAP + 3; i++) {
      state = lisaReducer(state, { type: "ADD_MEMORY_NOTE", payload: `note ${i}` });
    }
    expect(state.memoryNotes).toHaveLength(MEMORY_NOTES_CAP);
    expect(state.memoryNotes[MEMORY_NOTES_CAP - 1].content).toBe(`note ${MEMORY_NOTES_CAP + 2}`);
  });

  it("does not mutate initialState", () => {
    lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "side effect?" });
    expect(initialState.memoryNotes).toHaveLength(0);
  });
});

// ─── DELETE_MEMORY_NOTE ───────────────────────────────────────────────────────

describe("DELETE_MEMORY_NOTE", () => {
  it("removes the note with the given id", () => {
    let state = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "keep me" });
    state = lisaReducer(state, { type: "ADD_MEMORY_NOTE", payload: "delete me" });
    const idToDelete = state.memoryNotes[1].id;
    const next = lisaReducer(state, { type: "DELETE_MEMORY_NOTE", payload: idToDelete });
    expect(next.memoryNotes).toHaveLength(1);
    expect(next.memoryNotes[0].content).toBe("keep me");
  });

  it("is a no-op when the id is unknown", () => {
    let state = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "stay" });
    state = lisaReducer(state, { type: "DELETE_MEMORY_NOTE", payload: "nonexistent-id" });
    expect(state.memoryNotes).toHaveLength(1);
  });
});

// ─── CLEAR_MEMORY_NOTES ───────────────────────────────────────────────────────

describe("CLEAR_MEMORY_NOTES", () => {
  it("clears all notes", () => {
    let state = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "note 1" });
    state = lisaReducer(state, { type: "ADD_MEMORY_NOTE", payload: "note 2" });
    const cleared = lisaReducer(state, { type: "CLEAR_MEMORY_NOTES" });
    expect(cleared.memoryNotes).toEqual([]);
  });

  it("is safe when notes are already empty", () => {
    const next = lisaReducer(initialState, { type: "CLEAR_MEMORY_NOTES" });
    expect(next.memoryNotes).toEqual([]);
  });

  it("leaves conversationHistory, interactions, and settings untouched", () => {
    let state = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "note" });
    state = lisaReducer(state, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(1) });
    state = lisaReducer(state, { type: "ADD_INTERACTION", payload: makeInteraction("ix-1") });
    const cleared = lisaReducer(state, { type: "CLEAR_MEMORY_NOTES" });
    expect(cleared.memoryNotes).toEqual([]);
    expect(cleared.conversationHistory).toHaveLength(1);
    expect(cleared.interactions).toHaveLength(1);
  });
});

// ─── Phase 2J — channel boundary isolation ───────────────────────────────────

import type { ToolResult, MemoryNote } from "../core/types";

function makeToolResult(id: string): ToolResult {
  return {
    id,
    requestId: `req-${id}`,
    toolId: "conversation-stats",
    outputSummary: "Total turns: 2.",
    succeededAt: new Date().toISOString(),
  };
}

function makeMemoryNote(content: string): MemoryNote {
  return { id: crypto.randomUUID(), content, createdAt: new Date().toISOString(), source: "manual" };
}

describe("Phase 2J — CLEAR_MEMORY_NOTES channel isolation", () => {
  it("does not change conversationHistory", () => {
    let state = lisaReducer(initialState, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(1) });
    state = lisaReducer(state, { type: "ADD_MEMORY_NOTE", payload: "some note" });
    const next = lisaReducer(state, { type: "CLEAR_MEMORY_NOTES" });
    expect(next.memoryNotes).toHaveLength(0);
    expect(next.conversationHistory).toHaveLength(1);
    expect(next.conversationHistory[0].userInput).toBe("q1");
  });

  it("does not change toolResults", () => {
    const state = {
      ...initialState,
      memoryNotes: [makeMemoryNote("note")],
      toolResults: [makeToolResult("res-1")],
    };
    const next = lisaReducer(state, { type: "CLEAR_MEMORY_NOTES" });
    expect(next.memoryNotes).toHaveLength(0);
    expect(next.toolResults).toHaveLength(1);
    expect(next.toolResults[0].id).toBe("res-1");
  });
});

describe("Phase 2J — CLEAR_CONVERSATION_HISTORY channel isolation", () => {
  it("does not change memoryNotes", () => {
    let state = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "keep this note" });
    state = lisaReducer(state, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(1) });
    const next = lisaReducer(state, { type: "CLEAR_CONVERSATION_HISTORY" });
    expect(next.conversationHistory).toHaveLength(0);
    expect(next.memoryNotes).toHaveLength(1);
    expect(next.memoryNotes[0].content).toBe("keep this note");
  });

  it("does not change toolResults", () => {
    const state = {
      ...initialState,
      conversationHistory: [makeTurn(1)],
      toolResults: [makeToolResult("res-2")],
    };
    const next = lisaReducer(state, { type: "CLEAR_CONVERSATION_HISTORY" });
    expect(next.conversationHistory).toHaveLength(0);
    expect(next.toolResults).toHaveLength(1);
    expect(next.toolResults[0].id).toBe("res-2");
  });
});

describe("Phase 2J — DELETE_MEMORY_NOTE channel isolation", () => {
  it("does not change conversationHistory", () => {
    let state = lisaReducer(initialState, { type: "APPEND_CONVERSATION_TURN", payload: makeTurn(1) });
    state = lisaReducer(state, { type: "ADD_MEMORY_NOTE", payload: "delete me" });
    const noteId = state.memoryNotes[0].id;
    const next = lisaReducer(state, { type: "DELETE_MEMORY_NOTE", payload: noteId });
    expect(next.memoryNotes).toHaveLength(0);
    expect(next.conversationHistory).toHaveLength(1);
  });

  it("does not change toolResults", () => {
    const note = makeMemoryNote("delete me");
    const state = {
      ...initialState,
      memoryNotes: [note],
      toolResults: [makeToolResult("res-3")],
    };
    const next = lisaReducer(state, { type: "DELETE_MEMORY_NOTE", payload: note.id });
    expect(next.memoryNotes).toHaveLength(0);
    expect(next.toolResults).toHaveLength(1);
  });
});

// ─── Phase 2K — MemoryNote source field ───────────────────────────────────────

import type { MemoryNoteSource } from "../core/types";

describe("Phase 2K — ADD_MEMORY_NOTE source field", () => {
  it("plain string payload defaults to source: manual", () => {
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "note text" });
    expect(next.memoryNotes[0].source).toBe("manual");
  });

  it("object payload with source: manual stores manual", () => {
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: { content: "note", source: "manual" } });
    expect(next.memoryNotes[0].source).toBe("manual");
  });

  it("object payload with source: tool_result stores tool_result", () => {
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: { content: "note", source: "tool_result" as MemoryNoteSource } });
    expect(next.memoryNotes[0].source).toBe("tool_result");
  });

  it("object payload without source defaults to manual", () => {
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: { content: "note" } });
    expect(next.memoryNotes[0].source).toBe("manual");
  });

  it("note content is still stored correctly alongside source", () => {
    const next = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: { content: "hello world", source: "tool_result" as MemoryNoteSource } });
    expect(next.memoryNotes[0].content).toBe("hello world");
    expect(next.memoryNotes[0].source).toBe("tool_result");
  });

  it("cap still applies across mixed sources", () => {
    let state = initialState;
    for (let i = 0; i < 20; i++) {
      state = lisaReducer(state, { type: "ADD_MEMORY_NOTE", payload: { content: `note ${i}`, source: i % 2 === 0 ? "manual" : ("tool_result" as MemoryNoteSource) } });
    }
    expect(state.memoryNotes).toHaveLength(20);
    const next = lisaReducer(state, { type: "ADD_MEMORY_NOTE", payload: "overflow note" });
    expect(next.memoryNotes).toHaveLength(20);
  });
});

describe("Phase 2K — COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE stores tool_result source", () => {
  function makeRunningState() {
    const request: import("../core/types").ToolRequest = {
      id: "req-k1", toolId: "save-tool-result-memory-note", toolDisplayName: "Save", params: {},
      status: "running", source: "result_action", consequences: "adds note",
      createdAt: new Date().toISOString(), startedAt: new Date().toISOString(),
    };
    const approval: import("../core/types").ToolApprovalContract = {
      id: "apv-k1", requestId: "req-k1", toolId: "save-tool-result-memory-note",
      toolDisplayName: "Save", consequences: "adds note",
      decision: "approved", resolvedBy: "operator",
      createdAt: new Date().toISOString(), resolvedAt: new Date().toISOString(),
    };
    return { ...initialState, toolRequests: [request], toolApprovals: [approval] };
  }

  it("creates note with source: tool_result", () => {
    const result: ToolResult = { id: "res-k1", requestId: "req-k1", toolId: "save-tool-result-memory-note", outputSummary: "ok", succeededAt: new Date().toISOString() };
    const auditEvent = { id: "a1", timestamp: new Date().toISOString(), eventType: "tool_execution_succeeded" as const, source: "runner", summary: "done", severity: "info" as const };
    const memAudit = { id: "a2", timestamp: new Date().toISOString(), eventType: "memory_note_added" as const, source: "runner", summary: "note added", severity: "info" as const };
    const next = lisaReducer(makeRunningState(), {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: { requestId: "req-k1", result, completedAt: new Date().toISOString(), memoryNoteContent: "saved note", auditEvent, memoryNoteAuditEvent: memAudit },
    });
    expect(next.memoryNotes).toHaveLength(1);
    expect(next.memoryNotes[0].source).toBe("tool_result");
    expect(next.memoryNotes[0].content).toBe("saved note");
  });

  it("guard: non-running request does not add note", () => {
    const stateWithSucceeded = {
      ...makeRunningState(),
      toolRequests: [{ ...makeRunningState().toolRequests[0], status: "succeeded" as const }],
    };
    const result: ToolResult = { id: "res-k2", requestId: "req-k1", toolId: "save-tool-result-memory-note", outputSummary: "ok", succeededAt: new Date().toISOString() };
    const auditEvent = { id: "a3", timestamp: new Date().toISOString(), eventType: "tool_execution_succeeded" as const, source: "runner", summary: "done", severity: "info" as const };
    const memAudit = { id: "a4", timestamp: new Date().toISOString(), eventType: "memory_note_added" as const, source: "runner", summary: "note added", severity: "info" as const };
    const next = lisaReducer(stateWithSucceeded, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: { requestId: "req-k1", result, completedAt: new Date().toISOString(), memoryNoteContent: "should not add", auditEvent, memoryNoteAuditEvent: memAudit },
    });
    expect(next.memoryNotes).toHaveLength(0);
  });
});

describe("Phase 2K — source preserved through delete and clear", () => {
  it("DELETE_MEMORY_NOTE removes tool_result note by id", () => {
    const state = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: { content: "tool note", source: "tool_result" as MemoryNoteSource } });
    const noteId = state.memoryNotes[0].id;
    const next = lisaReducer(state, { type: "DELETE_MEMORY_NOTE", payload: noteId });
    expect(next.memoryNotes).toHaveLength(0);
  });

  it("CLEAR_MEMORY_NOTES clears notes of all sources", () => {
    let state = lisaReducer(initialState, { type: "ADD_MEMORY_NOTE", payload: "manual note" });
    state = lisaReducer(state, { type: "ADD_MEMORY_NOTE", payload: { content: "tool note", source: "tool_result" as MemoryNoteSource } });
    expect(state.memoryNotes).toHaveLength(2);
    const next = lisaReducer(state, { type: "CLEAR_MEMORY_NOTES" });
    expect(next.memoryNotes).toHaveLength(0);
  });
});
