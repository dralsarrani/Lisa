import type { CommandIntent, CommandRouteResult, LisaModeId } from "./types";

// ─── Mode name → ID mappings ──────────────────────────────────────────────────

const MODE_NAME_MAP: Record<string, LisaModeId> = {
  "normal mode": "normal",
  "normal": "normal",
  "focus mode": "focus",
  "focus": "focus",
  "study mode": "study",
  "study": "study",
  "work mode": "work",
  "work": "work",
  "meeting mode": "meeting",
  "meeting": "meeting",
  "privacy mode": "privacy",
  "privacy": "privacy",
  "lockdown mode": "lockdown",
  "lockdown": "lockdown",
  "sleep mode": "sleep",
  "presentation mode": "presentation",
  "presentation": "presentation",
  "cyber mode": "cyber",
  "cyber": "cyber",
  "design mode": "design",
  "design": "design",
  "gaming mode": "gaming",
  "gaming": "gaming",
  "coding mode": "coding",
  "coding": "coding",
  "tutor mode": "tutor",
  "tutor": "tutor",
  "companion mode": "companion",
  "companion": "companion",
};

// ─── Normalization ────────────────────────────────────────────────────────────

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/^lisa[,\s]+/i, "")
    .replace(/[.,!?]+$/, "")
    .trim();
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function routeCommand(raw: string): CommandRouteResult {
  const normalized = normalize(raw);

  // Emergency stop — highest priority.
  if (
    normalized === "emergency stop" ||
    normalized === "emergency stop now" ||
    normalized === "stop everything" ||
    normalized === "abort"
  ) {
    return result("emergency_stop", raw, normalized, {}, "high", "Emergency stop activated. All active operations halted.");
  }

  // Stop / pause.
  if (normalized === "stop" || normalized === "halt" || normalized === "freeze") {
    return result("stop", raw, normalized, {}, "high", "Stopping active operations.");
  }

  // Sleep.
  if (normalized === "sleep" || normalized === "go to sleep" || normalized === "quiet mode") {
    return result("sleep", raw, normalized, {}, "high", "Lisa entering sleep mode. I'll stay quiet until called.");
  }

  // Wake.
  if (
    normalized === "wake up" ||
    normalized === "wake" ||
    normalized === "resume" ||
    normalized === "i'm here" ||
    normalized === "hello lisa"
  ) {
    return result("wake", raw, normalized, {}, "high", "Lisa is awake and ready.");
  }

  // Runtime health check.
  if (
    normalized === "check local runtime" ||
    normalized === "runtime status" ||
    normalized === "check health" ||
    normalized === "system status" ||
    normalized === "status"
  ) {
    return result("runtime_health", raw, normalized, {}, "high", "Checking local runtime health...");
  }

  // Test mission.
  if (
    normalized === "create test mission" ||
    normalized === "test mission" ||
    normalized === "run test mission" ||
    normalized === "start test mission"
  ) {
    return result("create_test_mission", raw, normalized, {}, "high", "Creating Phase 0 test mission...");
  }

  // Approve test action.
  if (
    normalized === "approve test action" ||
    normalized === "approve" ||
    normalized === "approve action" ||
    normalized === "confirm"
  ) {
    return result("approve_test_action", raw, normalized, {}, "high", "Approving pending test action...");
  }

  // Reject test action.
  if (
    normalized === "reject test action" ||
    normalized === "reject" ||
    normalized === "reject action" ||
    normalized === "deny" ||
    normalized === "cancel"
  ) {
    return result("reject_test_action", raw, normalized, {}, "high", "Rejecting pending test action...");
  }

  // Mode activation: "activate X mode" / "return to X mode" / "switch to X mode"
  const modeActivateMatch = normalized.match(
    /^(?:activate|switch to|enable|start|return to|go to|use)\s+(.+)$/
  );
  if (modeActivateMatch) {
    const modeName = modeActivateMatch[1].trim();
    const modeId = MODE_NAME_MAP[modeName];
    if (modeId) {
      return result(
        "mode_change",
        raw,
        normalized,
        { modeId },
        "high",
        `Activating ${modeId.charAt(0).toUpperCase() + modeId.slice(1)} Mode.`
      );
    }
  }

  // Fallback: unknown command.
  return result(
    "unknown",
    raw,
    normalized,
    {},
    "low",
    `I don't have a handler for "${raw}" yet. This command has been logged. Phase 0 only supports deterministic commands.`
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function result(
  intent: CommandIntent,
  raw: string,
  normalized: string,
  payload: Record<string, unknown>,
  confidence: "high" | "medium" | "low",
  response: string
): CommandRouteResult {
  return { intent, raw, normalized, payload, confidence, response };
}
