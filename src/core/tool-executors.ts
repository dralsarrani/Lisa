import type { LisaState } from "../app/lisa-reducer";

export type ToolExecutor = (
  params: Record<string, string | number | boolean>,
  state: LisaState
) => Promise<{ outputSummary: string }>;

export async function executeConversationStats(
  _params: Record<string, string | number | boolean>,
  state: LisaState
): Promise<{ outputSummary: string }> {
  const { conversationHistory } = state;
  const total = conversationHistory.length;

  if (total === 0) {
    return { outputSummary: "Conversation history: 0 turns stored." };
  }

  const models = [
    ...new Set(conversationHistory.map((t) => t.model).filter(Boolean)),
  ];
  const oldest = conversationHistory[0].timestamp;
  const newest = conversationHistory[total - 1].timestamp;
  const totalChars = conversationHistory.reduce(
    (sum, t) => sum + t.userInput.length + t.assistantResponse.length,
    0
  );

  const lines = [
    `Conversation history: ${total} turn${total === 1 ? "" : "s"}`,
    `Models used: ${models.length > 0 ? models.join(", ") : "none"}`,
    `Oldest turn: ${new Date(oldest).toLocaleString()}`,
    `Newest turn: ${new Date(newest).toLocaleString()}`,
    `Total content: ~${totalChars.toLocaleString()} characters`,
  ];

  return { outputSummary: lines.join("\n") };
}

export async function executeRuntimeSnapshot(
  _params: Record<string, string | number | boolean>,
  state: LisaState
): Promise<{ outputSummary: string }> {
  const { runtimeHealth } = state;

  if (!runtimeHealth) {
    return {
      outputSummary:
        "No runtime health data available. Run 'check local runtime' first.",
    };
  }

  const lines = [
    `Runtime snapshot (as of ${new Date(runtimeHealth.timestamp).toLocaleString()}):`,
    `Backend: ${runtimeHealth.backendReachable ? "reachable" : "unreachable"}`,
    `App version: ${runtimeHealth.appVersion}`,
    `OS: ${runtimeHealth.osType} ${runtimeHealth.osVersion} (${runtimeHealth.arch})`,
    `Ollama: ${runtimeHealth.ollamaStatus}`,
    `Docker: ${runtimeHealth.dockerStatus}`,
  ];

  if (runtimeHealth.lastChecked) {
    lines.push(
      `Last checked: ${new Date(runtimeHealth.lastChecked).toLocaleString()}`
    );
  }

  return { outputSummary: lines.join("\n") };
}
