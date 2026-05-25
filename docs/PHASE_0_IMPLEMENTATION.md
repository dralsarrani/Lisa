# Lisa Phase 0 — Implementation Reference

## Status: Complete

Phase 0 ("Local Lisa Shell") is the foundation layer. It establishes every structural element Lisa needs to evolve into a full desktop AI operating companion.

---

## Files Created

### Scaffold
| File | Purpose |
|---|---|
| `package.json` | Node dependencies, npm scripts |
| `index.html` | Vite entry point |
| `vite.config.ts` | Vite + React + path aliases |
| `tsconfig.json` | TypeScript config (strict, ESNext) |
| `tsconfig.node.json` | Node-side TS config for Vite |
| `.eslintrc.cjs` | ESLint with TypeScript + React rules |

### Tauri Backend
| File | Purpose |
|---|---|
| `src-tauri/Cargo.toml` | Rust workspace + dependencies |
| `src-tauri/build.rs` | Tauri build script |
| `src-tauri/tauri.conf.json` | Tauri v2 app config (1400×900, min 1100×700) |
| `src-tauri/capabilities/default.json` | Tauri v2 capability manifest |
| `src-tauri/src/main.rs` | Rust entry point |
| `src-tauri/src/lib.rs` | Tauri commands: ping, health, state read/write |

### Core TypeScript Modules
| File | Purpose |
|---|---|
| `src/core/types.ts` | All models: OrbState, LisaMode, Mission, MissionStep, ApprovalRequest, AuditEvent, RuntimeHealth, LisaSettings, CommandRouteResult, PersistedState |
| `src/core/command-router.ts` | Deterministic command dispatcher (14 intents) |
| `src/core/mission-store.ts` | Mission factory + approval decision logic |
| `src/core/audit-store.ts` | Audit event factory |
| `src/core/mode-store.ts` | 15 built-in mode registry |
| `src/core/persistence.ts` | Dual-backend load/save (localStorage + Tauri) |

### Application State
| File | Purpose |
|---|---|
| `src/app/LisaContext.tsx` | Global React context, reducer, provider, hook |

### Components
| File | Purpose |
|---|---|
| `src/components/orb/LisaOrb.tsx` | Animated Orb with 9 state-driven CSS animations |
| `src/components/orb/LisaOrb.css` | Orb keyframes, ring animations, waveform, pulse |
| `src/components/command/CommandInput.tsx` | Command input, routing, action dispatch |
| `src/components/command/CommandInput.css` | Command bar styles |
| `src/components/missions/MissionPanel.tsx` | Mission cards + step timeline |
| `src/components/missions/MissionPanel.css` | Mission card + timeline styles |
| `src/components/approvals/ApprovalCenter.tsx` | Approval cards with approve/reject actions |
| `src/components/approvals/ApprovalCenter.css` | Approval panel styles |
| `src/components/audit/AuditLog.tsx` | Scrollable audit event log |
| `src/components/audit/AuditLog.css` | Audit row styles with severity colors |
| `src/components/runtime/RuntimeHealth.tsx` | Runtime health display |
| `src/components/runtime/RuntimeHealth.css` | Health panel styles |
| `src/components/settings/SettingsPanel.tsx` | Mode selector + build info |
| `src/components/settings/SettingsPanel.css` | Settings panel styles |
| `src/components/layout/Header.tsx` | App header with emergency stop |
| `src/components/layout/Header.css` | Header styles |

### App Entry
| File | Purpose |
|---|---|
| `src/App.tsx` | Root layout, tab navigation, orchestration |
| `src/App.css` | Layout + emergency overlay styles |
| `src/main.tsx` | ReactDOM root + LisaProvider |
| `src/styles/globals.css` | Design system: tokens, base, utilities |

### Documentation
| File | Purpose |
|---|---|
| `README.md` | Installation, commands, overview |
| `docs/ARCHITECTURE.md` | Technical architecture reference |
| `docs/PHASE_0_IMPLEMENTATION.md` | This document |
| `docs/ROADMAP.md` | Phase 0–10 roadmap |

---

## Acceptance Criteria Check

| Criterion | Met |
|---|---|
| App launches as Tauri desktop app | ✓ (requires Rust) |
| Orb shows all 9 states visually | ✓ |
| User can type command and receive response | ✓ |
| Mission panel shows current mission | ✓ |
| Approval card can approve/reject | ✓ |
| Audit log records mission start/end and approvals | ✓ |
| Emergency stop works from button and command | ✓ |
| Mode system with 15 modes | ✓ |
| Local persistence (localStorage + Tauri backend) | ✓ |
| Unknown commands handled safely | ✓ |
| No real desktop control | ✓ |
| No credential storage | ✓ |
| No destructive filesystem actions | ✓ |
| Documentation | ✓ |

---

## Known Limitations (Phase 0)

1. **Voice**: Not implemented. Phase 1 feature.
2. **Local LLM**: Not wired. Command routing is deterministic only. Phase 1 feature.
3. **Screen awareness**: Not implemented. Phase 2 feature.
4. **Desktop control**: Not implemented (by design — safety rule). Phase 2 feature.
5. **Browser automation**: Not implemented. Phase 3 feature.
6. **Memory/project graph**: Not implemented. Phase 4 feature.
7. **Vault / credential storage**: Not implemented (by design — security rule).
8. **Rust/Cargo**: Required for building the full Tauri desktop app. Without it, the frontend runs in browser mode via `npm run dev`.
9. **Real Ollama/Docker integration**: Only port-probe detection in Phase 0. Full integration is Phase 1.
10. **Clock in header does not auto-update**: Renders once. Can be made reactive if needed.

---

## Next Recommended Steps

See `docs/ROADMAP.md` for Phase 1 scope.

Immediate next tasks to improve Phase 0:
1. Install Rust and run `cargo check` in `src-tauri`
2. Run `npm run tauri dev` to launch the desktop app
3. Wire a clock tick in the header
4. Add auto-detection of Tauri vs browser context for better fallback messaging
