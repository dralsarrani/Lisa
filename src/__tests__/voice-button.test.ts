import { describe, it, expect } from "vitest";
import { getVoiceCapabilityMessage } from "../core/command-router";
import {
  getKeyVAction,
  resolveModelGate,
  VOICE_REVIEW_TITLE,
  VOICE_REVIEW_SUBTITLE,
  VOICE_REVIEW_NOTE,
  VOICE_NO_TRANSCRIPT_TITLE,
  VOICE_ERROR_TITLE,
  VOICE_HUD_OVERLAY_CLASS,
  VOICE_HUD_CARD_CLASS,
} from "../components/voice/VoiceInputControl";

// Phase 3D — Real microphone capture via cpal + local Whisper transcription.
// Push-to-talk only: hold KeyV → record → release → transcribe locally → review → send manually.
// No wake word, no background listening, no cloud STT, no auto-submit.

describe("Phase 3D — 'there is no mic button' is correct behavior", () => {
  it("answers 'there is no mic button'", () => {
    expect(getVoiceCapabilityMessage("there is no mic button")).not.toBeNull();
  });

  it("response describes keyboard-only push-to-talk", () => {
    const msg = getVoiceCapabilityMessage("there is no mic button") ?? "";
    expect(msg.toLowerCase()).toContain("keyboard-only");
  });

  it("response mentions KeyV shortcut", () => {
    const msg = getVoiceCapabilityMessage("there is no mic button") ?? "";
    expect(msg.toLowerCase()).toContain("keyv");
  });

  it("response mentions Whisper model requirement", () => {
    const msg = getVoiceCapabilityMessage("there is no mic button") ?? "";
    expect(msg.toLowerCase()).toContain("whisper model");
  });
});

describe("Phase 3D — no response references Start Voice UI Test button", () => {
  const queries = [
    "do you have voice input",
    "voice not working",
    "keyv not working",
    "where is the mic button",
    "mic button missing",
    "there is no mic button",
  ];

  for (const q of queries) {
    it(`"${q}" response does not reference removed button`, () => {
      const msg = getVoiceCapabilityMessage(q) ?? "";
      expect(msg).not.toContain("Start Voice UI Test");
      expect(msg).not.toContain("Phase 3A");
    });
  }
});

describe("Phase 3D — general voice capability describes real mic capture", () => {
  it("response mentions KeyV", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("keyv");
  });

  it("response mentions Whisper model requirement", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("whisper model");
  });

  it("response says no background listening", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("background");
  });

  it("response mentions no auto-submit", () => {
    const msg = getVoiceCapabilityMessage("do you have voice input") ?? "";
    expect(msg.toLowerCase()).toContain("auto-submit");
  });
});

describe("Phase 3D — KeyV troubleshooting describes focus requirement and model check", () => {
  it("response explains command box blocks KeyV", () => {
    const msg = getVoiceCapabilityMessage("keyv not working") ?? "";
    expect(msg.toLowerCase()).toContain("command box");
  });

  it("response tells user to click outside the input", () => {
    const msg = getVoiceCapabilityMessage("keyv not working") ?? "";
    expect(msg.toLowerCase()).toContain("click outside");
  });

  it("response mentions model path requirement", () => {
    const msg = getVoiceCapabilityMessage("keyv not working") ?? "";
    expect(msg.toLowerCase()).toContain("whisper model");
  });
});

describe("Phase 3D — nothing happened: model path and speech guidance", () => {
  it("'I asked through voice and nothing happened' returns non-null", () => {
    expect(getVoiceCapabilityMessage("I asked through voice and nothing happened")).not.toBeNull();
  });

  it("response mentions model path requirement", () => {
    const msg = getVoiceCapabilityMessage("I asked through voice and nothing happened") ?? "";
    expect(msg.toLowerCase()).toContain("model path");
  });

  it("response tells user to hold the key longer", () => {
    const msg = getVoiceCapabilityMessage("I asked through voice and nothing happened") ?? "";
    expect(msg.toLowerCase()).toContain("hold");
  });
});

describe("Phase 3D — no background listening, no wake word, no TTS", () => {
  it("background listening query — denied", () => {
    const msg = getVoiceCapabilityMessage("does Lisa listen in the background") ?? "";
    expect(msg).not.toBeNull();
    expect(msg.toLowerCase()).toContain("push-to-talk");
  });

  it("wake word query — denied", () => {
    const msg = getVoiceCapabilityMessage("does Lisa have a wake word") ?? "";
    expect(msg).not.toBeNull();
    expect(msg.toLowerCase()).toContain("push-to-talk");
  });

  it("TTS query — denied", () => {
    const msg = getVoiceCapabilityMessage("can Lisa speak back to me") ?? "";
    expect(msg).not.toBeNull();
    expect(msg.toLowerCase()).toContain("tts");
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

describe("getKeyVAction — restarts from no_transcript (KeyV works after empty result)", () => {
  it("returns 'restart' when no_transcript and canRecord=true", () => {
    expect(getKeyVAction("no_transcript", true)).toBe("restart");
  });

  it("returns 'ignore' when no_transcript and canRecord=false", () => {
    expect(getKeyVAction("no_transcript", false)).toBe("ignore");
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

// ── resolveModelGate — model path guard state machine ────────────────────────

describe("resolveModelGate — empty path returns no_model", () => {
  it("empty string → no_model", () => {
    expect(resolveModelGate("", "not_configured")).toBe("no_model");
  });

  it("whitespace-only string → no_model (trimmed)", () => {
    expect(resolveModelGate("   ", "not_configured")).toBe("no_model");
  });

  it("whitespace-only → no_model even when status is ready", () => {
    expect(resolveModelGate("   ", "ready")).toBe("no_model");
  });
});

describe("resolveModelGate — valid path with failed load returns model_error", () => {
  it("non-empty path + error status → model_error", () => {
    expect(resolveModelGate("C:\\models\\ggml-base.en.bin", "error")).toBe("model_error");
  });

  it("path with leading/trailing whitespace + error → model_error (path is non-empty after trim)", () => {
    expect(resolveModelGate("  C:\\models\\ggml-base.en.bin  ", "error")).toBe("model_error");
  });
});

describe("resolveModelGate — valid path with ok status returns ready", () => {
  it("non-empty path + ready status → ready", () => {
    expect(resolveModelGate("C:\\models\\ggml-base.en.bin", "ready")).toBe("ready");
  });

  it("non-empty path + not_configured status → ready (path set, never tested — allow attempt)", () => {
    expect(resolveModelGate("C:\\models\\ggml-base.en.bin", "not_configured")).toBe("ready");
  });

  it("path with whitespace + not_configured → ready after trim", () => {
    expect(resolveModelGate("  C:\\models\\ggml-base.en.bin  ", "not_configured")).toBe("ready");
  });
});

// ── Review card string constants — prevent silent regressions ─────────────────

describe("Phase 3D — review card titles and privacy note are stable", () => {
  it("VOICE_REVIEW_TITLE is 'Voice Transcript Ready'", () => {
    expect(VOICE_REVIEW_TITLE).toBe("Voice Transcript Ready");
  });

  it("VOICE_REVIEW_SUBTITLE is 'Review before sending'", () => {
    expect(VOICE_REVIEW_SUBTITLE).toBe("Review before sending");
  });

  it("VOICE_REVIEW_NOTE contains privacy assurance and action instruction", () => {
    expect(VOICE_REVIEW_NOTE).toContain("Not sent yet");
    expect(VOICE_REVIEW_NOTE).toContain("Send Transcript");
  });

  it("VOICE_NO_TRANSCRIPT_TITLE is 'No Transcript Produced'", () => {
    expect(VOICE_NO_TRANSCRIPT_TITLE).toBe("No Transcript Produced");
  });

  it("VOICE_ERROR_TITLE is 'Voice Capture Error'", () => {
    expect(VOICE_ERROR_TITLE).toBe("Voice Capture Error");
  });
});

// ── HUD overlay CSS class constants — prevent silent regressions ──────────────
// The portal renders these class names into document.body; any rename would
// break both CSS targeting and these tests simultaneously.

describe("Phase 3D — HUD overlay CSS class constants are stable", () => {
  it("VOICE_HUD_OVERLAY_CLASS is 'voice-hud-overlay'", () => {
    expect(VOICE_HUD_OVERLAY_CLASS).toBe("voice-hud-overlay");
  });

  it("VOICE_HUD_CARD_CLASS is 'voice-hud-card'", () => {
    expect(VOICE_HUD_CARD_CLASS).toBe("voice-hud-card");
  });
});

// ── Portal HUD — Send Transcript availability by state ────────────────────────
// The Send Transcript action must only appear in preview state.
// no_transcript and error states show Dismiss / Try Again only.
// These tests lock the title/label constants that drive the rendered buttons.

describe("Phase 3D — preview state has Send Transcript; other states do not", () => {
  it("VOICE_REVIEW_TITLE contains 'Transcript' — confirms it is the preview-only title", () => {
    expect(VOICE_REVIEW_TITLE).toContain("Transcript");
  });

  it("VOICE_NO_TRANSCRIPT_TITLE does not contain 'Send' — no send action in no-transcript state", () => {
    expect(VOICE_NO_TRANSCRIPT_TITLE).not.toContain("Send");
  });

  it("VOICE_ERROR_TITLE does not contain 'Send' — no send action in error state", () => {
    expect(VOICE_ERROR_TITLE).not.toContain("Send");
  });

  it("VOICE_REVIEW_NOTE references 'Send Transcript' — confirms the CTA label", () => {
    expect(VOICE_REVIEW_NOTE).toContain("Send Transcript");
  });
});

// ── Portal HUD — title constants are full strings, not truncated ──────────────
// Guards against accidental truncation that produced 'PT READY' during manual test.

describe("Phase 3D — HUD title constants are full untruncated strings", () => {
  it("VOICE_REVIEW_TITLE starts with 'Voice'", () => {
    expect(VOICE_REVIEW_TITLE.startsWith("Voice")).toBe(true);
  });

  it("VOICE_REVIEW_TITLE ends with 'Ready'", () => {
    expect(VOICE_REVIEW_TITLE.endsWith("Ready")).toBe(true);
  });

  it("VOICE_REVIEW_TITLE is exactly 22 characters", () => {
    expect(VOICE_REVIEW_TITLE.length).toBe(22);
  });

  it("VOICE_NO_TRANSCRIPT_TITLE starts with 'No'", () => {
    expect(VOICE_NO_TRANSCRIPT_TITLE.startsWith("No")).toBe(true);
  });

  it("VOICE_ERROR_TITLE starts with 'Voice'", () => {
    expect(VOICE_ERROR_TITLE.startsWith("Voice")).toBe(true);
  });
});
