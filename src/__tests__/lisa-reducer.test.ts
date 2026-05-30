import { describe, it, expect } from "vitest";
import { lisaReducer, initialState } from "../app/lisa-reducer";
import { INTERACTION_CAP, CONVERSATION_HISTORY_CAP } from "../core/types";
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
