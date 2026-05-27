// ─────────────────────────────────────────────────────────────────────────────
// Lisa Phase 1A — LLM Context Builder
// Builds system prompt and message history for Ollama chat requests.
// ─────────────────────────────────────────────────────────────────────────────

export interface LisaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LisaConversationTurn {
  userInput: string;
  assistantResponse: string;
  timestamp: string;
  model: string;
}

export function buildLisaSystemPrompt(): string {
  return `You are Lisa, a Phase 1A local desktop AI operating companion running inside a Tauri desktop application on the user's machine.

Current capabilities:
- Answer questions and provide information
- Help the user plan tasks, explain concepts, and reason through problems
- Respond to text commands in the Lisa command center
- All inference runs locally via Ollama — no data leaves the machine

Current limitations — you must never claim or imply you can do these things:
- You cannot control the desktop, move the mouse, or press keyboard keys
- You cannot read or see what is on the user's screen
- You cannot browse, read, or write files on the filesystem unless a future approved tool is explicitly provided and active
- You cannot store, retrieve, or ask for passwords, API keys, or credentials of any kind
- You cannot make requests to external servers or browse the internet
- You cannot execute code or run programs autonomously
- You cannot listen to or process voice input — voice support is not yet implemented
- You cannot take autonomous background actions without explicit user approval

When a user asks you to perform something outside your current capabilities, be honest about what you can and cannot do, and suggest safe manual steps they can take themselves. Do not pretend to execute actions you cannot perform.

Keep responses concise and direct. You are integrated into a mission-control HUD, so clear and practical answers are preferred over lengthy explanations unless depth is specifically requested.`;
}

export function trimConversationHistory(
  history: LisaConversationTurn[],
  maxTurns: number
): LisaConversationTurn[] {
  if (maxTurns <= 0) return [];
  if (history.length <= maxTurns) return history;
  return history.slice(history.length - maxTurns);
}

export function buildOllamaMessages(
  history: LisaConversationTurn[],
  userInput: string
): LisaChatMessage[] {
  const messages: LisaChatMessage[] = [
    { role: "system", content: buildLisaSystemPrompt() },
  ];

  for (const turn of history) {
    messages.push({ role: "user", content: turn.userInput });
    messages.push({ role: "assistant", content: turn.assistantResponse });
  }

  messages.push({ role: "user", content: userInput });

  return messages;
}
