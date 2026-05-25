import type { Mission, MissionStep, ApprovalRequest, LisaModeId } from "./types";

let _missionCounter = 1;
let _stepCounter = 1;
let _approvalCounter = 1;

function genMissionId(): string {
  return `mission_${Date.now()}_${_missionCounter++}`;
}

function genStepId(): string {
  return `step_${Date.now()}_${_stepCounter++}`;
}

function genApprovalId(): string {
  return `approval_${Date.now()}_${_approvalCounter++}`;
}

export function createTestMission(activeMode?: LisaModeId): {
  mission: Mission;
  approval: ApprovalRequest;
} {
  const missionId = genMissionId();
  const approvalId = genApprovalId();
  const now = new Date().toISOString();

  const steps: MissionStep[] = [
    {
      id: genStepId(),
      label: "Command Received",
      description: "User issued 'create test mission' command.",
      status: "completed",
      startedAt: now,
      completedAt: now,
    },
    {
      id: genStepId(),
      label: "Mission Initialized",
      description: "Phase 0 test mission created and added to the mission timeline.",
      status: "completed",
      startedAt: now,
      completedAt: now,
    },
    {
      id: genStepId(),
      label: "Approval Requested",
      description: "Waiting for operator decision before proceeding.",
      status: "running",
      startedAt: now,
    },
    {
      id: genStepId(),
      label: "Waiting for Operator Decision",
      description: "Mission paused at approval gate. Approve or reject from the Approval Center.",
      status: "pending",
    },
  ];

  const mission: Mission = {
    id: missionId,
    title: "Phase 0 Test Mission",
    description:
      "This is the Phase 0 test mission. It validates the mission model, approval flow, and audit logging. Approve to complete it, reject to cancel.",
    status: "waiting_approval",
    steps,
    createdAt: now,
    startedAt: now,
    approvalId,
    source: "user_command",
    mode: activeMode,
  };

  const approval: ApprovalRequest = {
    id: approvalId,
    missionId,
    title: "Authorize Phase 0 Test Mission",
    description:
      "Lisa has created a test mission to validate the Phase 0 approval flow. Approving will mark the mission complete. Rejecting will cancel it. No real actions will be taken.",
    actionType: "test_action",
    status: "pending",
    createdAt: now,
  };

  return { mission, approval };
}

export function applyApprovalDecision(
  mission: Mission,
  approval: ApprovalRequest,
  decision: "approved" | "rejected"
): { mission: Mission; approval: ApprovalRequest } {
  const now = new Date().toISOString();

  const updatedApproval: ApprovalRequest = {
    ...approval,
    status: decision === "approved" ? "approved" : "rejected",
    decision,
    resolvedAt: now,
    resolvedBy: "operator",
  };

  // Update steps.
  const updatedSteps = mission.steps.map((step, idx) => {
    if (idx === 2) {
      return { ...step, status: "completed" as const, completedAt: now };
    }
    if (idx === 3) {
      return {
        ...step,
        status: decision === "approved" ? ("completed" as const) : ("skipped" as const),
        startedAt: now,
        completedAt: now,
        notes: decision === "approved" ? "Approved by operator." : "Rejected by operator.",
      };
    }
    return step;
  });

  const updatedMission: Mission = {
    ...mission,
    status: decision === "approved" ? "completed" : "cancelled",
    steps: updatedSteps,
    completedAt: now,
  };

  return { mission: updatedMission, approval: updatedApproval };
}
