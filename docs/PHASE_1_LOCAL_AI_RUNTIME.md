# Lisa Phase 1A — Local AI Runtime

## What Phase 1A Adds

Phase 1A connects Lisa to a locally running Ollama instance so she can answer open-ended text questions using a local language model. All inference runs on your machine — no data is sent to any cloud service.

**Added in this phase:**
- `list_ollama_models` Tauri command — discovers installed models from Ollama `/api/tags`
- `send_ollama_chat` Tauri command — sends a non-streaming chat request to Ollama `/api/chat`
- `src/core/llm-context.ts` — system prompt, conversation history builder, history trimmer
- Settings panel: Ollama status badge, model selector, enable/disable toggle, offline guidance
- Command router LLM fallback: unknown commands route to the local model when enabled
- Orb state transitions: thinking → speaking → idle during LLM queries
- Four new audit event types: `llm_request_sent`, `llm_response_received`, `llm_request_failed`, `llm_disabled_fallback`
- Conversation history kept in memory (resets on restart), bounded by `maxContextTurns`
- `STATE_VERSION` bumped 1 → 2; existing state migrates automatically with safe defaults

---

## Requirements

- [Ollama](https://ollama.com) installed and running on your machine
- At least one model pulled (e.g. `llama3.2`, `mistral`, `phi3`)
- Lisa desktop app (Tauri build) — LLM integration is not available in a plain browser build

---

## Setup — Ollama

### 1. Install Ollama

Download from [ollama.com](https://ollama.com) and install for your OS.

### 2. Pull a model

```bash
ollama pull llama3.2
```

Other recommended starting models:

```bash
ollama pull mistral
ollama pull phi3
ollama pull gemma2
```

### 3. Start the Ollama server

Ollama usually starts automatically after installation. If not:

```bash
ollama serve
```

Ollama listens on `http://127.0.0.1:11434`. Lisa connects only to this local address.

### 4. Verify

```bash
curl http://127.0.0.1:11434/api/tags
```

You should see a JSON list of installed models.

---

## Setup — Lisa

### 1. Launch Lisa

```bash
npm run tauri dev
```

### 2. Run a health check

Type in the command bar:

```
Lisa, status
```

The Runtime tab and header indicator will show **Ollama: Online** when reachable.

### 3. Enable Local AI and select a model

1. Open the **Settings** tab
2. Scroll to **Local AI Runtime**
3. Toggle **Enable Local AI** → ON
4. The model selector populates with your installed models
5. Select your preferred model (e.g. `llama3.2:latest`)

### 4. Ask a question

Type any open-ended question:

```
What is the difference between TCP and UDP?
```

The Orb enters **thinking** → **speaking** → **idle** as the response arrives.

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

---

## Offline / Degraded Behavior

| Condition | Lisa Response |
|---|---|
| Ollama offline | "Local AI runtime is not available. Start Ollama and select a model in Settings." |
| Local AI disabled | Phase 0 "not implemented yet" message as before |
| No model selected | "No model selected. Go to Settings → Local AI to choose a model." |
| Model returns error | Error displayed; Orb briefly enters error state then returns to idle |
| Request timeout (60s) | Timeout surfaces as error message |

Emergency stop always works regardless of LLM state.

---

## Conversation History

- History is kept in memory and resets when the app restarts
- Bounded by `maxContextTurns` setting (default: 20 turns)
- Trimmed from the oldest end when the limit is reached
- The system prompt is prepended to every request regardless of history

---

## Current Limitations

- **No streaming.** Responses arrive all at once. On CPU inference, this may take 10–60 seconds.
- **No abort/cancel.** Once sent, a request runs to completion or times out at 60 seconds.
- **No voice.** Voice input/output is not implemented in Phase 1A.
- **No screen awareness.** Lisa cannot see or read the screen.
- **No desktop control.** Lisa cannot control the mouse, keyboard, or applications.
- **No file access.** Lisa cannot read or write files beyond her own state store.
- **No cloud providers.** Only localhost Ollama is supported. No OpenAI, Anthropic, or other cloud APIs are connected.
- **Conversation resets on restart.** Persistent history is a Phase 1B+ concern.
- **Localhost only.** The Rust backend hardcodes `127.0.0.1:11434`. Arbitrary URLs are rejected.

---

## Architecture

```
User types unknown command
    ↓
CommandInput.tsx — default switch case
    ↓
enableLocalAi && ollamaModel && ollamaOnline?
    ↓ yes
handleLlmQuery(raw, model, maxContextTurns)
    ├── trimConversationHistory()      — bound history to maxContextTurns-1
    ├── buildOllamaMessages()          — system prompt + history + current input
    ├── dispatch SET_ORB_STATE("thinking")
    ├── invoke("send_ollama_chat")
    │       ↓
    │   Rust: POST http://127.0.0.1:11434/api/chat
    │         { model, messages, stream: false }
    │         timeout: 60s
    │         ↓
    │   Returns OllamaChatResult { response, error, model, latency_ms }
    ├── On success → SET_ORB_STATE("speaking") → show response → idle after 3s
    └── On error   → SET_ORB_STATE("error")   → show error    → idle after 2s
```

**Key files:**

| File | Role |
|---|---|
| `src-tauri/src/lib.rs` | `list_ollama_models`, `send_ollama_chat` Rust commands |
| `src/core/llm-context.ts` | System prompt, message builder, history trimmer |
| `src/core/types.ts` | New `LisaSettings` fields, new `AuditEventType` values, `STATE_VERSION = 2` |
| `src/components/command/CommandInput.tsx` | LLM fallback in the `default` switch case |
| `src/components/settings/SettingsPanel.tsx` | Local AI section: status, model picker, guidance |

---

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
cd src-tauri && cargo check
```

---

## What's Next — Phase 1B Candidates

- **Streaming responses** — tokens appear as they arrive via Tauri event emit
- **Abort/cancel** — interrupt a slow request mid-generation
- **Persistent conversation** — survive app restarts
- **Voice shell** — STT (Whisper) + TTS wired to the LLM pipeline
- **SQLite migration** — replace localStorage + JSON file with a proper database
