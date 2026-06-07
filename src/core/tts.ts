// ─────────────────────────────────────────────────────────────────────────────
// Lisa Phase 3E — TTS Frontend Helpers
//
// Pure functions for TTS eligibility and suppression logic.
// All functions are side-effect-free and fully testable.
// ─────────────────────────────────────────────────────────────────────────────

import type { LisaInteraction, LisaModeId, LisaSettings, VoiceStatus } from "./types";

// ─── Mode suppression ─────────────────────────────────────────────────────────

const SUPPRESSED_MODES: ReadonlySet<LisaModeId> = new Set(["sleep", "privacy", "lockdown"]);

export function isTtsSuppressedMode(modeId: LisaModeId): boolean {
  return SUPPRESSED_MODES.has(modeId);
}

// ─── Manual Speak eligibility ─────────────────────────────────────────────────
//
// An interaction is eligible for manual Speak when all of the following hold:
//   - kind is "local_ai"
//   - status is "complete"
//   - response is non-empty after trimming
//   - voice output is enabled in settings
//   - app is not emergency stopped
//   - microphone is not actively recording

export function isInteractionSpeakEligible(
  interaction: LisaInteraction,
  opts: {
    settings: Pick<LisaSettings, "voiceOutputEnabled">;
    orbState: string;
    voiceStatus: VoiceStatus;
  }
): boolean {
  if (interaction.kind !== "local_ai") return false;
  if (interaction.status !== "complete") return false;
  if (!interaction.response || !interaction.response.trim()) return false;
  if (!opts.settings.voiceOutputEnabled) return false;
  if (opts.orbState === "emergency_stopped") return false;
  if (opts.voiceStatus === "recording") return false;
  return true;
}

// ─── Auto-speak decision ──────────────────────────────────────────────────────
//
// Auto-speak is allowed only when:
//   - auto-speak is enabled in settings
//   - the interaction is speak-eligible
//   - the active mode is not suppressed
//   - the interaction has not already been spoken this session

export function shouldAutoSpeakInteraction(
  interaction: LisaInteraction,
  opts: {
    settings: Pick<LisaSettings, "voiceOutputEnabled" | "voiceOutputAutoSpeak" | "voiceOutputSuppressInPrivacyModes">;
    orbState: string;
    voiceStatus: VoiceStatus;
    activeMode: LisaModeId;
    spokenInteractionIds: readonly string[];
  }
): { allowed: boolean; reason?: string } {
  if (!opts.settings.voiceOutputAutoSpeak) {
    return { allowed: false, reason: "auto_speak_disabled" };
  }
  if (!isInteractionSpeakEligible(interaction, opts)) {
    return { allowed: false, reason: "not_eligible" };
  }
  if (opts.settings.voiceOutputSuppressInPrivacyModes && isTtsSuppressedMode(opts.activeMode)) {
    return { allowed: false, reason: `mode_suppressed:${opts.activeMode}` };
  }
  if (opts.spokenInteractionIds.includes(interaction.id)) {
    return { allowed: false, reason: "already_spoken" };
  }
  return { allowed: true };
}

// ─── Audit metadata helpers ───────────────────────────────────────────────────
//
// Build audit detail strings containing metadata only — never spoken text.

export function buildTtsSpeechAuditDetails(opts: {
  interactionId: string;
  charCount: number;
  provider: string;
  source: string;
}): string {
  return `interaction_id=${opts.interactionId} chars=${opts.charCount} provider=${opts.provider} source=${opts.source}`;
}

export function buildTtsTestAuditDetails(opts: {
  charCount: number;
  provider: string;
}): string {
  return `chars=${opts.charCount} provider=${opts.provider} source=test_voice`;
}
