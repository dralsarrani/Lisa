import { getToolDefinition } from "./tool-registry";
import { executeConversationStats, executeRuntimeSnapshot, executeSaveToolResultMemoryNote } from "./tool-executors";
import type { LisaState } from "../app/lisa-reducer";
import type { ToolExecutor, ToolExecutorResult } from "./tool-executors";

export const TOOL_EXECUTION_TIMEOUT_MS = 30_000;

const EXECUTORS: Record<string, ToolExecutor> = {
  "conversation-stats": executeConversationStats,
  "runtime-snapshot": executeRuntimeSnapshot,
  "save-tool-result-memory-note": executeSaveToolResultMemoryNote,
};

export interface RunToolOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function runTool(
  toolId: string,
  params: Record<string, string | number | boolean>,
  state: LisaState,
  options: RunToolOptions = {}
): Promise<ToolExecutorResult> {
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

  const limit = options.timeoutMs ?? TOOL_EXECUTION_TIMEOUT_MS;
  const controller = new AbortController();

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  if (controller.signal.aborted) {
    throw new Error("Tool execution was cancelled.");
  }

  const timeoutId = setTimeout(() => controller.abort("timeout"), limit);

  function rejectAbort(reject: (e: Error) => void) {
    const reason = controller.signal.reason;
    if (reason === "timeout") {
      reject(new Error(`Tool execution timed out after ${limit}ms`));
    } else {
      reject(new Error("Tool execution was cancelled."));
    }
  }

  const abortPromise = new Promise<never>((_, reject) => {
    if (controller.signal.aborted) {
      rejectAbort(reject);
      return;
    }
    controller.signal.addEventListener("abort", () => rejectAbort(reject), { once: true });
  });

  try {
    return await Promise.race([
      executor(params, state, controller.signal),
      abortPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}
