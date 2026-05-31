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

describe("CANCEL_TOOL_REQUEST — does not cancel running requests", () => {
  it("no-ops on running request", () => {
    const s1 = lisaReducer(initialState, {
      type: "CREATE_TOOL_REQUEST",
      payload: { request: makeRequest("req-1", "running"), approval: makeApproval("apv-1", "req-1", "approved"), auditEvent: makeAudit() },
    });
    const next = lisaReducer(s1, {
      type: "CANCEL_TOOL_REQUEST",
      payload: { requestId: "req-1", auditEvent: makeAudit() },
    });
    expect(next.toolRequests[0].status).toBe("running");
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
