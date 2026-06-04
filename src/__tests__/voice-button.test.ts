import { describe, it, expect } from "vitest";
import { getVoiceCapabilityMessage } from "../core/command-router";
import { getKeyVAction } from "../components/voice/VoiceInputControl";

// Phase 3A is KeyV-only — no visible mic button.
// These tests verify that all voice capability responses accurately describe
// the KeyV-only UX and do not reference a "Start Voice UI Test" button.

describe("Phase 3A KeyV-only — 'there is no mic button' is correct behavior", () => {
  it("answers 'there is no mic button'", () => {
    expect(getVoiceCapabilityMessage("there is no mic button")).not.toBeNull();
  });

  it("response says 'Correct'", () => {
    const msg = getVoiceCapabilityMessage("there is no mic button") ?? "";
    expect(msg.toLowerCase()).toContain("correct");
  });

  it("response says KeyV-only", () => {
    const msg = getVoiceCapabilityMessage("there is no mic button") ?? "";
    expect(msg.toLowerCase()).toContain("keyv-only");
  });

  it("response mentions KeyV shortcut", () => {
    const msg = getVoiceCapabilityMessage("there is no mic button") ?? "";
    expect(msg.toLowerCase()).toContain("keyv");
  });

  it("response says local STT is not configured", () => {
    const msg = getVoiceCapabilityMessage("there is no mic button") ?? "";
    expect(msg.toLowerCase()).toContain("not configured");
  });
});

describe("Phase 3A KeyV-only — no response references Start Voice UI Test button", () => {
  const queries = [
    "do you have voice input",
    "voice not working",
    "keyv not working",
    "where is the mic button",
    "mic button missing",
    "there is no mic button",
  ];

  for (const q of queries) {
    it(`"${q}" response does not reference visible button`, () => {
      const msg = getVoiceCapabilityMessage(q) ?? "";
      expect(msg).not.toContain("Start Voice UI Test");
    });
  }
});

describe("Phase 3A KeyV-only — general voice capability describes KeyV", () => {
  it("response mentions KeyV", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("keyv");
  });

  it("response says STT is not configured", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("not configured");
  });

  it("response says no background listening", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("background");
  });
});

describe("Phase 3A KeyV-only — KeyV troubleshooting describes focus requirement", () => {
  it("response explains command box blocks KeyV", () => {
    const msg = getVoiceCapabilityMessage("keyv not working") ?? "";
    expect(msg.toLowerCase()).toContain("command box");
  });

  it("response tells user to click outside the input", () => {
    const msg = getVoiceCapabilityMessage("keyv not working") ?? "";
    expect(msg.toLowerCase()).toContain("click outside");
  });
});

describe("Phase 3A KeyV-only — voice question answered: STT not configured", () => {
  it("'I asked through voice and nothing happened' returns non-null", () => {
    expect(getVoiceCapabilityMessage("I asked through voice and nothing happened")).not.toBeNull();
  });

  it("response says not configured", () => {
    const msg = getVoiceCapabilityMessage("I asked through voice and nothing happened") ?? "";
    expect(msg.toLowerCase()).toContain("configured");
  });

  it("response says does not transcribe or submit command", () => {
    const msg = getVoiceCapabilityMessage("I asked through voice and nothing happened") ?? "";
    expect(msg.toLowerCase()).toMatch(/transcribe|command/);
  });
});

// ── getKeyVAction state-machine tests ─────────────────────────────────────────
// These cover the pure helper so KeyV repeatability cannot silently regress.

describe("getKeyVAction — starts recording from idle", () => {
  it("returns 'start' when idle and canRecord=true", () => {
    expect(getKeyVAction("idle", true)).toBe("start");
  });

  it("returns 'ignore' when idle and canRecord=false", () => {
    expect(getKeyVAction("idle", false)).toBe("ignore");
  });
});

describe("getKeyVAction — restarts from preview (KeyV works after first result)", () => {
  it("returns 'restart' when preview and canRecord=true", () => {
    expect(getKeyVAction("preview", true)).toBe("restart");
  });

  it("returns 'ignore' when preview and canRecord=false", () => {
    expect(getKeyVAction("preview", false)).toBe("ignore");
  });
});

describe("getKeyVAction — restarts from error (KeyV works after failed transcription)", () => {
  it("returns 'restart' when error and canRecord=true", () => {
    expect(getKeyVAction("error", true)).toBe("restart");
  });

  it("returns 'ignore' when error and canRecord=false", () => {
    expect(getKeyVAction("error", false)).toBe("ignore");
  });
});

describe("getKeyVAction — ignores mid-cycle presses", () => {
  it("returns 'ignore' when recording (cycle in progress)", () => {
    expect(getKeyVAction("recording", true)).toBe("ignore");
  });

  it("returns 'ignore' when transcribing (cycle in progress)", () => {
    expect(getKeyVAction("transcribing", true)).toBe("ignore");
  });
});
