# Lisa Phase 1A — Local AI Runtime

## What Phase 1A Adds

Phase 1A connects Lisa to a locally running Ollama instance so she can answer open-ended text questions using a local language model. All inference runs on your machine — no data is sent to any cloud service.

**Added in this phase:**
- `list_ollama_models` Tauri command — discovers installed models from Ollama `/api/tags`
- `send_ollama_chat` Tauri command — non-streaming chat request to Ollama `/api/chat`
- `src/core/llm-context.ts` — system prompt, conversation history builder, history trimmer
- Settings panel: Ollama status badge, model selector, enable/disable toggle, offline guidance
- Command router LLM fallback: unknown commands route to the local model when enabled
- Orb state transitions: thinking → responding → idle during LLM queries (text only — voice is not implemented)
- Console workspace: interaction history with per-entry thinking/complete/failed states
- Four audit event types: `llm_request_sent`, `llm_response_received`, `llm_request_failed`, `llm_disabled_fallback`
- Conversation history kept in memory (resets on restart), bounded by `maxContextTurns`
- `STATE_VERSION` bumped 1 → 2; existing state migrates automatically with safe defaults

---

## Requirements

- [Ollama](https://ollama.com) installed and running on your machine
- At least one model pulled (e.g. `llama3.2:1b`)
- Lisa desktop app (Tauri build) — LLM integration is not available in a plain browser build

---

## Setup — Ollama on Windows

### 1. Install Ollama

Download the Windows installer from [ollama.com](https://ollama.com) and run it.
Ollama installs as a background service and starts automatically.

### 2. Verify the API is running

Open PowerShell and run:

```powershell
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:11434/api/tags).Content
```

You should see a JSON object with a `models` array. If you get a connection error, run `ollama serve` in a terminal and retry.

### 3. Pull a small model

For testing on CPU hardware, start with the smallest available model:

```powershell
ollama pull llama3.2:1b
```

Other recommended small models that work well with Phase 1A:

| Model | Size | Notes |
|---|---|---|
| `llama3.2:1b` | ~1.3 GB | Best starting point — fast on CPU |
| `qwen2.5-coder:1.5b` | ~1.0 GB | Good for code and logic questions |
| `deepseek-r1:1.5b` | ~1.1 GB | Reasoning-focused, shows thinking steps |

Larger models (7B+) work but generation will be slow without a GPU.

### 4. Confirm the model is available

```powershell
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:11434/api/tags).Content
```

The model name should appear in the `models` array.

---

## Setup — Lisa

### 1. Launch Lisa

```bash
npm run tauri dev
```

### 2. Enable Local AI and select a model

1. Open the **Settings** tab
2. Scroll to **Local AI Runtime**
3. Toggle **Enable Local AI** → ON
4. Click **Refresh Models** if the model list is empty
5. Select your preferred model (e.g. `llama3.2:1b`)

### 3. Ask a question

Type any open-ended question in the command bar:

```
What is the difference between TCP and UDP?
```

The Orb enters **thinking** → **responding** → **idle** as the response arrives (text only — voice is not implemented in Phase 1B).
The Console tab shows the interaction with a local-thinking indicator while waiting.

### 4. About first-response latency

**The first response after launching Lisa (or after Ollama restarts) can take 20–60 seconds.**
Ollama must load the model weights into memory before generating. Subsequent responses in the same session are faster.

The Console will show:
> *Thinking locally with llama3.2:1b… first response may take a while while Ollama loads the model.*

The request timeout is **180 seconds** — enough headroom for cold model loads on most hardware.

---

## Command Routing Priority

Phase 0 deterministic commands always take priority over the LLM fallback:

| Priority | Intent | Example |
|---|---|---|
| 1 | Emergency stop | `emergency stop` |
| 2 | Stop / sleep / wake | `stop`, `sleep`, `wake up` |
| 3 | Mode changes | `activate focus mode` |
| 4 | Mission / approval | `create test mission`, `approve` |
| 5 | Runtime health | `status`, `check health` |
| 6 | **Local AI fallback** | Any unrecognized input (if enabled + Ollama online) |

These deterministic commands **never** route to the LLM. They always resolve immediately.

---

## Offline / Degraded Behavior

| Condition | Lisa Response |
|---|---|
| Ollama offline | Error shown in Console and Audit Log; Orb briefly enters error state |
| Local AI disabled | Phase 0 "not implemented yet" message |
| No model selected | "Local AI is enabled but no model is selected. Go to Settings → Local AI to choose a model." |
| Model removed from Ollama | Settings auto-selects the next available model on refresh |
| Model returns error | Error visible in Console; Audit Log records `llm_request_failed` |
| Request timeout (180s) | "Local model did not respond before the timeout. First responses can be slow while Ollama loads the model. Try again, choose a smaller model, or restart Ollama." |

Emergency stop always works regardless of LLM state.

---

## Conversation History

- Recent completed turns are persisted locally and restored when the app restarts (Phase 1D)
- This is **conversation continuity**, not semantic memory — Lisa does not maintain a long-term memory graph or vector database
- Bounded by `maxContextTurns` setting (default: 20 turns) and a hard cap of `CONVERSATION_HISTORY_CAP = 50`
- Trimmed from the oldest end when the limit is reached
- The system prompt is prepended to every request regardless of history
- Only successfully completed turns are persisted — cancelled, failed, and aborted turns are discarded
- Console interactions remain session-only and are never persisted

---

## Interaction History (Console)

- Interactions are **session-only** — they are not persisted between restarts
- Each command or LLM request creates one entry in the Console
- The same entry updates in place on completion or failure — no duplicates
- History is capped at `INTERACTION_CAP` (25) entries; oldest are dropped
- Failed responses are visible in both the Console and the Audit Log

---

## Capability Boundaries

Lisa's system prompt explicitly declares what she can and cannot do in Phase 1A.

**She can:**
- Answer questions and explain concepts
- Help plan tasks and reason through problems
- Respond to text commands in the Lisa command center

**She cannot (and will say so honestly):**
- Control the desktop, move the mouse, or press keyboard keys
- Read or see what is on the screen
- Browse, read, or write files
- Store, retrieve, or ask for passwords, API keys, or credentials
- Make requests to external servers or browse the internet
- Execute code or run programs autonomously
- Listen to or process voice input — voice is not yet implemented
- Take autonomous background actions without explicit user approval

If asked to do something outside these boundaries, Lisa explains the limitation and suggests a safe manual next step. She does not pretend to execute actions she cannot perform.

---

## Audit Events

| Event | When fired | Key fields in details |
|---|---|---|
| `llm_request_sent` | Before calling Ollama | `prompt_chars`, `messages`, `history_turns` |
| `llm_response_received` | On successful response | `response_chars`, `latency_ms` |
| `llm_request_failed` | On error or timeout | error text, `latency_ms` where available |
| `llm_disabled_fallback` | Input unknown, Local AI off or no model | — |

Full prompt and response content are **not** logged by default to avoid noisy or sensitive audit entries.

---

## Current Limitations

- **No streaming.** Responses arrive all at once. On CPU inference, this may take 10–60 seconds on first load. Phase 1B will add streaming.
- **No abort/cancel.** Once sent, a request runs to completion or times out at 180 seconds.
- **No voice.** Voice input/output is not implemented in Phase 1A.
- **No screen awareness.** Lisa cannot see or read the screen.
- **No desktop control.** Lisa cannot control the mouse, keyboard, or applications.
- **No file access.** Lisa cannot read or write files beyond her own state store.
- **No cloud providers.** Only localhost Ollama is supported.
- **Localhost only.** The Rust backend hardcodes `127.0.0.1:11434`. Arbitrary URLs are rejected.

---

## Architecture

```
User types unknown command
    ↓
CommandInput.tsx — default switch case
    ↓
enableLocalAi && ollamaModel?
    ↓ yes
ADD_INTERACTION (status: "thinking")     ← Console shows loading indicator immediately
    ↓
handleLlmQuery(raw, model, maxContextTurns)
    ├── trimConversationHistory()         — bound history to maxContextTurns-1
    ├── buildOllamaMessages()             — system prompt + history + current input
    ├── dispatch SET_ORB_STATE("thinking")
    ├── audit: llm_request_sent (prompt_chars, messages, history_turns)
    ├── invoke("send_ollama_chat")
    │       ↓
    │   Rust: POST http://127.0.0.1:11434/api/chat
    │         { model, messages, stream: false,
    │           options: { num_predict: 256, temperature: 0.4, top_p: 0.9 } }
    │         timeout: 180s
    │         ↓
    │   Returns OllamaChatResult { response, error, model, latency_ms }
    ├── On success → UPDATE_INTERACTION (complete) → audit: llm_response_received
    └── On error   → UPDATE_INTERACTION (failed)  → audit: llm_request_failed
```

**Key files:**

| File | Role |
|---|---|
| `src-tauri/src/lib.rs` | `list_ollama_models`, `send_ollama_chat` Rust commands |
| `src/core/llm-context.ts` | System prompt, message builder, history trimmer |
| `src/core/types.ts` | `LisaSettings` fields, `AuditEventType` values, `INTERACTION_CAP`, `CONVERSATION_HISTORY_CAP`, `STATE_VERSION = 3` |
| `src/components/command/CommandInput.tsx` | LLM fallback in the `default` switch case |
| `src/components/settings/SettingsPanel.tsx` | Local AI section: status, model picker, guidance |
| `src/components/console/ConsolePanel.tsx` | Interaction history with thinking/complete/failed states |

---

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
cd src-tauri && cargo check
cd src-tauri && cargo test
```

---

---

## Phase 1E — Conversation History Controls

Phase 1E adds user-facing visibility and control over the persisted conversation history introduced in Phase 1D.

**What changed:**

- Settings panel gains a **Conversation History** section showing stored turn count, context limit, and hard cap
- **Clear Conversation History** button with two-step confirmation (first click arms, second click executes)
- Button is disabled when history is empty or a local AI stream is active
- Clearing dispatches `CLEAR_CONVERSATION_HISTORY` reducer action → `conversationHistory: []` → persists automatically via existing save flow
- `CommandInput` syncs `conversationHistoryRef` to `[]` when state history is cleared externally
- Audit event `clear_conversation_history` records the cleared turn count
- `clear_conversation_history` added to `AuditEventType`

**Behavior guarantees:**

- Clearing history does not remove Console session messages
- Clearing history does not affect missions, approvals, audit log, settings, or modes
- The next LLM request after clear sends no prior conversation context
- The button cannot fire during an active streaming response

**What this is NOT:**

- Not a history viewer — individual turn content is not displayed
- Not per-turn deletion — only bulk clear is available
- Not search or export — deferred to a future phase
- Not semantic memory management — this only controls recent conversation continuity

---

## Phase 1D — Persistent Conversation History

Phase 1D adds local persistence for recent completed conversation turns so that Lisa can resume context after an app restart.

**What changed:**

- `STATE_VERSION` bumped 2 → 3; existing v2 state migrates automatically with `conversationHistory: []`
- `conversationHistory: LisaConversationTurn[]` added to `PersistedState`
- `APPEND_CONVERSATION_TURN` reducer action appends completed turns and enforces the cap
- `conversationHistoryRef` is seeded from persisted state on app load (`state.isLoaded` effect)
- Only successfully completed turns are appended — cancelled, failed, and aborted turns are not persisted
- `safeConversationHistory()` validates each persisted turn on load; malformed entries are silently dropped
- System prompt updated to distinguish conversation continuity from semantic memory

**What this is NOT:**

- Not semantic memory — Lisa has no vector database, memory graph, or arbitrary fact retention
- Not a Console feed backup — the Console interactions list remains session-only
- Not long-term user profiling — history is bounded and oldest turns are dropped first
- Not voice, screen awareness, desktop control, agents, or tool execution — none of these are implemented

**Audit events added:**

| Event | When fired |
|---|---|
| `llm_stream_aborted` | Stream cancelled by user before completion (Phase 1C) |

---

---

# Lisa Phase 1F — Basic Memory Foundation

## What Phase 1F Adds

Phase 1F gives the user a persistent, user-controlled memory layer. Notes are saved explicitly by the user, injected into the local AI system prompt, and survive app restarts. There is no automatic inference — only what the user deliberately writes.

**Added in this phase:**

- `MemoryNote { id, content, createdAt }` — new type defined in `llm-context.ts`, re-exported from `types.ts`
- `MEMORY_NOTES_CAP = 20`, `MEMORY_NOTE_CHAR_LIMIT = 200` — bounds constants in `types.ts`
- `ADD_MEMORY_NOTE`, `DELETE_MEMORY_NOTE`, `CLEAR_MEMORY_NOTES` reducer actions
- `memoryNotes: MemoryNote[]` added to `LisaState`, `PersistedState`, `LOAD_STATE` payload, and `saveState()` parameter
- `safeMemoryNotes()` validation guard on load — drops malformed, empty, or over-limit entries
- `buildLisaSystemPrompt(memoryNotes=[])` — injects a formatted notes block only when notes exist; empty array produces no block
- `buildOllamaMessages(history, input, memoryNotes=[])` — passes notes to system prompt on every request
- Settings panel — Memory Notes section: add input with char counter, per-note delete (×), two-step bulk clear with 5 s auto-reset
- `STATE_VERSION` bumped 3 → 4; old state migrates automatically with `memoryNotes: []`
- Three new audit event types (no note content ever logged):

| Event | Metadata logged |
|---|---|
| `memory_note_added` | `chars=N` |
| `memory_note_deleted` | `note_id=X` |
| `memory_notes_cleared` | `count=N` |

**How it works:**

1. User types a note (max 200 chars) in Settings → Memory Notes and clicks Add.
2. Note is stored in `state.memoryNotes` and auto-saved to localStorage / Tauri state file.
3. On the next local AI request, `buildOllamaMessages` prepends the notes block to the system prompt.
4. Lisa may reference the notes when answering but will not claim to have inferred or automatically learned them.

**What this is NOT:**

- Not automatic memory — Lisa never writes notes herself; only the user can add them
- Not semantic/vector memory — no embeddings, similarity search, or memory graph
- Not a credentials store — notes must not contain passwords or secrets
- Not voice, screen awareness, desktop control, agents, or tool execution — none of these are implemented

---

---

# Lisa Phase 1G — Natural Memory Commands

## What Phase 1G Adds

Phase 1G wires the Memory Notes system (added in Phase 1F) into the command bar via deterministic routing. The user can add, list, delete, and clear memory notes using natural language — no LLM involvement, no fuzzy matching, no automatic inference.

**New command intents (all deterministic, high-confidence):**

| Intent | Example inputs |
|---|---|
| `add_memory_note` | `remember that I prefer TypeScript` / `note that my editor is VS Code` / `save memory: I use Windows` / `add memory: concise answers please` |
| `list_memory_notes` | `list memory notes` / `show memory notes` / `what do you remember` / `memory notes` |
| `delete_memory_note` | `delete memory 1` / `forget memory 2` / `remove memory 3` |
| `request_clear_memory_notes` | `clear memory notes` / `clear all memory notes` / `delete all memory notes` |
| `confirm_clear_memory_notes` | `confirm clear memory` |

**Implementation details:**

- `CommandIntent` union type extended with 5 new values in `types.ts`
- `routeCommand()` extended in `command-router.ts` — memory blocks placed before `approve_test_action` so `"confirm clear memory"` beats the bare `"confirm"` check
- Note content extracted from the original raw input (prefix-stripped, case preserved) — stored exactly as typed
- Two-step clear: `request_clear_memory_notes` arms a 30 s confirmation window; `confirm_clear_memory_notes` executes or reports no pending clear
- All new intents route before the LLM fallback — memory commands never reach the model
- `CommandInput.tsx` handles all 5 new cases with the same validation and audit behavior as Settings:
  - Empty content rejected with message
  - Over-limit content rejected with char count
  - Cap reached rejected with guidance to delete first
  - Audit: `chars=N` / `note_id=X` / `count=N` — never note content

**Settings compatibility:**

- Notes added by command appear in Settings → Memory Notes
- Notes deleted in Settings no longer appear in `list memory notes`
- Notes added via Settings are numbered and deletable by command
- Both paths share the same `state.memoryNotes` array and persistence

**System prompt boundary (added):**

- `llm-context.ts` now states: "Memory note commands (add, list, delete, clear) are handled by Lisa's deterministic app logic. Do not attempt to add, modify, or delete memory notes yourself."

**What this is NOT:**

- Not automatic inference — the LLM never decides what to remember
- Not semantic/vector memory — no embeddings or similarity search
- Not fuzzy deletion — only numbered deletion by index (e.g. `delete memory 1`)
- Not voice, screen, desktop control, or agent execution

**Tests added:** 26 new command-router tests covering all 5 intents + 1 llm-context test for the new system prompt line. Total: 228 tests passing.

---

---

# Lisa Phase 1H — Local AI Runtime & Model Management Hardening

## What Phase 1H Adds

Phase 1H makes the Ollama runtime UX reliable when models fail, are too large, disappear, or aren't installed. It adds friendly error classification, model size display with recommendations, heavy-model warnings, and a non-invasive Test Model button.

## Error Classification

Both the Rust backend and TypeScript frontend classify raw Ollama error strings into friendly, actionable messages:

| Raw error signal | Friendly message |
|---|---|
| `unable to allocate` / `llama runner process has terminated` / `out of memory` | Memory failure + suggests llama3.2:1b, qwen2.5-coder:1.5b, deepseek-r1:1.5b |
| `model not found` / `pull model manifest` | Install guidance: `ollama pull <model>` |
| `connection refused` / `not reachable` / `failed to connect` | Start guidance: `ollama serve` |
| `no space left` / `disk full` | Disk space guidance |
| `timed out` / `deadline exceeded` | Timeout guidance with smaller-model suggestion |
| `response parse error` / `invalid json` | Restart Ollama guidance |
| Anything else | Passed through unchanged |

**Rust:** `classify_ollama_error(raw: &str) -> String` in `src-tauri/src/lib.rs`

Applied to: HTTP 5xx errors in `send_ollama_chat` and `stream_ollama_chat`, in-stream `error` field chunks.

**TypeScript:** `classifyOllamaError(raw: string): string` in `src/core/ollama-error.ts`

Applied to: `.catch` path on `invoke("stream_ollama_chat")` in `CommandInput.tsx`.

## Model Selector Hardening

- **Size display:** `OllamaModel.size` (bytes) now preserved through the full stack — Rust → IPC → `OllamaModelInfo` → `<select>` options show `(X.X GB)`.
- **Recommended badge:** ⭐ for `llama3.2:1b`, `qwen2.5-coder:1.5b`, `deepseek-r1:1.5b`.
- **Heavy-model warning:** ⚠ badge + inline guidance hint for models > 4 GB.
- **Missing model auto-recovery:** if the previously selected model is no longer installed, Settings auto-selects the first available model.

## Test Model Button

A "Test Model" button appears in Settings → Local AI Runtime when Ollama is online and a model is selected.

**Behavior:**
- Sends the minimal prompt `"Reply with OK."` via `test_ollama_model` Tauri command (15 s timeout).
- Shows `✓ Model responded in Xms` on success or `✗ <friendly error>` on failure.
- Result is displayed inline in Settings only — nothing is added to conversation history, memory notes, Console output, or LLM context.

**Audit events emitted (no prompt/response content logged):**
- `ollama_model_test_started` — model name only
- `ollama_model_test_passed` — model name + latency_ms
- `ollama_model_test_failed` — model name + latency_ms + error category

## Runtime Health Distinction

- `ollamaStatus: "available"` — TCP port 11434 is open (Ollama process running).
- Model-level failures (load error, OOM) are surfaced via the Test Model button and Console error messages, not the runtime health panel.

## New Files

| File | Purpose |
|---|---|
| `src/core/ollama-error.ts` | Frontend Ollama error classifier |
| `src/__tests__/ollama-error.test.ts` | 15 frontend classifier tests |

## Changes to Existing Files

| File | Change |
|---|---|
| `src-tauri/src/lib.rs` | `classify_ollama_error()`, `test_ollama_model` command, `OLLAMA_MODEL_TEST_TIMEOUT_SECS=15`, `OllamaModelTestResult` struct, 14 new Rust tests |
| `src/core/types.ts` | 3 new `AuditEventType` values |
| `src/components/command/CommandInput.tsx` | Import + apply `classifyOllamaError` in stream `.catch` path |
| `src/components/settings/SettingsPanel.tsx` | Size-aware model list, recommended/heavy badges, Test Model button + result, `testModel()` function |
| `src/components/settings/SettingsPanel.css` | `.ai-test-btn`, `.ai-model-hint`, `.ai-test-result` styles |

## PowerShell Diagnostics

If Ollama fails to load a model, run these from a PowerShell terminal to diagnose:

```powershell
# Check if Ollama is running
Test-NetConnection -ComputerName 127.0.0.1 -Port 11434

# List installed models and their sizes
ollama list

# Pull a recommended small model
ollama pull llama3.2:1b

# Run Ollama in a visible terminal to see error output
ollama serve

# Check available system RAM
Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum | Select-Object -ExpandProperty Sum | ForEach-Object { "$([math]::Round($_ / 1GB, 1)) GB RAM total" }

# Check disk space
Get-PSDrive C | Select-Object Used, Free
```

**What is NOT in Phase 1H:**
- Voice, STT/TTS, wake word, agents, tool execution, screen awareness, OCR, desktop control
- Arbitrary Ollama host URLs (localhost only, enforced)
- Cloud AI providers
- Orb redesign or whole UI redesign
- Memory-note or conversation-history semantics changes

**Tests:** 246 frontend tests + 32 Rust tests passing.

---

## What's Next — Future Phase Candidates

- **Voice shell** — STT (Whisper) + TTS wired to the LLM pipeline
- **SQLite migration** — replace localStorage + JSON file with a proper database
- **Screen awareness** — read-only screen context passed to the LLM
- **Skill execution** — structured tool calls approved by the user before execution
