# Phase 2A — Tool Approval Framework

## Overview

Phase 2A introduces Lisa's first safe tool/skill approval framework. It creates the contract layer for future tools and agents, enforcing a strict operator-in-the-loop model where **no tool executes without explicit human approval**.

## Security Model

The LLM boundary is enforced at every layer:

- Tool requests are created **only** by deterministic user commands in `command-router.ts`, never by parsing LLM output.
- The LLM may describe available tools but cannot invoke or approve them.
- Execution requires a triple-check gate: request `status === "approved"` AND contract `decision === "approved"` AND contract `resolvedBy === "operator"`.
- The LLM must never claim a tool ran unless Lisa's app logic produced a real `ToolResult`.

## Phase 2A Tools

Both tools are diagnostic-only, read local state, and make no external calls or data modifications.

| Tool ID | Display Name | What it reads |
|---------|-------------|---------------|
| `conversation-stats` | Conversation Stats | `state.conversationHistory` — counts, models, timestamps, character totals |
| `runtime-snapshot` | Runtime Snapshot | `state.runtimeHealth` — backend status, OS info, Ollama/Docker status |

## Architecture

```
command-router.ts        — parses "run conversation stats" → CommandIntent "request_tool"
CommandInput.tsx         — handles "request_tool" intent, dispatches CREATE_TOOL_REQUEST
lisa-reducer.ts          — stores ToolRequest + ToolApprovalContract in state
ApprovalCenter.tsx       — renders pending tool approvals alongside mission approvals
ToolApprovalCard.tsx     — operator clicks "Approve & Run" → executes, shows result
tool-registry.ts         — static ToolDefinition catalog
tool-executors.ts        — pure executor functions (no dispatch, no Tauri, no LLM)
tool-runner.ts           — validates definition + enabled + executor, then delegates
```

## Data Types

### ToolRequest
Tracks the lifecycle of a single tool invocation request.

```
status: pending_approval → approved → running → succeeded | failed | cancelled | expired
source: always "user_command" in Phase 2A
```

### ToolApprovalContract
The operator-facing approval record, separate from mission `ApprovalRequest`.

```
decision: null (pending) | "approved" | "rejected"
resolvedBy: null | "operator"
```

### ToolResult
Immutable record written on successful execution, linked to `ToolRequest` via `requestId`.

## Persistence

State version bumped `4 → 5`. Three new persisted collections:

- `toolRequests` — capped at 50, restart policy applied on load
- `toolResults` — capped at 50
- `toolApprovals` — capped at 50

**Restart policy** (applied in `safeToolRequests()` on every app load):
- `running` → `cancelled` (was mid-execution when app closed; cannot safely resume)
- `approved` → `expired` (approval granted but execution never started; stale approval cannot be replayed)

## Commands

| User types | Routes to |
|-----------|-----------|
| "run conversation stats" / "conversation stats" / "show conversation stats" | `request_tool { toolId: "conversation-stats" }` |
| "run runtime snapshot" / "runtime snapshot" / "show runtime snapshot" | `request_tool { toolId: "runtime-snapshot" }` |
| "approve tool" / "approve tool request" | `approve_tool_request` |
| "reject tool" / "cancel tool" / "reject tool request" | `reject_tool_request` |

## Emergency Stop

`EMERGENCY_STOP` cancels all `pending_approval`, `approved`, and `running` tool requests and rejects all pending (`decision === null`) tool approval contracts.

## What Phase 2A Does NOT Include

- Agents or autonomous multi-step execution
- LLM-generated tool calls
- Desktop control (mouse/keyboard/screen)
- File/shell/browser tools
- Network tools
- Tool management UI in Settings
- Voice/STT/TTS

---

# Phase 2B — Tool Framework Hardening

## Overview

Phase 2B hardens, stress-tests, and polishes the Phase 2A tool approval framework. No new risky capabilities are added. This phase is entirely about correctness, safety, and UX quality before LLM tool proposals or real side-effect tools are introduced.

## Changes Delivered

### Reducer Hardening
- `COMPLETE_TOOL_EXECUTION` now guards against overwriting a non-running request. If EMERGENCY_STOP fires while a tool is in-flight, the async closure's `COMPLETE_TOOL_EXECUTION` dispatch is silently ignored — the cancelled status is preserved.
- `FAIL_TOOL_EXECUTION` has the same guard. Neither action can overwrite `cancelled`, `succeeded`, `failed`, `rejected`, or `expired` status.
- This closes the EMERGENCY_STOP race condition identified in Phase 2A.

### Persistence Hardening
- `safeToolApprovals` now validates the `decision` field is `"approved" | "rejected" | null`. Corrupt persisted values are dropped on load rather than entering state.

### Approval Center Polish
- Section labels renamed: "Pending Tool Requests", "Pending Mission Approvals", "Resolved Tool Requests", "Resolved Mission Approvals".
- Resolved tool requests now have a "Show all" expansion (matching legacy mission approvals).
- Empty state check now also accounts for `toolRequests`.

### ToolApprovalCard Polish
- Shows tool category, tool ID, and risk level badge sourced from the registry.
- Shows Consequences and Parameters sections (with "No parameters" fallback).
- Shows inline result for succeeded requests; inline error for failed requests.
- Status label reflects full request lifecycle: PENDING / RUNNING… / SUCCEEDED / FAILED / REJECTED / CANCELLED / EXPIRED.
- Resolved-state labels explain what happened and (for expired) how to proceed.
- Approve & Run and Reject buttons both disabled while running (double-click protection).

### Console Tool Card Polish
- `tool_result` responses render in a monospace pre-wrap block with a green left border — visually distinct from command and local_ai responses.
- `tool_request` entries in thinking state show "Waiting for approval — go to Approvals to approve or reject."
- Kind labels colored: `tool_request` → warning, `tool_result` → success.

### Settings — Tool Framework Section
- New read-only "Tool Framework" section shows all registered tools with display name, tool ID, category, risk level badge, enabled status, and approval requirement.
- Build Info phase string updated to "2B — Tool Framework Hardening".

### Action-Like Guard Expansion
- `getDesktopActionGuardMessage` expanded with new patterns for: file/script execution, shell commands, UI button interaction, keyboard typing, restricted network connections, permission requests, tool/skill installation.
- Refusal message updated to: "That action is not implemented yet. Future tool execution requires explicit approval."
- Conceptual/educational questions are not affected.

## Tests Added

### persistence.test.ts
- Tool request, result, approval round-trips
- Restart policy: pending survives, running→cancelled, approved→expired, terminal statuses unchanged
- Mixed-status restart round-trip
- Cap enforcement (TOOL_REQUESTS_CAP, TOOL_RESULTS_CAP, TOOL_APPROVALS_CAP)
- Validation: requests missing `id`/`toolId` dropped; approvals with invalid `decision` dropped

### tool-request-reducer.test.ts
- `COMPLETE_TOOL_EXECUTION` no-ops if request is already cancelled (EMERGENCY_STOP race)
- `COMPLETE_TOOL_EXECUTION` no-ops on duplicate
- `FAIL_TOOL_EXECUTION` no-ops if request is already cancelled or succeeded
- `CANCEL_TOOL_REQUEST` no-ops on running request
- `CREATE_TOOL_REQUEST` respects cap at 50

### command-router.test.ts
- Phase 2B guard patterns (file/shell, UI interaction, network, permissions, install)
- Conceptual questions confirmed to pass through
- Refusal message content verified

## Current Limitations

- No typed confirmation for high-risk tools (no high-risk tools exist yet).
- Tool enable/disable is not runtime-configurable.
- No per-tool execution timeout — a hung Promise holds the approval card in running state.
- `EXPIRE_TOOL_REQUEST` action does not exist for live-session timeout; expiry only happens on restart.

## What Phase 2B Does NOT Include

- Agents or autonomous multi-step execution
- LLM-generated tool calls or tool proposals
- New real tools (file, system, network, shell)
- Desktop control
- Tool chaining or background execution
- Tool enable/disable toggles
- Voice/STT/TTS
