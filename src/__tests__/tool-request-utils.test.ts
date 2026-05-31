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
