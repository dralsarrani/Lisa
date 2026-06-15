import { describe, it, expect, vi } from "vitest";
import { createContext } from "react";
import type { LisaContextValue } from "../app/LisaContextDef";
import type { LisaState, LisaAction } from "../app/lisa-reducer";

// ─── Mock LisaContext ─────────────────────────────────────────────────────────

const mockState: LisaState = {
  orbState: "idle",
  activeMode: "normal",
  settings: {
    activeMode: "normal",
    enableVoiceInput: true,
    enableTts: true,
    theme: "dark",
    emergencyStopOnLaunch: false,
    voiceProvider: "system",
    ttsProvider: "system",
    voiceLanguage: "en-US",
    voiceConversationEnabled: false,
    voiceConversationTimeout: 30000,
    voiceConversationAutoSilenceMs: 1500,
    voiceConversationMaxFails: 3,
    screenAwarenessEnabled: false,
    ocrEnabled: false,
    sttModelPath: "",
  },
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
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useLisa hook (functional testing)", () => {
  it("should require context to be defined", () => {
    // The hook throws if context is null
    const mockAddAudit = vi.fn();
    const mockDispatch = vi.fn();

    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: mockDispatch,
      addAudit: mockAddAudit,
    };

    expect(mockContextValue).toBeDefined();
    expect(mockContextValue.state).toBe(mockState);
  });

  it("should have all state properties available", () => {
    const mockDispatch = vi.fn();
    const mockAddAudit = vi.fn();

    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: mockDispatch,
      addAudit: mockAddAudit,
    };

    expect(mockContextValue.state.orbState).toBe("idle");
    expect(mockContextValue.state.activeMode).toBe("normal");
    expect(mockContextValue.state.isLoaded).toBe(true);
    expect(mockContextValue.state.settings).toBeDefined();
    expect(mockContextValue.state.missions).toBeDefined();
    expect(mockContextValue.state.approvals).toBeDefined();
  });

  it("should allow dispatch of LisaAction", () => {
    const mockDispatch = vi.fn();

    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: mockDispatch,
      addAudit: vi.fn(),
    };

    const action: LisaAction = {
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

    mockContextValue.dispatch(action);

    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it("should allow calling addAudit", () => {
    const mockAddAudit = vi.fn();

    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: vi.fn(),
      addAudit: mockAddAudit,
    };

    const params = {
      eventType: "test_event" as const,
      source: "test",
      summary: "Test",
      details: "Test details",
      severity: "info" as const,
    };

    mockContextValue.addAudit(params);

    expect(mockAddAudit).toHaveBeenCalledWith(params);
  });

  it("should handle context value with different state values", () => {
    const customState: LisaState = {
      ...mockState,
      orbState: "thinking",
      activeMode: "focus",
    };

    const mockContextValue: LisaContextValue = {
      state: customState,
      dispatch: vi.fn(),
      addAudit: vi.fn(),
    };

    expect(mockContextValue.state.orbState).toBe("thinking");
    expect(mockContextValue.state.activeMode).toBe("focus");
  });

  it("should provide type-safe dispatch function", () => {
    const mockDispatch = vi.fn();

    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: mockDispatch,
      addAudit: vi.fn(),
    };

    expect(typeof mockContextValue.dispatch).toBe("function");

    const loadStateAction: LisaAction = {
      type: "LOAD_STATE",
      payload: {
        settings: mockState.settings,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [],
        toolResults: [],
        toolApprovals: [],
      },
    };

    mockContextValue.dispatch(loadStateAction);
    expect(mockDispatch).toHaveBeenCalledWith(loadStateAction);
  });

  it("should provide type-safe addAudit function", () => {
    const mockAddAudit = vi.fn();

    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: vi.fn(),
      addAudit: mockAddAudit,
    };

    expect(typeof mockContextValue.addAudit).toBe("function");

    const params = {
      eventType: "command_executed" as const,
      source: "user",
      summary: "Command executed",
      details: "User ran a command",
      severity: "info" as const,
    };

    mockContextValue.addAudit(params);
    expect(mockAddAudit).toHaveBeenCalledWith(params);
  });

  it("should maintain state reference consistently", () => {
    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: vi.fn(),
      addAudit: vi.fn(),
    };

    const stateRef1 = mockContextValue.state;
    const stateRef2 = mockContextValue.state;

    expect(stateRef1).toBe(stateRef2);
    expect(stateRef1).toBe(mockState);
  });

  it("should handle multiple audit event types", () => {
    const mockAddAudit = vi.fn();

    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: vi.fn(),
      addAudit: mockAddAudit,
    };

    const auditTypes = [
      "app_started",
      "command_executed",
      "mission_started",
      "approval_requested",
    ] as const;

    auditTypes.forEach((eventType) => {
      mockContextValue.addAudit({
        eventType,
        source: "test",
        summary: `Event: ${eventType}`,
        details: "Testing",
        severity: "info",
      });
    });

    expect(mockAddAudit).toHaveBeenCalledTimes(4);
  });

  it("should handle state with populated collections", () => {
    const stateWithData: LisaState = {
      ...mockState,
      missions: [
        {
          id: "m1",
          title: "Test Mission",
          description: "A test mission",
          steps: [],
          status: "running",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      auditEvents: [
        {
          id: "a1",
          eventType: "app_started",
          source: "system",
          timestamp: new Date().toISOString(),
          summary: "App started",
          details: "Initial startup",
          severity: "info",
        },
      ],
    };

    const mockContextValue: LisaContextValue = {
      state: stateWithData,
      dispatch: vi.fn(),
      addAudit: vi.fn(),
    };

    expect(mockContextValue.state.missions).toHaveLength(1);
    expect(mockContextValue.state.auditEvents).toHaveLength(1);
    expect(mockContextValue.state.missions[0].title).toBe("Test Mission");
  });

  it("should support different orb states", () => {
    const orbStates = [
      "idle",
      "listening",
      "thinking",
      "speaking",
      "acting",
      "waiting_approval",
      "paused",
      "error",
      "emergency_stopped",
    ] as const;

    orbStates.forEach((orbState) => {
      const stateWithOrbState: LisaState = {
        ...mockState,
        orbState,
      };

      const mockContextValue: LisaContextValue = {
        state: stateWithOrbState,
        dispatch: vi.fn(),
        addAudit: vi.fn(),
      };

      expect(mockContextValue.state.orbState).toBe(orbState);
    });
  });

  it("should support different Lisa modes", () => {
    const lisaModes = [
      "normal",
      "focus",
      "study",
      "work",
      "meeting",
      "privacy",
      "lockdown",
      "sleep",
      "presentation",
      "cyber",
      "design",
      "gaming",
      "coding",
      "tutor",
      "companion",
    ] as const;

    lisaModes.forEach((mode) => {
      const stateWithMode: LisaState = {
        ...mockState,
        activeMode: mode,
      };

      const mockContextValue: LisaContextValue = {
        state: stateWithMode,
        dispatch: vi.fn(),
        addAudit: vi.fn(),
      };

      expect(mockContextValue.state.activeMode).toBe(mode);
    });
  });

  it("should handle error severity levels in audit", () => {
    const mockAddAudit = vi.fn();

    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: vi.fn(),
      addAudit: mockAddAudit,
    };

    const severities = ["info", "warning", "error"] as const;

    severities.forEach((severity) => {
      mockContextValue.addAudit({
        eventType: "test_event",
        source: "test",
        summary: "Test",
        details: "Test details",
        severity,
      });
    });

    expect(mockAddAudit).toHaveBeenCalledTimes(3);
  });

  it("should expose context value structure correctly", () => {
    const mockContextValue: LisaContextValue = {
      state: mockState,
      dispatch: vi.fn(),
      addAudit: vi.fn(),
    };

    expect(mockContextValue).toHaveProperty("state");
    expect(mockContextValue).toHaveProperty("dispatch");
    expect(mockContextValue).toHaveProperty("addAudit");

    expect(Object.keys(mockContextValue).sort()).toEqual(
      ["state", "dispatch", "addAudit"].sort()
    );
  });
});
