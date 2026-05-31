import React, { useState } from "react";
import type { ToolSuggestion } from "../../core/types";
import { useLisa } from "../../app/useLisa";
import { createAuditEvent } from "../../core/audit-store";
import { getToolDefinition } from "../../core/tool-registry";
import { createToolRequestPair } from "../../core/tool-suggestions";

interface ToolSuggestionChipProps {
  suggestion: ToolSuggestion;
  interactionId: string;
}

export const ToolSuggestionChip: React.FC<ToolSuggestionChipProps> = ({ suggestion, interactionId }) => {
  const { dispatch, addAudit } = useLisa();
  const [localConverted, setLocalConverted] = useState(false);

  const isConverted = localConverted || suggestion.status === "converted";

  if (isConverted) {
    return (
      <div className="tool-suggestion-chip tool-suggestion-converted">
        <span className="tool-suggestion-converted-label">Request created — see Approvals.</span>
      </div>
    );
  }

  function handlePrepare() {
    if (localConverted) return;
    const def = getToolDefinition(suggestion.toolId);
    if (!def || !def.enabled) return;

    setLocalConverted(true);
    const { request, approval } = createToolRequestPair(def, "suggestion_converted");
    dispatch({
      type: "CREATE_TOOL_REQUEST",
      payload: {
        request,
        approval,
        auditEvent: createAuditEvent({
          eventType: "tool_request_created",
          source: "tool_suggestion",
          summary: `Tool request created from suggestion: "${def.displayName}"`,
          severity: "info",
        }),
      },
    });
    dispatch({ type: "CONVERT_TOOL_SUGGESTION", payload: { interactionId, requestId: request.id } });
    dispatch({ type: "SET_ORB_STATE", payload: "waiting_approval" });
    addAudit({
      eventType: "tool_suggestion_converted",
      source: "tool_suggestion_chip",
      summary: `Tool suggestion converted to request: "${def.displayName}"`,
      details: `tool_id=${suggestion.toolId} request_id=${request.id} interaction_id=${interactionId}`,
      severity: "info",
    });
  }

  function handleDismiss() {
    dispatch({ type: "DISMISS_TOOL_SUGGESTION", payload: { interactionId } });
    addAudit({
      eventType: "tool_suggestion_dismissed",
      source: "tool_suggestion_chip",
      summary: `Tool suggestion dismissed: "${suggestion.toolDisplayName}"`,
      details: `tool_id=${suggestion.toolId} interaction_id=${interactionId}`,
      severity: "info",
    });
  }

  return (
    <div className="tool-suggestion-chip">
      <div className="tool-suggestion-header">
        <span className="tool-suggestion-icon">💡</span>
        <span className="tool-suggestion-title">{suggestion.toolDisplayName} may help here</span>
      </div>
      <div className="tool-suggestion-note">
        Requires approval · Creates a pending request only — does not run automatically.
      </div>
      <div className="tool-suggestion-actions">
        <button
          type="button"
          className="tool-suggestion-prepare-btn"
          onClick={handlePrepare}
          disabled={localConverted}
        >
          Prepare {suggestion.toolDisplayName} Request
        </button>
        <button
          type="button"
          className="tool-suggestion-dismiss-btn"
          onClick={handleDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default ToolSuggestionChip;
