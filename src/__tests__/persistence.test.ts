import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState } from "../core/persistence";
import { createAuditEvent } from "../core/audit-store";
import { DEFAULT_SETTINGS, STATE_VERSION } from "../core/types";

beforeEach(() => {
  localStorage.clear();
});

describe("loadState — empty storage", () => {
  it("returns default state when nothing is stored", async () => {
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.settings).toMatchObject(DEFAULT_SETTINGS);
    expect(state.missions).toEqual([]);
    expect(state.approvals).toEqual([]);
    expect(state.auditEvents).toEqual([]);
  });

  it("savedAt is a valid ISO timestamp", async () => {
    const state = await loadState();
    expect(() => new Date(state.savedAt)).not.toThrow();
    expect(new Date(state.savedAt).toISOString()).toBe(state.savedAt);
  });
});

describe("loadState — invalid JSON", () => {
  it("returns default state when stored JSON is malformed", async () => {
    localStorage.setItem("lisa_state_v1", "not-json{{{");
    const state = await loadState();
    expect(state.missions).toEqual([]);
    expect(state.settings).toMatchObject(DEFAULT_SETTINGS);
  });
});

describe("loadState — migration", () => {
  it("migrates old state (version 0) and preserves partial settings", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({ version: 0, settings: { activeMode: "focus" } })
    );
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.settings.activeMode).toBe("focus");
    expect(state.missions).toEqual([]);
  });
});

describe("saveState + loadState round-trip", () => {
  it("persists and reloads settings", async () => {
    await saveState({
      settings: { ...DEFAULT_SETTINGS, activeMode: "focus", developerMode: true },
      missions: [],
      approvals: [],
      auditEvents: [],
    });
    const loaded = await loadState();
    expect(loaded.settings.activeMode).toBe("focus");
    expect(loaded.settings.developerMode).toBe(true);
  });

  it("persists and reloads empty arrays", async () => {
    await saveState({
      settings: DEFAULT_SETTINGS,
      missions: [],
      approvals: [],
      auditEvents: [],
    });
    const loaded = await loadState();
    expect(loaded.missions).toEqual([]);
    expect(loaded.approvals).toEqual([]);
    expect(loaded.auditEvents).toEqual([]);
  });

  it("caps auditEvents at 500 on save", async () => {
    const events = Array.from({ length: 600 }, (_, i) =>
      createAuditEvent({ eventType: "app_started", source: "test", summary: `event ${i}` })
    );
    await saveState({ settings: DEFAULT_SETTINGS, missions: [], approvals: [], auditEvents: events });
    const loaded = await loadState();
    expect(loaded.auditEvents.length).toBe(500);
  });

  it("caps auditEvents at 500 on load when bypassing saveState", async () => {
    const events = Array.from({ length: 600 }, (_, i) =>
      createAuditEvent({ eventType: "app_started", source: "test", summary: `event ${i}` })
    );
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: DEFAULT_SETTINGS,
        missions: [],
        approvals: [],
        auditEvents: events,
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.auditEvents.length).toBe(500);
  });

  it("merges saved settings with defaults for forward-compat (partial settings object)", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: STATE_VERSION,
        settings: { activeMode: "cyber" },
        missions: [],
        approvals: [],
        auditEvents: [],
        savedAt: new Date().toISOString(),
      })
    );
    const loaded = await loadState();
    expect(loaded.settings.activeMode).toBe("cyber");
    expect(loaded.settings.orbSize).toBe(DEFAULT_SETTINGS.orbSize);
  });
});

describe("loadState — v1 to v2 migration", () => {
  it("adds Phase 1A settings with defaults when migrating from STATE_VERSION 1", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 1,
        settings: { activeMode: "focus", developerMode: true },
        missions: [],
        approvals: [],
        auditEvents: [],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.version).toBe(STATE_VERSION);
    expect(state.settings.activeMode).toBe("focus");
    expect(state.settings.developerMode).toBe(true);
    expect(state.settings.enableLocalAi).toBe(false);
    expect(state.settings.ollamaModel).toBe("");
    expect(state.settings.maxContextTurns).toBe(20);
  });

  it("preserves missions and audit events across migration", async () => {
    localStorage.setItem(
      "lisa_state_v1",
      JSON.stringify({
        version: 1,
        settings: {},
        missions: [{ id: "m1", title: "Old mission" }],
        approvals: [],
        auditEvents: [{ id: "e1", summary: "old event" }],
        savedAt: new Date().toISOString(),
      })
    );
    const state = await loadState();
    expect(state.missions).toHaveLength(1);
    expect(state.auditEvents).toHaveLength(1);
  });
});
