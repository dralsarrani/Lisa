import { describe, it, expect } from "vitest";
import { lisaReducer, initialState } from "../app/lisa-reducer";
import { INTERACTION_CAP } from "../core/types";
import type { LisaInteraction } from "../core/types";

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
