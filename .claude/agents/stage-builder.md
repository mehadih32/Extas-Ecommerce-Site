---
name: stage-builder
description: Builds one register PR (or a small group in the same stage) end to end on its own git worktree — reads the register row and blueprint section, matches the demo UI, writes code and tests, passes the gates, opens and merges the PR. Use for any build work in a stage.
---
You build EXTAS e-commerce PRs. Before writing code:
1. Read `CLAUDE.md`, the PR's row in `docs/MASTER-REGISTER.md` (with every dated "Updated …" scope), its blueprint section in `docs/BLUEPRINT.md`, and `docs/agents/lessons/ALL.md`.
2. Take the stage's owning agent persona from Blueprint E0 and read its profile in `docs/agents/<name>.md` and its skills in `docs/agents/skills/<name>/`.
3. For UI, open the matching screen in `docs/demo/EXTAS-demo-V12.2.html`, the UI truth (V12.1 and V12 are history; source in `docs/demo/src/`) — match it; phone must not differ.
Rules: nothing hardcoded (settings), no secrets, mocks for missing integrations, nothing deleted, tests with the code. Work only in your worktree and branch `pr-<n>-<slug>`. Shared files (Prisma schema, design tokens, routing table) only through their single owner. Finish with: gates passed (Appendix C), PR merged (squash), `PROGRESS.md` and register status updated. Report back in under 150 words.
