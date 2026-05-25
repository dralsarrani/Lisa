# Lisa — Architecture Document

## Phase 0: Local Lisa Shell

---

## Overview

Lisa's architecture is designed as a layered desktop AI operating system, not a single-purpose application. Phase 0 establishes the structural foundation that all future phases build on.

```
┌─────────────────────────────────────────────────────────────────┐
│                        TAURI DESKTOP SHELL                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   REACT/TYPESCRIPT FRONTEND              │   │
│  │                                                          │   │
│  │   LisaOrb  ──  CommandInput  ──  MissionPanel           │   │
│  │   Header   ──  ApprovalCenter ── AuditLog               │   │
│  │   RuntimeHealth  ──  SettingsPanel                      │   │
│  │                     │                                   │   │
│  │           LisaContext (React Reducer)                   │   │
│  │                     │                                   │   │
│  │   command-router  ─  mission-store  ─  audit-store      │   │
│  │   mode-store      ─  persistence                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │ Tauri invoke                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    RUST BACKEND (Tauri)                  │   │
│  │                                                          │   │
│  │   get_runtime_health  ──  ping_backend                   │   │
│  │   read_app_state      ──  write_app_state                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                    │
│              Local filesystem (app data dir)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### State Management

All application state lives in `LisaContext` — a React context backed by `useReducer`. This is intentionally simple in Phase 0 but structured to accept more complex state as features are added.

```typescript
interface LisaState {
  orbState: OrbState;          // current orb visual state
  activeMode: LisaModeId;      // current operating mode
  settings: LisaSettings;      // persisted user settings
  missions: Mission[];          // all missions (active + history)
  approvals: ApprovalRequest[]; // all approval requests
  auditEvents: AuditEvent[];    // audit log (newest first)
  runtimeHealth: RuntimeHealth | null;
  commandResponse: string | null;
}
```

All state mutations go through typed `LisaAction` dispatches. No direct state mutation anywhere.

### Command Flow

```
User types command
       │
CommandInput.handleSubmit()
       │
routeCommand(raw) → CommandRouteResult { intent, payload, response }
       │
switch(intent):
  emergency_stop  → dispatch(EMERGENCY_STOP)
  mode_change     → dispatch(SET_MODE, modeId)
  create_test_mission → createTestMission() → dispatch(ADD_MISSION + ADD_APPROVAL)
  approve/reject  → applyApprovalDecision() → dispatch(UPDATE_MISSION + UPDATE_APPROVAL)
  runtime_health  → invoke("get_runtime_health") → dispatch(SET_RUNTIME_HEALTH)
  unknown         → audit log + safe response
       │
addAudit() after each action
       │
Debounced saveState() → localStorage + Tauri backend
```

### Component Architecture

All components are single-responsibility and receive only what they need:

| Component | Responsibility |
|---|---|
| `LisaOrb` | Visual state rendering only. Pure CSS animations. No logic. |
| `CommandInput` | Input handling + command routing + action dispatch. |
| `MissionPanel` | Read-only display of missions + steps. |
| `ApprovalCenter` | Approval card display + approve/reject buttons. |
| `AuditLog` | Read-only scrollable event log. |
| `RuntimeHealth` | Health data display + refresh trigger. |
| `SettingsPanel` | Settings display + mode selector. |
| `Header` | App identity, status, clock, emergency stop button. |
| `App` | Layout + tab navigation + orchestration. |

---

## Core Modules

### `types.ts`
All TypeScript interfaces and type aliases. No logic. The single source of truth for data shapes.

Key types:
- `OrbState` — 9 visual states
- `LisaModeId` — 15 mode identifiers
- `Mission` + `MissionStep` — mission model with full timeline
- `ApprovalRequest` — approval gate model
- `AuditEvent` — structured event with severity
- `RuntimeHealth` — backend health snapshot
- `CommandRouteResult` — command router output

### `command-router.ts`
Pure function `routeCommand(raw: string): CommandRouteResult`.

- No side effects
- No imports of React or store
- Input normalization: strips "Lisa, " prefix, trims, lowercases
- Returns intent, normalized input, payload, confidence, and response string
- Unknown commands return `intent: "unknown"` — never throw or crash

### `mission-store.ts`
Factory functions for creating and mutating missions. No React, no state management.

- `createTestMission(mode?)` — creates a Phase 0 test mission with steps + approval
- `applyApprovalDecision(mission, approval, decision)` — immutable update of mission + approval

### `audit-store.ts`
Single factory function `createAuditEvent(params)`. Generates IDs and timestamps. No state.

### `mode-store.ts`
Static registry of all 15 built-in modes. Read-only. Used by settings panel and mode display.

### `persistence.ts`
Async load/save with dual-backend:
1. Primary: `localStorage` (always available in browser/dev)
2. Secondary: Tauri `write_app_state`/`read_app_state` commands when running as desktop app

Saves are debounced to 1 second. Schema-versioned for future migrations.

---

## Rust Backend

### Commands

| Command | Purpose |
|---|---|
| `ping_backend` | Aliveness check |
| `get_runtime_health` | OS info, Ollama + Docker detection |
| `read_app_state` | Read JSON from app data dir |
| `write_app_state` | Write JSON to app data dir |

All commands are safe. No destructive operations, no credential handling, no network scanning.

### Safety Properties

- No file operations outside the Tauri app data directory
- JSON is validated before writing
- Ollama/Docker checks use TCP port probing with 300ms timeout — never hang, never fail
- OS version checked via safe system commands with fallback strings

---

## Persistence Design

Phase 0 uses a flat JSON file (`lisa_state.json`) in the Tauri app data directory, with localStorage as fallback.

The `PersistedState` interface is versioned (`version: 1`). The `migrateState()` function handles schema upgrades. Replacing this with SQLite in Phase 1 requires only changing `persistence.ts`.

---

## Emergency Stop

Emergency stop is treated as a first-class system event:

1. Reachable from: header button, "Lisa, stop" command, "Lisa, emergency stop" command
2. Effect: sets orbState to `emergency_stopped`, cancels all running missions, cancels pending approvals
3. Logs a `critical` severity audit event
4. Shows clear visual state in orb, header, and overlay
5. To clear: type "Lisa, wake up"

Emergency stop never deletes state. It only transitions it. All history is preserved.

---

## Future Architecture Notes

Phase 0 is designed to evolve into:

- **Phase 1**: Voice (STT/TTS via Ollama), local model routing
- **Phase 2**: Screen awareness, mouse/keyboard control via host adapters
- **Phase 3**: Browser automation, file operations
- **Phase 4**: Memory graph, workspace restoration, project profiles
- **Phase 5+**: Communication, documents, skills, self-improvement

The current `LisaContext` reducer will either remain (adding new action types) or be replaced with Zustand/Jotai if complexity demands it. The core modules (`command-router`, `mission-store`, `audit-store`) are framework-independent and require no changes as the UI layer evolves.
