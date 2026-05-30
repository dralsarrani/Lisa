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
