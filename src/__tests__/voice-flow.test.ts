import { describe, it, expect } from "vitest";
import {
  resolveTranscriptionResult,
  TRANSCRIPTION_TIMEOUT_MS,
  type TranscriptionInvokeResult,
} from "../components/voice/VoiceInputControl";

function makeResult(overrides: Partial<TranscriptionInvokeResult> = {}): TranscriptionInvokeResult {
  return {
    success: true,
    transcript: null,
    duration_ms: 500,
    error: null,
    ...overrides,
  };
}

describe("resolveTranscriptionResult", () => {
  it("returns preview when transcript has content", () => {
    const r = resolveTranscriptionResult(makeResult({ transcript: "hello Lisa" }));
    expect(r.action).toBe("preview");
    if (r.action === "preview") expect(r.transcript).toBe("hello Lisa");
  });

  it("returns no_speech when transcript is null", () => {
    const r = resolveTranscriptionResult(makeResult({ transcript: null }));
    expect(r.action).toBe("no_speech");
  });

  it("returns no_speech when transcript is empty string", () => {
    const r = resolveTranscriptionResult(makeResult({ transcript: "" }));
    expect(r.action).toBe("no_speech");
  });

  it("returns no_speech when transcript is whitespace only", () => {
    const r = resolveTranscriptionResult(makeResult({ transcript: "   " }));
    expect(r.action).toBe("no_speech");
  });

  it("returns error when success is false", () => {
    const r = resolveTranscriptionResult(
      makeResult({ success: false, error: "model not found" })
    );
    expect(r.action).toBe("error");
    if (r.action === "error") expect(r.message).toBe("model not found");
  });

  it("returns error with fallback message when error field is null but success is false", () => {
    const r = resolveTranscriptionResult(makeResult({ success: false, error: null }));
    expect(r.action).toBe("error");
    if (r.action === "error") expect(r.message).toBe("Transcription failed");
  });

  it("returns error when error field is set even if success is true", () => {
    const r = resolveTranscriptionResult(
      makeResult({ success: true, error: "Whisper engine not compiled" })
    );
    expect(r.action).toBe("error");
    if (r.action === "error") expect(r.message).toBe("Whisper engine not compiled");
  });

  it("preview preserves raw transcript value", () => {
    const r = resolveTranscriptionResult(makeResult({ transcript: "  hello  " }));
    expect(r.action).toBe("preview");
    if (r.action === "preview") expect(r.transcript).toBe("  hello  ");
  });
});

describe("TRANSCRIPTION_TIMEOUT_MS", () => {
  it("is at least 30 seconds", () => {
    expect(TRANSCRIPTION_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
  });

  it("is at most 180 seconds", () => {
    expect(TRANSCRIPTION_TIMEOUT_MS).toBeLessThanOrEqual(180_000);
  });

  it("is exactly 90 seconds", () => {
    expect(TRANSCRIPTION_TIMEOUT_MS).toBe(90_000);
  });
});
