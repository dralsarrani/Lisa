import { describe, it, expect } from "vitest";
import { createTestMission, applyApprovalDecision } from "../core/mission-store";

describe("createTestMission", () => {
  it("returns linked mission and approval pair", () => {
    const { mission, approval } = createTestMission();
    expect(mission.approvalId).toBe(approval.id);
    expect(approval.missionId).toBe(mission.id);
  });

  it("mission has correct initial shape", () => {
    const { mission } = createTestMission();
    expect(mission.id).toBeTruthy();
    expect(mission.status).toBe("waiting_approval");
    expect(mission.steps).toHaveLength(4);
    expect(mission.source).toBe("user_command");
    expect(mission.title).toBeTruthy();
    expect(mission.description).toBeTruthy();
    expect(mission.createdAt).toBeTruthy();
    expect(mission.startedAt).toBeTruthy();
  });

  it("approval has correct initial shape", () => {
    const { approval } = createTestMission();
    expect(approval.id).toBeTruthy();
    expect(approval.status).toBe("pending");
    expect(approval.actionType).toBe("test_action");
    expect(approval.title).toBeTruthy();
    expect(approval.description).toBeTruthy();
    expect(approval.createdAt).toBeTruthy();
  });

  it("first two steps are completed, third is running, fourth is pending", () => {
    const { mission } = createTestMission();
    expect(mission.steps[0].status).toBe("completed");
    expect(mission.steps[1].status).toBe("completed");
    expect(mission.steps[2].status).toBe("running");
    expect(mission.steps[3].status).toBe("pending");
  });

  it("generates unique IDs on each call", () => {
    const a = createTestMission();
    const b = createTestMission();
    expect(a.mission.id).not.toBe(b.mission.id);
    expect(a.approval.id).not.toBe(b.approval.id);
  });

  it("step IDs are unique within the same mission", () => {
    const { mission } = createTestMission();
    const stepIds = mission.steps.map((s) => s.id);
    expect(new Set(stepIds).size).toBe(stepIds.length);
  });

  it("accepts optional mode and assigns it", () => {
    const { mission } = createTestMission("focus");
    expect(mission.mode).toBe("focus");
  });

  it("mode is undefined when not provided", () => {
    const { mission } = createTestMission();
    expect(mission.mode).toBeUndefined();
  });
});

describe("applyApprovalDecision — approved", () => {
  it("sets mission status to completed", () => {
    const { mission, approval } = createTestMission();
    const { mission: updated } = applyApprovalDecision(mission, approval, "approved");
    expect(updated.status).toBe("completed");
  });

  it("sets approval status to approved with decision field", () => {
    const { mission, approval } = createTestMission();
    const { approval: updated } = applyApprovalDecision(mission, approval, "approved");
    expect(updated.status).toBe("approved");
    expect(updated.decision).toBe("approved");
    expect(updated.resolvedAt).toBeTruthy();
    expect(updated.resolvedBy).toBe("operator");
  });

  it("sets completedAt on the mission", () => {
    const { mission, approval } = createTestMission();
    const { mission: updated } = applyApprovalDecision(mission, approval, "approved");
    expect(updated.completedAt).toBeTruthy();
  });

  it("step at index 2 becomes completed", () => {
    const { mission, approval } = createTestMission();
    const { mission: updated } = applyApprovalDecision(mission, approval, "approved");
    expect(updated.steps[2].status).toBe("completed");
    expect(updated.steps[2].completedAt).toBeTruthy();
  });

  it("step at index 3 becomes completed with approval note", () => {
    const { mission, approval } = createTestMission();
    const { mission: updated } = applyApprovalDecision(mission, approval, "approved");
    expect(updated.steps[3].status).toBe("completed");
    expect(updated.steps[3].notes).toContain("Approved");
  });
});

describe("applyApprovalDecision — rejected", () => {
  it("sets mission status to cancelled", () => {
    const { mission, approval } = createTestMission();
    const { mission: updated } = applyApprovalDecision(mission, approval, "rejected");
    expect(updated.status).toBe("cancelled");
  });

  it("sets approval status to rejected with decision field", () => {
    const { mission, approval } = createTestMission();
    const { approval: updated } = applyApprovalDecision(mission, approval, "rejected");
    expect(updated.status).toBe("rejected");
    expect(updated.decision).toBe("rejected");
    expect(updated.resolvedAt).toBeTruthy();
  });

  it("step at index 3 becomes skipped with rejection note", () => {
    const { mission, approval } = createTestMission();
    const { mission: updated } = applyApprovalDecision(mission, approval, "rejected");
    expect(updated.steps[3].status).toBe("skipped");
    expect(updated.steps[3].notes).toContain("Rejected");
  });
});

describe("applyApprovalDecision — immutability", () => {
  it("does not mutate the original mission", () => {
    const { mission, approval } = createTestMission();
    const originalStatus = mission.status;
    const originalStep3Status = mission.steps[3].status;
    applyApprovalDecision(mission, approval, "approved");
    expect(mission.status).toBe(originalStatus);
    expect(mission.steps[3].status).toBe(originalStep3Status);
  });

  it("does not mutate the original approval", () => {
    const { mission, approval } = createTestMission();
    const originalStatus = approval.status;
    applyApprovalDecision(mission, approval, "approved");
    expect(approval.status).toBe(originalStatus);
  });
});
