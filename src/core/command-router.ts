import type { CommandIntent, CommandRouteResult, LisaModeId, ScreenStatus } from "./types";

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

  // ── Voice output (TTS) commands ──

  // Test voice.
  if (normalized === "test voice" || normalized === "test your voice") {
    return result("tts_test_voice", raw, normalized, {}, "high", "Testing local voice output…");
  }

  // Stop speaking.
  if (
    normalized === "stop speaking" ||
    normalized === "be quiet" ||
    normalized === "shh" ||
    normalized === "silence"
  ) {
    return result("tts_stop_speaking", raw, normalized, {}, "high", "Stopping speech.");
  }

  // Enable voice output.
  if (normalized === "enable voice output" || normalized === "turn on voice output") {
    return result("tts_enable", raw, normalized, {}, "high", "Voice output enabled.");
  }

  // Disable voice output.
  if (normalized === "disable voice output" || normalized === "turn off voice output") {
    return result("tts_disable", raw, normalized, {}, "high", "Voice output disabled.");
  }

  // Auto-speak on.
  if (
    normalized === "turn on auto speak" ||
    normalized === "enable auto speak" ||
    normalized === "auto speak on"
  ) {
    return result("tts_auto_speak_on", raw, normalized, {}, "high", "Auto-speak enabled. Lisa will speak completed local AI responses automatically.");
  }

  // Auto-speak off / silent mode.
  if (
    normalized === "turn off auto speak" ||
    normalized === "disable auto speak" ||
    normalized === "auto speak off" ||
    normalized === "silent mode"
  ) {
    return result("tts_auto_speak_off", raw, normalized, {}, "high", "Auto-speak disabled.");
  }

  // Speak again.
  if (normalized === "speak again" || normalized === "repeat that") {
    return result("tts_speak_again", raw, normalized, {}, "high", "Repeating last response…");
  }

  // Enable voice conversation.
  if (
    normalized === "enable voice conversation" ||
    normalized === "turn on voice conversation" ||
    normalized === "voice conversation on"
  ) {
    return result("voice_conversation_enable", raw, normalized, {}, "high", "Voice conversation enabled. Hold V to speak — transcript will auto-send when released.");
  }

  // Disable voice conversation.
  if (
    normalized === "disable voice conversation" ||
    normalized === "turn off voice conversation" ||
    normalized === "voice conversation off"
  ) {
    return result("voice_conversation_disable", raw, normalized, {}, "high", "Voice conversation disabled. Returning to manual review mode.");
  }

  // ── Screen awareness commands ──

  // Capture screen — explicit user-triggered action.
  if (
    normalized === "capture screen" ||
    normalized === "take screenshot" ||
    normalized === "take a screenshot" ||
    normalized === "look at my screen" ||
    normalized === "look at the screen"
  ) {
    return result("capture_screen", raw, normalized, {}, "high", "Capturing screen context...");
  }

  // What can you see — honest response based on whether screen context exists.
  if (
    normalized === "what can you see" ||
    normalized === "what do you see" ||
    normalized === "describe screen context" ||
    normalized === "describe what you see"
  ) {
    return result("screen_what_can_you_see", raw, normalized, {}, "high", "Checking screen context...");
  }

  // Clear screen context.
  if (
    normalized === "clear screen context" ||
    normalized === "forget screen context" ||
    normalized === "clear screen"
  ) {
    return result("clear_screen_context", raw, normalized, {}, "high", "Screen context cleared.");
  }

  // Enable screen awareness.
  if (
    normalized === "enable screen awareness" ||
    normalized === "turn on screen awareness"
  ) {
    return result("screen_awareness_enable", raw, normalized, {}, "high", "Screen awareness enabled.");
  }

  // Disable screen awareness.
  if (
    normalized === "disable screen awareness" ||
    normalized === "turn off screen awareness"
  ) {
    return result("screen_awareness_disable", raw, normalized, {}, "high", "Screen awareness disabled.");
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
    "No. Phase 3D is push-to-talk only. Lisa has no wake word and no always-on background listening. Recording only happens while you hold KeyV.",
  ],
  // Wake word
  [
    /\bwake\s+word\b/i,
    "No. Lisa has no wake word. Voice input is push-to-talk only — hold KeyV when the command box is not focused, speak, then release to transcribe.",
  ],
  // TTS / speak back / voice output
  [
    /\b(?:tts|text.to.speech|voice\s+output|voice\s+synthesis)\b|\bspeak\s+(?:back|out\s+loud|aloud)\b|\btalk\s+back\b|\bread\s+(?:out\s+loud|aloud|back)\b|\bcan\s+(?:you\s+)?(?:speak|talk)\s+(?:back|out\s+loud|aloud)\b/i,
    "Phase 3E: Local voice output (TTS) is available when enabled in Settings → Voice Output. Lisa can speak completed local AI responses using your system's built-in speech engine (Windows SAPI). Enable it in settings, then use 'Test Voice' to verify. Auto-speak can be turned on for automatic speech after each AI response. Voice output is suppressed in Sleep, Privacy, and Lockdown modes. No cloud TTS, no voice cloning, no always-on listening.",
  ],
  // No mic button / can't find / "there is no mic button"
  [
    /\bthere\s+is\s+no\s+mic(?:rophone)?\s+button\b|\bno\s+mic(?:rophone)?\s+button\b|\bmic(?:rophone)?\s+button\s+(?:missing|not\s+(?:visible|showing|there|found|appear))\b|\b(?:can'?t?\s+|cannot\s+)?(?:find|see)\s+(?:the\s+)?mic(?:rophone)?\s+button\b|\bwhere\s+is\s+(?:the\s+)?mic(?:rophone)?\s+button\b/i,
    "Phase 3D uses keyboard-only push-to-talk — there is no on-screen mic button. Hold KeyV (when not typing) to record, release to transcribe. A Whisper model must be configured in Settings → Voice Input first.",
  ],
  // KeyV not working / worked once then stopped
  [
    /\bkey\s*v\s+(?:not\s+working|doesn'?t?\s+work|isn'?t?\s+working|not\s+responding|nothing|does\s+nothing|worked.*stopped|stopped\s+working)\b|\bkeyv\b.*\b(?:not\s+working|doesn'?t?\s+work|nothing|worked.*stopped|stopped)\b|\bv\s+key\s+not\s+working\b|\bpush.to.talk\s+(?:not\s+working|broken|doesn'?t?\s+work)\b/i,
    "KeyV is ignored while you are typing in the command box so it does not hijack normal text input. Click outside the input first, then hold KeyV. Also confirm a Whisper model path is set in Settings → Voice Input — without a model, recording will show an error instead of starting.",
  ],
  // Nothing happened / no transcript / why didn't voice work
  [
    /\b(?:nothing\s+happened|nothing\s+came\s+up|no\s+(?:result|response|text|transcript))\s+(?:after|when|from)\s+(?:voice|speaking|talking)\b|\b(?:asked|spoke|said|talked)\s+(?:through|via|using)\s+voice.*(?:nothing|no\s+(?:result|response|text|transcript))\b|\bvoice.*(?:nothing\s+happened|no\s+response|not\s+transcribed)\b|\bwhy\s+didn'?t?\s+(?:lisa\s+)?answer.*voice\b|\bwhy\s+didn'?t?\s+voice\s+work\b/i,
    "Check two things: (1) A Whisper model path must be set in Settings → Voice Input. Without it, recording will not start. (2) Speak clearly and hold KeyV for at least a second — very short recordings may return an empty transcript.",
  ],
  // Voice not working (general troubleshooting)
  [
    /\bvoice\s+(?:not\s+working|doesn'?t?\s+work|isn'?t?\s+working|failed|broken|not\s+responding)\b|\bvoice\s+(?:did\s+)?(?:nothing|not\s+(?:do|respond|start|activate))\b/i,
    "Phase 3D push-to-talk flow: (1) Set a Whisper model path in Settings → Voice Input. (2) Click outside the command box. (3) Hold KeyV — microphone opens. (4) Speak. (5) Release KeyV — local Whisper transcribes. (6) Review transcript in preview card, then click Send Transcript or Discard. No audio is sent to any network service.",
  ],
  // General voice input capability / how to enable
  [
    /\bvoice\s+(?:input|command|commands|control|recognition|feature|capability|support)\b|\benable\s+voice\b|\buse\s+voice\s+input\b|\bhave\s+voice\s+input\b/i,
    "Phase 3D/3G: Lisa supports local push-to-talk voice input. Hold KeyV (outside the text box) to record, release to transcribe with local Whisper. In Manual Review mode (default), review the transcript and click Send Transcript. In Voice Conversation mode (Settings → Voice Conversation or type 'enable voice conversation'), the transcript auto-sends and Lisa speaks the reply. No background listening, no wake word, no cloud STT. The microphone never opens automatically — you must hold KeyV for every turn.",
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

// ─── Screen capability guard ─────────────────────────────────────────────────
//
// Returns a canned accurate message for screen-related questions forwarded to LLM.
// Called before the LLM streaming path in CommandInput so small models cannot
// hallucinate OCR, desktop control, or continuous watching.

const SCREEN_CAPABILITY_QA: Array<[RegExp, string]> = [
  // Background / continuous watching
  [
    /\bwatch(?:ing)?\s+(?:my\s+)?screen\b|\bcontinuous(?:ly)?\s+(?:watch|monitor|capture|watch)\s+screen\b|\bbackground\s+screen\b|\balways.on\s+screen\b/i,
    "No. Lisa does not watch your screen in the background. Phase 4A screen awareness is manual-only: you trigger each capture with 'capture screen' or the button in Settings. There is no continuous monitoring.",
  ],
  // OCR / reading text from screen
  [
    /\bocr\b|\bread\s+text\s+(?:from|on|off)\s+(?:the\s+|my\s+)?screen\b|\bextract\s+text\s+from\s+(?:the\s+|my\s+)?screen\b/i,
    "OCR (reading text from screenshots) is not implemented in Phase 4A. Lisa captures metadata only — resolution and timestamp. No text extraction, no optical character recognition.",
  ],
  // Screenshot upload / cloud
  [
    /\bupload\s+(?:the\s+)?screenshot\b|\bsend\s+(?:the\s+)?screenshot\b|\bshare\s+(?:the\s+)?screenshot\b/i,
    "Screenshots are local only. Lisa never uploads, sends, or shares screenshots to any network service. All capture stays on your machine.",
  ],
  // General screen awareness capability
  [
    /\bscreen\s+(?:awareness|context|capture|screenshot)\b|\bcan\s+(?:you\s+)?see\s+(?:my\s+|the\s+)?screen\b|\bdo\s+you\s+have\s+screen\s+(?:access|context)\b/i,
    "Phase 4A: Lisa has manual screen awareness. Use 'capture screen' or the button in Settings → Screen Awareness to take a snapshot. Lisa sees metadata only (resolution, timestamp) — no OCR, no image understanding, no cloud upload, no background watching. Enable 'Include Screen Context in AI' in settings to include metadata in local AI prompts.",
  ],
];

export function getScreenCapabilityMessage(raw: string): string | null {
  for (const [re, response] of SCREEN_CAPABILITY_QA) {
    if (re.test(raw)) {
      return response;
    }
  }
  return null;
}

// ─── Screen context formatter ─────────────────────────────────────────────────
//
// Pure helper: returns a grounded answer from actual reducer state.
// Used by CommandInput for deterministic screen_what_can_you_see — no LLM involved.

export function formatScreenContextResponse(screenState: {
  screenStatus: ScreenStatus;
  screenCapturedAt?: number;
  screenWidth?: number;
  screenHeight?: number;
  screenProvider?: string;
}): string {
  const { screenStatus, screenCapturedAt, screenWidth, screenHeight, screenProvider } = screenState;
  if (screenStatus !== "available" || screenWidth === undefined || screenHeight === undefined) {
    return "I do not have screen context yet. Use 'capture screen' or the Screen Awareness button to capture metadata manually.";
  }
  const resolution = `${screenWidth}×${screenHeight}`;
  const provider = screenProvider ?? "unknown";
  const capturedAt = screenCapturedAt ? new Date(screenCapturedAt).toLocaleTimeString() : "unknown";
  return [
    "I have manual screen context from the latest capture:",
    `- Resolution: ${resolution}`,
    `- Provider: ${provider}`,
    `- Captured: ${capturedAt}`,
    "",
    "I only have metadata in Phase 4A. I cannot read text on the screen, inspect pixels, perform OCR, or control the desktop yet.",
  ].join("\n");
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
  // Screen reading via OCR — not implemented
  /\bread\s+(?:my|the|your)\s+screen\b/i,
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
