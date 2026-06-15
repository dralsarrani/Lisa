import { describe, it, expect, vi, beforeEach } from "vitest";
import * as persistenceModule from "../core/persistence";
import * as auditStoreModule from "../core/audit-store";
import type { PersistedState } from "../core/types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../core/persistence");
vi.mock("../core/audit-store");

const mockLoadState = vi.mocked(persistenceModule.loadState);
const mockSaveState = vi.mocked(persistenceModule.saveState);
const mockCreateAuditEvent = vi.mocked(auditStoreModule.createAuditEvent);

// ─── Setup ────────────────────────────────────────────────────────────────────

const mockDefaultPersistedState: PersistedState = {
  version: 9,
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
  conversationHistory: [],
  memoryNotes: [],
  toolRequests: [],
  toolResults: [],
  toolApprovals: [],
  savedAt: new Date().toISOString(),
};

const mockAuditEvent = {
  id: "audit-1",
  eventType: "app_started" as const,
  source: "system",
  timestamp: new Date().toISOString(),
  summary: "App started",
  details: "Initial startup",
  severity: "info" as const,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LisaProvider (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadState.mockResolvedValue(mockDefaultPersistedState);
    mockSaveState.mockResolvedValue(undefined);
    mockCreateAuditEvent.mockReturnValue(mockAuditEvent);
  });

  it("should mock loadState properly", async () => {
    const result = await mockLoadState();
    expect(result).toEqual(mockDefaultPersistedState);
    expect(mockLoadState).toHaveBeenCalledTimes(1);
  });

  it("should mock saveState properly", async () => {
    await mockSaveState({
      settings: mockDefaultPersistedState.settings,
      missions: [],
      approvals: [],
      auditEvents: [],
      conversationHistory: [],
      memoryNotes: [],
      toolRequests: [],
      toolResults: [],
      toolApprovals: [],
    });

    expect(mockSaveState).toHaveBeenCalledTimes(1);
    expect(mockSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: mockDefaultPersistedState.settings,
      })
    );
  });

  it("should mock createAuditEvent properly", () => {
    const params = {
      eventType: "app_started" as const,
      source: "system",
      summary: "Test",
      details: "Testing",
      severity: "info" as const,
    };

    const result = mockCreateAuditEvent(params);
    expect(result).toEqual(mockAuditEvent);
    expect(mockCreateAuditEvent).toHaveBeenCalledWith(params);
  });

  it("should handle multiple audit event params", () => {
    mockCreateAuditEvent.mockImplementation((params) => ({
      id: `audit-${Math.random()}`,
      ...params,
      timestamp: new Date().toISOString(),
    }));

    const param1 = {
      eventType: "test_event" as const,
      source: "test",
      summary: "Test 1",
      details: "Testing 1",
      severity: "info" as const,
    };

    const param2 = {
      eventType: "test_event" as const,
      source: "test",
      summary: "Test 2",
      details: "Testing 2",
      severity: "warning" as const,
    };

    const result1 = mockCreateAuditEvent(param1);
    const result2 = mockCreateAuditEvent(param2);

    expect(result1.summary).toBe("Test 1");
    expect(result2.summary).toBe("Test 2");
    expect(mockCreateAuditEvent).toHaveBeenCalledTimes(2);
  });

  it("should handle loadState with custom persisted state", async () => {
    const customPersistedState: PersistedState = {
      ...mockDefaultPersistedState,
      missions: [
        {
          id: "mission-1",
          title: "Test Mission",
          description: "A test mission",
          steps: [],
          status: "running",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    mockLoadState.mockResolvedValue(customPersistedState);

    const result = await mockLoadState();
    expect(result.missions).toHaveLength(1);
    expect(result.missions[0].title).toBe("Test Mission");
  });

  it("should handle loadState rejection", async () => {
    mockLoadState.mockRejectedValue(new Error("Load failed"));

    try {
      await mockLoadState();
      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe("Load failed");
    }
  });

  it("should handle saveState rejection", async () => {
    mockSaveState.mockRejectedValue(new Error("Save failed"));

    try {
      await mockSaveState({
        settings: mockDefaultPersistedState.settings,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [],
        toolResults: [],
        toolApprovals: [],
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe("Save failed");
    }
  });

  it("should verify mocks were called with correct arguments", async () => {
    await mockLoadState();

    const auditParams = {
      eventType: "app_started" as const,
      source: "system",
      summary: "Lisa started. Persistent state loaded.",
      severity: "info" as const,
      details: "Mode: normal | Version: Phase 0",
    };

    mockCreateAuditEvent(auditParams);

    expect(mockCreateAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "app_started",
        source: "system",
        severity: "info",
      })
    );
  });

  it("should handle state with multiple missions and approvals", async () => {
    const richPersistedState: PersistedState = {
      ...mockDefaultPersistedState,
      missions: [
        {
          id: "mission-1",
          title: "Mission 1",
          description: "Test 1",
          steps: [],
          status: "running",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "mission-2",
          title: "Mission 2",
          description: "Test 2",
          steps: [],
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      approvals: [
        {
          id: "approval-1",
          requestSummary: "Approval 1",
          requestDetails: "Details 1",
          actionType: "use_tool",
          requestedBy: "system",
          status: "pending",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      ],
    };

    mockLoadState.mockResolvedValue(richPersistedState);

    const result = await mockLoadState();
    expect(result.missions).toHaveLength(2);
    expect(result.approvals).toHaveLength(1);
  });

  it("should verify saveState receives all state fields", async () => {
    const testState = {
      settings: mockDefaultPersistedState.settings,
      missions: [
        {
          id: "m1",
          title: "Test",
          description: "Test mission",
          steps: [],
          status: "running",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      approvals: [],
      auditEvents: [mockAuditEvent],
      conversationHistory: [],
      memoryNotes: [],
      toolRequests: [],
      toolResults: [],
      toolApprovals: [],
    };

    await mockSaveState(testState);

    expect(mockSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.any(Object),
        missions: expect.any(Array),
        approvals: expect.any(Array),
        auditEvents: expect.any(Array),
        conversationHistory: expect.any(Array),
        memoryNotes: expect.any(Array),
        toolRequests: expect.any(Array),
        toolResults: expect.any(Array),
        toolApprovals: expect.any(Array),
      })
    );
  });

  it("should support multiple audit events with different types", () => {
    mockCreateAuditEvent.mockImplementation((params) => ({
      id: `audit-${Date.now()}`,
      ...params,
      timestamp: new Date().toISOString(),
    }));

    const events = [
      { eventType: "app_started" as const, severity: "info" as const },
      { eventType: "test_event" as const, severity: "warning" as const },
      { eventType: "command_executed" as const, severity: "info" as const },
    ];

    events.forEach((evt) => {
      mockCreateAuditEvent({
        ...evt,
        source: "test",
        summary: "Test",
        details: "Test details",
      });
    });

    expect(mockCreateAuditEvent).toHaveBeenCalledTimes(3);
  });
});
