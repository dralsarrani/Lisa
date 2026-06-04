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

function modeResponse(modeId: LisaModeId): string {
  return `Activating ${modeId.charAt(0).toUpperCase() + modeId.slice(1)} Mode.`;
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
  if (
    normalized === "sleep" ||
    normalized === "go to sleep" ||
    normalized === "quiet mode"
  ) {
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

  // ── Memory commands (before approve/reject so "confirm clear memory" wins) ──

  // Confirm clear — must come before bare "confirm" → approve_test_action.
  if (normalized === "confirm clear memory") {
    return result("confirm_clear_memory_notes", raw, normalized, {}, "high", "Confirming memory clear...");
  }

  // Add memory note — extract content from raw (case preserved, prefix stripped).
  {
    const prefixStripped = raw.replace(/^lisa[,\s]+/i, "").replace(/[.,!?]+$/, "").trim();
    const addNoteMatch =
      prefixStripped.match(/^remember\s+that\s+(.+)$/i) ||
      prefixStripped.match(/^remember\s+(.+)$/i) ||
      prefixStripped.match(/^note\s+that\s+(.+)$/i) ||
      prefixStripped.match(/^save\s+memory[:\s]\s*(.+)$/i) ||
      prefixStripped.match(/^add\s+memory[:\s]\s*(.+)$/i);
    if (addNoteMatch) {
      const noteContent = addNoteMatch[1].trim();
      return result("add_memory_note", raw, normalized, { noteContent }, "high", "Saving memory note...");
    }
  }

  // List memory notes.
  if (
    normalized === "show memory notes" ||
    normalized === "show my memory notes" ||
    normalized === "list memory notes" ||
    normalized === "list my memory notes" ||
    normalized === "what do you remember" ||
    normalized === "what memory notes do you have" ||
    normalized === "memory notes"
  ) {
    return result("list_memory_notes", raw, normalized, {}, "high", "Listing memory notes...");
  }

  // Delete memory note by number.
  {
    const deleteNoteMatch = normalized.match(/^(?:delete|forget|remove)\s+memory\s+(\d+)$/);
    if (deleteNoteMatch) {
      const noteIndex = parseInt(deleteNoteMatch[1], 10);
      return result("delete_memory_note", raw, normalized, { noteIndex }, "high", "Deleting memory note...");
    }
  }

  // Request clear all memory notes.
  if (
    normalized === "clear memory notes" ||
    normalized === "clear all memory notes" ||
    normalized === "clear my memory notes" ||
    normalized === "delete all memory notes"
  ) {
    return result("request_clear_memory_notes", raw, normalized, {}, "high", 'Type "confirm clear memory" to delete all memory notes.');
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

  // Tool request — run a named tool (requires approval).
  if (
    normalized === "run conversation stats" ||
    normalized === "conversation stats" ||
    normalized === "show conversation stats"
  ) {
    return result("request_tool", raw, normalized, { toolId: "conversation-stats" }, "high", "Tool request created: Conversation Stats. Approval required before execution.");
  }

  if (
    normalized === "run runtime snapshot" ||
    normalized === "runtime snapshot" ||
    normalized === "show runtime snapshot"
  ) {
    return result("request_tool", raw, normalized, { toolId: "runtime-snapshot" }, "high", "Tool request created: Runtime Snapshot. Approval required before execution.");
  }

  // Approve pending tool request.
  if (
    normalized === "approve tool" ||
    normalized === "approve tool request" ||
    normalized === "approve the tool" ||
    normalized === "approve the tool request"
  ) {
    return result("approve_tool_request", raw, normalized, {}, "high", "Approving pending tool request...");
  }

  // Reject pending tool request.
  if (
    normalized === "reject tool" ||
    normalized === "reject tool request" ||
    normalized === "reject the tool" ||
    normalized === "reject the tool request" ||
    normalized === "cancel tool" ||
    normalized === "cancel tool request"
  ) {
    return result("reject_tool_request", raw, normalized, {}, "high", "Rejecting pending tool request...");
  }

  // Mode activation — verb-based.
  // Supported verbs: activate, switch to, switch, turn on, enable, start,
  //                  return to, go back to, go to, go, use, set to, set.
  // Articles ("the", "a", "an") before the mode name are stripped.
  const modeVerbMatch = normalized.match(
    /^(?:activate|switch to|switch|turn on|enable|start|return to|go back to|go to|go|use|set to|set)\s+(.+)$/
  );
  if (modeVerbMatch) {
    const modeName = modeVerbMatch[1].replace(/^(?:the|a|an)\s+/, "").trim();
    const modeId = MODE_NAME_MAP[modeName];
    if (modeId) {
      return result("mode_change", raw, normalized, { modeId }, "high", modeResponse(modeId));
    }
  }

  // Mode activation — bare mode name (no leading verb).
  // Handles: "cyber mode", "focus", "normal mode", "gaming", etc.
  const bareModeId = MODE_NAME_MAP[normalized];
  if (bareModeId) {
    return result("mode_change", raw, normalized, { modeId: bareModeId }, "high", modeResponse(bareModeId));
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

// ─── Voice capability guard ───────────────────────────────────────────────────
//
// Returns a deterministic Phase 3A voice capability answer when the input asks
// about voice features. Called before the LLM fallback path in CommandInput.
// Small local models reliably ignore system-prompt boundaries; this guard ensures
// accurate answers regardless of model quality.

const VOICE_CAPABILITY_QA: Array<[RegExp, string]> = [
  // Background listening / always-on
  [
    /\blisten(?:ing)?\s+in\s+the\s+background\b|\balways.on\s+listen|\bbackground\s+listen(?:ing)?\b|\bconstantly\s+listen/i,
    "No. Phase 3A is push-to-talk only. Lisa has no wake word and no always-on background listening.",
  ],
  // Wake word
  [
    /\bwake\s+word\b/i,
    "No. Lisa has no wake word in Phase 3A. Voice input is push-to-talk only — hold KeyV when the command box is not focused.",
  ],
  // TTS / speak back / voice output
  [
    /\b(?:tts|text.to.speech|voice\s+output|voice\s+synthesis)\b|\bspeak\s+(?:back|out\s+loud|aloud)\b|\btalk\s+back\b|\bread\s+(?:out\s+loud|aloud|back)\b|\bcan\s+(?:you\s+)?(?:speak|talk)\s+(?:back|out\s+loud|aloud)\b/i,
    "No. Voice output/TTS is not implemented yet. Lisa responds in text only.",
  ],
  // No mic button / can't find / "there is no mic button"
  [
    /\bthere\s+is\s+no\s+mic(?:rophone)?\s+button\b|\bno\s+mic(?:rophone)?\s+button\b|\bmic(?:rophone)?\s+button\s+(?:missing|not\s+(?:visible|showing|there|found|appear))\b|\b(?:can'?t?\s+|cannot\s+)?(?:find|see)\s+(?:the\s+)?mic(?:rophone)?\s+button\b|\bwhere\s+is\s+(?:the\s+)?mic(?:rophone)?\s+button\b/i,
    "Correct. Phase 3A is currently KeyV-only. Hold KeyV when the command box is not focused to test the voice UI. The feature does not transcribe speech yet because local STT is not configured.",
  ],
  // KeyV not working / worked once then stopped
  [
    /\bkey\s*v\s+(?:not\s+working|doesn'?t?\s+work|isn'?t?\s+working|not\s+responding|nothing|does\s+nothing|worked.*stopped|stopped\s+working)\b|\bkeyv\b.*\b(?:not\s+working|doesn'?t?\s+work|nothing|worked.*stopped|stopped)\b|\bv\s+key\s+not\s+working\b|\bpush.to.talk\s+(?:not\s+working|broken|doesn'?t?\s+work)\b/i,
    "KeyV is ignored while you are typing in the command box so it does not hijack normal text input. Click outside the input first, then hold KeyV.",
  ],
  // Nothing happened / why didn't Lisa answer voice question
  [
    /\b(?:nothing\s+happened|nothing\s+came\s+up|no\s+(?:result|response|text|transcript))\s+(?:after|when|from)\s+(?:voice|speaking|talking)\b|\b(?:asked|spoke|said|talked)\s+(?:through|via|using)\s+voice.*(?:nothing|no\s+(?:result|response|text|transcript))\b|\bvoice.*(?:nothing\s+happened|no\s+response|not\s+transcribed)\b|\bwhy\s+didn'?t?\s+(?:lisa\s+)?answer.*voice\b|\bwhy\s+didn'?t?\s+voice\s+work\b/i,
    "That is expected in Phase 3A until a local STT engine is configured. The current voice control only tests the UI and shows an STT-not-configured result. It does not transcribe speech or submit a command yet.",
  ],
  // Voice not working (general troubleshooting)
  [
    /\bvoice\s+(?:not\s+working|doesn'?t?\s+work|isn'?t?\s+working|failed|broken|not\s+responding)\b|\bvoice\s+(?:did\s+)?(?:nothing|not\s+(?:do|respond|start|activate))\b/i,
    'Phase 3A voice expected behavior: hold KeyV when the command box is not focused → release KeyV → preview shows "Voice UI test result". Local STT is not configured, so no speech is transcribed — this is a UI test only. If KeyV does nothing, click somewhere outside the text input first (KeyV is blocked while typing).',
  ],
  // General voice input capability / how to enable
  [
    /\bvoice\s+(?:input|command|commands|control|recognition|feature|capability|support)\b|\benable\s+voice\b|\buse\s+voice\s+input\b|\bhave\s+voice\s+input\b/i,
    "Lisa has a Phase 3A KeyV voice UI test. Local STT is not configured yet, so Lisa cannot transcribe real speech yet. Hold KeyV when the command box is not focused to test the UI. Lisa does not listen in the background and no audio is sent to any network service.",
  ],
];

export function getVoiceCapabilityMessage(raw: string): string | null {
  for (const [re, response] of VOICE_CAPABILITY_QA) {
    if (re.test(raw)) {
      return response;
    }
  }
  return null;
}

// ─── Desktop-action guard ─────────────────────────────────────────────────────
//
// Returns a safe refusal message if the raw input matches a known pattern for
// unsupported desktop/system action commands, or null if safe to forward to LLM.
// Called in CommandInput before the LLM streaming path.

const BLOCKED_DESKTOP_ACTIONS: RegExp[] = [
  // App opening / launching / closing
  /\b(?:open|launch|close|quit|run)\s+(?:steam|chrome|firefox|edge|safari|opera|brave|discord|spotify|slack|zoom|teams|word|excel|powerpoint|notepad|explorer|terminal|cmd|powershell|bash|an?\s+app|the\s+app|any\s+app|a\s+program)\b/i,
  // Mouse / cursor / keyboard control
  /\bcontrol\s+(?:my|the|your)\s+(?:mouse|keyboard|desktop|computer|screen|cursor)\b/i,
  /\b(?:move|click|drag)\s+(?:the\s+|my\s+)?(?:mouse|cursor)\b/i,
  /\bright[- ]?click\b/i,
  /\bdouble[- ]?click\b/i,
  // Screen capture / reading
  /\bread\s+(?:my|the|your)\s+screen\b/i,
  /\bcapture\s+(?:the\s+|my\s+)?screen\b/i,
  // File / script execution
  /\b(?:run|execute)\s+(?:this\s+)?(?:file|script|program|code|executable|\.exe|\.sh|\.ps1|\.bat)\b/i,
  /\brun\s+a\s+shell\s+command\b/i,
  /\bexecute\s+a\s+shell\s+command\b/i,
  /\brun\s+shell\b/i,
  // UI interaction
  /\b(?:click|press|tap)\s+(?:this|the|that)\s+button\b/i,
  /\btype\s+this\s+for\s+me\b/i,
  /\btype\s+for\s+me\b/i,
  // Network actions
  /\bconnect\s+to\s+(?:a\s+|the\s+|this\s+)?restricted\s+network\b/i,
  /\bconnect\s+to\s+(?:a\s+|the\s+|this\s+)?(?:corporate|internal|private)\s+(?:network|vpn|wifi)\b/i,
  // Permission requests
  /\b(?:verify|request|approve|grant)\s+permissions?\b/i,
  // Tool / skill installation
  /\binstall\s+(?:this\s+)?(?:tool|skill|plugin|extension|package|app)\b/i,
];

export function getDesktopActionGuardMessage(raw: string): string | null {
  for (const re of BLOCKED_DESKTOP_ACTIONS) {
    if (re.test(raw)) {
      return "That action is not implemented yet. Future tool execution requires explicit approval.";
    }
  }
  return null;
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
