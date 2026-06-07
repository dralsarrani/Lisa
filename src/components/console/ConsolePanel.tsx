import React, { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { LisaInteraction, LisaSettings, OrbState, ToolResult, ToolRequest, VoiceStatus, TtsUiStatus, ScreenStatus, ScreenOcrStatus } from "../../core/types";
import { hasActiveToolRequestForParams } from "../../core/tool-request-utils";
import { isInteractionSpeakEligible } from "../../core/tts";
import { MarkdownResponse } from "./MarkdownResponse";
import { ToolSuggestionChip } from "./ToolSuggestionChip";
import "./ConsolePanel.css";

interface ConsolePanelProps {
  interactions: LisaInteraction[];
  orbState: OrbState;
  settings: LisaSettings;
  onCancelStream?: (id: string) => void;
  toolResults?: ToolResult[];
  toolRequests?: ToolRequest[];
  onPrepareMemoryNoteSave?: (resultId: string) => void;
  ttsUiStatus?: TtsUiStatus;
  ttsSpeakingInteractionId?: string | null;
  voiceStatus?: VoiceStatus;
  onSpeak?: (interaction: LisaInteraction) => void;
  onStopSpeaking?: () => void;
  screenStatus?: ScreenStatus;
  screenCapturedAt?: number;
  screenWidth?: number;
  screenHeight?: number;
  screenProvider?: string;
  screenFilePath?: string;
  screenOcrStatus?: ScreenOcrStatus;
  screenOcrText?: string;
  screenOcrChars?: number;
  screenOcrLines?: number;
  screenOcrProvider?: string;
  showScreenTextPreview?: boolean;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  interactions,
  orbState,
  settings,
  onCancelStream,
  toolResults,
  toolRequests,
  onPrepareMemoryNoteSave,
  ttsSpeakingInteractionId,
  voiceStatus,
  onSpeak,
  onStopSpeaking,
  screenStatus,
  screenCapturedAt,
  screenWidth,
  screenHeight,
  screenProvider,
  screenFilePath,
  screenOcrStatus,
  screenOcrText,
  screenOcrChars,
  screenOcrLines,
  screenOcrProvider,
  showScreenTextPreview,
}) => {
  const feedRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    // Only auto-scroll when the user is already near the bottom (within 120px).
    // This avoids yanking the viewport when the user has scrolled up to read history.
    if (distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [interactions]);

  if (interactions.length === 0) {
    return <EmptyConsole orbState={orbState} settings={settings} />;
  }

  return (
    <div className="console-panel">
      <div className="console-header">
        <span className="console-header-title">Session</span>
        {settings.enableLocalAi && settings.ollamaModel && (
          <span className="console-ai-badge">
            <span className="console-ai-dot" />
            Local AI · {settings.ollamaModel}
          </span>
        )}
      </div>
      {screenStatus === "available" && screenCapturedAt && (
        <div className="console-screen-context-card">
          <div className="console-screen-context-header">
            <span className="console-screen-context-title">Screen Context</span>
            <span className="console-screen-context-badge">Manual Capture</span>
          </div>
          <div className="console-screen-context-row">
            <span className="console-screen-context-label">Captured</span>
            <span className="console-screen-context-value">{new Date(screenCapturedAt).toLocaleTimeString()}</span>
          </div>
          {screenWidth && screenHeight && (
            <div className="console-screen-context-row">
              <span className="console-screen-context-label">Resolution</span>
              <span className="console-screen-context-value">{screenWidth}×{screenHeight}</span>
            </div>
          )}
          <div className="console-screen-context-row">
            <span className="console-screen-context-label">Provider</span>
            <span className="console-screen-context-value">{screenProvider ?? "unknown"}</span>
          </div>
          {screenFilePath && settings.showScreenPreview && (
            <img
              src={convertFileSrc(screenFilePath)}
              className="console-screen-preview-img"
              alt="Screen preview — local only, not uploaded"
            />
          )}
          <div className="console-screen-context-note">
            {screenFilePath && settings.showScreenPreview
              ? "Preview only · Local · No OCR · Not uploaded"
              : "Metadata only · Local · No OCR · Not uploaded"}
          </div>
        </div>
      )}
      {screenOcrStatus === "available" && showScreenTextPreview && screenOcrText && (
        <div className="console-screen-context-card console-ocr-card">
          <div className="console-screen-context-header">
            <span className="console-screen-context-title">Screen Text</span>
            <span className="console-screen-context-badge">Manual OCR</span>
          </div>
          {screenOcrLines != null && (
            <div className="console-screen-context-row">
              <span className="console-screen-context-label">Lines</span>
              <span className="console-screen-context-value">{screenOcrLines}</span>
            </div>
          )}
          {screenOcrChars != null && (
            <div className="console-screen-context-row">
              <span className="console-screen-context-label">Characters</span>
              <span className="console-screen-context-value">{screenOcrChars}</span>
            </div>
          )}
          <div className="console-screen-context-row">
            <span className="console-screen-context-label">Provider</span>
            <span className="console-screen-context-value">{screenOcrProvider ?? "unknown"}</span>
          </div>
          <div className="console-ocr-text-preview">
            {screenOcrText.length > 500
              ? screenOcrText.slice(0, 500) + "… [truncated]"
              : screenOcrText}
          </div>
          <div className="console-screen-context-note">
            Local OCR only · Not uploaded · May be imperfect
          </div>
        </div>
      )}
      <div className="console-feed" ref={feedRef}>
        {interactions.map((ix) => {
          const linkedResult = ix.kind === "tool_result"
            ? toolResults?.find((r) => r.requestId === ix.id)
            : undefined;
          const saveDisabled = linkedResult
            ? (toolRequests
                ? hasActiveToolRequestForParams(toolRequests, "save-tool-result-memory-note", { sourceResultId: linkedResult.id }) !== null
                : false)
            : true;
          const speakEligible = onSpeak != null && isInteractionSpeakEligible(ix, {
            settings: { voiceOutputEnabled: settings.voiceOutputEnabled ?? false },
            orbState,
            voiceStatus: voiceStatus ?? "idle",
          });
          return (
            <InteractionCard
              key={ix.id}
              interaction={ix}
              onCancelStream={onCancelStream}
              linkedToolResult={linkedResult}
              saveDisabled={saveDisabled}
              onPrepareMemoryNoteSave={onPrepareMemoryNoteSave}
              isSpeaking={ttsSpeakingInteractionId === ix.id}
              speakEligible={speakEligible}
              onSpeak={speakEligible ? onSpeak : undefined}
              onStopSpeaking={onStopSpeaking}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

// ─── Interaction card ─────────────────────────────────────────────────────────

function InteractionCard({
  interaction,
  onCancelStream,
  linkedToolResult,
  saveDisabled,
  onPrepareMemoryNoteSave,
  isSpeaking,
  speakEligible,
  onSpeak,
  onStopSpeaking,
}: {
  interaction: LisaInteraction;
  onCancelStream?: (id: string) => void;
  linkedToolResult?: ToolResult;
  saveDisabled?: boolean;
  onPrepareMemoryNoteSave?: (resultId: string) => void;
  isSpeaking?: boolean;
  speakEligible?: boolean;
  onSpeak?: (interaction: LisaInteraction) => void;
  onStopSpeaking?: () => void;
}) {
  const time = new Date(interaction.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className={`console-interaction console-interaction-${interaction.kind}`}>
      <div className="console-prompt">
        <span className="console-prompt-chevron">›</span>
        <span className="console-prompt-text">{interaction.prompt}</span>
        <span className="console-prompt-time">{time}</span>
      </div>

      <div className="console-response">
        {interaction.status === "thinking" ? (
          <ThinkingIndicator
            model={interaction.model}
            kind={interaction.kind}
            id={interaction.id}
            onCancel={interaction.kind === "local_ai" ? onCancelStream : undefined}
          />
        ) : interaction.status === "streaming" ? (
          <StreamingResponse
            interaction={interaction}
            onCancel={interaction.kind === "local_ai" ? onCancelStream : undefined}
          />
        ) : interaction.status === "cancelled" ? (
          <CancelledResponse interaction={interaction} />
        ) : interaction.status === "failed" ? (
          <FailedResponse interaction={interaction} />
        ) : (
          <CompleteResponse
            interaction={interaction}
            linkedToolResult={linkedToolResult}
            saveDisabled={saveDisabled}
            onPrepareMemoryNoteSave={onPrepareMemoryNoteSave}
            isSpeaking={isSpeaking}
            speakEligible={speakEligible}
            onSpeak={onSpeak}
            onStopSpeaking={onStopSpeaking}
          />
        )}
      </div>
    </div>
  );
}

// ─── Streaming response ───────────────────────────────────────────────────────

function StreamingResponse({
  interaction,
  onCancel,
}: {
  interaction: LisaInteraction;
  onCancel?: (id: string) => void;
}) {
  return (
    <>
      <div className="console-streaming-text">
        {interaction.response}
        <span className="console-streaming-cursor" />
      </div>
      <div className="console-response-meta">
        <span className={`console-meta-kind console-meta-kind-${interaction.kind}`}>
          {kindLabel(interaction.kind)}
        </span>
        {interaction.model && (
          <>
            <span className="console-meta-sep">·</span>
            <span className="console-meta-model">{interaction.model}</span>
          </>
        )}
        <span className="console-meta-sep">·</span>
        <span className="console-streaming-indicator">streaming…</span>
        {onCancel && (
          <>
            <span className="console-meta-sep">·</span>
            <button
              className="console-cancel-btn"
              type="button"
              onClick={() => onCancel(interaction.id)}
              aria-label="Cancel streaming response"
            >
              ✕ Cancel
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

function ThinkingIndicator({
  model,
  kind,
  id,
  onCancel,
}: {
  model?: string;
  kind?: LisaInteraction["kind"];
  id?: string;
  onCancel?: (id: string) => void;
}) {
  let label: string;
  if (kind === "tool_request") {
    label = "Waiting for approval — go to Approvals to approve or reject.";
  } else if (kind === "local_ai" && model) {
    label = `Thinking locally with ${model}… first response may take a while while Ollama loads the model.`;
  } else if (model) {
    label = `${model} is thinking…`;
  } else {
    label = "Lisa is thinking…";
  }

  return (
    <div className="console-thinking">
      <div className="console-thinking-dots">
        <span className="console-thinking-dot" />
        <span className="console-thinking-dot" />
        <span className="console-thinking-dot" />
      </div>
      <span className="console-thinking-label">{label}</span>
      {onCancel && id && (
        <button
          className="console-cancel-btn"
          type="button"
          onClick={() => onCancel(id)}
          aria-label="Cancel pending request"
        >
          ✕ Cancel
        </button>
      )}
    </div>
  );
}

// ─── Cancelled response ───────────────────────────────────────────────────────

function CancelledResponse({ interaction }: { interaction: LisaInteraction }) {
  return (
    <>
      <div className="console-cancelled-label">Response cancelled</div>
      {interaction.response && (
        <div className="console-cancelled-partial">{interaction.response}</div>
      )}
      <div className="console-response-meta">
        <span className={`console-meta-kind console-meta-kind-${interaction.kind}`}>
          {kindLabel(interaction.kind)}
        </span>
        {interaction.model && (
          <>
            <span className="console-meta-sep">·</span>
            <span className="console-meta-model">{interaction.model}</span>
          </>
        )}
        {interaction.latencyMs != null && (
          <>
            <span className="console-meta-sep">·</span>
            <span className="console-meta-latency">{formatLatency(interaction.latencyMs)}</span>
          </>
        )}
      </div>
    </>
  );
}

// ─── Complete response ────────────────────────────────────────────────────────

function CompleteResponse({
  interaction,
  linkedToolResult,
  saveDisabled,
  onPrepareMemoryNoteSave,
  isSpeaking,
  speakEligible,
  onSpeak,
  onStopSpeaking,
}: {
  interaction: LisaInteraction;
  linkedToolResult?: ToolResult;
  saveDisabled?: boolean;
  onPrepareMemoryNoteSave?: (resultId: string) => void;
  isSpeaking?: boolean;
  speakEligible?: boolean;
  onSpeak?: (interaction: LisaInteraction) => void;
  onStopSpeaking?: () => void;
}) {
  const isToolResult = interaction.kind === "tool_result";
  const suggestion = interaction.toolSuggestion;
  const showChip =
    interaction.kind === "local_ai" &&
    suggestion != null &&
    (suggestion.status === "visible" || suggestion.status === "converted");
  const showSaveButton =
    isToolResult &&
    interaction.status === "complete" &&
    linkedToolResult?.outputSummary &&
    onPrepareMemoryNoteSave != null;

  return (
    <>
      {interaction.kind === "local_ai" ? (
        <MarkdownResponse content={interaction.response} />
      ) : isToolResult ? (
        <pre className="console-tool-result-text">{interaction.response}</pre>
      ) : (
        <div className="console-response-text">{interaction.response}</div>
      )}
      <div className="console-response-meta">
        <span className={`console-meta-kind console-meta-kind-${interaction.kind}`}>
          {kindLabel(interaction.kind)}
        </span>
        {interaction.model && (
          <>
            <span className="console-meta-sep">·</span>
            <span className="console-meta-model">{interaction.model}</span>
          </>
        )}
        {interaction.latencyMs != null && (
          <>
            <span className="console-meta-sep">·</span>
            <span className="console-meta-latency">{formatLatency(interaction.latencyMs)}</span>
          </>
        )}
      </div>
      {showSaveButton && linkedToolResult && (
        <div className="console-result-actions">
          <button
            className="console-save-note-btn"
            type="button"
            disabled={saveDisabled}
            onClick={() => onPrepareMemoryNoteSave!(linkedToolResult.id)}
            title={saveDisabled ? "A save request for this result is already pending" : "Create a pending approval request to save this result as a memory note"}
          >
            {saveDisabled ? "Save Request Pending" : "Prepare Save Memory Note Request"}
          </button>
          {saveDisabled && (
            <span className="console-save-note-hint">Review in Approvals.</span>
          )}
        </div>
      )}
      {(isSpeaking || (speakEligible && onSpeak)) && (
        <div className="console-speak-actions">
          {isSpeaking ? (
            <>
              <span className="console-speaking-indicator">Speaking…</span>
              {onStopSpeaking && (
                <button
                  className="console-stop-speaking-btn"
                  type="button"
                  onClick={onStopSpeaking}
                  title="Stop speaking"
                >
                  ■ Stop
                </button>
              )}
            </>
          ) : (
            <button
              className="console-speak-btn"
              type="button"
              onClick={() => onSpeak!(interaction)}
              title="Speak this response using local TTS"
            >
              ▶ Speak
            </button>
          )}
        </div>
      )}
      {showChip && suggestion && (
        <ToolSuggestionChip suggestion={suggestion} interactionId={interaction.id} />
      )}
    </>
  );
}

// ─── Failed response ──────────────────────────────────────────────────────────

function FailedResponse({ interaction }: { interaction: LisaInteraction }) {
  const errorText = interaction.error ?? interaction.response ?? "An unknown error occurred.";
  return (
    <>
      <div className="console-failed-label">Request failed</div>
      <div className="console-failed-detail">{errorText}</div>
      <div className="console-response-meta">
        <span className={`console-meta-kind console-meta-kind-${interaction.kind}`}>
          {kindLabel(interaction.kind)}
        </span>
        {interaction.model && (
          <>
            <span className="console-meta-sep">·</span>
            <span className="console-meta-model">{interaction.model}</span>
          </>
        )}
        {interaction.latencyMs != null && (
          <>
            <span className="console-meta-sep">·</span>
            <span className="console-meta-latency">{formatLatency(interaction.latencyMs)}</span>
          </>
        )}
      </div>
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

const SUGGESTED_COMMANDS = [
  "What can you help me with?",
  "Activate Focus Mode",
  "Create a test mission",
  "Check local runtime",
];

function EmptyConsole({
  orbState,
  settings,
}: {
  orbState: OrbState;
  settings: LisaSettings;
}) {
  const aiStatus = settings.enableLocalAi
    ? settings.ollamaModel
      ? `Local AI · ${settings.ollamaModel}`
      : "Local AI enabled — no model selected"
    : "Local AI disabled";

  return (
    <div className="console-empty">
      <div className="console-empty-orb" />
      <div className="console-empty-title">Lisa is ready</div>
      <div className="console-empty-status">
        <div className="console-empty-row">
          Mode: <span>{settings.activeMode}</span>
        </div>
        <div className="console-empty-row">
          State: <span>{orbState}</span>
        </div>
        <div className="console-empty-row">
          AI: <span>{aiStatus}</span>
        </div>
      </div>
      <div className="console-empty-divider" />
      <div className="console-empty-hints">
        {SUGGESTED_COMMANDS.map((cmd) => (
          <div key={cmd} className="console-empty-hint">
            {cmd}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function kindLabel(kind: LisaInteraction["kind"]): string {
  switch (kind) {
    case "local_ai":      return "Local AI";
    case "command":       return "Command";
    case "system":        return "System";
    case "error":         return "Error";
    case "tool_request":  return "Tool";
    case "tool_result":   return "Tool Result";
  }
}

function formatLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export default ConsolePanel;
