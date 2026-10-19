# START HERE — how every session runs

## Every session, in this order
1. Read `CLAUDE.md`, `PROGRESS.md` and `BLOCKED.md`.
2. If `PROGRESS.md` shows work in progress, **continue from the exact stopping point** (A1.1 rule 5). Don't restart.
3. Otherwise take the next PR in build order (below). Read its row in `docs/MASTER-REGISTER.md`, including every dated
   "Updated …" scope, and its section in `docs/BLUEPRINT.md`. For any UI, open the matching screen in
   `docs/demo/EXTAS-demo-V12.html`.
4. Build it, test it, pass the gates, merge, deploy, then update `PROGRESS.md` and the register status.
5. Never sit idle waiting for the owner. Blocked items go into `BLOCKED.md` and you move on.

## Build order
Blueprint E0 stage table and A1.4. **S0A → S00 → S01 → S02 → S03 → S04 → S05 → S07 → S08 → S09 → S06 → S10 …**
Wave 1 is the shop that can go live: about 80 PRs.
- At the wave boundary, report in Bengali and **continue without waiting** (CN-006, replaces A1.1 rule 7).
- S26 and S27 are parked. Don't build them.

## The first session (session 1): what to do
The repository already holds the docs. Session 0 (repo setup) was done from the planning chat on 20 Oct 2026. Now:

1. **Plan, short.** Read Blueprint A1, A2, A2.9 (the server spec), E0, Appendix C (QA gates), and
   `docs/agents/lessons/ALL.md`.
   - Then show the owner a **short Bengali plan by stage and PR, never by days or time** (owner's rule, 20 Oct): which
     stages come first (S0A → S00 → S01 …), how many PRs each has, and what he will see on new.extas.com.bd after each.
   - Then **start straight away**; he does not need to approve it.
2. **S0A as code (PR 1–10, 601, 604).** Write the server setup as scripts under `infra/` and workflows under
   `.github/workflows/`, running on `runs-on: [self-hosted, extas-vm]`:
   - `server-setup.yml`: idempotent; re-running is safe. Covers:
     - hardening, UFW, fail2ban
     - data disk: LVM on the 1 TB disk
     - NVMe boot unit (601)
     - Docker
     - auto profile (604)
     - Postgres, PgBouncer, Redis, Meilisearch
     - Caddy
     - backups and monitoring hooks
   - `deploy.yml`: on push to `main`, build and deploy with zero downtime to **new.extas.com.bd**, with automatic
     rollback.
   - The workflows commit a short machine report back to `docs/reports/server/`, so later sessions can read the state
     without SSH.
3. **Is the runner online?** If the `extas-vm` runner has not picked up a job yet:
   - Put one Bengali item at the top of `BLOCKED.md`: "সার্ভারে GitHub রানার বসানো বাকি — `docs/owner/RUNNER-SETUP.md` দেখে ৫ মিনিটের কাজ".
   - Tell the owner the same in chat.
   - **Continue with S00 meanwhile.**
4. **S00 (PR 11–18, 491–496, 500, 508–510, 603).**
   - Next.js + TypeScript skeleton, pnpm.
   - CI on GitHub-hosted runners at first; move heavy jobs to `extas-vm` once it is online.
   - **The complete Prisma schema skeleton for every stage**, with `storeId` everywhere.
   - Settings framework and two-tier resolver, credential vault, hardcode guard, role builder, integrations screen.
   - DB index pack (603).
5. **A status page on new.extas.com.bd** (password protected, `noindex`) from the very first deploy. It shows in
   Bengali:
   - which stages and PRs are done, read from the register status;
   - the last deploy time;
   - what is waiting for the owner.

   This is how the owner follows progress.
   - The staging password is generated on the server and **never committed**.
   - ~~Tell it to the owner once in chat. It only protects a preview.~~
   - **Updated 20 Oct 2026 (CN-007):** never in chat, a log or an artifact. The owner reads it on the VM himself
     (Azure portal → Run command → `/usr/local/sbin/extas-preview-login`), steps in `docs/owner/PREVIEW-LOGIN.md`.
6. **Cloudflare.** The owner adds an A record `new` → the VM's public IP, proxied (orange cloud).
   - If HTTPS fails because of the Cloudflare SSL mode, write the exact Bengali click-steps for the owner in
     `BLOCKED.md`.
   - Later, the owner enters a Cloudflare API token in the admin "Keys & connections" page (PR 493/500), for cache
     purge (PR 602) and settings.

## The gates before every merge (Blueprint Appendix C)
- Type check, unit tests and build all pass. The hardcode guard passes.
- UI PRs:
  - **device gate 0 fails** on phones, tablets and desktop;
  - phone pixel diff against `main` shows 0 unintended changes;
  - the timing checks pass (L32/L33);
  - the Lighthouse budget passes.
- The QA tools from the demo phase are in `docs/qa/tools/` and `docs/qa/device-matrix.js`. Port them to the real app
  as Playwright tests.

## Speed targets (A2.9.11): not met = not finished
LCP < 2.5 s, CLS < 0.1, INP < 200 ms, TTFB < 600 ms, category page < 1 MB, admin page < 1 s. Measured as a phone
on 4G in Dhaka.

## Go-live gate (A1.1 V2/V2.1 blocks; A2.9.16)
Real orders start only when all of these are live and tested:
- the Google Drive and Azure Blob backups, plus the first restore test;
- Telegram alerts;
- every server item.

The main domain switch happens only on the owner's explicit go-ahead.
