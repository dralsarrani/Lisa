import { describe, it, expect } from "vitest";
import {
  CLARIFICATION_TEXT,
  shouldAutoSubmitTranscript,
  shouldAutoSpeakVoiceReply,
  shouldSpokenClarify,
  buildVoiceAutoSendAuditDetails,
} from "../core/voice-conversation";
import type { LisaInteraction } from "../core/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInteraction(overrides: Partial<LisaInteraction> = {}): LisaInteraction {
  return {
    id: "ix-1",
    kind: "local_ai",
    prompt: "Hello",
    response: "I am Lisa.",
    status: "complete",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "voice",
    ...overrides,
  } as LisaInteraction;
}

const autoSendSettings = {
  voiceConversationEnabled: true,
  voiceConversationMode: "auto_send" as const,
  voiceConversationSuppressInPrivacyModes: true,
};

const voiceReplySettings = {
  voiceAutoSpeakReplies: true,
  voiceOutputEnabled: true,
};

const clarifySettings = {
  voiceConversationEnabled: true,
  voiceNoTranscriptAction: "clarify" as const,
  voiceConversationSuppressInPrivacyModes: true,
  voiceOutputEnabled: true,
};

// ─── shouldAutoSubmitTranscript ───────────────────────────────────────────────

describe("shouldAutoSubmitTranscript", () => {
  const baseOpts = {
    settings: autoSendSettings,
    orbState: "idle",
    voiceStatus: "preview" as const,
    activeMode: "normal" as const,
  };

  it("allows when voiceConversationEnabled=true, mode=auto_send, orbState=idle", () => {
    expect(shouldAutoSubmitTranscript(baseOpts).allowed).toBe(true);
  });

  it("blocks when voiceConversationEnabled=false", () => {
    const result = shouldAutoSubmitTranscript({
      ...baseOpts,
      settings: { ...autoSendSettings, voiceConversationEnabled: false },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("voice_conversation_disabled");
  });

  it("blocks when mode=confirm", () => {
    const result = shouldAutoSubmitTranscript({
      ...baseOpts,
      settings: { ...autoSendSettings, voiceConversationMode: "confirm" },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("mode_requires_confirm:confirm");
  });

  it("blocks when mode=manual_review", () => {
    const result = shouldAutoSubmitTranscript({
      ...baseOpts,
      settings: { ...autoSendSettings, voiceConversationMode: "manual_review" },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("mode_requires_confirm:manual_review");
  });

  it("blocks when orbState=emergency_stopped", () => {
    const result = shouldAutoSubmitTranscript({ ...baseOpts, orbState: "emergency_stopped" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("emergency_stopped");
  });

  it("blocks when voiceStatus=transcribing", () => {
    const result = shouldAutoSubmitTranscript({ ...baseOpts, voiceStatus: "transcribing" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("transcription_in_progress");
  });

  it("blocks when activeMode=sleep and suppression=true", () => {
    const result = shouldAutoSubmitTranscript({ ...baseOpts, activeMode: "sleep" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("mode_suppressed:sleep");
  });

  it("blocks when activeMode=privacy and suppression=true", () => {
    const result = shouldAutoSubmitTranscript({ ...baseOpts, activeMode: "privacy" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("mode_suppressed:privacy");
  });

  it("allows when activeMode=sleep but suppression=false", () => {
    const result = shouldAutoSubmitTranscript({
      ...baseOpts,
      activeMode: "sleep",
      settings: { ...autoSendSettings, voiceConversationSuppressInPrivacyModes: false },
    });
    expect(result.allowed).toBe(true);
  });

  it("does not have reopen/rearm fields (no auto-mic behavior)", () => {
    const result = shouldAutoSubmitTranscript(baseOpts);
    const keys = Object.keys(result);
    expect(keys).not.toContain("reopen_mic");
    expect(keys).not.toContain("rearm_recording");
    expect(keys).not.toContain("restart_listening");
  });
});

// ─── shouldAutoSpeakVoiceReply ────────────────────────────────────────────────

describe("shouldAutoSpeakVoiceReply", () => {
  const baseOpts = {
    settings: voiceReplySettings,
    orbState: "idle",
    spokenInteractionIds: [] as string[],
  };

  it("allows: source=voice, voiceAutoSpeakReplies=true, not yet spoken", () => {
    expect(shouldAutoSpeakVoiceReply(makeInteraction(), baseOpts).allowed).toBe(true);
  });

  it("blocks when source=typed", () => {
    const result = shouldAutoSpeakVoiceReply(makeInteraction({ source: "typed" }), baseOpts);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_voice_sourced");
  });

  it("blocks when source=undefined", () => {
    const result = shouldAutoSpeakVoiceReply(makeInteraction({ source: undefined }), baseOpts);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_voice_sourced");
  });

  it("blocks when voiceAutoSpeakReplies=false", () => {
    const result = shouldAutoSpeakVoiceReply(makeInteraction(), {
      ...baseOpts,
      settings: { ...voiceReplySettings, voiceAutoSpeakReplies: false },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("voice_auto_speak_replies_disabled");
  });

  it("blocks when voiceOutputEnabled=false", () => {
    const result = shouldAutoSpeakVoiceReply(makeInteraction(), {
      ...baseOpts,
      settings: { ...voiceReplySettings, voiceOutputEnabled: false },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("voice_output_disabled");
  });

  it("blocks when already spoken", () => {
    const result = shouldAutoSpeakVoiceReply(makeInteraction({ id: "ix-1" }), {
      ...baseOpts,
      spokenInteractionIds: ["ix-1"],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("already_spoken");
  });

  it("blocks when orbState=emergency_stopped", () => {
    const result = shouldAutoSpeakVoiceReply(makeInteraction(), {
      ...baseOpts,
      orbState: "emergency_stopped",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("emergency_stopped");
  });

  it("blocks when status is not complete", () => {
    const result = shouldAutoSpeakVoiceReply(makeInteraction({ status: "streaming" }), baseOpts);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_complete");
  });

  it("blocks when response is empty", () => {
    const result = shouldAutoSpeakVoiceReply(makeInteraction({ response: "   " }), baseOpts);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("empty_response");
  });

  it("does not have reopen/rearm fields (no auto-mic behavior)", () => {
    const result = shouldAutoSpeakVoiceReply(makeInteraction(), baseOpts);
    const keys = Object.keys(result);
    expect(keys).not.toContain("reopen_mic");
    expect(keys).not.toContain("rearm_recording");
  });
});

// ─── shouldSpokenClarify ──────────────────────────────────────────────────────

describe("shouldSpokenClarify", () => {
  const baseOpts = {
    settings: clarifySettings,
    orbState: "idle",
    activeMode: "normal" as const,
  };

  it("allows when all conditions met", () => {
    expect(shouldSpokenClarify(baseOpts)).toBe(true);
  });

  it("blocks when voiceConversationEnabled=false (manual review mode unchanged)", () => {
    expect(shouldSpokenClarify({
      ...baseOpts,
      settings: { ...clarifySettings, voiceConversationEnabled: false },
    })).toBe(false);
  });

  it("blocks when voiceNoTranscriptAction=silent", () => {
    expect(shouldSpokenClarify({
      ...baseOpts,
      settings: { ...clarifySettings, voiceNoTranscriptAction: "silent" },
    })).toBe(false);
  });

  it("blocks when voiceOutputEnabled=false", () => {
    expect(shouldSpokenClarify({
      ...baseOpts,
      settings: { ...clarifySettings, voiceOutputEnabled: false },
    })).toBe(false);
  });

  it("blocks when orbState=emergency_stopped", () => {
    expect(shouldSpokenClarify({ ...baseOpts, orbState: "emergency_stopped" })).toBe(false);
  });

  it("blocks when activeMode=sleep and suppression=true", () => {
    expect(shouldSpokenClarify({ ...baseOpts, activeMode: "sleep" })).toBe(false);
  });

  it("allows when activeMode=sleep but suppression=false", () => {
    expect(shouldSpokenClarify({
      ...baseOpts,
      activeMode: "sleep",
      settings: { ...clarifySettings, voiceConversationSuppressInPrivacyModes: false },
    })).toBe(true);
  });
});

// ─── CLARIFICATION_TEXT ───────────────────────────────────────────────────────

describe("CLARIFICATION_TEXT", () => {
  it("is non-empty", () => {
    expect(CLARIFICATION_TEXT.trim().length).toBeGreaterThan(0);
  });

  it("does not contain user-variable content placeholders", () => {
    expect(CLARIFICATION_TEXT).not.toMatch(/\$\{/);
    expect(CLARIFICATION_TEXT).not.toMatch(/transcript/i);
  });
});

// ─── buildVoiceAutoSendAuditDetails ──────────────────────────────────────────

describe("buildVoiceAutoSendAuditDetails", () => {
  it("contains transcript char count", () => {
    const d = buildVoiceAutoSendAuditDetails({ transcriptCharCount: 42, mode: "auto_send" });
    expect(d).toContain("transcript_chars=42");
  });

  it("contains mode name", () => {
    const d = buildVoiceAutoSendAuditDetails({ transcriptCharCount: 10, mode: "auto_send" });
    expect(d).toContain("mode=auto_send");
  });

  it("does not contain spoken text content", () => {
    const d = buildVoiceAutoSendAuditDetails({ transcriptCharCount: 5, mode: "auto_send" });
    expect(d).not.toContain("Hello");
    expect(d).not.toContain("Lisa");
  });
});
