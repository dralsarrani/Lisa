import type { ToolRequest } from "./types";

export function hasActiveToolRequest(
  toolRequests: ToolRequest[],
  toolId: string
): ToolRequest | null {
  return (
    toolRequests.find(
      (r) =>
        r.toolId === toolId &&
        (r.status === "pending_approval" || r.status === "approved" || r.status === "running")
    ) ?? null
  );
}

export function hasActiveToolRequestForParams(
  toolRequests: ToolRequest[],
  toolId: string,
  params: Record<string, string | number | boolean>
): ToolRequest | null {
  const entries = Object.entries(params);
  return (
    toolRequests.find(
      (r) =>
        r.toolId === toolId &&
        (r.status === "pending_approval" || r.status === "approved" || r.status === "running") &&
        entries.every(([k, v]) => r.params[k] === v)
    ) ?? null
  );
}
