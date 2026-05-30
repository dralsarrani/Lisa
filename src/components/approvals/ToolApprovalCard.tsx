import { useState } from "react";
import type { ToolApprovalContract, ToolRequest } from "../../core/types";
import { useLisa } from "../../app/useLisa";
import { runTool } from "../../core/tool-runner";
import { createAuditEvent } from "../../core/audit-store";

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

export function ToolApprovalCard({ contract, request }: ToolApprovalCardProps) {
  const { state, dispatch } = useLisa();
  const [isRunning, setIsRunning] = useState(false);

  const isPending = contract.decision === null;

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
    if (!request) return;
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

  const statusLabel =
    contract.decision === null ? "PENDING" : contract.decision === "approved" ? "APPROVED" : "REJECTED";

  const statusClass =
    contract.decision === null ? "pending" : contract.decision === "approved" ? "approved" : "rejected";

  return (
    <div className={`approval-card approval-card-${statusClass}`}>
      {isPending && <div className="approval-card-pulse" />}

      <div className="approval-card-header">
        <div className="approval-card-title-row">
          <span className="approval-card-title">{contract.toolDisplayName}</span>
          <span className={`approval-status-badge approval-status-${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        <span className="approval-action-type">tool · diagnostic</span>
      </div>

      <p className="approval-card-desc">{contract.consequences}</p>

      {isPending && (
        <div className="approval-actions">
          <button
            className="btn btn-success approval-btn"
            onClick={handleApprove}
            disabled={isRunning}
          >
            {isRunning ? "Running…" : "✓ Approve & Run"}
          </button>
          <button
            className="btn btn-danger approval-btn"
            onClick={handleReject}
            disabled={isRunning}
          >
            ✗ Reject
          </button>
        </div>
      )}

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
