import { describe, expect, it } from "vitest";
import {
  buildOcrAuditDetails,
  buildRunScreenOcrInvokeArgs,
  formatOcrErrorMessage,
  formatOcrStatusResponse,
  formatOcrSuccessResponse,
  getOcrPreconditionMessage,
} from "../core/ocr";

describe("getOcrPreconditionMessage", () => {
  it("requires a screen capture when no capture is available", () => {
    expect(getOcrPreconditionMessage({ screenStatus: "idle" })).toBe(
      "Capture the screen first, then run OCR."
    );
  });

  it("distinguishes captured metadata from a missing screenshot file", () => {
    expect(getOcrPreconditionMessage({ screenStatus: "available" })).toContain(
      "local screenshot preview file is missing"
    );
  });

  it("allows OCR when metadata and file path are available", () => {
    expect(
      getOcrPreconditionMessage({
        screenStatus: "available",
        screenFilePath: "C:\\Temp\\lisa_screen_1.png",
      })
    ).toBeNull();
  });
});

describe("OCR command helpers", () => {
  it("maps screenFilePath to the Tauri imagePath payload", () => {
    expect(buildRunScreenOcrInvokeArgs("C:\\Temp\\lisa_screen_1.png")).toEqual({
      imagePath: "C:\\Temp\\lisa_screen_1.png",
    });
  });

  it("formats deterministic OCR success without including OCR text", () => {
    const response = formatOcrSuccessResponse({
      lines: 3,
      chars: 42,
      provider: "windows_ocr",
    });
    expect(response).toContain("Screen text extracted locally.");
    expect(response).toContain("Lines: 3");
    expect(response).toContain('Type "what can you read"');
    expect(response).not.toContain("sensitive OCR body");
  });

  it("formats empty OCR output as a completed scan with no readable text", () => {
    expect(
      formatOcrSuccessResponse({ lines: 0, chars: 0, provider: "windows_ocr" })
    ).toBe("OCR completed but no readable text was detected.");
  });

  it("does not expose an echoed PowerShell source line as the OCR error", () => {
    const error = formatOcrErrorMessage("try {");
    expect(error).toContain("unexpected error");
    expect(error).not.toContain("try {");
  });

  it("preserves safe actionable backend OCR errors", () => {
    expect(
      formatOcrErrorMessage(
        "OCR failed: screenshot file is missing or not accessible. Capture the screen again."
      )
    ).toBe(
      "OCR failed: screenshot file is missing or not accessible. Capture the screen again."
    );
  });

  it("formats deterministic OCR status", () => {
    const response = formatOcrStatusResponse({
      available: true,
      configured: true,
      provider: "windows_ocr",
    });
    expect(response).toContain("Available: yes");
    expect(response).toContain("Configured: yes");
    expect(response).toContain("windows_ocr");
  });

  it("builds metadata-only audit details", () => {
    const details = buildOcrAuditDetails({
      source: "command",
      outcome: "completed",
      provider: "windows_ocr",
      chars: 42,
      lines: 3,
    });
    expect(details).toBe(
      "source=command outcome=completed provider=windows_ocr chars=42 lines=3"
    );
    expect(details).not.toContain("sensitive OCR body");
  });
});
