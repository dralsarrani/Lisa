# Lisa — Product Roadmap

## Phase 0: Local Lisa Shell (Current) ✓

**Goal:** Establish the desktop foundation.

- Tauri v2 shell + React/TypeScript frontend
- Animated Lisa Orb with 9 state-driven animations
- Dark futuristic HUD command center
- Deterministic text command router
- Mission model + timeline
- Approval center (approve/reject gates)
- Audit/event log with severity levels
- 15 built-in mode foundation
- Runtime health panel
- Emergency stop (button + command)
- Local persistence (localStorage + Tauri backend)
- Rust backend: health check, state read/write

**Acceptance:** App launches, orb animates, commands route, test mission runs, approvals work, audit logs fill, emergency stop halts everything.

---

## Phase 1: Voice + Local Runtime Core

**Goal:** Make Lisa speak, listen, and connect to a local LLM.

- Wake-word detection ("Lisa") + push-to-talk
- Local STT (Whisper via Ollama or standalone)
- Local TTS (Coqui, Piper, or system voice)
- Transcript preview ("What Lisa heard")
- Ollama integration for command understanding (beyond deterministic Phase 0)
- Mission planner v1 (natural language → structured steps)
- Basic memory: save/retrieve user preferences
- Voice barge-in + interruption support

**Stack additions:** Ollama, Whisper, TTS crate or subprocess, WebSocket for audio streaming.

---

## Phase 2: Screen Awareness + Desktop Control

**Goal:** Lisa can see and act on the desktop.

- Continuous screen capture + OCR pipeline
- Active app/window detection
- Mouse + keyboard control (via enigo or rdev)
- Visual feedback loop (act → observe → verify → correct)
- Manual takeover (user moves mouse → Lisa pauses)
- Control ownership states: Lisa controlling / User takeover / Observe-only
- Emergency stop halts all mouse/keyboard input immediately

**Safety gate:** All Phase 2 desktop control is behind explicit mission approval. No silent automation.

---

## Phase 3: File + Browser Operator

**Goal:** Lisa can operate files and browsers like a human.

- Browser automation (Playwright or visual control fallback)
- Login state detection, MFA/CAPTCHA handoff
- Download watcher + file verification + rename/move
- File organization pipeline with preview/simulation
- Rollback snapshots for file operations
- Watched folder maintenance

---

## Phase 4: Memory + Workspace Brain

**Goal:** Lisa remembers everything useful.

- Project memory graph (projects, repos, apps, tasks, decisions)
- People memory (contacts, communication style)
- Activity timeline (files, apps, websites, missions)
- Local vector search over memory + files
- Workspace restoration (apps, windows, tabs, notes)
- Knowledge base construction

**Stack additions:** SQLite (replacing JSON persistence), vector index (e.g., Qdrant local or SQLite-vec).

---

## Phase 5: Communication + Calendar

**Goal:** Lisa handles email, calendar, and messaging under user control.

- Gmail/Outlook summarization and drafting
- Google/Microsoft Calendar read + event creation
- WhatsApp/Telegram/Discord trusted session support
- Communication style memory per contact
- Trusted session contracts (bounded, scoped delegation)
- Pre-send review + approval gate

---

## Phase 6: Documents + Creative Studio

**Goal:** Lisa produces and transforms documents and design.

- PDF/DOCX/PPTX/XLSX intelligence
- Word editing with backup + change summary
- Document conversion pipeline
- Figma visual workflows
- Brand/style memory
- Social asset creation with pre-publish review

---

## Phase 7: Coding + Cyber Operator

**Goal:** Lisa works as a repo operator and authorized security assistant.

- Full repo operator (inspect, edit, test, commit, PR)
- Git policy enforcement (approval for destructive operations)
- Cyber Mode: scope guard, evidence capture, report generation
- Out-of-scope detection and blocking
- Lab/CTF/bug bounty workflow support

---

## Phase 8: Skills + Self-Improvement

**Goal:** Lisa can acquire, create, and evolve capabilities.

- Skill manifest + sandboxing system
- GitHub/local skill install pipeline
- Demonstration learning ("Lisa, watch me do this")
- Lisa-generated workflow skills
- Self-improvement pipeline (snapshot → patch → test → activate → rollback)

---

## Phase 9: Full JARVIS Command Center

**Goal:** Full multi-mission, multi-agent, continuity-aware operation.

- Parallel background missions with priorities
- Mission replay with timeline + screenshots
- Startup continuity (restore unfinished work)
- Shutdown routine (checkpoint + workspace save)
- Performance scheduler (throttle by resource state)
- Full JARVIS Control Center UI

---

## Phase 10: Advanced Lisa

**Goal:** Platform maturity, extensibility, and deeper intelligence.

- Marketplace-ready skill registry
- Advanced local model benchmarking and routing
- Richer personality evolution
- Multi-device identity foundation
- Full audit export and compliance reporting
- Privacy zone system
- Presentation/share-aware mode automation
