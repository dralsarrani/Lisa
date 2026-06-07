import { describe, it, expect } from "vitest";
import {
  isTtsSuppressedMode,
  isInteractionSpeakEligible,
  shouldAutoSpeakInteraction,
  buildTtsSpeechAuditDetails,
  buildTtsTestAuditDetails,
  buildSpeakTextInvokeArgs,
} from "../core/tts";
import type { LisaInteraction, LisaSettings } from "../core/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInteraction(overrides: Partial<LisaInteraction> = {}): LisaInteraction {
  return {
    id: "ix-1",
    kind: "local_ai",
    prompt: "Hello",
    response: "I am Lisa.",
    status: "complete",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as LisaInteraction;
}

const baseSettings: Pick<LisaSettings, "voiceOutputEnabled" | "voiceOutputAutoSpeak" | "voiceOutputSuppressInPrivacyModes"> = {
  voiceOutputEnabled: true,
  voiceOutputAutoSpeak: true,
  voiceOutputSuppressInPrivacyModes: true,
};

// ─── isTtsSuppressedMode ──────────────────────────────────────────────────────

describe("isTtsSuppressedMode", () => {
  it("returns true for sleep", () => expect(isTtsSuppressedMode("sleep")).toBe(true));
  it("returns true for privacy", () => expect(isTtsSuppressedMode("privacy")).toBe(true));
  it("returns true for lockdown", () => expect(isTtsSuppressedMode("lockdown")).toBe(true));
  it("returns false for normal", () => expect(isTtsSuppressedMode("normal")).toBe(false));
  it("returns false for focus", () => expect(isTtsSuppressedMode("focus")).toBe(false));
  it("returns false for cyber", () => expect(isTtsSuppressedMode("cyber")).toBe(false));
});

// ─── isInteractionSpeakEligible ───────────────────────────────────────────────

describe("isInteractionSpeakEligible", () => {
  const opts = {
    settings: { voiceOutputEnabled: true },
    orbState: "idle",
    voiceStatus: "idle" as const,
  };

  it("returns true for a complete local_ai interaction with response", () => {
    expect(isInteractionSpeakEligible(makeInteraction(), opts)).toBe(true);
  });

  it("returns false when kind is not local_ai", () => {
    expect(isInteractionSpeakEligible(makeInteraction({ kind: "command" }), opts)).toBe(false);
  });

  it("returns false when voiceStatus is transcribing", () => {
    expect(isInteractionSpeakEligible(makeInteraction(), { ...opts, voiceStatus: "transcribing" })).toBe(false);
  });

  it("returns false when status is not complete", () => {
    expect(isInteractionSpeakEligible(makeInteraction({ status: "streaming" }), opts)).toBe(false);
    expect(isInteractionSpeakEligible(makeInteraction({ status: "thinking" }), opts)).toBe(false);
  });

  it("returns false when response is empty", () => {
    expect(isInteractionSpeakEligible(makeInteraction({ response: "" }), opts)).toBe(false);
    expect(isInteractionSpeakEligible(makeInteraction({ response: "   " }), opts)).toBe(false);
  });

  it("returns false when voiceOutputEnabled is false", () => {
    expect(isInteractionSpeakEligible(makeInteraction(), { ...opts, settings: { voiceOutputEnabled: false } })).toBe(false);
  });

  it("returns false when orbState is emergency_stopped", () => {
    expect(isInteractionSpeakEligible(makeInteraction(), { ...opts, orbState: "emergency_stopped" })).toBe(false);
  });

  it("returns false when microphone is recording", () => {
    expect(isInteractionSpeakEligible(makeInteraction(), { ...opts, voiceStatus: "recording" })).toBe(false);
  });
});

// ─── shouldAutoSpeakInteraction ───────────────────────────────────────────────

describe("shouldAutoSpeakInteraction", () => {
  const baseOpts = {
    settings: baseSettings,
    orbState: "idle",
    voiceStatus: "idle" as const,
    activeMode: "normal" as const,
    spokenInteractionIds: [] as string[],
  };

  it("allows auto-speak for a fresh eligible interaction", () => {
    const result = shouldAutoSpeakInteraction(makeInteraction(), baseOpts);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("blocks when auto_speak_disabled", () => {
    const result = shouldAutoSpeakInteraction(makeInteraction(), {
      ...baseOpts,
      settings: { ...baseSettings, voiceOutputAutoSpeak: false },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("auto_speak_disabled");
  });

  it("blocks when interaction is not eligible (voiceOutputEnabled: false)", () => {
    const result = shouldAutoSpeakInteraction(makeInteraction(), {
      ...baseOpts,
      settings: { ...baseSettings, voiceOutputEnabled: false },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_eligible");
  });

  it("blocks when mode is suppressed and suppression is on", () => {
    const result = shouldAutoSpeakInteraction(makeInteraction(), {
      ...baseOpts,
      activeMode: "sleep",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("mode_suppressed:sleep");
  });

  it("allows when mode is suppressed but suppression setting is off", () => {
    const result = shouldAutoSpeakInteraction(makeInteraction(), {
      ...baseOpts,
      settings: { ...baseSettings, voiceOutputSuppressInPrivacyModes: false },
      activeMode: "sleep",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks when interaction was already spoken", () => {
    const result = shouldAutoSpeakInteraction(makeInteraction({ id: "ix-1" }), {
      ...baseOpts,
      spokenInteractionIds: ["ix-1"],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("already_spoken");
  });

  it("blocks when microphone is recording", () => {
    const result = shouldAutoSpeakInteraction(makeInteraction(), {
      ...baseOpts,
      voiceStatus: "recording",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_eligible");
  });

  it("blocks when emergency stopped", () => {
    const result = shouldAutoSpeakInteraction(makeInteraction(), {
      ...baseOpts,
      orbState: "emergency_stopped",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_eligible");
  });
});

// ─── Audit metadata builders ──────────────────────────────────────────────────

describe("buildTtsSpeechAuditDetails", () => {
  it("formats audit details without spoken text", () => {
    const details = buildTtsSpeechAuditDetails({
      interactionId: "ix-abc",
      charCount: 42,
      provider: "windows_sapi",
      source: "manual",
    });
    expect(details).toBe("interaction_id=ix-abc chars=42 provider=windows_sapi source=manual");
    expect(details).not.toContain("Hello");
  });
});

describe("buildTtsTestAuditDetails", () => {
  it("formats test audit details without spoken text", () => {
    const details = buildTtsTestAuditDetails({ charCount: 18, provider: "windows_sapi" });
    expect(details).toBe("chars=18 provider=windows_sapi source=test_voice");
  });
});

// ─── buildSpeakTextInvokeArgs ─────────────────────────────────────────────────

describe("buildSpeakTextInvokeArgs — wraps payload in `request` key", () => {
  it("result has a `request` key", () => {
    const args = buildSpeakTextInvokeArgs({ text: "Hello", source: "test" });
    expect(args).toHaveProperty("request");
  });

  it("request.text matches input text", () => {
    const args = buildSpeakTextInvokeArgs({ text: "Hello Lisa", source: "test" });
    expect(args.request.text).toBe("Hello Lisa");
  });

  it("request.source matches input source", () => {
    const args = buildSpeakTextInvokeArgs({ text: "x", source: "settings_test_voice" });
    expect(args.request.source).toBe("settings_test_voice");
  });

  it("optional fields default to null when omitted", () => {
    const args = buildSpeakTextInvokeArgs({ text: "x", source: "console_manual_speak" });
    expect(args.request.voice_id).toBeNull();
    expect(args.request.rate).toBeNull();
    expect(args.request.volume).toBeNull();
  });

  it("optional fields are passed through when provided", () => {
    const args = buildSpeakTextInvokeArgs({ text: "x", source: "test", voiceId: "Microsoft David", rate: 0, volume: 80 });
    expect(args.request.voice_id).toBe("Microsoft David");
    expect(args.request.rate).toBe(0);
    expect(args.request.volume).toBe(80);
  });

  it("explicit null optional fields remain null", () => {
    const args = buildSpeakTextInvokeArgs({ text: "x", source: "test", voiceId: null, rate: null, volume: null });
    expect(args.request.voice_id).toBeNull();
    expect(args.request.rate).toBeNull();
    expect(args.request.volume).toBeNull();
  });

  it("does not include a top-level `text` key (old broken shape)", () => {
    const args = buildSpeakTextInvokeArgs({ text: "Hello", source: "test" }) as Record<string, unknown>;
    expect(args["text"]).toBeUndefined();
  });
});
