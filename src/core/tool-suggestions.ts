import type { ToolDefinition, ToolRequest, ToolApprovalContract, ToolSuggestion } from "./types";
import { routeCommand, getDesktopActionGuardMessage } from "./command-router";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SuggestionCore = Omit<ToolSuggestion, "id" | "createdAt" | "originatingInteractionId" | "status">;

// ─── Detection patterns ───────────────────────────────────────────────────────

const RUNTIME_SNAPSHOT_PATTERNS: RegExp[] = [
  /what can you tell me about (my |the )?runtime/i,
  /check (my |the )?(system|local) status/i,
  /show me (the |my )?local runtime health/i,
  /what'?s?\s+(is\s+)?ollama doing/i,
  /is ollama running/i,
  /\bbackend status\b/i,
];

const CONVERSATION_STATS_PATTERNS: RegExp[] = [
  /how many turns (have we|did we) talk(ed)?/i,
  /summarize our conversation/i,
  /what (have we|did we) discuss(ed)?( today| so far| recently)?/i,
  /analyze (our |the |this )?(chat|conversation) history/i,
  /\bmessage count\b/i,
  /\bconversation (history )?stats\b/i,
];

// ─── Detector ─────────────────────────────────────────────────────────────────

export function detectToolSuggestion(
  userText: string,
  availableTools: ToolDefinition[],
  existingToolRequests: ToolRequest[] = []
): SuggestionCore | null {
  const trimmed = userText.trim();

  // Reject empty / very short inputs (< 3 words or < 10 chars)
  if (trimmed.length < 10 || trimmed.split(/\s+/).length < 3) return null;

  // Reject if command router handles it deterministically
  if (routeCommand(trimmed).intent !== "unknown") return null;

  // Reject if desktop-action guard would block it
  if (getDesktopActionGuardMessage(trimmed) !== null) return null;

  function canSuggest(toolId: string): boolean {
    const def = availableTools.find((t) => t.id === toolId);
    if (!def || !def.enabled) return false;
    if (def.riskLevel !== "safe" && def.riskLevel !== "low") return false;
    if (
      existingToolRequests.some(
        (r) =>
          r.toolId === toolId &&
          (r.status === "pending_approval" || r.status === "approved" || r.status === "running")
      )
    )
      return false;
    return true;
  }

  if (canSuggest("runtime-snapshot")) {
    if (RUNTIME_SNAPSHOT_PATTERNS.some((p) => p.test(trimmed))) {
      const def = availableTools.find((t) => t.id === "runtime-snapshot")!;
      return {
        toolId: "runtime-snapshot",
        toolDisplayName: def.displayName,
        reason: "Your question relates to runtime or system status.",
        source: "user_intent_detected",
      };
    }
  }

  if (canSuggest("conversation-stats")) {
    if (CONVERSATION_STATS_PATTERNS.some((p) => p.test(trimmed))) {
      const def = availableTools.find((t) => t.id === "conversation-stats")!;
      return {
        toolId: "conversation-stats",
        toolDisplayName: def.displayName,
        reason: "Your question relates to conversation history.",
        source: "user_intent_detected",
      };
    }
  }

  return null;
}

// ─── Request creation helper ──────────────────────────────────────────────────

export function createToolRequestPair(
  definition: ToolDefinition,
  source: ToolRequest["source"]
): { request: ToolRequest; approval: ToolApprovalContract } {
  const requestId = crypto.randomUUID();
  const contractId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  return {
    request: {
      id: requestId,
      toolId: definition.id,
      toolDisplayName: definition.displayName,
      params: {},
      status: "pending_approval",
      source,
      consequences: definition.consequences,
      createdAt,
    },
    approval: {
      id: contractId,
      requestId,
      toolId: definition.id,
      toolDisplayName: definition.displayName,
      consequences: definition.consequences,
      decision: null,
      resolvedBy: null,
      createdAt,
    },
  };
}
