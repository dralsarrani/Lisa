import { useState } from "react";
import type { ToolApprovalContract, ToolRequest } from "../../core/types";
import { useLisa } from "../../app/useLisa";
import { runTool } from "../../core/tool-runner";
import { createAuditEvent } from "../../core/audit-store";
import { getToolDefinition } from "../../core/tool-registry";

interface ToolApprovalCardProps {
  contract: ToolApprovalContract;
  request: ToolRequest | undefined;
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function RiskBadge({ level }: { level: string }) {
  const cls =
    level === "safe" ? "risk-badge-safe"
    : level === "low" ? "risk-badge-low"
    : level === "medium" ? "risk-badge-medium"
    : level === "high" ? "risk-badge-high"
    : "risk-badge-critical";
  return (
    <span className={`tool-risk-badge ${cls}`}>{level.toUpperCase()}</span>
  );
}

export function ToolApprovalCard({ contract, request }: ToolApprovalCardProps) {
  const { state, dispatch } = useLisa();
  const [isRunning, setIsRunning] = useState(false);

  const isPending = contract.decision === null;
  const toolDef = getToolDefinition(contract.toolId);
  const params = request?.params ?? {};
  const paramEntries = Object.entries(params);

  const inlineResult =
    request?.resultId != null
      ? state.toolResults.find((r) => r.id === request.resultId)
      : undefined;

  const requestStatus = request?.status ?? "pending_approval";

  const statusLabel: string =
    requestStatus === "pending_approval" ? "PENDING"
    : requestStatus === "approved" ? "APPROVED"
    : requestStatus === "running" ? "RUNNING…"
    : requestStatus === "succeeded" ? "SUCCEEDED"
    : requestStatus === "failed" ? "FAILED"
    : requestStatus === "rejected" ? "REJECTED"
    : requestStatus === "cancelled" ? "CANCELLED"
    : requestStatus === "expired" ? "EXPIRED"
    : contract.decision === null ? "PENDING"
    : contract.decision === "approved" ? "APPROVED"
    : "REJECTED";

  const statusCssKey =
    requestStatus === "succeeded" || requestStatus === "approved" ? "approved"
    : requestStatus === "running" ? "running"
    : requestStatus === "failed" || requestStatus === "rejected" ? "rejected"
    : requestStatus === "cancelled" || requestStatus === "expired" ? "cancelled"
    : "pending";

  async function handleApprove() {
    if (!request || isRunning) return;
    setIsRunning(true);

    const resolvedAt = new Date().toISOString();

    dispatch({
      type: "OPERATOR_APPROVE_TOOL",
      payload: {
        requestId: request.id,
        resolvedAt,
        auditEvent: createAuditEvent({
          eventType: "tool_request_approved",
          source: "approval_center",
          summary: `Tool approved: "${contract.toolDisplayName}"`,
          severity: "info",
        }),
      },
    });

    dispatch({
      type: "START_TOOL_EXECUTION",
      payload: {
        requestId: request.id,
        startedAt: resolvedAt,
        auditEvent: createAuditEvent({
          eventType: "tool_execution_started",
          source: "tool_runner",
          summary: `Tool execution started: "${contract.toolDisplayName}"`,
          severity: "info",
        }),
      },
    });

    dispatch({
      type: "ADD_INTERACTION",
      payload: {
        id: request.id,
        kind: "tool_request",
        prompt: `[Tool] ${contract.toolDisplayName}`,
        response: "Running…",
        status: "thinking",
        createdAt: resolvedAt,
      },
    });

    try {
      const { outputSummary } = await runTool(request.toolId, request.params, state);
      const completedAt = new Date().toISOString();
      const resultId = crypto.randomUUID();

      dispatch({
        type: "COMPLETE_TOOL_EXECUTION",
        payload: {
          requestId: request.id,
          result: {
            id: resultId,
            requestId: request.id,
            toolId: request.toolId,
            outputSummary,
            succeededAt: completedAt,
          },
          completedAt,
          auditEvent: createAuditEvent({
            eventType: "tool_execution_succeeded",
            source: "tool_runner",
            summary: `Tool succeeded: "${contract.toolDisplayName}"`,
            severity: "info",
          }),
        },
      });

      dispatch({
        type: "UPDATE_INTERACTION",
        payload: {
          id: request.id,
          kind: "tool_result",
          response: outputSummary,
          status: "complete",
          completedAt,
        },
      });
    } catch (err) {
      const completedAt = new Date().toISOString();
      const errMsg = err instanceof Error ? err.message : String(err);

      dispatch({
        type: "FAIL_TOOL_EXECUTION",
        payload: {
          requestId: request.id,
          error: errMsg,
          completedAt,
          auditEvent: createAuditEvent({
            eventType: "tool_execution_failed",
            source: "tool_runner",
            summary: `Tool failed: "${contract.toolDisplayName}" — ${errMsg}`,
            severity: "error",
          }),
        },
      });

      dispatch({
        type: "UPDATE_INTERACTION",
        payload: {
          id: request.id,
          status: "failed",
          error: errMsg,
          completedAt,
        },
      });
    }

    setIsRunning(false);
  }

  function handleReject() {
    if (!request || isRunning) return;
    const resolvedAt = new Date().toISOString();
    dispatch({
      type: "OPERATOR_REJECT_TOOL",
      payload: {
        requestId: request.id,
        resolvedAt,
        auditEvent: createAuditEvent({
          eventType: "tool_request_rejected",
          source: "approval_center",
          summary: `Tool rejected: "${contract.toolDisplayName}"`,
          severity: "warning",
        }),
      },
    });
  }

  return (
    <div className={`approval-card approval-card-${statusCssKey}`}>
      {isPending && <div className="approval-card-pulse" />}

      {/* Header */}
      <div className="approval-card-header">
        <div className="approval-card-title-row">
          <span className="approval-card-title">{contract.toolDisplayName}</span>
          <span className={`approval-status-badge approval-status-${statusCssKey}`}>
            {statusLabel}
          </span>
        </div>
        <div className="tool-card-meta-row">
          <span className="approval-action-type">
            {toolDef ? `${toolDef.category} · ${toolDef.id}` : contract.toolId}
          </span>
          {toolDef && <RiskBadge level={toolDef.riskLevel} />}
        </div>
      </div>

      {/* Consequences block */}
      <div className="tool-card-consequences">
        <div className="tool-card-label">Consequences</div>
        <div className="tool-card-consequences-text">{contract.consequences}</div>
      </div>

      {/* Parameters */}
      <div className="tool-card-params">
        <div className="tool-card-label">Parameters</div>
        {paramEntries.length === 0 ? (
          <div className="tool-card-params-empty">No parameters</div>
        ) : (
          <div className="tool-card-params-list">
            {paramEntries.map(([k, v]) => (
              <div key={k} className="tool-card-param-row">
                <span className="tool-card-param-key">{k}</span>
                <span className="tool-card-param-val">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline result for succeeded */}
      {inlineResult && (
        <div className="tool-card-result">
          <div className="tool-card-label">Result</div>
          <pre className="tool-card-result-text">{inlineResult.outputSummary}</pre>
        </div>
      )}

      {/* Inline error for failed */}
      {request?.status === "failed" && request.error && !inlineResult && (
        <div className="tool-card-result tool-card-result-error">
          <div className="tool-card-label">Error</div>
          <pre className="tool-card-result-text">{request.error}</pre>
        </div>
      )}

      {/* Resolved state labels */}
      {!isPending && (
        <div className="tool-card-resolved-label">
          {requestStatus === "expired" && "Expired — create a new request to run this tool."}
          {requestStatus === "cancelled" && "Cancelled — this request was cancelled."}
          {requestStatus === "rejected" && "Rejected — this request was rejected."}
          {requestStatus === "succeeded" && "Succeeded — result available above."}
          {requestStatus === "failed" && "Failed — see error above."}
        </div>
      )}

      {/* Actions — pending only */}
      {isPending && (
        <div className="approval-actions">
          <button
            className="btn btn-success approval-btn"
            onClick={handleApprove}
            disabled={isRunning || !request}
          >
            {isRunning ? "Running…" : "✓ Approve & Run"}
          </button>
          <button
            className="btn btn-danger approval-btn"
            onClick={handleReject}
            disabled={isRunning || !request}
          >
            ✗ Reject
          </button>
        </div>
      )}

      {/* Footer timestamps */}
      <div className="approval-card-footer">
        <span className="timestamp">Requested {formatTime(contract.createdAt)}</span>
        {contract.resolvedAt && (
          <span className="timestamp">Resolved {formatTime(contract.resolvedAt)}</span>
        )}
      </div>
    </div>
  );
}

export default ToolApprovalCard;
