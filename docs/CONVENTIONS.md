# Conventions (PR 11)

How code gets into this repository. `CLAUDE.md` holds the owner's hard rules; this file holds the mechanics.

## Branches and pull requests
- One pull request per register PR (or a small group from the same stage). Title: `PR <number>: <what it does>`;
  a group is written `PR 11, 12, 17: …`.
- Branch name `pr-<number>-<slug>`. **Exception (cloud sessions):** the session's push access is bound to one branch
  (`claude/…`). The PR is opened from that branch, squash-merged, and the branch is reset to `main` for the next PR.
- `main` is always deployable: every merge runs `ci`, and a green `ci` on `main` runs `deploy` to new.extas.com.bd.
- Squash-merge only, after the gates pass (CLAUDE.md rule 9). The owner is never asked to review or merge.
- The PR body follows `.github/pull_request_template.md`.

## Commits
- Message: `PR <number>: <what it does>`, then a short body: what changed and why.
- Never a key, password, token or the owner's own data (CLAUDE.md rules 2 and 4). Secrets live on the server and,
  from PR 493, in the encrypted vault.

## After every PR
1. `docs/MASTER-REGISTER.md` → the **Build status** table: one row per PR with state `merged` (gates passed) or
   `live` (also verified on the server), the date and a short note. Update the **Progress** line above it.
2. `PROGRESS.md` → one line: what was merged, what was verified, what comes next.
3. Anything only the owner can do → `BLOCKED.md` with a short Bengali question.

The status page reads the Build status table and `BLOCKED.md` at build time (`tools/make-status.mjs`), so keep both
tables in their column order.

## Code
- pnpm workspace: apps in `apps/`, shared packages in `packages/`. Node 22, TypeScript strict.
- Every visible text comes from a message file (`apps/web/messages/`), every number or limit from settings
  (PR 491–496); until the settings framework lands, from the environment the server sets. The hardcode guard
  (PR 494) enforces it.
- Before pushing: `pnpm check` (lint, type-check, unit tests) and `pnpm build`. Infra: `shellcheck` and
  `infra/tests/run.sh` (see `.github/workflows/ci.yml` for the exact commands).
