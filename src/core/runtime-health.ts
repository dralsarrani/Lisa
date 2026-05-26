import type { RuntimeHealth, ServiceStatus } from "./types";

// ─── Tauri environment detection ──────────────────────────────────────────────

export function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ─── Runtime health fetch ─────────────────────────────────────────────────────

export async function fetchRuntimeHealth(): Promise<RuntimeHealth> {
  if (isTauriEnv()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<{
      backend_reachable: boolean;
      app_version: string;
      os_type: string;
      os_version: string;
      arch: string;
      timestamp: string;
      ollama_status: string;
      docker_status: string;
    }>("get_runtime_health");

    return {
      backendReachable: raw.backend_reachable,
      appVersion: raw.app_version,
      osType: raw.os_type,
      osVersion: raw.os_version,
      arch: raw.arch,
      timestamp: raw.timestamp,
      ollamaStatus: raw.ollama_status as ServiceStatus,
      dockerStatus: raw.docker_status as ServiceStatus,
      lastChecked: new Date().toISOString(),
    };
  }

  // Browser / dev-server fallback — no Tauri backend available.
  return {
    backendReachable: false,
    appVersion: "0.1.0-dev",
    osType: navigator.platform || "browser",
    osVersion: navigator.userAgent.slice(0, 80),
    arch: "unknown",
    timestamp: new Date().toISOString(),
    ollamaStatus: "not_configured",
    dockerStatus: "not_configured",
    lastChecked: new Date().toISOString(),
  };
}
