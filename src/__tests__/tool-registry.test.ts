import { describe, it, expect } from "vitest";
import { getAllToolDefinitions, getToolDefinition, getEnabledToolDefinitions } from "../core/tool-registry";

describe("getAllToolDefinitions", () => {
  it("returns an array", () => {
    expect(Array.isArray(getAllToolDefinitions())).toBe(true);
  });

  it("includes conversation-stats and runtime-snapshot", () => {
    const ids = getAllToolDefinitions().map((t) => t.id);
    expect(ids).toContain("conversation-stats");
    expect(ids).toContain("runtime-snapshot");
  });

  it("every definition has required fields", () => {
    for (const def of getAllToolDefinitions()) {
      expect(typeof def.id).toBe("string");
      expect(typeof def.displayName).toBe("string");
      expect(typeof def.description).toBe("string");
      expect(typeof def.consequences).toBe("string");
      expect(Array.isArray(def.parameters)).toBe(true);
      expect(typeof def.requiresApproval).toBe("boolean");
      expect(typeof def.enabled).toBe("boolean");
    }
  });

  it("both Phase 2A tools require approval", () => {
    for (const def of getAllToolDefinitions()) {
      expect(def.requiresApproval).toBe(true);
    }
  });

  it("both Phase 2A tools are enabled by default", () => {
    for (const def of getAllToolDefinitions()) {
      expect(def.enabled).toBe(true);
    }
  });

  it("both Phase 2A tools are in the diagnostic category", () => {
    for (const def of getAllToolDefinitions()) {
      expect(def.category).toBe("diagnostic");
    }
  });

  it("both Phase 2A tools are safe risk level", () => {
    for (const def of getAllToolDefinitions()) {
      expect(def.riskLevel).toBe("safe");
    }
  });
});

describe("getToolDefinition", () => {
  it("returns the correct definition for conversation-stats", () => {
    const def = getToolDefinition("conversation-stats");
    expect(def).toBeDefined();
    expect(def!.id).toBe("conversation-stats");
    expect(def!.displayName).toBe("Conversation Stats");
  });

  it("returns the correct definition for runtime-snapshot", () => {
    const def = getToolDefinition("runtime-snapshot");
    expect(def).toBeDefined();
    expect(def!.id).toBe("runtime-snapshot");
    expect(def!.displayName).toBe("Runtime Snapshot");
  });

  it("returns undefined for an unknown tool id", () => {
    expect(getToolDefinition("not-a-real-tool")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getToolDefinition("")).toBeUndefined();
  });
});

describe("getEnabledToolDefinitions", () => {
  it("returns only enabled tools", () => {
    const enabled = getEnabledToolDefinitions();
    for (const def of enabled) {
      expect(def.enabled).toBe(true);
    }
  });

  it("includes both Phase 2A tools since they are enabled", () => {
    const ids = getEnabledToolDefinitions().map((t) => t.id);
    expect(ids).toContain("conversation-stats");
    expect(ids).toContain("runtime-snapshot");
  });
});
