import { describe, it, expect } from "vitest";
import { executeConversationStats, executeRuntimeSnapshot } from "../core/tool-executors";
import { initialState } from "../app/lisa-reducer";
import type { LisaState } from "../app/lisa-reducer";
import type { LisaConversationTurn, RuntimeHealth } from "../core/types";

const NOOP_SIGNAL = new AbortController().signal;

function makeTurn(n: number, model = "llama3.2:1b"): LisaConversationTurn {
  return {
    userInput: `question ${n}`,
    assistantResponse: `answer ${n}`,
    timestamp: new Date(Date.UTC(2025, 0, n)).toISOString(),
    model,
  };
}

const BASE_HEALTH: RuntimeHealth = {
  backendReachable: true,
  appVersion: "0.1.0-test",
  osType: "Windows",
  osVersion: "11",
  arch: "x86_64",
  timestamp: new Date(Date.UTC(2025, 0, 1)).toISOString(),
  ollamaStatus: "available",
  dockerStatus: "not_configured",
  lastChecked: new Date(Date.UTC(2025, 0, 1)).toISOString(),
};

// ─── executeConversationStats ─────────────────────────────────────────────────

describe("executeConversationStats — empty history", () => {
  it("returns 0-turn message when history is empty", async () => {
    const { outputSummary } = await executeConversationStats({}, initialState, NOOP_SIGNAL);
    expect(outputSummary).toBe("Conversation history: 0 turns stored.");
  });
});

describe("executeConversationStats — with turns", () => {
  it("reports total turn count", async () => {
    const state: LisaState = { ...initialState, conversationHistory: [makeTurn(1), makeTurn(2), makeTurn(3)] };
    const { outputSummary } = await executeConversationStats({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("3 turns");
  });

  it("reports singular 'turn' for exactly 1 entry", async () => {
    const state: LisaState = { ...initialState, conversationHistory: [makeTurn(1)] };
    const { outputSummary } = await executeConversationStats({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("1 turn");
    expect(outputSummary).not.toContain("1 turns");
  });

  it("reports unique model names", async () => {
    const turns = [makeTurn(1, "llama3.2:1b"), makeTurn(2, "mistral"), makeTurn(3, "llama3.2:1b")];
    const state: LisaState = { ...initialState, conversationHistory: turns };
    const { outputSummary } = await executeConversationStats({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("llama3.2:1b");
    expect(outputSummary).toContain("mistral");
  });

  it("shows 'none' when all model fields are empty", async () => {
    const turns = [
      { userInput: "hi", assistantResponse: "hello", timestamp: new Date().toISOString(), model: "" },
    ];
    const state: LisaState = { ...initialState, conversationHistory: turns };
    const { outputSummary } = await executeConversationStats({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("none");
  });

  it("includes total character count line", async () => {
    const state: LisaState = { ...initialState, conversationHistory: [makeTurn(1)] };
    const { outputSummary } = await executeConversationStats({}, state, NOOP_SIGNAL);
    expect(outputSummary).toMatch(/Total content:.*characters/);
  });

  it("character count matches input + response lengths", async () => {
    const turns = [makeTurn(1), makeTurn(2)];
    const expected = turns.reduce((s, t) => s + t.userInput.length + t.assistantResponse.length, 0);
    const state: LisaState = { ...initialState, conversationHistory: turns };
    const { outputSummary } = await executeConversationStats({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain(expected.toLocaleString());
  });

  it("ignores params argument (no parameters used)", async () => {
    const state: LisaState = { ...initialState, conversationHistory: [makeTurn(1)] };
    const r1 = await executeConversationStats({}, state, NOOP_SIGNAL);
    const r2 = await executeConversationStats({ unused: "value" }, state, NOOP_SIGNAL);
    expect(r1.outputSummary).toBe(r2.outputSummary);
  });
});

// ─── executeRuntimeSnapshot ───────────────────────────────────────────────────

describe("executeRuntimeSnapshot — no health data", () => {
  it("returns fallback message when runtimeHealth is null", async () => {
    const { outputSummary } = await executeRuntimeSnapshot({}, initialState, NOOP_SIGNAL);
    expect(outputSummary).toContain("No runtime health data available");
  });
});

describe("executeRuntimeSnapshot — with health data", () => {
  it("includes backend reachability", async () => {
    const state: LisaState = { ...initialState, runtimeHealth: BASE_HEALTH };
    const { outputSummary } = await executeRuntimeSnapshot({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("reachable");
  });

  it("reports unreachable when backendReachable is false", async () => {
    const state: LisaState = { ...initialState, runtimeHealth: { ...BASE_HEALTH, backendReachable: false } };
    const { outputSummary } = await executeRuntimeSnapshot({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("unreachable");
  });

  it("includes app version", async () => {
    const state: LisaState = { ...initialState, runtimeHealth: BASE_HEALTH };
    const { outputSummary } = await executeRuntimeSnapshot({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("0.1.0-test");
  });

  it("includes OS type", async () => {
    const state: LisaState = { ...initialState, runtimeHealth: BASE_HEALTH };
    const { outputSummary } = await executeRuntimeSnapshot({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("Windows");
  });

  it("includes ollama status", async () => {
    const state: LisaState = { ...initialState, runtimeHealth: BASE_HEALTH };
    const { outputSummary } = await executeRuntimeSnapshot({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("available");
  });

  it("includes docker status", async () => {
    const state: LisaState = { ...initialState, runtimeHealth: BASE_HEALTH };
    const { outputSummary } = await executeRuntimeSnapshot({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("not_configured");
  });

  it("includes lastChecked line when present", async () => {
    const state: LisaState = { ...initialState, runtimeHealth: BASE_HEALTH };
    const { outputSummary } = await executeRuntimeSnapshot({}, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("Last checked");
  });

  it("omits lastChecked line when field is absent", async () => {
    const noLastChecked = { ...BASE_HEALTH } as Partial<RuntimeHealth>;
    delete noLastChecked.lastChecked;
    const state: LisaState = { ...initialState, runtimeHealth: noLastChecked as RuntimeHealth };
    const { outputSummary } = await executeRuntimeSnapshot({}, state, NOOP_SIGNAL);
    expect(outputSummary).not.toContain("Last checked");
  });

  it("ignores params argument", async () => {
    const state: LisaState = { ...initialState, runtimeHealth: BASE_HEALTH };
    const r1 = await executeRuntimeSnapshot({}, state, NOOP_SIGNAL);
    const r2 = await executeRuntimeSnapshot({ unused: true }, state, NOOP_SIGNAL);
    expect(r1.outputSummary).toBe(r2.outputSummary);
  });
});
