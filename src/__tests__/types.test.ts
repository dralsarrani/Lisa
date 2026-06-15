import { describe, it, expect } from "vitest";
import type {
  OrbState,
  LisaModeId,
  LisaMode,
  MissionStatus,
  MissionStepStatus,
  MissionStep,
  Mission,
  ApprovalStatus,
  ApprovalActionType,
  ApprovalRequest,
  ToolRiskLevel,
  ToolCategory,
  ToolParameter,
  ToolDefinition,
  ToolRequestStatus,
  ToolSuggestion,
  ToolRequest,
  ToolResult,
  ToolApprovalContract,
  AuditSeverity,
  AuditEventType,
  AuditEvent,
  ServiceStatus,
  RuntimeHealth,
  LisaSettings,
  CommandIntent,
  CommandRouteResult,
  InteractionKind,
  InteractionStatus,
  LisaInteraction,
  VoiceStatus,
  SttEngineStatus,
  TtsUiStatus,
  ScreenStatus,
  ScreenOcrStatus,
  PersistedState,
} from "../core/types";
import { DEFAULT_SETTINGS, STATE_VERSION, INTERACTION_CAP } from "../core/types";

describe("Type definitions validation", () => {
  describe("OrbState", () => {
    it("should accept valid orb states", () => {
      const states: OrbState[] = [
        "idle",
        "listening",
        "thinking",
        "speaking",
        "acting",
        "waiting_approval",
        "paused",
        "error",
        "emergency_stopped",
      ];
      expect(states.length).toBe(9);
    });
  });

  describe("LisaModeId", () => {
    it("should have 15 valid mode IDs", () => {
      const modes: LisaModeId[] = [
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
      ];
      expect(modes.length).toBe(15);
    });
  });

  describe("LisaMode interface", () => {
    it("should have all required properties", () => {
      const mode: LisaMode = {
        id: "normal",
        name: "Normal Mode",
        description: "Standard operation",
        orbTheme: "blue",
        behaviorSummary: "Balanced mode",
      };

      expect(mode).toHaveProperty("id");
      expect(mode).toHaveProperty("name");
      expect(mode).toHaveProperty("description");
      expect(mode).toHaveProperty("orbTheme");
      expect(mode).toHaveProperty("behaviorSummary");
    });
  });

  describe("MissionStatus and MissionStepStatus", () => {
    it("should define all mission statuses", () => {
      const statuses: MissionStatus[] = [
        "idle",
        "planned",
        "running",
        "waiting_approval",
        "paused",
        "completed",
        "failed",
        "cancelled",
        "emergency_stopped",
      ];
      expect(statuses.length).toBe(9);
    });

    it("should define all mission step statuses", () => {
      const statuses: MissionStepStatus[] = [
        "pending",
        "running",
        "completed",
        "failed",
        "skipped",
      ];
      expect(statuses.length).toBe(5);
    });
  });

  describe("MissionStep interface", () => {
    it("should allow creating a valid mission step", () => {
      const step: MissionStep = {
        id: "step-1",
        label: "Step 1",
        description: "First step",
        status: "pending",
      };

      expect(step).toHaveProperty("id");
      expect(step).toHaveProperty("label");
      expect(step).toHaveProperty("description");
      expect(step).toHaveProperty("status");
    });

    it("should allow optional timestamp and notes fields", () => {
      const step: MissionStep = {
        id: "step-1",
        label: "Step 1",
        description: "First step",
        status: "completed",
        startedAt: "2024-01-01T12:00:00Z",
        completedAt: "2024-01-01T12:30:00Z",
        notes: "Step completed successfully",
      };

      expect(step.startedAt).toBeDefined();
      expect(step.completedAt).toBeDefined();
      expect(step.notes).toBeDefined();
    });
  });

  describe("Mission interface", () => {
    it("should allow creating a valid mission", () => {
      const mission: Mission = {
        id: "mission-1",
        title: "Test Mission",
        description: "A test mission",
        status: "idle",
        steps: [],
        createdAt: "2024-01-01T12:00:00Z",
        source: "user_command",
      };

      expect(mission).toHaveProperty("id");
      expect(mission).toHaveProperty("title");
      expect(mission).toHaveProperty("description");
      expect(mission).toHaveProperty("status");
      expect(mission).toHaveProperty("steps");
      expect(mission).toHaveProperty("createdAt");
      expect(mission).toHaveProperty("source");
    });

    it("should allow optional fields like mode and approvalId", () => {
      const mission: Mission = {
        id: "mission-1",
        title: "Test Mission",
        description: "A test mission",
        status: "idle",
        steps: [],
        createdAt: "2024-01-01T12:00:00Z",
        source: "user_command",
        mode: "focus",
        approvalId: "approval-1",
        startedAt: "2024-01-01T12:00:00Z",
      };

      expect(mission.mode).toBe("focus");
      expect(mission.approvalId).toBe("approval-1");
      expect(mission.startedAt).toBeDefined();
    });
  });

  describe("ApprovalRequest interface", () => {
    it("should allow creating a valid approval request", () => {
      const approval: ApprovalRequest = {
        id: "approval-1",
        title: "Test Approval",
        description: "A test approval",
        actionType: "test_action",
        status: "pending",
        createdAt: "2024-01-01T12:00:00Z",
      };

      expect(approval).toHaveProperty("id");
      expect(approval).toHaveProperty("title");
      expect(approval).toHaveProperty("description");
      expect(approval).toHaveProperty("actionType");
      expect(approval).toHaveProperty("status");
      expect(approval).toHaveProperty("createdAt");
    });

    it("should have all approval action types", () => {
      const types: ApprovalActionType[] = [
        "mission_start",
        "file_operation",
        "system_change",
        "network_action",
        "communication",
        "skill_install",
        "credential_use",
        "test_action",
      ];
      expect(types.length).toBe(8);
    });
  });

  describe("Tool-related interfaces", () => {
    it("should define risk levels", () => {
      const levels: ToolRiskLevel[] = [
        "safe",
        "low",
        "medium",
        "high",
        "critical",
      ];
      expect(levels.length).toBe(5);
    });

    it("should define tool categories", () => {
      const categories: ToolCategory[] = [
        "diagnostic",
        "information",
        "file",
        "system",
        "network",
        "automation",
      ];
      expect(categories.length).toBe(6);
    });

    it("should allow creating a tool parameter", () => {
      const param: ToolParameter = {
        name: "param1",
        type: "string",
        description: "A parameter",
        required: true,
      };

      expect(param).toHaveProperty("name");
      expect(param).toHaveProperty("type");
      expect(param).toHaveProperty("description");
      expect(param).toHaveProperty("required");
    });

    it("should allow creating a tool definition", () => {
      const tool: ToolDefinition = {
        id: "tool-1",
        displayName: "Test Tool",
        description: "A test tool",
        category: "diagnostic",
        riskLevel: "safe",
        requiresApproval: false,
        parameters: [],
        consequences: "None",
        enabled: true,
        contextPolicy: "inject",
      };

      expect(tool).toHaveProperty("id");
      expect(tool).toHaveProperty("displayName");
      expect(tool).toHaveProperty("contextPolicy");
    });

    it("should define tool request statuses", () => {
      const statuses: ToolRequestStatus[] = [
        "pending_approval",
        "approved",
        "rejected",
        "running",
        "succeeded",
        "failed",
        "cancelled",
        "expired",
      ];
      expect(statuses.length).toBe(8);
    });
  });

  describe("AuditEvent interface", () => {
    it("should have valid severity levels", () => {
      const severities: AuditSeverity[] = [
        "info",
        "warning",
        "error",
        "critical",
      ];
      expect(severities.length).toBe(4);
    });

    it("should allow creating an audit event", () => {
      const event: AuditEvent = {
        id: "event-1",
        timestamp: "2024-01-01T12:00:00Z",
        eventType: "app_started",
        source: "system",
        summary: "App started",
        severity: "info",
      };

      expect(event).toHaveProperty("id");
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("eventType");
      expect(event).toHaveProperty("source");
      expect(event).toHaveProperty("summary");
      expect(event).toHaveProperty("severity");
    });
  });

  describe("RuntimeHealth interface", () => {
    it("should have valid service statuses", () => {
      const statuses: ServiceStatus[] = [
        "available",
        "not_configured",
        "unavailable",
        "checking",
        "error",
      ];
      expect(statuses.length).toBe(5);
    });

    it("should allow creating runtime health", () => {
      const health: RuntimeHealth = {
        backendReachable: true,
        appVersion: "0.1.0",
        osType: "linux",
        osVersion: "5.15.0",
        arch: "x86_64",
        timestamp: "2024-01-01T12:00:00Z",
        ollamaStatus: "available",
        dockerStatus: "available",
      };

      expect(health).toHaveProperty("backendReachable");
      expect(health).toHaveProperty("appVersion");
    });
  });

  describe("CommandIntent", () => {
    it("should have all expected intents", () => {
      const intents: CommandIntent[] = [
        "emergency_stop",
        "stop",
        "sleep",
        "wake",
        "mode_change",
        "runtime_health",
        "create_test_mission",
        "approve_test_action",
        "reject_test_action",
        "add_memory_note",
        "list_memory_notes",
        "delete_memory_note",
        "request_clear_memory_notes",
        "confirm_clear_memory_notes",
        "request_tool",
        "approve_tool_request",
        "reject_tool_request",
        "tts_test_voice",
        "tts_stop_speaking",
        "tts_enable",
        "tts_disable",
        "tts_auto_speak_on",
        "tts_auto_speak_off",
        "tts_speak_again",
        "voice_conversation_enable",
        "voice_conversation_disable",
        "capture_screen",
        "clear_screen_context",
        "screen_awareness_enable",
        "screen_awareness_disable",
        "screen_what_can_you_see",
        "run_screen_ocr",
        "screen_what_can_you_read",
        "clear_screen_text",
        "check_ocr_status",
        "screen_explain",
        "screen_summarize",
        "screen_next_steps",
        "screen_find_errors",
        "screen_extract_action_items",
        "screen_page_about",
        "repeat_last_response",
        "unknown",
      ];

      expect(intents.length).toBeGreaterThan(40);
    });
  });

  describe("LisaInteraction interface", () => {
    it("should have valid interaction kinds", () => {
      const kinds: InteractionKind[] = [
        "command",
        "local_ai",
        "error",
        "system",
        "tool_request",
        "tool_result",
      ];
      expect(kinds.length).toBe(6);
    });

    it("should have valid interaction statuses", () => {
      const statuses: InteractionStatus[] = [
        "thinking",
        "streaming",
        "complete",
        "failed",
        "cancelled",
      ];
      expect(statuses.length).toBe(5);
    });

    it("should allow creating an interaction", () => {
      const interaction: LisaInteraction = {
        id: "interaction-1",
        kind: "command",
        prompt: "Hello Lisa",
        response: "Hello there",
        status: "complete",
        createdAt: "2024-01-01T12:00:00Z",
      };

      expect(interaction).toHaveProperty("id");
      expect(interaction).toHaveProperty("kind");
      expect(interaction).toHaveProperty("prompt");
      expect(interaction).toHaveProperty("response");
      expect(interaction).toHaveProperty("status");
      expect(interaction).toHaveProperty("createdAt");
    });
  });

  describe("Voice and screen-related statuses", () => {
    it("should have valid voice statuses", () => {
      const statuses: VoiceStatus[] = [
        "idle",
        "recording",
        "transcribing",
        "preview",
        "error",
        "no_transcript",
      ];
      expect(statuses.length).toBe(6);
    });

    it("should have valid TTS UI statuses", () => {
      const statuses: TtsUiStatus[] = [
        "idle",
        "checking",
        "available",
        "unavailable",
        "speaking",
        "error",
      ];
      expect(statuses.length).toBe(6);
    });

    it("should have valid screen statuses", () => {
      const statuses: ScreenStatus[] = [
        "idle",
        "capturing",
        "available",
        "error",
      ];
      expect(statuses.length).toBe(4);
    });

    it("should have valid screen OCR statuses", () => {
      const statuses: ScreenOcrStatus[] = [
        "idle",
        "running",
        "available",
        "error",
      ];
      expect(statuses.length).toBe(4);
    });
  });

  describe("DEFAULT_SETTINGS", () => {
    it("should have all required settings properties", () => {
      expect(DEFAULT_SETTINGS).toHaveProperty("activeMode");
      expect(DEFAULT_SETTINGS).toHaveProperty("orbSize");
      expect(DEFAULT_SETTINGS).toHaveProperty("soundEnabled");
      expect(DEFAULT_SETTINGS).toHaveProperty("voiceEnabled");
      expect(DEFAULT_SETTINGS).toHaveProperty("persistAuditLog");
      expect(DEFAULT_SETTINGS).toHaveProperty("maxAuditEvents");
      expect(DEFAULT_SETTINGS).toHaveProperty("theme");
      expect(DEFAULT_SETTINGS).toHaveProperty("language");
      expect(DEFAULT_SETTINGS).toHaveProperty("developerMode");
      expect(DEFAULT_SETTINGS).toHaveProperty("enableLocalAi");
    });

    it("should have valid default values", () => {
      expect(DEFAULT_SETTINGS.activeMode).toBe("normal");
      expect(DEFAULT_SETTINGS.orbSize).toBe("medium");
      expect(DEFAULT_SETTINGS.soundEnabled).toBe(false);
      expect(DEFAULT_SETTINGS.voiceEnabled).toBe(false);
      expect(DEFAULT_SETTINGS.persistAuditLog).toBe(true);
      expect(DEFAULT_SETTINGS.maxAuditEvents).toBe(500);
      expect(DEFAULT_SETTINGS.theme).toBe("darker");
      expect(DEFAULT_SETTINGS.language).toBe("en");
      expect(DEFAULT_SETTINGS.developerMode).toBe(false);
    });

    it("should have voice output settings disabled by default", () => {
      expect(DEFAULT_SETTINGS.voiceOutputEnabled).toBe(false);
      expect(DEFAULT_SETTINGS.voiceOutputAutoSpeak).toBe(false);
      expect(DEFAULT_SETTINGS.voiceOutputSuppressInPrivacyModes).toBe(true);
    });

    it("should have screen awareness disabled by default", () => {
      expect(DEFAULT_SETTINGS.screenAwarenessEnabled).toBe(false);
      expect(DEFAULT_SETTINGS.screenContextEnabledForPrompt).toBe(false);
      expect(DEFAULT_SETTINGS.screenSuppressInPrivacyModes).toBe(true);
    });

    it("should have OCR disabled by default", () => {
      expect(DEFAULT_SETTINGS.screenOcrEnabled).toBe(false);
      expect(DEFAULT_SETTINGS.screenTextEnabledForPrompt).toBe(false);
      expect(DEFAULT_SETTINGS.screenOcrSuppressInPrivacyModes).toBe(true);
    });
  });

  describe("Constants", () => {
    it("STATE_VERSION should be a positive number", () => {
      expect(typeof STATE_VERSION).toBe("number");
      expect(STATE_VERSION).toBeGreaterThan(0);
    });

    it("INTERACTION_CAP should be a positive number", () => {
      expect(typeof INTERACTION_CAP).toBe("number");
      expect(INTERACTION_CAP).toBeGreaterThan(0);
    });
  });

  describe("PersistedState interface", () => {
    it("should allow creating persisted state", () => {
      const state: PersistedState = {
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: [],
        conversationHistory: [],
        memoryNotes: [],
        toolRequests: [],
        toolResults: [],
        toolApprovals: [],
        savedAt: "2024-01-01T12:00:00Z",
      };

      expect(state).toHaveProperty("version");
      expect(state).toHaveProperty("settings");
      expect(state).toHaveProperty("missions");
      expect(state).toHaveProperty("auditEvents");
      expect(state).toHaveProperty("savedAt");
    });
  });
});
