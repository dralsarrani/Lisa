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

// ─── executeSaveToolResultMemoryNote ──────────────────────────────────────────

import { executeSaveToolResultMemoryNote } from "../core/tool-executors";
import type { ToolResult } from "../core/types";
import { MEMORY_NOTE_CHAR_LIMIT } from "../core/types";

function makeToolResult(overrides: Partial<ToolResult> = {}): ToolResult {
  return {
    id: "res-1",
    requestId: "req-1",
    toolId: "conversation-stats",
    outputSummary: "3 turns stored.",
    succeededAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("executeSaveToolResultMemoryNote — guards", () => {
  it("throws if signal is pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeSaveToolResultMemoryNote({}, initialState, controller.signal)
    ).rejects.toThrow("cancelled");
  });

  it("throws if sourceResultId param is missing", async () => {
    await expect(
      executeSaveToolResultMemoryNote({}, initialState, NOOP_SIGNAL)
    ).rejects.toThrow("sourceResultId parameter is required.");
  });

  it("throws if sourceResultId is not a string", async () => {
    await expect(
      executeSaveToolResultMemoryNote({ sourceResultId: 42 }, initialState, NOOP_SIGNAL)
    ).rejects.toThrow("sourceResultId parameter is required.");
  });

  it("throws if tool result is not found in state", async () => {
    await expect(
      executeSaveToolResultMemoryNote({ sourceResultId: "nonexistent" }, initialState, NOOP_SIGNAL)
    ).rejects.toThrow("Tool result not found.");
  });

  it("throws if tool result has empty outputSummary", async () => {
    const state: LisaState = {
      ...initialState,
      toolResults: [makeToolResult({ id: "res-1", outputSummary: "" })],
    };
    await expect(
      executeSaveToolResultMemoryNote({ sourceResultId: "res-1" }, state, NOOP_SIGNAL)
    ).rejects.toThrow("Tool result has no summary to save.");
  });

  it("throws if tool result has whitespace-only outputSummary", async () => {
    const state: LisaState = {
      ...initialState,
      toolResults: [makeToolResult({ id: "res-1", outputSummary: "   " })],
    };
    await expect(
      executeSaveToolResultMemoryNote({ sourceResultId: "res-1" }, state, NOOP_SIGNAL)
    ).rejects.toThrow("Tool result has no summary to save.");
  });
});

describe("executeSaveToolResultMemoryNote — success", () => {
  it("returns outputSummary confirming save", async () => {
    const state: LisaState = {
      ...initialState,
      toolResults: [makeToolResult({ id: "res-1", outputSummary: "3 turns stored." })],
    };
    const { outputSummary } = await executeSaveToolResultMemoryNote({ sourceResultId: "res-1" }, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("Saved tool result as memory note");
  });

  it("outputSummary includes char count", async () => {
    const state: LisaState = {
      ...initialState,
      toolResults: [makeToolResult({ id: "res-1", outputSummary: "hello" })],
    };
    const { outputSummary } = await executeSaveToolResultMemoryNote({ sourceResultId: "res-1" }, state, NOOP_SIGNAL);
    expect(outputSummary).toContain("5 chars");
  });

  it("sideEffect type is add_memory_note", async () => {
    const state: LisaState = {
      ...initialState,
      toolResults: [makeToolResult({ id: "res-1", outputSummary: "summary text" })],
    };
    const { sideEffect } = await executeSaveToolResultMemoryNote({ sourceResultId: "res-1" }, state, NOOP_SIGNAL);
    expect(sideEffect?.type).toBe("add_memory_note");
  });

  it("sideEffect content equals the outputSummary when within limit", async () => {
    const state: LisaState = {
      ...initialState,
      toolResults: [makeToolResult({ id: "res-1", outputSummary: "3 turns stored." })],
    };
    const { sideEffect } = await executeSaveToolResultMemoryNote({ sourceResultId: "res-1" }, state, NOOP_SIGNAL);
    expect(sideEffect?.content).toBe("3 turns stored.");
  });

  it("truncates content to MEMORY_NOTE_CHAR_LIMIT when summary is too long", async () => {
    const longSummary = "x".repeat(300);
    const state: LisaState = {
      ...initialState,
      toolResults: [makeToolResult({ id: "res-1", outputSummary: longSummary })],
    };
    const { sideEffect } = await executeSaveToolResultMemoryNote({ sourceResultId: "res-1" }, state, NOOP_SIGNAL);
    expect(sideEffect!.content.length).toBeLessThanOrEqual(MEMORY_NOTE_CHAR_LIMIT);
  });

  it("truncated content ends with ellipsis character", async () => {
    const longSummary = "x".repeat(300);
    const state: LisaState = {
      ...initialState,
      toolResults: [makeToolResult({ id: "res-1", outputSummary: longSummary })],
    };
    const { sideEffect } = await executeSaveToolResultMemoryNote({ sourceResultId: "res-1" }, state, NOOP_SIGNAL);
    expect(sideEffect!.content.endsWith("…")).toBe(true);
  });

  it("outputSummary does not contain the full tool result content", async () => {
    const longSummary = "x".repeat(300);
    const state: LisaState = {
      ...initialState,
      toolResults: [makeToolResult({ id: "res-1", outputSummary: longSummary })],
    };
    const { outputSummary } = await executeSaveToolResultMemoryNote({ sourceResultId: "res-1" }, state, NOOP_SIGNAL);
    expect(outputSummary).not.toContain("x".repeat(10));
  });

  it("finds result by id among multiple results", async () => {
    const state: LisaState = {
      ...initialState,
      toolResults: [
        makeToolResult({ id: "res-a", outputSummary: "result A" }),
        makeToolResult({ id: "res-b", outputSummary: "result B" }),
      ],
    };
    const { sideEffect } = await executeSaveToolResultMemoryNote({ sourceResultId: "res-b" }, state, NOOP_SIGNAL);
    expect(sideEffect?.content).toBe("result B");
  });
});
