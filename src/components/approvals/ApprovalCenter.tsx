import React from "react";
import type { ApprovalRequest, ToolApprovalContract, ToolRequest } from "../../core/types";
import { useLisa } from "../../app/useLisa";
import { applyApprovalDecision } from "../../core/mission-store";
import { ToolApprovalCard } from "./ToolApprovalCard";
import "./ApprovalCenter.css";

interface ApprovalCenterProps {
  approvals: ApprovalRequest[];
  toolApprovals: ToolApprovalContract[];
  toolRequests: ToolRequest[];
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ApprovalCard({ approval }: { approval: ApprovalRequest }) {
  const { state, dispatch, addAudit } = useLisa();

  function handleDecision(decision: "approved" | "rejected") {
    const mission = state.missions.find((m) => m.id === approval.missionId);
    if (!mission) return;

    const { mission: updated, approval: updatedApproval } = applyApprovalDecision(
      mission,
      approval,
      decision
    );

    dispatch({ type: "UPDATE_MISSION", payload: updated });
    dispatch({ type: "UPDATE_APPROVAL", payload: updatedApproval });
    dispatch({ type: "SET_ORB_STATE", payload: "idle" });

    const hasPendingLeft = state.approvals.some(
      (a) => a.id !== approval.id && a.status === "pending"
    );
    if (!hasPendingLeft) {
      dispatch({ type: "SET_ORB_STATE", payload: "idle" });
    }

    addAudit({
      eventType: decision === "approved" ? "approval_approved" : "approval_rejected",
      source: "approval_center",
      summary: `${decision === "approved" ? "Approved" : "Rejected"}: "${approval.title}"`,
      missionId: approval.missionId,
      severity: decision === "approved" ? "info" : "warning",
    });

    dispatch({
      type: "SET_COMMAND_RESPONSE",
      payload:
        decision === "approved"
          ? `✓ Approved: "${approval.title}" — Mission completed.`
          : `✗ Rejected: "${approval.title}" — Mission cancelled.`,
    });
  }

  const isPending = approval.status === "pending";

  return (
    <div className={`approval-card approval-card-${approval.status}`}>
      {isPending && <div className="approval-card-pulse" />}

      <div className="approval-card-header">
        <div className="approval-card-title-row">
          <span className="approval-card-title">{approval.title}</span>
          <span className={`approval-status-badge approval-status-${approval.status}`}>
            {approval.status.toUpperCase()}
          </span>
        </div>
        <span className="approval-action-type">
          {approval.actionType.replace(/_/g, " ")}
        </span>
      </div>

      <p className="approval-card-desc">{approval.description}</p>

      {isPending && (
        <div className="approval-actions">
          <button
            className="btn btn-success approval-btn"
            onClick={() => handleDecision("approved")}
          >
            ✓ Approve
          </button>
          <button
            className="btn btn-danger approval-btn"
            onClick={() => handleDecision("rejected")}
          >
            ✗ Reject
          </button>
        </div>
      )}

      <div className="approval-card-footer">
        <span className="timestamp">Requested {formatTime(approval.createdAt)}</span>
        {approval.resolvedAt && (
          <span className="timestamp">Resolved {formatTime(approval.resolvedAt)}</span>
        )}
      </div>
    </div>
  );
}

const RESOLVED_PREVIEW = 10;

export const ApprovalCenter: React.FC<ApprovalCenterProps> = ({ approvals, toolApprovals, toolRequests }) => {
  const [showAllResolved, setShowAllResolved] = React.useState(false);

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");
  const resolvedVisible = showAllResolved ? resolved : resolved.slice(0, RESOLVED_PREVIEW);

  const pendingToolApprovals = toolApprovals.filter((a) => a.decision === null);
  const resolvedToolApprovals = toolApprovals.filter((a) => a.decision !== null);

  const isEmpty = approvals.length === 0 && toolApprovals.length === 0;

  return (
    <div className="approval-center">
      {isEmpty ? (
        <div className="empty-state">
          <span>◈</span>
          No pending approvals
        </div>
      ) : (
        <>
          {pendingToolApprovals.length > 0 && (
            <div className="approval-section">
              <div className="approval-section-label">
                Tool Requests — Pending
                <span className="approval-count">{pendingToolApprovals.length}</span>
              </div>
              {pendingToolApprovals.map((contract) => (
                <ToolApprovalCard
                  key={contract.id}
                  contract={contract}
                  request={toolRequests.find((r) => r.id === contract.requestId)}
                />
              ))}
            </div>
          )}
          {pending.length > 0 && (
            <div className="approval-section">
              <div className="approval-section-label">
                Pending
                <span className="approval-count">{pending.length}</span>
              </div>
              {pending.map((a) => (
                <ApprovalCard key={a.id} approval={a} />
              ))}
            </div>
          )}
          {resolvedToolApprovals.length > 0 && (
            <div className="approval-section">
              <div className="approval-section-label">Tool Requests — Resolved</div>
              {resolvedToolApprovals.slice(0, RESOLVED_PREVIEW).map((contract) => (
                <ToolApprovalCard
                  key={contract.id}
                  contract={contract}
                  request={toolRequests.find((r) => r.id === contract.requestId)}
                />
              ))}
            </div>
          )}
          {resolved.length > 0 && (
            <div className="approval-section">
              <div className="approval-section-label">Resolved</div>
              {resolvedVisible.map((a) => (
                <ApprovalCard key={a.id} approval={a} />
              ))}
              {resolved.length > RESOLVED_PREVIEW && !showAllResolved && (
                <button
                  className="approval-show-more"
                  onClick={() => setShowAllResolved(true)}
                >
                  Show all ({resolved.length})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ApprovalCenter;
