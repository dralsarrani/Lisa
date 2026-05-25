\# ECC Usage for Lisa



Lisa uses ECC as a Claude Code discipline layer, not as a replacement for Lisa's own PRD or architecture.



\## Priority Order



When working on Lisa, follow this order:



1\. User's current instruction.

2\. Lisa safety rules and project PRD.

3\. CLAUDE.md.

4\. Local Lisa skills in .claude/skills/.

5\. ECC rules and workflows.

6\. General coding best practices.



If ECC conflicts with Lisa's PRD or safety model, Lisa's PRD wins.



\## ECC Usage Policy



Use ECC for:



\- planning implementation steps;

\- code review;

\- build-fix workflows;

\- TypeScript quality;

\- Rust/Tauri quality;

\- security review;

\- verification loops;

\- documentation updates;

\- avoiding shallow implementation.



Do not use ECC to:



\- override Lisa's safety boundaries;

\- implement real desktop control before approved phase;

\- add credential storage early;

\- add network scanning early;

\- bypass approval gates;

\- install unnecessary hooks globally;

\- duplicate skills/rules already present.



\## Lisa Validation Gate



Before reporting success on Lisa changes, run:



\- npm run build

\- npm run lint

\- npm run typecheck

\- cargo check inside src-tauri



For UI changes, manually verify Lisa opens with:



\- npm run tauri dev



\## Lisa Phase Discipline



Current baseline:



\- phase-0-green is complete and pushed.

\- Next recommended task is Phase 0 hardening and polish.

\- Do not jump to Phase 1 voice/runtime until Phase 0 hardening is approved.

