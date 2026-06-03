import { describe, it, expect } from "vitest";
import { lisaReducer, initialState } from "../app/lisa-reducer";
import type { LisaState } from "../app/lisa-reducer";
import { createAuditEvent } from "../core/audit-store";
import type { ToolRequest, ToolApprovalContract, ToolResult } from "../core/types";

const NOW = "2025-01-01T00:00:00.000Z";

function makeRequest(id: string, status: ToolRequest["status"] = "pending_approval"): ToolRequest {
  return {
    id,
    toolId: "conversation-stats",
    toolDisplayName: "Conversation Stats",
    params: {},
    status,
    source: "user_command",
    consequences: "Safe diagnostic only.",
    createdAt: NOW,
  };
}

function makeApproval(id: string, requestId: string, decision: ToolApprovalContract["decision"] = null): ToolApprovalContract {
  return {
    id,
    requestId,
    toolId: "conversation-stats",
    toolDisplayName: "Conversation Stats",
    consequences: "Safe diagnostic only.",
    decision,
    resolvedBy: decision !== null ? "operator" : null,
    createdAt: NOW,
  };
}

function makeAudit() {
  return createAuditEvent({ eventType: "app_started", source: "test", summary: "test event" });
}

// ─── CREATE_TOOL_REQUEST ──────────────────────────────────────────────────────

describe("CREATE_TOOL_REQUEST", () => {
  it("adds request and approval to state", () => {
    const request = makeRequest("req-1");
    const approval = makeApproval("apv-1", "req-1");
    const next = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request, approval, auditEvent: makeAudit() },
    });
    expect(next.toolRequests).toHaveLength(1);
    expect(next.toolRequests[0].id).toBe("req-1");
    expect(next.toolApprovals).toHaveLength(1);
    expect(next.toolApprovals[0].requestId).toBe("req-1");
    expect(next.toolApprovals[0].decision).toBeNull();
  });

  it("prepends new request (latest first)", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    const s2 = lisaReducer(s1, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-2"), approval: makeApproval("apv-2", "req-2"), auditEvent: makeAudit() },
    });
    expect(s2.toolRequests[0].id).toBe("req-2");
    expect(s2.toolRequests[1].id).toBe("req-1");
  });

  it("adds an audit event", () => {
    const before = initialState.auditEvents.length;
    const next = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    expect(next.auditEvents.length).toBe(before + 1);
  });
});

// ─── OPERATOR_APPROVE_TOOL ────────────────────────────────────────────────────

describe("OPERATOR_APPROVE_TOOL", () => {
  function stateWithPending(): LisaState {
    return lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
  }

  it("moves request status to approved", () => {
    const next = lisaReducer(stateWithPending(), {
      type: "OPERATOR_APPROVE_TOOL",
      payload: { requestId: "req-1", resolvedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("approved");
  });

  it("sets approval decision to approved with resolvedBy operator", () => {
    const next = lisaReducer(stateWithPending(), {
      type: "OPERATOR_APPROVE_TOOL",
      payload: { requestId: "req-1", resolvedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolApprovals[0].decision).toBe("approved");
    expect(next.toolApprovals[0].resolvedBy).toBe("operator");
    expect(next.toolApprovals[0].resolvedAt).toBe(NOW);
  });

  it("does not affect unrelated requests", () => {
    const s = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    const s2 = lisaReducer(s, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-2"), approval: makeApproval("apv-2", "req-2"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s2, {
      type: "OPERATOR_APPROVE_TOOL",
      payload: { requestId: "req-1", resolvedAt: NOW, auditEvent: makeAudit() },
    });
    const req2 = next.toolRequests.find((r) => r.id === "req-2")!;
    expect(req2.status).toBe("pending_approval");
  });
});

// ─── OPERATOR_REJECT_TOOL ─────────────────────────────────────────────────────

describe("OPERATOR_REJECT_TOOL", () => {
  function stateWithPending(): LisaState {
    return lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
  }

  it("moves request status to rejected", () => {
    const next = lisaReducer(stateWithPending(), {
      type: "OPERATOR_REJECT_TOOL",
      payload: { requestId: "req-1", resolvedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("rejected");
  });

  it("sets approval decision to rejected", () => {
    const next = lisaReducer(stateWithPending(), {
      type: "OPERATOR_REJECT_TOOL",
      payload: { requestId: "req-1", resolvedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolApprovals[0].decision).toBe("rejected");
    expect(next.toolApprovals[0].resolvedBy).toBe("operator");
  });
});

// ─── START_TOOL_EXECUTION (triple-check gate) ─────────────────────────────────

describe("START_TOOL_EXECUTION", () => {
  function approvedState(): LisaState {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    return lisaReducer(s1, {
      type: "OPERATOR_APPROVE_TOOL",
      payload: { requestId: "req-1", resolvedAt: NOW, auditEvent: makeAudit() },
    });
  }

  it("transitions status to running when gate passes", () => {
    const next = lisaReducer(approvedState(), {
      type: "START_TOOL_EXECUTION",
      payload: { requestId: "req-1", startedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("running");
  });

  it("gate blocks execution when request is still pending_approval", () => {
    const pending = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(pending, {
      type: "START_TOOL_EXECUTION",
      payload: { requestId: "req-1", startedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("pending_approval");
  });

  it("gate blocks execution for unknown requestId", () => {
    const next = lisaReducer(approvedState(), {
      type: "START_TOOL_EXECUTION",
      payload: { requestId: "does-not-exist", startedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("approved");
  });
});

// ─── COMPLETE_TOOL_EXECUTION ──────────────────────────────────────────────────

describe("COMPLETE_TOOL_EXECUTION", () => {
  function runningState(): LisaState {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    const s2 = lisaReducer(s1, {
      type: "OPERATOR_APPROVE_TOOL",
      payload: { requestId: "req-1", resolvedAt: NOW, auditEvent: makeAudit() },
    });
    return lisaReducer(s2, {
      type: "START_TOOL_EXECUTION",
      payload: { requestId: "req-1", startedAt: NOW, auditEvent: makeAudit() },
    });
  }

  it("transitions request to succeeded", () => {
    const result: ToolResult = { id: "res-1", requestId: "req-1", toolId: "conversation-stats", outputSummary: "ok", succeededAt: NOW };
    const next = lisaReducer(runningState(), {
      type: "COMPLETE_TOOL_EXECUTION",
      payload: { requestId: "req-1", result, completedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("succeeded");
    expect(next.toolRequests[0].resultId).toBe("res-1");
  });

  it("stores the result in toolResults", () => {
    const result: ToolResult = { id: "res-1", requestId: "req-1", toolId: "conversation-stats", outputSummary: "done", succeededAt: NOW };
    const next = lisaReducer(runningState(), {
      type: "COMPLETE_TOOL_EXECUTION",
      payload: { requestId: "req-1", result, completedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolResults).toHaveLength(1);
    expect(next.toolResults[0].outputSummary).toBe("done");
  });
});

// ─── FAIL_TOOL_EXECUTION ──────────────────────────────────────────────────────

describe("FAIL_TOOL_EXECUTION", () => {
  it("transitions request to failed with error message", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "running"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s1, {
      type: "FAIL_TOOL_EXECUTION",
      payload: { requestId: "req-1", error: "executor threw", completedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("failed");
    expect(next.toolRequests[0].error).toBe("executor threw");
  });
});

// ─── CANCEL_TOOL_REQUEST ──────────────────────────────────────────────────────

describe("CANCEL_TOOL_REQUEST", () => {
  it("cancels a pending_approval request", () => {
    const s = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s, {
      type: "CANCEL_TOOL_REQUEST",
      payload: { requestId: "req-1", auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("cancelled");
    expect(next.toolApprovals[0].decision).toBe("rejected");
  });

  it("cancels an approved request", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    const s2 = lisaReducer(s1, {
      type: "OPERATOR_APPROVE_TOOL",
      payload: { requestId: "req-1", resolvedAt: NOW, auditEvent: makeAudit() },
    });
    const next = lisaReducer(s2, {
      type: "CANCEL_TOOL_REQUEST",
      payload: { requestId: "req-1", auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("cancelled");
  });

  it("does not cancel an already-succeeded request", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "succeeded"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s1, {
      type: "CANCEL_TOOL_REQUEST",
      payload: { requestId: "req-1", auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("succeeded");
  });
});

// ─── EMERGENCY_STOP (tool side effects) ──────────────────────────────────────

describe("EMERGENCY_STOP — tool requests", () => {
  it("cancels pending_approval tool requests", () => {
    const s = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s, { type: "EMERGENCY_STOP" });
    expect(next.toolRequests[0].status).toBe("cancelled");
  });

  it("rejects pending tool approvals on emergency stop", () => {
    const s = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s, { type: "EMERGENCY_STOP" });
    expect(next.toolApprovals[0].decision).toBe("rejected");
  });

  it("does not alter already-completed requests on emergency stop", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "succeeded"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s1, { type: "EMERGENCY_STOP" });
    expect(next.toolRequests[0].status).toBe("succeeded");
  });
});

// ─── EMERGENCY_STOP race guards ───────────────────────────────────────────────

describe("COMPLETE_TOOL_EXECUTION — guard against non-running state", () => {
  function makeResult(requestId: string) {
    return {
      id: "res-1",
      requestId,
      toolId: "conversation-stats",
      outputSummary: "ok",
      succeededAt: NOW,
    };
  }

  it("no-ops if request is already cancelled (EMERGENCY_STOP race)", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "running"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const cancelled = lisaReducer(s1, { type: "EMERGENCY_STOP" });
    expect(cancelled.toolRequests[0].status).toBe("cancelled");

    const afterComplete = lisaReducer(cancelled, {
      type: "COMPLETE_TOOL_EXECUTION",
      payload: { requestId: "req-1", result: makeResult("req-1"), completedAt: NOW, auditEvent: makeAudit() },
    });
    expect(afterComplete.toolRequests[0].status).toBe("cancelled");
    expect(afterComplete.toolResults).toHaveLength(0);
  });

  it("no-ops if request is already succeeded (duplicate complete)", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "running"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const s2 = lisaReducer(s1, {
      type: "COMPLETE_TOOL_EXECUTION",
      payload: { requestId: "req-1", result: makeResult("req-1"), completedAt: NOW, auditEvent: makeAudit() },
    });
    expect(s2.toolRequests[0].status).toBe("succeeded");
    expect(s2.toolResults).toHaveLength(1);

    const s3 = lisaReducer(s2, {
      type: "COMPLETE_TOOL_EXECUTION",
      payload: { requestId: "req-1", result: { ...makeResult("req-1"), id: "res-2" }, completedAt: NOW, auditEvent: makeAudit() },
    });
    expect(s3.toolResults).toHaveLength(1); // no duplicate result added
  });
});

describe("FAIL_TOOL_EXECUTION — guard against non-running state", () => {
  it("no-ops if request is already cancelled (EMERGENCY_STOP race)", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "running"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const cancelled = lisaReducer(s1, { type: "EMERGENCY_STOP" });
    const afterFail = lisaReducer(cancelled, {
      type: "FAIL_TOOL_EXECUTION",
      payload: { requestId: "req-1", error: "timeout", completedAt: NOW, auditEvent: makeAudit() },
    });
    expect(afterFail.toolRequests[0].status).toBe("cancelled");
  });

  it("no-ops if request is already succeeded", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "running"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const s2 = lisaReducer(s1, {
      type: "COMPLETE_TOOL_EXECUTION",
      payload: {
        requestId: "req-1",
        result: { id: "res-1", requestId: "req-1", toolId: "conversation-stats", outputSummary: "ok", succeededAt: NOW },
        completedAt: NOW,
        auditEvent: makeAudit(),
      },
    });
    const s3 = lisaReducer(s2, {
      type: "FAIL_TOOL_EXECUTION",
      payload: { requestId: "req-1", error: "late error", completedAt: NOW, auditEvent: makeAudit() },
    });
    expect(s3.toolRequests[0].status).toBe("succeeded");
  });
});

describe("CANCEL_TOOL_REQUEST — Phase 2G: cancels running requests", () => {
  it("cancels a running request", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "running"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s1, {
      type: "CANCEL_TOOL_REQUEST",
      payload: { requestId: "req-1", auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("cancelled");
  });

  it("sets completedAt on running cancellation", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "running"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s1, {
      type: "CANCEL_TOOL_REQUEST",
      payload: { requestId: "req-1", auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].completedAt).toBeDefined();
  });

  it("does not cancel an already-succeeded request", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "succeeded"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s1, {
      type: "CANCEL_TOOL_REQUEST",
      payload: { requestId: "req-1", auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("succeeded");
  });
});

describe("CREATE_TOOL_REQUEST — cap enforcement", () => {
  it("caps toolRequests at 50 on create", () => {
    let state = initialState;
    for (let i = 0; i < 52; i++) {
      state = lisaReducer(state, {
        type: "CREATE_TOOL_REQUEST",
        payload: {
          request: makeRequest(`req-${i}`),
          approval: makeApproval(`apv-${i}`, `req-${i}`),
          auditEvent: makeAudit(),
        },
      });
    }
    expect(state.toolRequests.length).toBeLessThanOrEqual(50);
    expect(state.toolApprovals.length).toBeLessThanOrEqual(50);
  });
});

// ─── Phase 2F — expiresAt on approval ────────────────────────────────────────

describe("OPERATOR_APPROVE_TOOL — Phase 2F expiresAt", () => {
  function stateWithPending(): LisaState {
    return lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
  }

  it("sets expiresAt 5 minutes after resolvedAt", () => {
    const resolvedAt = "2025-01-01T00:00:00.000Z";
    const next = lisaReducer(stateWithPending(), {
      type: "OPERATOR_APPROVE_TOOL",
      payload: { requestId: "req-1", resolvedAt, auditEvent: makeAudit() },
    });
    const req = next.toolRequests.find((r) => r.id === "req-1")!;
    expect(req.expiresAt).toBeDefined();
    const diff = new Date(req.expiresAt!).getTime() - new Date(resolvedAt).getTime();
    expect(diff).toBe(5 * 60 * 1000);
  });

  it("expiresAt is after approvedAt", () => {
    const resolvedAt = "2025-06-15T12:00:00.000Z";
    const next = lisaReducer(stateWithPending(), {
      type: "OPERATOR_APPROVE_TOOL",
      payload: { requestId: "req-1", resolvedAt, auditEvent: makeAudit() },
    });
    const req = next.toolRequests.find((r) => r.id === "req-1")!;
    expect(new Date(req.expiresAt!).getTime()).toBeGreaterThan(new Date(resolvedAt).getTime());
  });
});

// ─── Phase 2F — expiry check in START_TOOL_EXECUTION ─────────────────────────

describe("START_TOOL_EXECUTION — Phase 2F expiry", () => {
  function approvedStateWithExpiry(expiresAt: string): LisaState {
    const reqWithExpiry: ToolRequest = { ...makeRequest("req-1", "approved"), approvedAt: NOW, expiresAt };
    const approval: ToolApprovalContract = {
      id: "apv-1",
      requestId: "req-1",
      toolId: "conversation-stats",
      toolDisplayName: "Conversation Stats",
      consequences: "Safe diagnostic only.",
      decision: "approved",
      resolvedBy: "operator",
      createdAt: NOW,
      resolvedAt: NOW,
    };
    return lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: reqWithExpiry, approval, auditEvent: makeAudit() },
    });
  }

  it("marks request as expired when startedAt is after expiresAt", () => {
    const expiresAt = "2025-01-01T00:04:00.000Z";
    const startedAt = "2025-01-01T00:06:00.000Z";
    const s = approvedStateWithExpiry(expiresAt);
    const next = lisaReducer(s, {
      type: "START_TOOL_EXECUTION",
      payload: { requestId: "req-1", startedAt, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("expired");
  });

  it("proceeds to running when startedAt is before expiresAt", () => {
    const expiresAt = "2025-01-01T00:10:00.000Z";
    const startedAt = "2025-01-01T00:03:00.000Z";
    const s = approvedStateWithExpiry(expiresAt);
    const next = lisaReducer(s, {
      type: "START_TOOL_EXECUTION",
      payload: { requestId: "req-1", startedAt, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("running");
  });

  it("proceeds to running when no expiresAt is set", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1"), approval: makeApproval("apv-1", "req-1"), auditEvent: makeAudit() },
    });
    const s2 = lisaReducer(s1, {
      type: "OPERATOR_APPROVE_TOOL",
      payload: { requestId: "req-1", resolvedAt: NOW, auditEvent: makeAudit() },
    });
    const s3 = {
      ...s2,
      toolRequests: s2.toolRequests.map((r) => {
        const { expiresAt: _exp, ...rest } = r as ToolRequest & { expiresAt?: string };
        return rest as ToolRequest;
      }),
    };
    const next = lisaReducer(s3, {
      type: "START_TOOL_EXECUTION",
      payload: { requestId: "req-1", startedAt: NOW, auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("running");
  });
});

// ─── DISMISS_TOOL_SUGGESTION ──────────────────────────────────────────────────

import type { LisaInteraction, ToolSuggestion } from "../core/types";

function makeInteractionWithSuggestion(
  id: string,
  suggestionStatus: ToolSuggestion["status"] = "visible"
): LisaInteraction {
  const suggestion: ToolSuggestion = {
    id: "sug-1",
    toolId: "runtime-snapshot",
    toolDisplayName: "Runtime Snapshot",
    reason: "test",
    source: "user_intent_detected",
    createdAt: NOW,
    originatingInteractionId: id,
    status: suggestionStatus,
  };
  return {
    id,
    kind: "local_ai",
    prompt: "check my system",
    response: "Sure!",
    status: "complete",
    createdAt: NOW,
    completedAt: NOW,
    toolSuggestion: suggestion,
  };
}

describe("DISMISS_TOOL_SUGGESTION", () => {
  it("sets visible suggestion to dismissed", () => {
    const ix = makeInteractionWithSuggestion("ix-1", "visible");
    const s = { ...initialState, interactions: [ix] };
    const next = lisaReducer(s, { type: "DISMISS_TOOL_SUGGESTION", payload: { interactionId: "ix-1" } });
    expect(next.interactions[0].toolSuggestion?.status).toBe("dismissed");
  });

  it("no-ops if suggestion is already dismissed", () => {
    const ix = makeInteractionWithSuggestion("ix-1", "dismissed");
    const s = { ...initialState, interactions: [ix] };
    const next = lisaReducer(s, { type: "DISMISS_TOOL_SUGGESTION", payload: { interactionId: "ix-1" } });
    expect(next.interactions[0].toolSuggestion?.status).toBe("dismissed");
  });

  it("no-ops if suggestion is already converted", () => {
    const ix = makeInteractionWithSuggestion("ix-1", "converted");
    const s = { ...initialState, interactions: [ix] };
    const next = lisaReducer(s, { type: "DISMISS_TOOL_SUGGESTION", payload: { interactionId: "ix-1" } });
    expect(next.interactions[0].toolSuggestion?.status).toBe("converted");
  });

  it("no-ops if interaction has no toolSuggestion", () => {
    const ix: LisaInteraction = { id: "ix-1", kind: "local_ai", prompt: "hi", response: "ok", status: "complete", createdAt: NOW };
    const s = { ...initialState, interactions: [ix] };
    const next = lisaReducer(s, { type: "DISMISS_TOOL_SUGGESTION", payload: { interactionId: "ix-1" } });
    expect(next.interactions[0].toolSuggestion).toBeUndefined();
  });
});

// ─── CONVERT_TOOL_SUGGESTION ──────────────────────────────────────────────────

describe("CONVERT_TOOL_SUGGESTION", () => {
  it("sets visible suggestion to converted", () => {
    const ix = makeInteractionWithSuggestion("ix-1", "visible");
    const s = { ...initialState, interactions: [ix] };
    const next = lisaReducer(s, { type: "CONVERT_TOOL_SUGGESTION", payload: { interactionId: "ix-1", requestId: "req-1" } });
    expect(next.interactions[0].toolSuggestion?.status).toBe("converted");
  });

  it("no-ops if suggestion is already converted", () => {
    const ix = makeInteractionWithSuggestion("ix-1", "converted");
    const s = { ...initialState, interactions: [ix] };
    const next = lisaReducer(s, { type: "CONVERT_TOOL_SUGGESTION", payload: { interactionId: "ix-1", requestId: "req-1" } });
    expect(next.interactions[0].toolSuggestion?.status).toBe("converted");
  });

  it("no-ops if suggestion is already dismissed", () => {
    const ix = makeInteractionWithSuggestion("ix-1", "dismissed");
    const s = { ...initialState, interactions: [ix] };
    const next = lisaReducer(s, { type: "CONVERT_TOOL_SUGGESTION", payload: { interactionId: "ix-1", requestId: "req-1" } });
    expect(next.interactions[0].toolSuggestion?.status).toBe("dismissed");
  });

  it("no-ops if interaction has no toolSuggestion", () => {
    const ix: LisaInteraction = { id: "ix-1", kind: "local_ai", prompt: "hi", response: "ok", status: "complete", createdAt: NOW };
    const s = { ...initialState, interactions: [ix] };
    const next = lisaReducer(s, { type: "CONVERT_TOOL_SUGGESTION", payload: { interactionId: "ix-1", requestId: "req-1" } });
    expect(next.interactions[0].toolSuggestion).toBeUndefined();
  });
});

// ─── COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE (Phase 2H) ───────────────────

function makeMemoryNoteToolResult(id: string, requestId: string): ToolResult {
  return {
    id,
    requestId,
    toolId: "save-tool-result-memory-note",
    outputSummary: "Saved tool result as memory note (7 chars).",
    succeededAt: NOW,
  };
}

describe("COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE", () => {
  it("marks request succeeded and adds ToolResult and memory note", () => {
    const req = makeRequest("req-1", "running");
    const apv = makeApproval("apv-1", "req-1", "approved");
    const s0: LisaState = { ...initialState, toolRequests: [req], toolApprovals: [apv] };
    const result = makeMemoryNoteToolResult("res-1", "req-1");

    const next = lisaReducer(s0, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: {
        requestId: "req-1",
        result,
        completedAt: NOW,
        memoryNoteContent: "7 chars",
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    });

    expect(next.toolRequests[0].status).toBe("succeeded");
    expect(next.toolRequests[0].resultId).toBe("res-1");
    expect(next.toolResults).toHaveLength(1);
    expect(next.memoryNotes).toHaveLength(1);
    expect(next.memoryNotes[0].content).toBe("7 chars");
  });

  it("no-op when request is not running (pending_approval)", () => {
    const req = makeRequest("req-1", "pending_approval");
    const s0: LisaState = { ...initialState, toolRequests: [req] };

    const next = lisaReducer(s0, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: {
        requestId: "req-1",
        result: makeMemoryNoteToolResult("res-1", "req-1"),
        completedAt: NOW,
        memoryNoteContent: "test",
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    });

    expect(next).toBe(s0);
  });

  it("no-op when request is cancelled", () => {
    const req = makeRequest("req-1", "cancelled");
    const s0: LisaState = { ...initialState, toolRequests: [req] };

    const next = lisaReducer(s0, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: {
        requestId: "req-1",
        result: makeMemoryNoteToolResult("res-1", "req-1"),
        completedAt: NOW,
        memoryNoteContent: "test",
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    });

    expect(next).toBe(s0);
    expect(next.memoryNotes).toHaveLength(0);
  });

  it("no-op when request is expired", () => {
    const req = makeRequest("req-1", "expired");
    const s0: LisaState = { ...initialState, toolRequests: [req] };

    const next = lisaReducer(s0, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: {
        requestId: "req-1",
        result: makeMemoryNoteToolResult("res-1", "req-1"),
        completedAt: NOW,
        memoryNoteContent: "test",
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    });

    expect(next).toBe(s0);
    expect(next.memoryNotes).toHaveLength(0);
  });

  it("still completes tool even when note content is empty", () => {
    const req = makeRequest("req-1", "running");
    const s0: LisaState = { ...initialState, toolRequests: [req] };

    const next = lisaReducer(s0, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: {
        requestId: "req-1",
        result: makeMemoryNoteToolResult("res-1", "req-1"),
        completedAt: NOW,
        memoryNoteContent: "",
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    });

    expect(next.toolRequests[0].status).toBe("succeeded");
    expect(next.toolResults).toHaveLength(1);
    expect(next.memoryNotes).toHaveLength(0);
  });

  it("does not add note when content exceeds MEMORY_NOTE_CHAR_LIMIT", () => {
    const req = makeRequest("req-1", "running");
    const s0: LisaState = { ...initialState, toolRequests: [req] };

    const next = lisaReducer(s0, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: {
        requestId: "req-1",
        result: makeMemoryNoteToolResult("res-1", "req-1"),
        completedAt: NOW,
        memoryNoteContent: "x".repeat(201),
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    });

    expect(next.toolRequests[0].status).toBe("succeeded");
    expect(next.memoryNotes).toHaveLength(0);
  });

  it("respects MEMORY_NOTES_CAP and evicts oldest note", () => {
    const req = makeRequest("req-1", "running");
    const existingNotes = Array.from({ length: 20 }, (_, i) => ({
      id: `note-${i}`,
      content: `note ${i}`,
      createdAt: NOW,
    }));
    const s0: LisaState = { ...initialState, toolRequests: [req], memoryNotes: existingNotes };

    const next = lisaReducer(s0, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: {
        requestId: "req-1",
        result: makeMemoryNoteToolResult("res-1", "req-1"),
        completedAt: NOW,
        memoryNoteContent: "new note",
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    });

    expect(next.memoryNotes).toHaveLength(20);
    expect(next.memoryNotes[next.memoryNotes.length - 1].content).toBe("new note");
  });

  it("does not add duplicate note on stale second dispatch", () => {
    const req = makeRequest("req-1", "running");
    const s0: LisaState = { ...initialState, toolRequests: [req] };

    const action = {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE" as const,
      payload: {
        requestId: "req-1",
        result: makeMemoryNoteToolResult("res-1", "req-1"),
        completedAt: NOW,
        memoryNoteContent: "note content",
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    };

    const s1 = lisaReducer(s0, action);
    expect(s1.memoryNotes).toHaveLength(1);

    // Second dispatch — request is now succeeded, guard fires
    const s2 = lisaReducer(s1, action);
    expect(s2.memoryNotes).toHaveLength(1); // no duplicate
  });

  it("adds two audit events when note is successfully created", () => {
    const req = makeRequest("req-1", "running");
    const s0: LisaState = { ...initialState, toolRequests: [req] };

    const next = lisaReducer(s0, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: {
        requestId: "req-1",
        result: makeMemoryNoteToolResult("res-1", "req-1"),
        completedAt: NOW,
        memoryNoteContent: "valid note",
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    });

    expect(next.auditEvents).toHaveLength(2);
  });

  it("adds only one audit event when note content is invalid", () => {
    const req = makeRequest("req-1", "running");
    const s0: LisaState = { ...initialState, toolRequests: [req] };

    const next = lisaReducer(s0, {
      type: "COMPLETE_TOOL_EXECUTION_AND_ADD_MEMORY_NOTE",
      payload: {
        requestId: "req-1",
        result: makeMemoryNoteToolResult("res-1", "req-1"),
        completedAt: NOW,
        memoryNoteContent: "",
        auditEvent: makeAudit(),
        memoryNoteAuditEvent: makeAudit(),
      },
    });

    expect(next.auditEvents).toHaveLength(1);
  });
});
