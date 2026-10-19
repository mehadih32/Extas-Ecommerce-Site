# PROGRESS

| When | Where we are |
|---|---|
| 2026-10-20 | **Session 0 done** (from the planning chat): docs, register (604 PRs), V2.1 final blueprint, demo V12, QA tools and agent files are in `docs/`. `CLAUDE.md` and `docs/START-HERE.md` written. **No application code yet.** |
| 2026-10-20 | **S0A · PR 1–10, 601, 604 merged** (12/12): server setup as code — `infra/server/setup.sh` + steps (A2.9.16 order), `infra/stack/compose.yml`, `.github/workflows/server-setup.yml` on `extas-vm`, report committed to `docs/reports/server/`. Verified: shellcheck clean, infra unit tests 22/22, full stack (Postgres/PgBouncer/Redis ×2/Meili/Caddy) healthy in a local Docker run, backup → restore test OK incl. WAL replay, k6 baseline. Owner: runner online and DNS `new` in place (20 Oct 02:32). Stage plan sent (stage/PR form, owner rule 20 Oct). Build order follows Blueprint E3 waves: wave 1 = S00, S01, S09. |
| next | Watch the first `server-setup` run on the VM → fix anything it reports → S00 (PR 11, 12, 17 + deploy.yml + status page first, then PR 13/603 schema, 491–496, 500, 508–510, 14–16, 18). |
