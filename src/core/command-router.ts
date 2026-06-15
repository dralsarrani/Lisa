import type { CommandIntent, CommandRouteResult, LisaInteraction, LisaModeId, ScreenStatus, ScreenOcrStatus } from "./types";

export interface CommandRoutingContext {
  hasUsableOcrText?: boolean;
}

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

export function routeCommand(
  raw: string,
  context: CommandRoutingContext = {}
): CommandRouteResult {
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

  // Speak again — TTS voice path.
  if (
    normalized === "speak again" ||
    normalized === "speak that again" ||
    normalized === "say it out loud again" ||
    normalized === "read that again"
  ) {
    return result("tts_speak_again", raw, normalized, {}, "high", "Repeating last response…");
  }

  // Repeat last response — deterministic text repeat, no LLM.
  if (
    normalized === "say that again" ||
    normalized === "say again" ||
    normalized === "repeat that" ||
    normalized === "repeat last response" ||
    normalized === "repeat the last response" ||
    normalized === "repeat your last response" ||
    normalized === "show that again" ||
    normalized === "show me that again"
  ) {
    return result("repeat_last_response", raw, normalized, {}, "high", "Repeating last response…");
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

  // ── OCR / screen text commands (Phase 4C) ──

  // Run OCR / Read screen text — explicit user-triggered action.
  if (
    normalized === "read screen text" ||
    normalized === "run ocr" ||
    normalized === "extract screen text" ||
    normalized === "scan screen text" ||
    normalized === "ocr screen"
  ) {
    return result("run_screen_ocr", raw, normalized, {}, "high", "Running local OCR on latest screen capture...");
  }

  // What can you read — grounded OCR text response, no LLM.
  if (
    normalized === "what can you read" ||
    normalized === "what you can read" ||
    normalized === "what do you read" ||
    normalized === "what did you read" ||
    normalized === "what can you read from the screen" ||
    normalized === "what text can you read" ||
    normalized === "what text is on my screen" ||
    normalized === "what text can you see" ||
    normalized === "read screen" ||
    normalized === "show screen text" ||
    normalized === "read extracted screen text"
  ) {
    return result("screen_what_can_you_read", raw, normalized, {}, "high", "Checking extracted screen text...");
  }

  // Clear screen text.
  if (
    normalized === "clear screen text" ||
    normalized === "forget screen text" ||
    normalized === "delete screen text"
  ) {
    return result("clear_screen_text", raw, normalized, {}, "high", "Screen text cleared.");
  }

  // Check OCR status.
  if (
    normalized === "check ocr" ||
    normalized === "check ocr status" ||
    normalized === "ocr status"
  ) {
    return result("check_ocr_status", raw, normalized, {}, "high", "Checking OCR status...");
  }

  // ── Grounded screen reasoning commands (Phase 4D) ──

  if (
    normalized === "explain what you read" ||
    normalized === "explain the screen text" ||
    normalized === "explain this screen" ||
    normalized === "explain what is on my screen" ||
    normalized === "explain the visible text"
  ) {
    return result("screen_explain", raw, normalized, {}, "high", "Reasoning over extracted screen text...");
  }

  if (
    normalized === "summarize this screen" ||
    normalized === "summarize the screen" ||
    normalized === "summarize screen text" ||
    normalized === "summarize what you read" ||
    normalized === "give me a summary of the screen"
  ) {
    return result("screen_summarize", raw, normalized, {}, "high", "Summarizing extracted screen text...");
  }

  if (
    normalized === "what is this page about" ||
    normalized === "what is this screen about" ||
    normalized === "what am i looking at" ||
    normalized === "what is open on my screen"
  ) {
    return result("screen_page_about", raw, normalized, {}, "high", "Reasoning about the extracted page text...");
  }

  if (
    normalized === "what should i do next based on the screen" ||
    normalized === "suggest next steps from the screen" ||
    normalized === "help me with this screen" ||
    normalized === "guide me through this screen" ||
    (normalized === "what should i do next" && context.hasUsableOcrText === true)
  ) {
    return result("screen_next_steps", raw, normalized, {}, "high", "Finding grounded next steps from screen text...");
  }

  if (
    normalized === "is there an error on the screen" ||
    normalized === "find errors on the screen" ||
    normalized === "explain the error on the screen" ||
    normalized === "what error do you see"
  ) {
    return result("screen_find_errors", raw, normalized, {}, "high", "Checking extracted screen text for errors...");
  }

  if (
    normalized === "extract action items from the screen" ||
    normalized === "find tasks on the screen" ||
    normalized === "what are the action items"
  ) {
    return result("screen_extract_action_items", raw, normalized, {}, "high", "Extracting action items from screen text...");
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
    /\bocr\b|\bcan\s+(?:you\s+)?read\s+(?:my\s+|the\s+)?screen\b|\bread\s+text\s+(?:from|on|off)\s+(?:the\s+|my\s+)?screen\b|\bextract\s+text\s+from\s+(?:the\s+|my\s+)?screen\b/i,
    "Phase 4C: Local OCR is available. Capture the screen first with 'capture screen', then type 'read screen text' to extract visible text using the Windows built-in OCR engine. Type 'what can you read' to see the extracted text. OCR is manual, local-only, and may be imperfect. No cloud upload, no background OCR, no desktop control.",
  ],
  // Screenshot upload / cloud
  [
    /\bupload\s+(?:the\s+)?screenshot\b|\bsend\s+(?:the\s+)?screenshot\b|\bshare\s+(?:the\s+)?screenshot\b/i,
    "Screenshots are local only. Lisa never uploads, sends, or shares screenshots to any network service. All capture stays on your machine.",
  ],
  // General screen awareness capability
  [
    /\bscreen\s+(?:awareness|context|capture|screenshot)\b|\bcan\s+(?:you\s+)?see\s+(?:my\s+|the\s+)?screen\b|\bdo\s+you\s+have\s+screen\s+(?:access|context)\b/i,
    "Phase 4C: Lisa has manual screen awareness and local OCR. Use 'capture screen' for a local preview and metadata, then 'read screen text' to run OCR explicitly. There is no image understanding, cloud upload, background watching, or desktop control.",
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
  screenFilePath?: string;
}): string {
  const { screenStatus, screenCapturedAt, screenWidth, screenHeight, screenProvider, screenFilePath } = screenState;
  if (screenStatus !== "available" || screenWidth === undefined || screenHeight === undefined) {
    return "I do not have screen context yet. Use 'capture screen' or the Screen Awareness button to capture metadata manually.";
  }
  const resolution = `${screenWidth}×${screenHeight}`;
  const provider = screenProvider ?? "unknown";
  const capturedAt = screenCapturedAt ? new Date(screenCapturedAt).toLocaleTimeString() : "unknown";
  const lines = [
    "I have manual screen context from the latest capture:",
    `- Resolution: ${resolution}`,
    `- Provider: ${provider}`,
    `- Captured: ${capturedAt}`,
  ];
  if (screenFilePath) {
    lines.push("- Preview: Available in Console (local file · not uploaded)");
  }
  lines.push(
    "",
    "I can report capture metadata here. Screen text is available only after you manually run 'read screen text' and ask 'what can you read'. I cannot infer other visual details or control the desktop."
  );
  return lines.join("\n");
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

// ─── OCR response formatter ──────────────────────────────────────────────────
//
// Pure helper: returns a grounded answer from OCR state.
// Used by CommandInput for deterministic screen_what_can_you_read — no LLM.
// The OCR text body may appear in the UI preview because the user explicitly
// requested OCR, but it must NOT appear in audit details.

const OCR_EXCERPT_CHARS = 500;

export function formatOcrResponse(ocrState: {
  screenOcrStatus: ScreenOcrStatus;
  screenOcrText?: string;
  screenOcrChars?: number;
  screenOcrLines?: number;
  screenOcrProvider?: string;
  screenOcrCapturedAt?: number;
}): string {
  const { screenOcrStatus, screenOcrText, screenOcrChars, screenOcrLines, screenOcrProvider, screenOcrCapturedAt } = ocrState;

  if (screenOcrStatus !== "available" || !screenOcrText) {
    return "I do not have extracted screen text yet. Capture the screen first, then run 'read screen text' to extract text with local OCR.";
  }

  const provider = screenOcrProvider ?? "local_ocr";
  const capturedAt = screenOcrCapturedAt ? new Date(screenOcrCapturedAt).toLocaleTimeString() : "unknown";
  const excerpt = screenOcrText.length > OCR_EXCERPT_CHARS
    ? screenOcrText.slice(0, OCR_EXCERPT_CHARS) + "… [truncated]"
    : screenOcrText;

  const lines = [
    "I extracted text from the latest manual screen capture:",
    `- Lines: ${screenOcrLines ?? 0}`,
    `- Characters: ${screenOcrChars ?? 0}`,
    `- Provider: ${provider}`,
    `- Captured: ${capturedAt}`,
    "",
    "Excerpt:",
    `"${excerpt}"`,
    "",
    "OCR can be imperfect. I cannot infer visual details beyond extracted text, and I cannot control the desktop yet.",
  ];
  return lines.join("\n");
}

// ─── Repeat helper ───────────────────────────────────────────────────────────
//
// Pure helper: finds the most recent repeatable response in interaction history.
// Used by CommandInput for deterministic repeat_last_response — no LLM involved.

export function findLastRepeatableResponse(interactions: LisaInteraction[]): string | null {
  for (let i = interactions.length - 1; i >= 0; i--) {
    const ix = interactions[i];
    if (
      (ix.kind === "local_ai" || ix.kind === "command") &&
      ix.status === "complete" &&
      ix.response?.trim()
    ) {
      return ix.response;
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
