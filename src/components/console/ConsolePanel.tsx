import React, { useEffect, useRef } from "react";
import type { LisaInteraction, LisaSettings, OrbState } from "../../core/types";
import { MarkdownResponse } from "./MarkdownResponse";
import "./ConsolePanel.css";

interface ConsolePanelProps {
  interactions: LisaInteraction[];
  orbState: OrbState;
  settings: LisaSettings;
  onCancelStream?: (id: string) => void;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  interactions,
  orbState,
  settings,
  onCancelStream,
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
      <div className="console-feed" ref={feedRef}>
        {interactions.map((ix) => (
          <InteractionCard key={ix.id} interaction={ix} onCancelStream={onCancelStream} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

// ─── Interaction card ─────────────────────────────────────────────────────────

function InteractionCard({
  interaction,
  onCancelStream,
}: {
  interaction: LisaInteraction;
  onCancelStream?: (id: string) => void;
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
          <CompleteResponse interaction={interaction} />
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
  if (kind === "local_ai" && model) {
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

function CompleteResponse({ interaction }: { interaction: LisaInteraction }) {
  return (
    <>
      {interaction.kind === "local_ai" ? (
        <MarkdownResponse content={interaction.response} />
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
