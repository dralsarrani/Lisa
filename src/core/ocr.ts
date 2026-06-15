import type { ScreenStatus } from "./types";

export interface OcrStatusResult {
  available: boolean;
  provider: string;
  configured: boolean;
  error?: string | null;
}

export function getOcrPreconditionMessage(state: {
  screenStatus: ScreenStatus;
  screenFilePath?: string;
}): string | null {
  if (state.screenStatus !== "available") {
    return "Capture the screen first, then run OCR.";
  }
  if (!state.screenFilePath) {
    return "Screen metadata is available, but the local screenshot preview file is missing. Capture the screen again.";
  }
  return null;
}

export function buildRunScreenOcrInvokeArgs(imagePath: string): { imagePath: string } {
  return { imagePath };
}

export function formatOcrSuccessResponse(result: {
  lines: number;
  chars: number;
  provider: string;
}): string {
  if (result.chars === 0) {
    return "OCR completed but no readable text was detected.";
  }
  return [
    "Screen text extracted locally.",
    `- Lines: ${result.lines}`,
    `- Characters: ${result.chars}`,
    `- Provider: ${result.provider}`,
    "",
    'Type "what can you read" to view the extracted text.',
  ].join("\n");
}

export function formatOcrErrorMessage(error?: unknown): string {
  const message = typeof error === "string"
    ? error.trim()
    : error instanceof Error
      ? error.message.trim()
      : "";

  if (!message || /^(?:try|catch)\s*\{/i.test(message)) {
    return "OCR failed: Windows OCR engine returned an unexpected error. See terminal logs for details.";
  }
  if (message.startsWith("OCR failed:")) {
    return message;
  }
  if (
    message.startsWith("OCR not compiled") ||
    message.startsWith("OCR is only supported") ||
    message.startsWith("OCR rejected:")
  ) {
    return `OCR failed: ${message}`;
  }
  return "OCR failed: Windows OCR engine returned an unexpected error. See terminal logs for details.";
}

export function formatOcrStatusResponse(status: OcrStatusResult): string {
  const lines = [
    "Local OCR status:",
    `- Available: ${status.available ? "yes" : "no"}`,
    `- Configured: ${status.configured ? "yes" : "no"}`,
    `- Provider: ${status.provider}`,
  ];
  if (status.error) {
    lines.push(`- Error: ${status.error}`);
  }
  return lines.join("\n");
}

export function buildOcrAuditDetails(opts: {
  source: string;
  provider?: string;
  chars?: number;
  lines?: number;
  outcome: "completed" | "failed" | "queried" | "cleared";
}): string {
  const fields = [`source=${opts.source}`, `outcome=${opts.outcome}`];
  if (opts.provider) fields.push(`provider=${opts.provider}`);
  if (opts.chars !== undefined) fields.push(`chars=${opts.chars}`);
  if (opts.lines !== undefined) fields.push(`lines=${opts.lines}`);
  return fields.join(" ");
}
