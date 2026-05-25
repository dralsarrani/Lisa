# Lisa — JARVIS-Like Local Desktop AI Operating Companion

> Phase 0: Local Lisa Shell

Lisa is a local-first, voice-first desktop AI operating companion built with Tauri v2, React, TypeScript, and Rust. She is not a chatbot, not a generic dashboard, and not a toy. She is the foundation of a full JARVIS-like desktop operating layer.

---

## What Lisa Is

- A persistent desktop AI presence with an animated Orb/HUD
- A command center for missions, approvals, audit logs, and mode control
- A local-first system with no cloud dependency
- Phase 0 of a multi-phase architecture leading to full desktop control, voice, screen awareness, memory, skills, and autonomous operation

## What Lisa Is Not

- Not a chatbot
- Not a web dashboard
- Not a generic admin panel
- Not a demo mockup

---

## Phase 0 Features

| Feature | Status |
|---|---|
| Tauri v2 desktop shell | ✓ |
| React + TypeScript frontend | ✓ |
| Animated Lisa Orb (9 states) | ✓ |
| Dark futuristic HUD command center | ✓ |
| Text command input | ✓ |
| Deterministic fast-path command router | ✓ |
| Mission model + timeline | ✓ |
| Approval center (approve/reject) | ✓ |
| Audit/event log | ✓ |
| Built-in mode foundation (15 modes) | ✓ |
| Runtime health panel | ✓ |
| Emergency stop (button + command) | ✓ |
| Local persistence (localStorage + Tauri backend) | ✓ |
| Rust backend commands | ✓ |
| Documentation | ✓ |

---

## Requirements

### Node.js
- Node.js 18+ (tested with Node 24)
- npm 9+

### Rust (required to build the Tauri desktop app)
- Rust stable via [rustup](https://rustup.rs/)
- WebView2 (Windows) or WebKitGTK (Linux) or Safari (macOS)
- See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

> **Phase 0 frontend-only mode:** Without Rust, you can still run the frontend in a browser via `npm run dev`. All features work except the native Tauri backend commands (runtime health falls back to browser info).

---

## Installation

```bash
# 1. Install Node dependencies
npm install

# 2. (If Rust is installed) Install Tauri CLI
npm install --save-dev @tauri-apps/cli

# 3. Run frontend dev server only (no Rust needed)
npm run dev

# 4. Run full Tauri app (requires Rust)
npm run tauri dev
```

---

## Build

```bash
# Build frontend only
npm run build

# Type check
npm run typecheck

# Lint
npm run lint

# Build full Tauri app (requires Rust)
npm run tauri build
```

---

## Phase 0 Commands

Type any of these in the command input:

| Command | Effect |
|---|---|
| `Lisa, emergency stop` | Halt all operations immediately |
| `Lisa, stop` | Pause active operations |
| `Lisa, sleep` | Enter sleep mode |
| `Lisa, wake up` | Clear paused/stopped state |
| `Lisa, activate Focus Mode` | Switch to Focus Mode |
| `Lisa, activate Cyber Mode` | Switch to Cyber Mode |
| `Lisa, activate Study Mode` | Switch to Study Mode |
| `Lisa, activate Design Mode` | Switch to Design Mode |
| `Lisa, activate Gaming Mode` | Switch to Gaming Mode |
| `Lisa, return to Normal Mode` | Switch to Normal Mode |
| `Lisa, check local runtime` | Query system health |
| `Lisa, create test mission` | Create approval-gated test mission |
| `Lisa, approve test action` | Approve the pending test action |
| `Lisa, reject test action` | Reject the pending test action |

Unknown commands are handled safely and logged.

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a full breakdown.

```
Lisa/
├── src/                         # React/TypeScript frontend
│   ├── app/LisaContext.tsx       # Global state (React context + reducer)
│   ├── components/
│   │   ├── orb/                 # Animated Lisa Orb
│   │   ├── command/             # Command input
│   │   ├── missions/            # Mission panel + timeline
│   │   ├── approvals/           # Approval center
│   │   ├── audit/               # Audit event log
│   │   ├── runtime/             # Runtime health panel
│   │   ├── settings/            # Settings + mode selector
│   │   └── layout/              # Header, navigation
│   ├── core/
│   │   ├── types.ts             # All TypeScript models
│   │   ├── command-router.ts    # Fast-path command dispatcher
│   │   ├── mission-store.ts     # Mission factory + approval logic
│   │   ├── audit-store.ts       # Audit event factory
│   │   ├── mode-store.ts        # 15 built-in modes
│   │   └── persistence.ts       # localStorage + Tauri backend save/load
│   └── styles/globals.css
├── src-tauri/                   # Rust backend
│   ├── src/lib.rs               # Tauri commands
│   └── tauri.conf.json          # App config
└── docs/                        # Documentation
```

---

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

---

## License

Private — Abas. All rights reserved.
