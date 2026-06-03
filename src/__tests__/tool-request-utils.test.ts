import { describe, it, expect } from "vitest";
import { hasActiveToolRequest } from "../core/tool-request-utils";
import type { ToolRequest } from "../core/types";

function makeRequest(toolId: string, status: ToolRequest["status"]): ToolRequest {
  return {
    id: `req-${toolId}-${status}`,
    toolId,
    toolDisplayName: toolId,
    params: {},
    status,
    source: "user_command",
    consequences: "test",
    createdAt: new Date().toISOString(),
  };
}

describe("hasActiveToolRequest", () => {
  it("returns null for empty array", () => {
    expect(hasActiveToolRequest([], "runtime-snapshot")).toBeNull();
  });

  it("returns the request when status is pending_approval", () => {
    const req = makeRequest("runtime-snapshot", "pending_approval");
    expect(hasActiveToolRequest([req], "runtime-snapshot")).toBe(req);
  });

  it("returns the request when status is approved", () => {
    const req = makeRequest("runtime-snapshot", "approved");
    expect(hasActiveToolRequest([req], "runtime-snapshot")).toBe(req);
  });

  it("returns the request when status is running", () => {
    const req = makeRequest("runtime-snapshot", "running");
    expect(hasActiveToolRequest([req], "runtime-snapshot")).toBe(req);
  });

  it("returns null when status is succeeded", () => {
    const req = makeRequest("runtime-snapshot", "succeeded");
    expect(hasActiveToolRequest([req], "runtime-snapshot")).toBeNull();
  });

  it("returns null when status is failed", () => {
    const req = makeRequest("runtime-snapshot", "failed");
    expect(hasActiveToolRequest([req], "runtime-snapshot")).toBeNull();
  });

  it("returns null when status is cancelled", () => {
    const req = makeRequest("runtime-snapshot", "cancelled");
    expect(hasActiveToolRequest([req], "runtime-snapshot")).toBeNull();
  });

  it("returns null when status is rejected", () => {
    const req = makeRequest("runtime-snapshot", "rejected");
    expect(hasActiveToolRequest([req], "runtime-snapshot")).toBeNull();
  });

  it("returns null when status is expired", () => {
    const req = makeRequest("runtime-snapshot", "expired");
    expect(hasActiveToolRequest([req], "runtime-snapshot")).toBeNull();
  });

  it("returns null when toolId does not match", () => {
    const req = makeRequest("conversation-stats", "pending_approval");
    expect(hasActiveToolRequest([req], "runtime-snapshot")).toBeNull();
  });

  it("returns the first matching active request when multiple exist", () => {
    const r1 = makeRequest("runtime-snapshot", "succeeded");
    const r2 = makeRequest("runtime-snapshot", "pending_approval");
    const r3 = makeRequest("runtime-snapshot", "running");
    const result = hasActiveToolRequest([r1, r2, r3], "runtime-snapshot");
    expect(result).toBe(r2);
  });

  it("ignores active requests for other tool ids", () => {
    const other = makeRequest("conversation-stats", "running");
    expect(hasActiveToolRequest([other], "runtime-snapshot")).toBeNull();
  });

  it("returns active request even when mixed tool ids are present", () => {
    const other = makeRequest("conversation-stats", "running");
    const target = makeRequest("runtime-snapshot", "approved");
    expect(hasActiveToolRequest([other, target], "runtime-snapshot")).toBe(target);
  });
});

// ─── Phase 2H — hasActiveToolRequestForParams ─────────────────────────────────

import { hasActiveToolRequestForParams } from "../core/tool-request-utils";

function makeParamRequest(toolId: string, status: ToolRequest["status"], params: Record<string, string | number | boolean> = {}): ToolRequest {
  return {
    id: `req-${toolId}-${status}`,
    toolId,
    toolDisplayName: toolId,
    params,
    status,
    source: "result_action",
    consequences: "test",
    createdAt: new Date().toISOString(),
  };
}

describe("hasActiveToolRequestForParams", () => {
  it("returns null for empty array", () => {
    expect(hasActiveToolRequestForParams([], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBeNull();
  });

  it("returns matching active request when toolId and params match", () => {
    const req = makeParamRequest("save-tool-result-memory-note", "pending_approval", { sourceResultId: "res-1" });
    expect(hasActiveToolRequestForParams([req], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBe(req);
  });

  it("returns null when params value does not match", () => {
    const req = makeParamRequest("save-tool-result-memory-note", "pending_approval", { sourceResultId: "res-2" });
    expect(hasActiveToolRequestForParams([req], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBeNull();
  });

  it("returns null when toolId does not match", () => {
    const req = makeParamRequest("conversation-stats", "pending_approval", { sourceResultId: "res-1" });
    expect(hasActiveToolRequestForParams([req], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBeNull();
  });

  it("returns null for succeeded status even when params match", () => {
    const req = makeParamRequest("save-tool-result-memory-note", "succeeded", { sourceResultId: "res-1" });
    expect(hasActiveToolRequestForParams([req], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBeNull();
  });

  it("returns null for rejected status", () => {
    const req = makeParamRequest("save-tool-result-memory-note", "rejected", { sourceResultId: "res-1" });
    expect(hasActiveToolRequestForParams([req], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBeNull();
  });

  it("returns null for cancelled status", () => {
    const req = makeParamRequest("save-tool-result-memory-note", "cancelled", { sourceResultId: "res-1" });
    expect(hasActiveToolRequestForParams([req], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBeNull();
  });

  it("matches running status", () => {
    const req = makeParamRequest("save-tool-result-memory-note", "running", { sourceResultId: "res-1" });
    expect(hasActiveToolRequestForParams([req], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBe(req);
  });

  it("matches approved status", () => {
    const req = makeParamRequest("save-tool-result-memory-note", "approved", { sourceResultId: "res-1" });
    expect(hasActiveToolRequestForParams([req], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBe(req);
  });

  it("skips succeeded request for same result and finds active one", () => {
    const old = makeParamRequest("save-tool-result-memory-note", "succeeded", { sourceResultId: "res-1" });
    old.id = "req-old";
    const active = makeParamRequest("save-tool-result-memory-note", "pending_approval", { sourceResultId: "res-1" });
    active.id = "req-new";
    expect(hasActiveToolRequestForParams([old, active], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBe(active);
  });

  it("does not match request with empty params when params specified", () => {
    const req = makeParamRequest("save-tool-result-memory-note", "pending_approval", {});
    expect(hasActiveToolRequestForParams([req], "save-tool-result-memory-note", { sourceResultId: "res-1" })).toBeNull();
  });
});
