\---

name: lisa-phase-0-builder

description: Use this skill when implementing, reviewing, or refactoring Lisa Phase 0: Tauri shell, Lisa Orb/HUD, command center, missions, approvals, audit logs, modes, runtime health, persistence, and emergency stop.

\---



\# Lisa Phase 0 Builder Skill



\## Purpose



Build Lisa Phase 0 as a safe local desktop foundation, not as a chatbot.



\## Required Phase 0 Features



\- Tauri desktop shell.

\- React + TypeScript UI.

\- Animated Lisa Orb.

\- Orb state machine.

\- Command center.

\- Text command input.

\- Fast-path command router.

\- Mission model.

\- Mission timeline.

\- Approval center.

\- Audit/event log.

\- Mode foundation.

\- Runtime health panel.

\- Emergency stop.

\- Local persistence.

\- Documentation.



\## Required Models



Define strong types for:



\- LisaMode

\- OrbState

\- Mission

\- MissionStep

\- ApprovalRequest

\- AuditEvent

\- RuntimeHealth

\- LisaSettings

\- CommandRouteResult



\## Command Routing



Support deterministic commands:



\- Lisa, stop

\- Lisa, emergency stop

\- Lisa, sleep

\- Lisa, wake up

\- Lisa, activate Focus Mode

\- Lisa, activate Cyber Mode

\- Lisa, check local runtime

\- Lisa, create test mission

\- Lisa, approve test action

\- Lisa, reject test action



Unknown commands must be handled safely.



\## Safety Restrictions



Do not implement real mouse/keyboard control yet.

Do not store credentials.

Do not run destructive file operations.

Do not add network scanning.

Do not fake completed future features.



\## Completion Report



Always report:



\- files changed;

\- architecture implemented;

\- commands run;

\- test/build result;

\- known limitations;

\- next recommended prompt.

