import { describe, it, expect, vi, beforeEach } from "vitest";
import { isTauriEnv, fetchRuntimeHealth } from "../core/runtime-health";
import type { RuntimeHealth, ServiceStatus } from "../core/types";

describe("isTauriEnv", () => {
  let originalWindow: any;

  beforeEach(() => {
    originalWindow = global.window;
  });

  it("returns false when window is undefined", () => {
    // @ts-ignore
    delete global.window;
    expect(isTauriEnv()).toBe(false);
    global.window = originalWindow;
  });

  it("returns false when __TAURI_INTERNALS__ is not present", () => {
    // @ts-ignore
    global.window = {};
    expect(isTauriEnv()).toBe(false);
  });

  it("returns true when __TAURI_INTERNALS__ is present", () => {
    // @ts-ignore
    global.window = { __TAURI_INTERNALS__: {} };
    expect(isTauriEnv()).toBe(true);
  });

  it("returns true when __TAURI_INTERNALS__ has a value", () => {
    // @ts-ignore
    global.window = { __TAURI_INTERNALS__: "some_value" };
    expect(isTauriEnv()).toBe(true);
  });
});

describe("fetchRuntimeHealth", () => {
  let originalWindow: any;
  let mockInvoke: any;

  beforeEach(() => {
    originalWindow = global.window;
    mockInvoke = vi.fn();
  });

  describe("when in Tauri environment", () => {
    beforeEach(() => {
      // @ts-ignore
      global.window = { __TAURI_INTERNALS__: {} };

      // Mock the Tauri import
      vi.doMock("@tauri-apps/api/core", () => ({
        invoke: mockInvoke,
      }));
    });

    it("returns runtime health with backend reachable", async () => {
      mockInvoke.mockResolvedValueOnce({
        backend_reachable: true,
        app_version: "0.2.0",
        os_type: "linux",
        os_version: "5.15.0",
        arch: "x86_64",
        timestamp: "2024-01-01T12:00:00Z",
        ollama_status: "available",
        docker_status: "available",
      });

      const health = await fetchRuntimeHealth();

      expect(health).toHaveProperty("backendReachable", true);
      expect(health).toHaveProperty("appVersion", "0.2.0");
      expect(health).toHaveProperty("osType", "linux");
      expect(health).toHaveProperty("osVersion", "5.15.0");
      expect(health).toHaveProperty("arch", "x86_64");
      expect(health).toHaveProperty("ollamaStatus", "available");
      expect(health).toHaveProperty("dockerStatus", "available");
    });

    it("camelCases the response keys from Tauri backend", async () => {
      mockInvoke.mockResolvedValueOnce({
        backend_reachable: true,
        app_version: "0.2.0",
        os_type: "windows",
        os_version: "10.0.19045",
        arch: "x86_64",
        timestamp: "2024-01-01T12:00:00Z",
        ollama_status: "unavailable",
        docker_status: "error",
      });

      const health = await fetchRuntimeHealth();

      // Check camelCase conversion
      expect(health).toHaveProperty("backendReachable");
      expect(health).toHaveProperty("appVersion");
      expect(health).toHaveProperty("osType");
      expect(health).toHaveProperty("osVersion");
      expect(health).toHaveProperty("ollamaStatus");
      expect(health).toHaveProperty("dockerStatus");
    });

    it("includes lastChecked timestamp", async () => {
      mockInvoke.mockResolvedValueOnce({
        backend_reachable: true,
        app_version: "0.2.0",
        os_type: "macos",
        os_version: "12.0",
        arch: "arm64",
        timestamp: "2024-01-01T12:00:00Z",
        ollama_status: "available",
        docker_status: "available",
      });

      const health = await fetchRuntimeHealth();

      expect(health).toHaveProperty("lastChecked");
      expect(typeof health.lastChecked).toBe("string");
    });

    it("handles different service statuses", async () => {
      const testCases: ServiceStatus[] = [
        "available",
        "not_configured",
        "unavailable",
        "checking",
        "error",
      ];

      for (const status of testCases) {
        mockInvoke.mockResolvedValueOnce({
          backend_reachable: true,
          app_version: "0.2.0",
          os_type: "linux",
          os_version: "5.15.0",
          arch: "x86_64",
          timestamp: "2024-01-01T12:00:00Z",
          ollama_status: status,
          docker_status: status,
        });

        const health = await fetchRuntimeHealth();
        expect(health.ollamaStatus).toBe(status);
        expect(health.dockerStatus).toBe(status);
      }
    });
  });

  describe("when NOT in Tauri environment (browser fallback)", () => {
    beforeEach(() => {
      // @ts-ignore
      global.window = {};
    });

    it("returns fallback runtime health", async () => {
      const health = await fetchRuntimeHealth();

      expect(health).toHaveProperty("backendReachable", false);
      expect(health).toHaveProperty("appVersion", "0.1.0-dev");
      expect(health).toHaveProperty("ollamaStatus", "not_configured");
      expect(health).toHaveProperty("dockerStatus", "not_configured");
    });

    it("includes lastChecked timestamp in fallback", async () => {
      const health = await fetchRuntimeHealth();

      expect(health).toHaveProperty("lastChecked");
      expect(typeof health.lastChecked).toBe("string");
    });

    it("uses navigator.platform for osType", async () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(navigator),
        "platform"
      );

      Object.defineProperty(Object.getPrototypeOf(navigator), "platform", {
        value: "Linux x86_64",
        configurable: true,
      });

      const health = await fetchRuntimeHealth();
      expect(health.osType).toBe("Linux x86_64");

      Object.defineProperty(Object.getPrototypeOf(navigator), "platform", {
        value: originalPlatform?.value,
        configurable: true,
      });
    });

    it("uses navigator.userAgent for osVersion (truncated to 80 chars)", async () => {
      const health = await fetchRuntimeHealth();

      expect(health.osVersion).toBeTruthy();
      expect(health.osVersion.length).toBeLessThanOrEqual(80);
    });

    it("sets arch to unknown in fallback", async () => {
      const health = await fetchRuntimeHealth();
      expect(health.arch).toBe("unknown");
    });

    it("has correct runtime health shape in fallback", async () => {
      const health = await fetchRuntimeHealth();

      expect(health).toHaveProperty("backendReachable");
      expect(health).toHaveProperty("appVersion");
      expect(health).toHaveProperty("osType");
      expect(health).toHaveProperty("osVersion");
      expect(health).toHaveProperty("arch");
      expect(health).toHaveProperty("timestamp");
      expect(health).toHaveProperty("ollamaStatus");
      expect(health).toHaveProperty("dockerStatus");
      expect(health).toHaveProperty("lastChecked");
    });
  });

  describe("runtime health structure validation", () => {
    beforeEach(() => {
      // @ts-ignore
      global.window = {};
    });

    it("timestamp is a valid ISO string", async () => {
      const health = await fetchRuntimeHealth();
      const parsedDate = new Date(health.timestamp);
      expect(parsedDate).toBeInstanceOf(Date);
      expect(parsedDate.getTime()).not.toBeNaN();
    });

    it("lastChecked is a valid ISO string", async () => {
      const health = await fetchRuntimeHealth();
      const parsedDate = new Date(health.lastChecked || "");
      expect(parsedDate).toBeInstanceOf(Date);
      expect(parsedDate.getTime()).not.toBeNaN();
    });

    it("all required fields are present", async () => {
      const health = await fetchRuntimeHealth();
      const requiredFields: (keyof RuntimeHealth)[] = [
        "backendReachable",
        "appVersion",
        "osType",
        "osVersion",
        "arch",
        "timestamp",
        "ollamaStatus",
        "dockerStatus",
      ];

      for (const field of requiredFields) {
        expect(health).toHaveProperty(field);
        expect(health[field]).toBeDefined();
      }
    });
  });
});
