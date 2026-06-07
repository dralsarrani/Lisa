// ─────────────────────────────────────────────────────────────────────────────
// Lisa Phase 3G — Voice Conversation Helpers
//
// Pure functions for voice conversation flow decisions.
// All functions are side-effect-free and fully testable.
// ─────────────────────────────────────────────────────────────────────────────

import type { LisaInteraction, LisaModeId, LisaSettings } from "./types";
import type { VoiceStatus } from "./types";
import { isTtsSuppressedMode } from "./tts";

// ─── Clarification constant ───────────────────────────────────────────────────
// Hardcoded — never derived from user audio content.

export const CLARIFICATION_TEXT = "Can you say that again?";

// ─── Auto-submit decision ─────────────────────────────────────────────────────
//
// Auto-submit is allowed only when:
//   - voiceConversationEnabled is true
//   - voiceConversationMode is "auto_send"
//   - the app is not emergency stopped
//   - voiceStatus is not still transcribing
//   - the active mode is not suppressed (when suppression is on)

export function shouldAutoSubmitTranscript(opts: {
  settings: Pick<LisaSettings, "voiceConversationEnabled" | "voiceConversationMode" | "voiceConversationSuppressInPrivacyModes">;
  orbState: string;
  voiceStatus: VoiceStatus;
  activeMode: LisaModeId;
}): { allowed: boolean; reason?: string } {
  if (!opts.settings.voiceConversationEnabled) {
    return { allowed: false, reason: "voice_conversation_disabled" };
  }
  if (opts.settings.voiceConversationMode !== "auto_send") {
    return { allowed: false, reason: `mode_requires_confirm:${opts.settings.voiceConversationMode}` };
  }
  if (opts.orbState === "emergency_stopped") {
    return { allowed: false, reason: "emergency_stopped" };
  }
  if (opts.voiceStatus === "transcribing") {
    return { allowed: false, reason: "transcription_in_progress" };
  }
  if (opts.settings.voiceConversationSuppressInPrivacyModes && isTtsSuppressedMode(opts.activeMode)) {
    return { allowed: false, reason: `mode_suppressed:${opts.activeMode}` };
  }
  return { allowed: true };
}

// ─── Voice reply auto-speak decision ─────────────────────────────────────────
//
// Allows auto-speak of a voice-sourced reply when:
//   - the interaction source is "voice"
//   - voiceAutoSpeakReplies is true
//   - voiceOutputEnabled is true
//   - the interaction is complete with a non-empty response
//   - the app is not emergency stopped
//   - the interaction has not already been spoken

export function shouldAutoSpeakVoiceReply(
  interaction: LisaInteraction,
  opts: {
    settings: Pick<LisaSettings, "voiceAutoSpeakReplies" | "voiceOutputEnabled">;
    orbState: string;
    spokenInteractionIds: readonly string[];
  }
): { allowed: boolean; reason?: string } {
  if (interaction.source !== "voice") {
    return { allowed: false, reason: "not_voice_sourced" };
  }
  if (!opts.settings.voiceAutoSpeakReplies) {
    return { allowed: false, reason: "voice_auto_speak_replies_disabled" };
  }
  if (!opts.settings.voiceOutputEnabled) {
    return { allowed: false, reason: "voice_output_disabled" };
  }
  if (interaction.status !== "complete") {
    return { allowed: false, reason: "not_complete" };
  }
  if (!interaction.response?.trim()) {
    return { allowed: false, reason: "empty_response" };
  }
  if (opts.orbState === "emergency_stopped") {
    return { allowed: false, reason: "emergency_stopped" };
  }
  if (opts.spokenInteractionIds.includes(interaction.id)) {
    return { allowed: false, reason: "already_spoken" };
  }
  return { allowed: true };
}

// ─── Clarification speak decision ────────────────────────────────────────────
//
// Clarification TTS is allowed when:
//   - voiceConversationEnabled is true
//   - voiceNoTranscriptAction is "clarify"
//   - voiceOutputEnabled is true
//   - the app is not emergency stopped
//   - the active mode is not suppressed (when suppression is on)

export function shouldSpokenClarify(opts: {
  settings: Pick<LisaSettings, "voiceConversationEnabled" | "voiceNoTranscriptAction" | "voiceConversationSuppressInPrivacyModes" | "voiceOutputEnabled">;
  orbState: string;
  activeMode: LisaModeId;
}): boolean {
  if (!opts.settings.voiceConversationEnabled) return false;
  if (opts.settings.voiceNoTranscriptAction !== "clarify") return false;
  if (!opts.settings.voiceOutputEnabled) return false;
  if (opts.orbState === "emergency_stopped") return false;
  if (opts.settings.voiceConversationSuppressInPrivacyModes && isTtsSuppressedMode(opts.activeMode)) return false;
  return true;
}

// ─── Audit detail builder ─────────────────────────────────────────────────────
// Contains only metadata — never the transcript text itself.

export function buildVoiceAutoSendAuditDetails(opts: {
  transcriptCharCount: number;
  mode: string;
}): string {
  return `transcript_chars=${opts.transcriptCharCount} mode=${opts.mode}`;
}
