import type { ToolDefinition } from "./types";

const TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: "conversation-stats",
    displayName: "Conversation Stats",
    description: "Analyze local conversation-history metadata stored in Lisa state.",
    category: "diagnostic",
    riskLevel: "safe",
    requiresApproval: true,
    parameters: [],
    consequences:
      "This will analyze local conversation-history metadata only. It does not call the model and does not modify data.",
    enabled: true,
  },
  {
    id: "runtime-snapshot",
    displayName: "Runtime Snapshot",
    description: "Format the latest local runtime status already stored in Lisa state.",
    category: "diagnostic",
    riskLevel: "safe",
    requiresApproval: true,
    parameters: [],
    consequences:
      "This will format the latest local runtime status already stored in Lisa state. It does not call external services and does not modify data.",
    enabled: true,
  },
];

export function getAllToolDefinitions(): ToolDefinition[] {
  return TOOL_REGISTRY;
}

export function getToolDefinition(toolId: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.id === toolId);
}

export function getEnabledToolDefinitions(): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => t.enabled);
}
