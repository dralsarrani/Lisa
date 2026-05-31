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
