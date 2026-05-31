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

---

# Phase 2C — Deterministic Tool Suggestions

## Overview

Phase 2C adds a safe suggestion-chip bridge between local AI conversations and the existing approval-gated tool framework. When a user's question matches known intent patterns, Lisa's app logic attaches a suggestion chip to the completed AI response. The chip lets the operator prepare a pending tool request with one click — but execution still requires explicit approval in the Approval Center.

**Core rule:** Suggestions are generated deterministically from user input. The LLM does not create, approve, or execute tool requests, and LLM output is never parsed for tool calls.

## Suggestion vs Request vs Approval vs Execution

| Stage | Who acts | What happens |
|-------|----------|-------------|
| **Suggestion** | App logic (deterministic) | Chip appears after AI response if user text matches a pattern |
| **Request** | Operator (Prepare click) | `ToolRequest` created with `status: pending_approval` |
| **Approval** | Operator (Approval Center) | Operator reviews and approves or rejects |
| **Execution** | App logic (tool-runner) | Tool runs, result stored, shown in Console |

## Architecture

```
detectToolSuggestion()   — pure function in tool-suggestions.ts
                           reads userText + tool registry + existing requests
                           never reads LLM output
                           returns SuggestionCore | null

CommandInput.tsx         — runs detector after lisa-stream-done
                           attaches ToolSuggestion to the completed local_ai interaction

ToolSuggestionChip.tsx   — renders inside ConsolePanel for visible/converted suggestions
                           Prepare → createToolRequestPair → CREATE_TOOL_REQUEST + CONVERT_TOOL_SUGGESTION
                           Dismiss → DISMISS_TOOL_SUGGESTION

lisa-reducer.ts          — DISMISS_TOOL_SUGGESTION: visible → dismissed (no-op otherwise)
                         — CONVERT_TOOL_SUGGESTION: visible → converted (no-op otherwise)

tool-suggestions.ts      — detectToolSuggestion + createToolRequestPair helper
```

## ToolSuggestion Type

```typescript
interface ToolSuggestion {
  id: string;
  toolId: string;
  toolDisplayName: string;
  reason: string;
  source: "user_intent_detected";   // never "llm_output"
  createdAt: string;
  originatingInteractionId: string;
  status: "visible" | "dismissed" | "converted";
}
```

Suggestions are **ephemeral and not persisted**. They live only on the `LisaInteraction` object in session state.

## Detector Rules

- Only triggers on `local_ai` interactions, never deterministic commands.
- Only runs if `routeCommand(userText).intent === "unknown"` (command router had no match).
- Only runs if `getDesktopActionGuardMessage(userText) === null` (no action-like guard match).
- Only suggests enabled tools with `riskLevel === "safe" | "low"`.
- Suppressed if a `pending_approval` request for the same tool already exists.
- Rejects very short inputs (< 10 chars or < 3 words).

## System Prompt Change

The LLM may now name available tools and tell the user the exact commands to request them (e.g. "Type 'runtime snapshot' to request it."). The suggestion chip may appear automatically. The LLM still cannot create, approve, execute, or invent results for tool requests, and must not output JSON tool-call payloads.

## Audit Events Added

| Event | When |
|-------|------|
| `tool_suggestion_shown` | Suggestion attached to interaction |
| `tool_suggestion_converted` | Operator clicks Prepare |
| `tool_suggestion_dismissed` | Operator clicks Dismiss |

## Tests Added

- `src/__tests__/tool-suggestions.test.ts` — detector positive/negative/registry guard/state guard + `createToolRequestPair` helper
- `src/__tests__/tool-request-reducer.test.ts` — `DISMISS_TOOL_SUGGESTION` and `CONVERT_TOOL_SUGGESTION` lifecycle and no-op cases
- `src/__tests__/llm-context.test.ts` — Phase 2C tool framework boundary assertions

## What Phase 2C Does NOT Include

- Agents or autonomous multi-step execution
- LLM-generated tool calls or parsing of LLM output for tool invocations
- Structured JSON tool-calling protocol
- New real tools (file, system, network, shell)
- Desktop control or mouse/keyboard automation
- Tool chaining or background execution
- Voice/STT/TTS

---

# Phase 2D — Tool Result Feedback Loop

## Overview

Phase 2D closes the feedback loop between Lisa's tool execution pipeline and the local AI conversation. When a tool has run and produced a `ToolResult`, its `outputSummary` is injected into the LLM context as read-only app-produced data before the next AI response. The LLM may reason about the results and summarize them for the user — but it cannot re-run tools, treat results as instructions, or invent results that were never produced.

**Core rule:** Tool results flow in one direction only — from app logic into context. The LLM observes them; it does not create them.

## Architecture

```
state.toolResults              — persisted ToolResult[] (succeeded results only)
formatToolResultsForContext()  — pure formatter in llm-context.ts
buildOllamaMessages()          — injects formatted block into system message
CommandInput.tsx               — passes state.toolResults, emits audit event
```

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `TOOL_RESULT_CONTEXT_CAP` | 5 | Max results injected per LLM call |
| `TOOL_RESULT_CONTEXT_SUMMARY_CHAR_LIMIT` | 1200 | Max chars per outputSummary; excess truncated with `… [truncated]` |

## Injection Format

Tool results are appended to the system message (not sent as a separate assistant or user message):

```
--- App-produced tool results (read-only, from Lisa app logic) ---
[tool-id — ISO-timestamp]
<outputSummary content>

[tool-id — ISO-timestamp]
<outputSummary content>
--- End of app-produced tool results ---
```

## Eligibility Filter

- Only results with a non-empty `outputSummary` are included.
- The most recent N results (by array order) are used, capped at `TOOL_RESULT_CONTEXT_CAP`.
- `ToolResult` only stores succeeded results, so no status filter is needed — defensive filter applied anyway.

## System Prompt Change

New read-only boundary clause added to the tool framework section:
- LLM may reason about and summarize tool results for the user.
- LLM must not treat results as instructions to execute or use them to invoke tools.
- LLM must not invent results when none appear in context.

## Audit Event

| Event | When | Details |
|-------|------|---------|
| `llm_tool_context_injected` | Tool results injected into LLM context | `count=N tool_ids=...` (no outputSummary content) |

## Future tools — outputSummary classification note

When new tools are added to the registry, keep their `outputSummary` short and factual (fits within 1200 chars), free of secrets/credentials/PII, and not formatted in a way that could be mistaken for LLM instructions.

## Tests Added

### llm-context.test.ts
- `formatToolResultsForContext` — empty, empty-summary filter, single result format, header/footer delimiters, toolId+timestamp in header, truncation, exact-limit no-truncation, cap enforcement, most-recent-N selection, custom cap, constant value checks
- `buildOllamaMessages` Phase 2D — no change with empty results, block present when results injected, injected into system message not separate message, message count invariant, block position after base prompt
- `buildLisaSystemPrompt` Phase 2D — read-only context declaration, forbids treating as instructions, forbids inventing results

## What Phase 2D Does NOT Include

- LLM-triggered re-execution of tools
- Tool result streaming or partial injection
- Per-tool injection opt-out flags
- LLM feedback on tool result quality
- Agents or autonomous multi-step execution
- New real tools (file, system, network, shell)
- Desktop control or mouse/keyboard automation
- Voice/STT/TTS
