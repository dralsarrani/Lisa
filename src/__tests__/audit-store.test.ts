import { describe, it, expect } from "vitest";
import { createAuditEvent, severityForIntent } from "../core/audit-store";

describe("createAuditEvent", () => {
  it("returns event with all required fields", () => {
    const event = createAuditEvent({
      eventType: "app_started",
      source: "test",
      summary: "test summary",
    });
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBeTruthy();
    expect(event.eventType).toBe("app_started");
    expect(event.source).toBe("test");
    expect(event.summary).toBe("test summary");
    expect(event.severity).toBe("info");
    expect(event.details).toBeUndefined();
    expect(event.missionId).toBeUndefined();
  });

  it("defaults severity to info when not provided", () => {
    const event = createAuditEvent({ eventType: "command_received", source: "x", summary: "x" });
    expect(event.severity).toBe("info");
  });

  it("uses provided severity", () => {
    const event = createAuditEvent({
      eventType: "emergency_stop_activated",
      source: "test",
      summary: "emergency",
      severity: "critical",
    });
    expect(event.severity).toBe("critical");
  });

  it("passes through optional details and missionId", () => {
    const event = createAuditEvent({
      eventType: "mission_created",
      source: "test",
      summary: "created",
      details: "extra info",
      missionId: "m-123",
    });
    expect(event.details).toBe("extra info");
    expect(event.missionId).toBe("m-123");
  });

  it("generates unique IDs across calls", () => {
    const ids = new Set(
      Array.from({ length: 10 }, () =>
        createAuditEvent({ eventType: "app_started", source: "x", summary: "x" }).id
      )
    );
    expect(ids.size).toBe(10);
  });

  it("timestamp is a valid ISO string", () => {
    const event = createAuditEvent({ eventType: "app_started", source: "x", summary: "x" });
    expect(() => new Date(event.timestamp)).not.toThrow();
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
  });
});

describe("severityForIntent", () => {
  it("returns critical for emergency_stop", () => {
    expect(severityForIntent("emergency_stop")).toBe("critical");
  });

  it("returns error for error_occurred", () => {
    expect(severityForIntent("error_occurred")).toBe("error");
  });

  it("returns warning for command_unknown", () => {
    expect(severityForIntent("command_unknown")).toBe("warning");
  });

  it("returns info for all other intents", () => {
    expect(severityForIntent("wake")).toBe("info");
    expect(severityForIntent("mode_change")).toBe("info");
    expect(severityForIntent("runtime_health")).toBe("info");
    expect(severityForIntent("create_test_mission")).toBe("info");
    expect(severityForIntent("unknown")).toBe("info");
  });
});
