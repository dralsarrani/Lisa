import { getToolDefinition } from "./tool-registry";
import { executeConversationStats, executeRuntimeSnapshot } from "./tool-executors";
import type { LisaState } from "../app/lisa-reducer";
import type { ToolExecutor } from "./tool-executors";

const EXECUTORS: Record<string, ToolExecutor> = {
  "conversation-stats": executeConversationStats,
  "runtime-snapshot": executeRuntimeSnapshot,
};

export async function runTool(
  toolId: string,
  params: Record<string, string | number | boolean>,
  state: LisaState
): Promise<{ outputSummary: string }> {
  const definition = getToolDefinition(toolId);
  if (!definition) {
    throw new Error(`Unknown tool: ${toolId}`);
  }
  if (!definition.enabled) {
    throw new Error(`Tool is disabled: ${toolId}`);
  }

  const executor = EXECUTORS[toolId];
  if (!executor) {
    throw new Error(`No executor registered for tool: ${toolId}`);
  }

  return executor(params, state);
}
