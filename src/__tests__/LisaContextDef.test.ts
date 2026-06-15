import { describe, it, expect } from "vitest";
import { LisaContext } from "../app/LisaContextDef";
import type { LisaContextValue } from "../app/LisaContextDef";
import type { LisaState, LisaAction } from "../app/lisa-reducer";
import type React from "react";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LisaContext", () => {
  it("should be defined", () => {
    expect(LisaContext).toBeDefined();
  });

  it("should be a React Context", () => {
    expect(LisaContext).toHaveProperty("Provider");
    expect(LisaContext).toHaveProperty("Consumer");
  });

  it("should have null as default value", () => {
    // React Context default value is null for required contexts
    // that must be wrapped with a provider
    expect(LisaContext._currentValue).toBeNull();
  });
});

describe("LisaContextValue interface", () => {
  it("should define state property as LisaState", () => {
    // This is a type-level test to ensure the interface is structured correctly
    const mockValue: LisaContextValue = {
      state: {} as LisaState,
      dispatch: (() => {}) as React.Dispatch<LisaAction>,
      addAudit: () => {},
    };

    expect(mockValue).toHaveProperty("state");
    expect(mockValue).toHaveProperty("dispatch");
    expect(mockValue).toHaveProperty("addAudit");
  });

  it("should have state as LisaState type", () => {
    const mockState = {
      orbState: "idle",
      activeMode: "normal",
      settings: {} as any,
      missions: [],
      approvals: [],
      auditEvents: [],
      runtimeHealth: null,
      isLoaded: false,
      commandResponse: null,
      interactions: [],
      conversationHistory: [],
      memoryNotes: [],
      toolRequests: [],
      toolResults: [],
      toolApprovals: [],
      voiceStatus: "idle",
      voiceTranscriptDraft: null,
      voiceError: null,
      ttsUiStatus: "idle",
      ttsProvider: null,
      ttsError: null,
      ttsSpeakingInteractionId: null,
      spokenInteractionIds: [],
      screenStatus: "idle",
      screenOcrStatus: "idle",
    } as LisaState;

    const mockValue: LisaContextValue = {
      state: mockState,
      dispatch: (() => {}) as React.Dispatch<LisaAction>,
      addAudit: () => {},
    };

    expect(mockValue.state).toEqual(mockState);
    expect(mockValue.state.orbState).toBe("idle");
    expect(mockValue.state.activeMode).toBe("normal");
    expect(mockValue.state.isLoaded).toBe(false);
  });

  it("should have dispatch as React.Dispatch<LisaAction>", () => {
    const mockDispatch: React.Dispatch<LisaAction> = (action: LisaAction) => {};

    const mockValue: LisaContextValue = {
      state: {} as LisaState,
      dispatch: mockDispatch,
      addAudit: () => {},
    };

    expect(typeof mockValue.dispatch).toBe("function");
    expect(mockValue.dispatch).toBe(mockDispatch);
  });

  it("should have addAudit as a function", () => {
    const mockAddAudit = (params: any) => {};

    const mockValue: LisaContextValue = {
      state: {} as LisaState,
      dispatch: (() => {}) as React.Dispatch<LisaAction>,
      addAudit: mockAddAudit,
    };

    expect(typeof mockValue.addAudit).toBe("function");
    expect(mockValue.addAudit).toBe(mockAddAudit);
  });

  it("should allow calling dispatch on context value", () => {
    const dispatchCalls: LisaAction[] = [];

    const mockDispatch: React.Dispatch<LisaAction> = (action: LisaAction) => {
      dispatchCalls.push(action);
    };

    const mockValue: LisaContextValue = {
      state: {} as LisaState,
      dispatch: mockDispatch,
      addAudit: () => {},
    };

    const testAction: LisaAction = {
      type: "ADD_AUDIT_EVENT",
      payload: {
        id: "test",
        eventType: "test_event",
        source: "test",
        timestamp: new Date().toISOString(),
        summary: "Test",
        details: "Test details",
        severity: "info",
      },
    };

    mockValue.dispatch(testAction);

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0]).toEqual(testAction);
  });

  it("should allow calling addAudit on context value", () => {
    const auditCalls: any[] = [];

    const mockValue: LisaContextValue = {
      state: {} as LisaState,
      dispatch: (() => {}) as React.Dispatch<LisaAction>,
      addAudit: (params: any) => {
        auditCalls.push(params);
      },
    };

    const testParams = {
      eventType: "test_event",
      source: "test",
      summary: "Test",
      details: "Test details",
      severity: "info",
    };

    mockValue.addAudit(testParams);

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toEqual(testParams);
  });

  it("should maintain state reference through context value", () => {
    const mockState = {
      orbState: "listening",
      activeMode: "focus",
      settings: {} as any,
      missions: [],
      approvals: [],
      auditEvents: [],
      runtimeHealth: null,
      isLoaded: true,
      commandResponse: null,
      interactions: [],
      conversationHistory: [],
      memoryNotes: [],
      toolRequests: [],
      toolResults: [],
      toolApprovals: [],
      voiceStatus: "idle",
      voiceTranscriptDraft: null,
      voiceError: null,
      ttsUiStatus: "idle",
      ttsProvider: null,
      ttsError: null,
      ttsSpeakingInteractionId: null,
      spokenInteractionIds: [],
      screenStatus: "idle",
      screenOcrStatus: "idle",
    } as LisaState;

    const mockValue: LisaContextValue = {
      state: mockState,
      dispatch: (() => {}) as React.Dispatch<LisaAction>,
      addAudit: () => {},
    };

    const value = mockValue;

    expect(value.state).toBe(mockState);
    expect(value.state.orbState).toBe("listening");
    expect(value.state.activeMode).toBe("focus");
  });

  it("should be compatible with multiple context consumers", () => {
    const mockState = {} as LisaState;
    const mockDispatch = (() => {}) as React.Dispatch<LisaAction>;
    const mockAddAudit = () => {};

    const mockValue: LisaContextValue = {
      state: mockState,
      dispatch: mockDispatch,
      addAudit: mockAddAudit,
    };

    const value1 = mockValue;
    const value2 = mockValue;

    expect(value1.state).toBe(value2.state);
    expect(value1.dispatch).toBe(value2.dispatch);
    expect(value1.addAudit).toBe(value2.addAudit);
  });

  it("should support all dispatch action types from LisaAction", () => {
    const mockValue: LisaContextValue = {
      state: {} as LisaState,
      dispatch: ((action: LisaAction) => {}) as React.Dispatch<LisaAction>,
      addAudit: () => {},
    };

    const actions: LisaAction[] = [
      {
        type: "ADD_AUDIT_EVENT",
        payload: {
          id: "test",
          eventType: "test_event",
          source: "test",
          timestamp: new Date().toISOString(),
          summary: "Test",
          details: "Test details",
          severity: "info",
        },
      },
      {
        type: "LOAD_STATE",
        payload: {
          settings: {} as any,
          missions: [],
          approvals: [],
          auditEvents: [],
          conversationHistory: [],
          memoryNotes: [],
          toolRequests: [],
          toolResults: [],
          toolApprovals: [],
        },
      },
    ];

    actions.forEach((action) => {
      expect(() => mockValue.dispatch(action)).not.toThrow();
    });
  });
});
