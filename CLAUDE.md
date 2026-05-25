\# CLAUDE.md — Lisa Project Instructions



\## ECC Discipline Layer



This project may use ECC for Claude Code workflow discipline, planning, review, security checks, and verification.



Read `.claude/ECC\_LISA\_USAGE.md` before using ECC workflows.



ECC is subordinate to Lisa's PRD, Lisa safety rules, and this CLAUDE.md. If ECC guidance conflicts with Lisa's product/safety model, Lisa rules win.



Do not install ECC full/manual profiles into this project after the plugin is installed. Do not duplicate hooks or skills. Use only project-local selected ECC rules unless explicitly approved.



\## Project Identity



This repository builds Lisa: a JARVIS-like, local-first, voice-first desktop AI operating companion.



Lisa is not a chatbot, web dashboard, or toy assistant. Lisa is a Tauri desktop app with a living Orb/HUD, command center, local state, mission timeline, approval center, audit logs, runtime health checks, emergency stop, and future support for voice, screen awareness, desktop control, local models, memory, skills, automation, file/browser/document operators, coding/cyber modes, and workspace intelligence.



The current engineering target is Phase 0: Local Lisa Shell.



Read these files before implementing major changes:



\- docs/PRD\_Lisa.md

\- docs/PRD\_Lisa\_Part\_2.md

\- docs/visual\_direction.md



\## Non-Negotiable Product Rules



\- Do not reduce Lisa into a chatbot.

\- Do not build a generic dashboard.

\- Do not ignore the Orb/HUD identity.

\- Do not skip audit logs.

\- Do not skip emergency stop.

\- Do not skip approval center foundations.

\- Do not implement unsafe real desktop mouse/keyboard control yet.

\- Do not claim voice, screen control, vault, browser automation, or local AI routing is complete unless actually implemented.

\- Build safe scaffolding and interfaces for future phases instead of fake dangerous functionality.



\## Phase 0 Scope



Phase 0 must include:



\- Tauri desktop shell.

\- React + TypeScript frontend.

\- Rust/Tauri backend commands.

\- Animated Lisa Orb with state changes.

\- Command center layout.

\- Text command input.

\- Deterministic fast-path command router.

\- Mission model and mission timeline.

\- Approval request model and approval center.

\- Audit/event log.

\- Built-in mode foundation.

\- Runtime health panel.

\- Emergency stop button and command.

\- Local persistence for missions, approvals, audit events, settings, and active mode.

\- Clean architecture that can evolve into future Lisa phases.



\## Visual Direction



Lisa should feel like a living AI presence:



\- glowing neural orb;

\- blue/cyan energy core;

\- animated rings;

\- waveform/listening animation;

\- dark futuristic HUD;

\- polished command center;

\- not a copied JARVIS/TikTok UI;

\- not a plain admin dashboard.



Orb states:



\- idle;

\- listening;

\- thinking;

\- speaking;

\- acting;

\- waiting\_approval;

\- paused;

\- error;

\- emergency\_stopped.



\## Architecture Expectations



Prefer this structure unless there is a better reason:



src/

&#x20; app/

&#x20; components/

&#x20;   orb/

&#x20;   command/

&#x20;   missions/

&#x20;   approvals/

&#x20;   audit/

&#x20;   runtime/

&#x20;   settings/

&#x20;   layout/

&#x20; core/

&#x20;   command-router.ts

&#x20;   mission-store.ts

&#x20;   audit-store.ts

&#x20;   mode-store.ts

&#x20;   persistence.ts

&#x20;   types.ts

&#x20; styles/



src-tauri/

&#x20; src/

&#x20;   commands/

&#x20;   state/

&#x20;   main.rs



docs/

&#x20; PRD\_Lisa.md

&#x20; PRD\_Lisa\_Part\_2.md

&#x20; visual\_direction.md

&#x20; ARCHITECTURE.md

&#x20; PHASE\_0\_IMPLEMENTATION.md

&#x20; ROADMAP.md



\## Engineering Rules



\- Keep logic modular.

\- Do not put all logic inside React components.

\- Use TypeScript types for core models.

\- Keep Rust commands simple and safe in Phase 0.

\- Persist app state locally.

\- Make errors visible and logged.

\- Prefer deterministic handlers for Phase 0 commands.

\- Unknown commands should produce a safe “not implemented yet” response, not crash.

\- Write docs as you build.

\- Run build/check commands before reporting success.



\## Safety Rules



\- No real desktop control in Phase 0.

\- No password vault implementation in Phase 0 unless explicitly requested.

\- No credential storage.

\- No network scanning.

\- No filesystem destructive actions.

\- No background autonomous tasks beyond safe local UI/test missions.

\- Every meaningful action must create an audit event.

\- Emergency stop must always be visible and functional.



\## Required Validation



Before saying the task is complete, run what is available:



\- npm install if needed

\- npm run build

\- npm run typecheck if configured

\- npm run lint if configured

\- cargo check inside src-tauri if present



If something fails because dependencies are missing, explain exactly what failed and what command/output caused it.

