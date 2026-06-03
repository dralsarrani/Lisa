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
    contextPolicy: "inject",
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
    contextPolicy: "inject",
  },
  {
    id: "save-tool-result-memory-note",
    displayName: "Save Tool Result as Memory Note",
    description: "Save the output summary of a completed tool result as a persistent Lisa memory note.",
    category: "information",
    riskLevel: "low",
    requiresApproval: true,
    parameters: [
      {
        name: "sourceResultId",
        type: "string",
        description: "The ID of the tool result whose summary will be saved as a memory note.",
        required: true,
      },
    ],
    consequences:
      "This will save the selected tool result summary as an explicit Lisa memory note. The note will persist across restarts and can influence future local AI responses until deleted. It does not access files, clipboard, network, shell, or desktop apps.",
    enabled: true,
    contextPolicy: "no_inject",
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
