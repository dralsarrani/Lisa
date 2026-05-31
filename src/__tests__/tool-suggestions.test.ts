import { describe, it, expect } from "vitest";
import { detectToolSuggestion, createToolRequestPair } from "../core/tool-suggestions";
import type { ToolDefinition, ToolRequest } from "../core/types";

// ─── Registry fixtures ────────────────────────────────────────────────────────

function makeRuntimeDef(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: "runtime-snapshot",
    displayName: "Runtime Snapshot",
    description: "Format runtime status.",
    category: "diagnostic",
    riskLevel: "safe",
    requiresApproval: true,
    parameters: [],
    consequences: "Read-only runtime info.",
    enabled: true,
    contextPolicy: "inject",
    ...overrides,
  };
}

function makeStatsDef(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: "conversation-stats",
    displayName: "Conversation Stats",
    description: "Analyze conversation history.",
    category: "diagnostic",
    riskLevel: "safe",
    requiresApproval: true,
    parameters: [],
    consequences: "Read-only conversation metadata.",
    enabled: true,
    contextPolicy: "inject",
    ...overrides,
  };
}

const ALL_TOOLS = [makeRuntimeDef(), makeStatsDef()];

function makePendingRequest(toolId: string): ToolRequest {
  return {
    id: "req-1",
    toolId,
    toolDisplayName: "test",
    params: {},
    status: "pending_approval",
    source: "user_command",
    consequences: "test",
    createdAt: new Date().toISOString(),
  };
}

// ─── Runtime Snapshot positive matches ───────────────────────────────────────

describe("detectToolSuggestion — runtime-snapshot positive", () => {
  it("matches: what can you tell me about the runtime?", () => {
    const result = detectToolSuggestion("what can you tell me about the runtime?", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("runtime-snapshot");
  });

  it("matches: check my system status", () => {
    const result = detectToolSuggestion("check my system status", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("runtime-snapshot");
  });

  it("matches: show me local runtime health", () => {
    const result = detectToolSuggestion("show me local runtime health", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("runtime-snapshot");
  });

  it("matches: what's ollama doing?", () => {
    const result = detectToolSuggestion("what's ollama doing?", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("runtime-snapshot");
  });

  it("matches: is ollama running right now", () => {
    const result = detectToolSuggestion("is ollama running right now", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("runtime-snapshot");
  });

  it("source is always user_intent_detected", () => {
    const result = detectToolSuggestion("check my system status", ALL_TOOLS);
    expect(result?.source).toBe("user_intent_detected");
  });
});

// ─── Conversation Stats positive matches ──────────────────────────────────────

describe("detectToolSuggestion — conversation-stats positive", () => {
  it("matches: how many turns have we talked?", () => {
    const result = detectToolSuggestion("how many turns have we talked?", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("conversation-stats");
  });

  it("matches: summarize our conversation", () => {
    const result = detectToolSuggestion("summarize our conversation please", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("conversation-stats");
  });

  it("matches: what have we discussed today?", () => {
    const result = detectToolSuggestion("what have we discussed today?", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("conversation-stats");
  });

  it("matches: analyze our chat history", () => {
    const result = detectToolSuggestion("analyze our chat history please", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("conversation-stats");
  });

  it("matches: message count", () => {
    const result = detectToolSuggestion("what is the message count here", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("conversation-stats");
  });

  it("matches: conversation history stats", () => {
    const result = detectToolSuggestion("show me conversation history stats", ALL_TOOLS);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("conversation-stats");
  });
});

// ─── Negative: deterministic commands route directly, not via suggestion ───────

describe("detectToolSuggestion — negative: deterministic commands", () => {
  it("returns null for 'run runtime snapshot'", () => {
    expect(detectToolSuggestion("run runtime snapshot", ALL_TOOLS)).toBeNull();
  });

  it("returns null for 'conversation stats'", () => {
    expect(detectToolSuggestion("conversation stats", ALL_TOOLS)).toBeNull();
  });

  it("returns null for 'show conversation stats'", () => {
    expect(detectToolSuggestion("show conversation stats", ALL_TOOLS)).toBeNull();
  });
});

describe("detectToolSuggestion — negative: desktop-action guard patterns", () => {
  it("returns null for 'open Steam'", () => {
    expect(detectToolSuggestion("open Steam for me please", ALL_TOOLS)).toBeNull();
  });

  it("returns null for 'execute this file'", () => {
    expect(detectToolSuggestion("execute this file now please", ALL_TOOLS)).toBeNull();
  });
});

describe("detectToolSuggestion — negative: too short or unrelated", () => {
  it("returns null for 'hello'", () => {
    expect(detectToolSuggestion("hello", ALL_TOOLS)).toBeNull();
  });

  it("returns null for 'what is a neural network?'", () => {
    expect(detectToolSuggestion("what is a neural network?", ALL_TOOLS)).toBeNull();
  });

  it("returns null for 'tell me a joke'", () => {
    expect(detectToolSuggestion("tell me a joke please", ALL_TOOLS)).toBeNull();
  });

  it("returns null for two-word input", () => {
    expect(detectToolSuggestion("hi there", ALL_TOOLS)).toBeNull();
  });
});

// ─── Registry guards ──────────────────────────────────────────────────────────

describe("detectToolSuggestion — registry guards", () => {
  it("returns null when tool is disabled", () => {
    const tools = [makeRuntimeDef({ enabled: false }), makeStatsDef()];
    expect(detectToolSuggestion("check my system status", tools)).toBeNull();
  });

  it("returns null when tool has high risk level", () => {
    const tools = [makeRuntimeDef({ riskLevel: "high" }), makeStatsDef()];
    expect(detectToolSuggestion("check my system status", tools)).toBeNull();
  });

  it("returns null when tool has critical risk level", () => {
    const tools = [makeRuntimeDef({ riskLevel: "critical" }), makeStatsDef()];
    expect(detectToolSuggestion("check my system status", tools)).toBeNull();
  });

  it("returns null when tool has medium risk level", () => {
    const tools = [makeRuntimeDef({ riskLevel: "medium" }), makeStatsDef()];
    expect(detectToolSuggestion("check my system status", tools)).toBeNull();
  });

  it("still suggests the other tool when one is disabled", () => {
    const tools = [makeRuntimeDef({ enabled: false }), makeStatsDef()];
    const result = detectToolSuggestion("summarize our conversation please", tools);
    expect(result?.toolId).toBe("conversation-stats");
  });
});

// ─── State guard: pending_approval suppression ────────────────────────────────

describe("detectToolSuggestion — state guard", () => {
  it("returns null when pending_approval request already exists for same tool", () => {
    const existing = [makePendingRequest("runtime-snapshot")];
    expect(detectToolSuggestion("check my system status", ALL_TOOLS, existing)).toBeNull();
  });

  it("still suggests when existing request is succeeded", () => {
    const existing: ToolRequest[] = [{ ...makePendingRequest("runtime-snapshot"), status: "succeeded" }];
    const result = detectToolSuggestion("check my system status", ALL_TOOLS, existing);
    expect(result).not.toBeNull();
    expect(result?.toolId).toBe("runtime-snapshot");
  });

  it("still suggests when existing request is cancelled", () => {
    const existing: ToolRequest[] = [{ ...makePendingRequest("runtime-snapshot"), status: "cancelled" }];
    const result = detectToolSuggestion("check my system status", ALL_TOOLS, existing);
    expect(result).not.toBeNull();
  });
});

// ─── createToolRequestPair helper ─────────────────────────────────────────────

describe("createToolRequestPair", () => {
  it("created request has source suggestion_converted", () => {
    const { request } = createToolRequestPair(makeRuntimeDef(), "suggestion_converted");
    expect(request.source).toBe("suggestion_converted");
  });

  it("created request starts pending_approval", () => {
    const { request } = createToolRequestPair(makeRuntimeDef(), "suggestion_converted");
    expect(request.status).toBe("pending_approval");
  });

  it("approval contract decision is null", () => {
    const { approval } = createToolRequestPair(makeRuntimeDef(), "suggestion_converted");
    expect(approval.decision).toBeNull();
  });

  it("approval contract resolvedBy is null", () => {
    const { approval } = createToolRequestPair(makeRuntimeDef(), "suggestion_converted");
    expect(approval.resolvedBy).toBeNull();
  });

  it("request and approval share the same requestId", () => {
    const { request, approval } = createToolRequestPair(makeRuntimeDef(), "suggestion_converted");
    expect(approval.requestId).toBe(request.id);
  });

  it("works with user_command source", () => {
    const { request } = createToolRequestPair(makeStatsDef(), "user_command");
    expect(request.source).toBe("user_command");
    expect(request.toolId).toBe("conversation-stats");
  });

  it("does not execute — request stays pending_approval with no result", () => {
    const { request } = createToolRequestPair(makeRuntimeDef(), "suggestion_converted");
    expect(request.status).toBe("pending_approval");
    expect(request.resultId).toBeUndefined();
    expect(request.startedAt).toBeUndefined();
  });
});
