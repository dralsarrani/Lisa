import { describe, it, expect } from "vitest";
import { routeCommand } from "../core/command-router";

describe("routeCommand — emergency_stop", () => {
  it("routes 'emergency stop'", () => {
    expect(routeCommand("emergency stop").intent).toBe("emergency_stop");
  });
  it("routes 'emergency stop now'", () => {
    expect(routeCommand("emergency stop now").intent).toBe("emergency_stop");
  });
  it("routes 'abort'", () => {
    expect(routeCommand("abort").intent).toBe("emergency_stop");
  });
  it("routes 'stop everything'", () => {
    expect(routeCommand("stop everything").intent).toBe("emergency_stop");
  });
  it("routes 'Lisa, emergency stop'", () => {
    expect(routeCommand("Lisa, emergency stop").intent).toBe("emergency_stop");
  });
  it("has high confidence", () => {
    expect(routeCommand("emergency stop").confidence).toBe("high");
  });
});

describe("routeCommand — stop", () => {
  it("routes 'stop'", () => {
    expect(routeCommand("stop").intent).toBe("stop");
  });
  it("routes 'halt'", () => {
    expect(routeCommand("halt").intent).toBe("stop");
  });
  it("routes 'freeze'", () => {
    expect(routeCommand("freeze").intent).toBe("stop");
  });
});

describe("routeCommand — sleep", () => {
  it("routes 'sleep'", () => {
    expect(routeCommand("sleep").intent).toBe("sleep");
  });
  it("routes 'go to sleep'", () => {
    expect(routeCommand("go to sleep").intent).toBe("sleep");
  });
  it("routes 'quiet mode'", () => {
    expect(routeCommand("quiet mode").intent).toBe("sleep");
  });
  it("routes 'Lisa, sleep'", () => {
    expect(routeCommand("Lisa, sleep").intent).toBe("sleep");
  });
});

describe("routeCommand — wake", () => {
  it("routes 'wake up'", () => {
    expect(routeCommand("wake up").intent).toBe("wake");
  });
  it("routes 'wake'", () => {
    expect(routeCommand("wake").intent).toBe("wake");
  });
  it("routes 'resume'", () => {
    expect(routeCommand("resume").intent).toBe("wake");
  });
  it("routes 'hello lisa'", () => {
    expect(routeCommand("hello lisa").intent).toBe("wake");
  });
  it("routes 'Lisa, wake up'", () => {
    expect(routeCommand("Lisa, wake up").intent).toBe("wake");
  });
});

describe("routeCommand — runtime_health", () => {
  it("routes 'status'", () => {
    expect(routeCommand("status").intent).toBe("runtime_health");
  });
  it("routes 'check health'", () => {
    expect(routeCommand("check health").intent).toBe("runtime_health");
  });
  it("routes 'runtime status'", () => {
    expect(routeCommand("runtime status").intent).toBe("runtime_health");
  });
  it("routes 'system status'", () => {
    expect(routeCommand("system status").intent).toBe("runtime_health");
  });
  it("routes 'Lisa, status'", () => {
    expect(routeCommand("Lisa, status").intent).toBe("runtime_health");
  });
});

describe("routeCommand — create_test_mission", () => {
  it("routes 'create test mission'", () => {
    expect(routeCommand("create test mission").intent).toBe("create_test_mission");
  });
  it("routes 'test mission'", () => {
    expect(routeCommand("test mission").intent).toBe("create_test_mission");
  });
  it("routes 'Lisa, test mission'", () => {
    expect(routeCommand("Lisa, test mission").intent).toBe("create_test_mission");
  });
});

describe("routeCommand — approve_test_action", () => {
  it("routes 'approve'", () => {
    expect(routeCommand("approve").intent).toBe("approve_test_action");
  });
  it("routes 'confirm'", () => {
    expect(routeCommand("confirm").intent).toBe("approve_test_action");
  });
  it("routes 'approve test action'", () => {
    expect(routeCommand("approve test action").intent).toBe("approve_test_action");
  });
});

describe("routeCommand — reject_test_action", () => {
  it("routes 'reject'", () => {
    expect(routeCommand("reject").intent).toBe("reject_test_action");
  });
  it("routes 'deny'", () => {
    expect(routeCommand("deny").intent).toBe("reject_test_action");
  });
  it("routes 'cancel'", () => {
    expect(routeCommand("cancel").intent).toBe("reject_test_action");
  });
});

describe("routeCommand — mode_change", () => {
  it("routes 'activate focus mode'", () => {
    const r = routeCommand("activate focus mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("focus");
  });
  it("routes 'switch to coding mode'", () => {
    const r = routeCommand("switch to coding mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("coding");
  });
  it("routes 'enable work mode'", () => {
    const r = routeCommand("enable work mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("work");
  });
  it("routes 'Lisa, activate normal mode'", () => {
    const r = routeCommand("Lisa, activate normal mode");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("normal");
  });
  it("routes bare mode name 'activate focus'", () => {
    const r = routeCommand("activate focus");
    expect(r.intent).toBe("mode_change");
    expect(r.payload?.modeId).toBe("focus");
  });
});

describe("routeCommand — unknown", () => {
  it("routes unrecognized command", () => {
    expect(routeCommand("do something weird").intent).toBe("unknown");
  });
  it("routes empty string", () => {
    expect(routeCommand("").intent).toBe("unknown");
  });
  it("has low confidence for unknown", () => {
    expect(routeCommand("something random").confidence).toBe("low");
  });
  it("unknown response includes the original input", () => {
    const r = routeCommand("foobar");
    expect(r.response).toContain("foobar");
  });
});

describe("routeCommand — Lisa prefix stripping", () => {
  it("strips 'LISA, ' prefix case-insensitively", () => {
    expect(routeCommand("LISA, WAKE UP").intent).toBe("wake");
  });
  it("strips 'Lisa ' prefix (no comma)", () => {
    expect(routeCommand("Lisa status").intent).toBe("runtime_health");
  });
  it("preserves raw and sets normalized without prefix", () => {
    const r = routeCommand("Lisa, wake up");
    expect(r.raw).toBe("Lisa, wake up");
    expect(r.normalized).toBe("wake up");
  });
});

describe("routeCommand — response field", () => {
  it("returns non-empty response for all known intents", () => {
    const commands = [
      "emergency stop",
      "stop",
      "sleep",
      "wake up",
      "status",
      "create test mission",
      "approve",
      "reject",
      "activate focus mode",
    ];
    for (const cmd of commands) {
      expect(routeCommand(cmd).response).toBeTruthy();
    }
  });
});
