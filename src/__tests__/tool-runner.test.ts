import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTool, TOOL_EXECUTION_TIMEOUT_MS } from "../core/tool-runner";
import { initialState } from "../app/lisa-reducer";

// ─── Registry fixtures ────────────────────────────────────────────────────────

vi.mock("../core/tool-registry", () => ({
  getToolDefinition: (id: string) => {
    if (id === "conversation-stats") {
      return { id, displayName: "Conversation Stats", enabled: true };
    }
    if (id === "disabled-tool") {
      return { id, displayName: "Disabled Tool", enabled: false };
    }
    if (id === "known-no-executor") {
      return { id, displayName: "Known No Executor", enabled: true };
    }
    return null;
  },
}));

vi.mock("../core/tool-executors", () => ({
  executeConversationStats: vi.fn(),
  executeRuntimeSnapshot: vi.fn(),
  executeSaveToolResultMemoryNote: vi.fn(),
}));

import { executeConversationStats } from "../core/tool-executors";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Validation guards ────────────────────────────────────────────────────────

describe("runTool — validation", () => {
  it("throws for unknown tool", async () => {
    await expect(runTool("unknown-tool", {}, initialState)).rejects.toThrow("Unknown tool");
  });

  it("throws for disabled tool", async () => {
    await expect(runTool("disabled-tool", {}, initialState)).rejects.toThrow("Tool is disabled");
  });

  it("throws when no executor is registered", async () => {
    await expect(runTool("known-no-executor", {}, initialState)).rejects.toThrow("No executor registered");
  });
});

// ─── Success path ─────────────────────────────────────────────────────────────

describe("runTool — success", () => {
  it("returns outputSummary from executor", async () => {
    vi.mocked(executeConversationStats).mockResolvedValue({ outputSummary: "3 turns" });
    const result = await runTool("conversation-stats", {}, initialState);
    expect(result.outputSummary).toBe("3 turns");
  });

  it("passes params and state to executor", async () => {
    vi.mocked(executeConversationStats).mockResolvedValue({ outputSummary: "ok" });
    await runTool("conversation-stats", { foo: "bar" }, initialState);
    expect(vi.mocked(executeConversationStats)).toHaveBeenCalledWith(
      { foo: "bar" },
      initialState,
      expect.any(AbortSignal)
    );
  });
});

// ─── Timeout ─────────────────────────────────────────────────────────────────

describe("runTool — timeout", () => {
  it("rejects with timeout message when executor hangs", async () => {
    vi.mocked(executeConversationStats).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    await expect(
      runTool("conversation-stats", {}, initialState, { timeoutMs: 20 })
    ).rejects.toThrow("timed out after 20ms");
  });

  it("exports TOOL_EXECUTION_TIMEOUT_MS as 30000", () => {
    expect(TOOL_EXECUTION_TIMEOUT_MS).toBe(30_000);
  });
});

// ─── Cancellation via external signal ────────────────────────────────────────

describe("runTool — external signal cancellation", () => {
  it("rejects with cancelled message when signal is pre-aborted", async () => {
    vi.mocked(executeConversationStats).mockResolvedValue({ outputSummary: "ok" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      runTool("conversation-stats", {}, initialState, { signal: controller.signal })
    ).rejects.toThrow("cancelled");
  });

  it("rejects with cancelled message when signal is aborted during execution", async () => {
    const controller = new AbortController();
    vi.mocked(executeConversationStats).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    const promise = runTool("conversation-stats", {}, initialState, {
      signal: controller.signal,
      timeoutMs: 5000,
    });
    controller.abort();
    await expect(promise).rejects.toThrow("cancelled");
  });

  it("forwards signal to executor", async () => {
    vi.mocked(executeConversationStats).mockResolvedValue({ outputSummary: "ok" });
    const controller = new AbortController();
    await runTool("conversation-stats", {}, initialState, { signal: controller.signal });
    const receivedSignal = vi.mocked(executeConversationStats).mock.calls[0][2];
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});

// ─── Phase 2H — sideEffect passthrough ───────────────────────────────────────

describe("runTool — sideEffect passthrough", () => {
  it("returns sideEffect from executor result", async () => {
    vi.mocked(executeConversationStats).mockResolvedValue({
      outputSummary: "ok",
      sideEffect: { type: "add_memory_note", content: "test note" },
    });
    const result = await runTool("conversation-stats", {}, initialState);
    expect(result.sideEffect?.type).toBe("add_memory_note");
    expect(result.sideEffect?.content).toBe("test note");
  });

  it("returns undefined sideEffect when executor omits it", async () => {
    vi.mocked(executeConversationStats).mockResolvedValue({ outputSummary: "ok" });
    const result = await runTool("conversation-stats", {}, initialState);
    expect(result.sideEffect).toBeUndefined();
  });

  it("outputSummary is still accessible alongside sideEffect", async () => {
    vi.mocked(executeConversationStats).mockResolvedValue({
      outputSummary: "summary text",
      sideEffect: { type: "add_memory_note", content: "note" },
    });
    const { outputSummary, sideEffect } = await runTool("conversation-stats", {}, initialState);
    expect(outputSummary).toBe("summary text");
    expect(sideEffect?.content).toBe("note");
  });
});
