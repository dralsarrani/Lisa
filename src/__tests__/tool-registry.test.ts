import { describe, it, expect } from "vitest";
import { getAllToolDefinitions, getToolDefinition, getEnabledToolDefinitions } from "../core/tool-registry";

describe("getAllToolDefinitions", () => {
  it("returns an array", () => {
    expect(Array.isArray(getAllToolDefinitions())).toBe(true);
  });

  it("includes conversation-stats, runtime-snapshot, and save-tool-result-memory-note", () => {
    const ids = getAllToolDefinitions().map((t) => t.id);
    expect(ids).toContain("conversation-stats");
    expect(ids).toContain("runtime-snapshot");
    expect(ids).toContain("save-tool-result-memory-note");
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

  it("all tools require approval", () => {
    for (const def of getAllToolDefinitions()) {
      expect(def.requiresApproval).toBe(true);
    }
  });

  it("all tools are enabled by default", () => {
    for (const def of getAllToolDefinitions()) {
      expect(def.enabled).toBe(true);
    }
  });

  it("Phase 2A tools are in the diagnostic category", () => {
    expect(getToolDefinition("conversation-stats")?.category).toBe("diagnostic");
    expect(getToolDefinition("runtime-snapshot")?.category).toBe("diagnostic");
  });

  it("Phase 2A tools are safe risk level", () => {
    expect(getToolDefinition("conversation-stats")?.riskLevel).toBe("safe");
    expect(getToolDefinition("runtime-snapshot")?.riskLevel).toBe("safe");
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

  it("includes all three registered tools", () => {
    const ids = getEnabledToolDefinitions().map((t) => t.id);
    expect(ids).toContain("conversation-stats");
    expect(ids).toContain("runtime-snapshot");
    expect(ids).toContain("save-tool-result-memory-note");
  });
});

// ─── Phase 2E — contextPolicy ─────────────────────────────────────────────────

describe("tool definitions — Phase 2E contextPolicy", () => {
  it("every tool definition has a contextPolicy field", () => {
    for (const def of getAllToolDefinitions()) {
      expect(def.contextPolicy).toBeDefined();
    }
  });

  it("no tool definition has undefined contextPolicy", () => {
    for (const def of getAllToolDefinitions()) {
      expect(def.contextPolicy).not.toBeUndefined();
    }
  });

  it("contextPolicy is a valid ToolContextPolicy literal", () => {
    const valid = ["inject", "no_inject", "inject_redacted"];
    for (const def of getAllToolDefinitions()) {
      expect(valid).toContain(def.contextPolicy);
    }
  });

  it("conversation-stats contextPolicy is 'inject'", () => {
    expect(getToolDefinition("conversation-stats")?.contextPolicy).toBe("inject");
  });

  it("runtime-snapshot contextPolicy is 'inject'", () => {
    expect(getToolDefinition("runtime-snapshot")?.contextPolicy).toBe("inject");
  });
});

// ─── Phase 2H — save-tool-result-memory-note ──────────────────────────────────

describe("save-tool-result-memory-note definition", () => {
  it("exists in registry", () => {
    expect(getToolDefinition("save-tool-result-memory-note")).toBeDefined();
  });

  it("requires approval", () => {
    expect(getToolDefinition("save-tool-result-memory-note")?.requiresApproval).toBe(true);
  });

  it("contextPolicy is no_inject", () => {
    expect(getToolDefinition("save-tool-result-memory-note")?.contextPolicy).toBe("no_inject");
  });

  it("is enabled", () => {
    expect(getToolDefinition("save-tool-result-memory-note")?.enabled).toBe(true);
  });

  it("riskLevel is low", () => {
    expect(getToolDefinition("save-tool-result-memory-note")?.riskLevel).toBe("low");
  });

  it("category is information", () => {
    expect(getToolDefinition("save-tool-result-memory-note")?.category).toBe("information");
  });

  it("has sourceResultId parameter that is required and type string", () => {
    const def = getToolDefinition("save-tool-result-memory-note");
    const param = def?.parameters.find((p) => p.name === "sourceResultId");
    expect(param).toBeDefined();
    expect(param?.required).toBe(true);
    expect(param?.type).toBe("string");
  });

  it("consequences mention memory note and deny access to files/network/shell", () => {
    const c = getToolDefinition("save-tool-result-memory-note")?.consequences ?? "";
    expect(c).toContain("memory note");
    expect(c.toLowerCase()).toContain("does not access");
  });
});
