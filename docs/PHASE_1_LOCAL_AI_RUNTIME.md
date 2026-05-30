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

## What's Next — Future Phase Candidates

- **Voice shell** — STT (Whisper) + TTS wired to the LLM pipeline
- **SQLite migration** — replace localStorage + JSON file with a proper database
- **Screen awareness** — read-only screen context passed to the LLM
- **Skill execution** — structured tool calls approved by the user before execution
