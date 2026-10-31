# CLAUDE.md — EXTAS e-commerce build

Every session in this repository reads this file first, then `docs/START-HERE.md`.

## Who you work for
- The owner runs EXTAS, a Bangladeshi menswear brand. He is **not technical**. He does not read code,
  GitHub or the server. He checks progress by opening the staging site in a browser.
- **Talk to him only in simple everyday Bengali (চলতি ভাষা)**, short and systematic, with no jargon. Screenshot
  labels and captions are in Bengali too.
- He never reviews or merges pull requests. **Do not ask him to.** Ask him only what genuinely needs his decision:
  money, prices, owner data, or something irreversible. Write it in `BLOCKED.md` and keep working on other PRs.

## The single source of truth
| File | What it is |
|---|---|
| `docs/BLUEPRINT.md` | The full specification (V2.1 final, 20 Oct 2026). **Read it from here; it is never re-uploaded.** |
| `docs/MASTER-REGISTER.md` | All 621 PRs in 28 stages (615 active, 6 parked). **Nothing gets built unless it is in here.** |
| `docs/demo/EXTAS-demo-V12.4.html` | The approved clickable demo, **V12.4** (24 Oct: storefront = V12.2; new admin per CN-022 with the redesigned Dashboard, Orders and Products, each with 3 switchable designs A/B/C via Settings → Admin look (CN-025); English default, বাং toggle; framework `docs/demo/ADMIN2-FRAMEWORK.md`; V12.3 and older kept as history). **It is the UI truth.** Section guides for the admin are in `docs/admin-guide/`. The source is in `docs/demo/src/`. Before/after details: `docs/owner/ROUND15.md` Note 51, `docs/qa/QA-REPORT-V12B.md`, `docs/qa/ADMIN-AUDIT.md`. |
| `docs/qa/ECOMMERCE-CHECKLIST.md` | The QA checklist. The gates are in Blueprint Appendix C. |
| `docs/owner/` | The owner's decisions, review notes, server spec and guides. |
| `docs/agents/` | The seven agent profiles, protocol, skills and lessons (`lessons/ALL.md`). Read the lessons. |
| `PROGRESS.md` | The exact stopping point. Update it after every PR. |
| `BLOCKED.md` | Anything that needs the owner, or can't be finished. Each item has a short question in Bengali. |

The operating rules are Blueprint **Part A1** (A1.1–A1.6). The build order is **A2 (S0A) → S00 → the rest by the
E0 stage table**. Where a section has a "V2"/"V2.1" block, that block wins over the older text under it.

## Hard rules (owner's standing instructions)
1. **Nothing hardcoded.** Every name, number, price, policy, text, key or limit comes from settings (PR 491–496).
   The CI hardcode guard (PR 494) fails the build otherwise.
2. **No secrets in Git, ever.** Keys live only in the encrypted vault (PR 493) and are typed in by the owner through
   the admin "Keys & connections" page. Every integration runs on a **mock** until its key arrives (A1.3).
3. **Nothing is deleted.** Removed features become switches, and superseded text is struck through.
4. **The owner's own data never ships to a new installation** (PR 509). The repo holds sample data only.
5. **The phone UI must match the demo.** Desktop has its own layout. Every change runs the phone gate.
6. **Never without the owner's written OK:** moving money, refunds, changing COD, prices or discounts, raising ad
   budgets, blocking anyone, deleting data, or anything irreversible.
7. **Every pause has a tested resume.** Mouse, touch and keyboard each have their own pause flag. Checklist L32/L33,
   lessons file.
8. **Register first.** A new requirement first gets a dated update on an existing PR, or the next free PR number,
   plus a change note CN-### (Blueprint "How changes are made after V2"; `docs/owner/CHANGE-PROCESS.md`).
   Then it gets built.
9. **Quality is ours.** Type checks, tests, the Lighthouse budget, the device gate (0 fails) and the journeys must
   pass before a merge. You create the PR, test it and merge it yourself (A1.1 rule 3).
10. **2–3 agents in parallel at most**, each on its own git worktree. The five-builder exception of CN-029 (PR 607–621) is over. **From 31 Oct 2026 (CN-031): three builders in parallel plus the reviewer `qa-gate`**, in the lanes of `docs/LAUNCH-TRACK.md`. S0A and S00 (including the full Prisma schema skeleton) run with one agent alone
    before parallel work starts. Shared files (Prisma schema, design tokens, routing table) have one
    owner (A1.4).

## Infrastructure facts (CN-001, CN-002, CN-003)
- **Server:** Azure VM E8ds_v6 (8 vCPU, 64 GB), region **Malaysia West, zone 1**, Ubuntu Server 24.04 LTS, Trusted
  launch, NVMe controller.
  - Disks: OS disk 128 GB and a **separate 1 TB data disk**, both Premium SSD. The data disk is still raw.
  - **The 440 GB local NVMe is raw on every boot** (PR 601).
  - The network security group allows inbound 22, 80 and 443. Everything else is denied.
- **How we reach the server (CN-003):** cloud Claude sessions **cannot open SSH (port 22) to the VM**.
  - All server work runs through **GitHub Actions on a self-hosted runner installed on the VM** (label `extas-vm`).
  - The owner installs it once, following `docs/owner/RUNNER-SETUP.md`; the script is `infra/bootstrap/install-runner.sh`.
  - Server setup (S0A) and deploys are workflows in `.github/workflows/`. Read the results from the workflow run
    logs, or from files the workflow commits back.
- **Domains (CN-003):** the old WordPress shop stays live on **extas.com.bd** until go-live day. **Do not touch it.**
  - The build deploys to **new.extas.com.bd**, behind Cloudflare, protected with a password and `noindex`.
  - On go-live day (S19, PR 587) the main domain is switched and every old URL gets a 301 redirect.
  - The domain is a setting, never code.
- **Stack** (A3.1, A2.9): Next.js (App Router) + TypeScript + Prisma + PostgreSQL (PgBouncer), Redis + BullMQ,
  Meilisearch, sharp, Caddy, Docker Compose, Cloudflare in front.
  - Media lives on Azure Blob.
  - Backups go to Azure Blob and Google Drive.

## Run without stopping (owner, 20 Oct 02:33 — CN-006)
- The owner's computer and browser may be off. Everything runs in the cloud and on the VM runner; nothing waits for him.
- **Never stop to ask permission** for building, testing, merging your own PRs, deploying to new.extas.com.bd or
  starting the next stage. Merge yourself once the gates pass.
- Build order (CN-027): finish every PR in `docs/LAUNCH-TRACK.md` → Launch first, then continue the After-launch list automatically.
- **The wave boundary is no longer a stop** (this replaces Blueprint A1.1 rule 7): write the Bengali wave report,
  show it in chat, and **carry straight on** to the next wave.
- Blocked on the owner? Add it to `BLOCKED.md` and move to the next PR. Never sit idle.
- **Resume without the owner and without waste:** on every new or resumed session read `PROGRESS.md` and continue the exact next step. Read only the register rows and blueprint sections that step needs, not whole files. Never ask the owner to restart or re-explain anything.
- **Never idle (owner, 31 Oct 2026, CN-031):** a session never stops between PRs and never waits for the owner. After a PR, the next one starts at once. Before a usage limit hits, write the exact point in `PROGRESS.md` and schedule your own continuation for the reset time, plus a check-in every 30 minutes until Launch is done; a session that finds `PROGRESS.md` untouched for 30 minutes while work is open starts the next PR. Launch first (one run), then the After-launch priority order in `docs/LAUNCH-TRACK.md`.
- **Usage limit reached:** stop cleanly, with `PROGRESS.md` holding the exact point. When the limit resets, continue from
  there by yourself (the project's auto-continue is on).
- The only real stops are the hard-rule items (money, prices, deleting data, anything irreversible) and the go-live
  switch of extas.com.bd. None of these happens during the build.

## How to report
- Any commit touching `docs/MASTER-REGISTER.md`, `docs/BLUEPRINT.md` or `README.md` runs `tools/docs/precommit-docs.sh` first.
- **Keep `README.md` as the live, detailed front page** (owner, 20 Oct; CN-011): after every merged PR, update
  (1) the **status dashboard** (the "Stages" row = the register's Progress line, the 28-stage table, what is live on
  new.extas.com.bd, last deploy, what waits for the owner), (2) the **PR log** row, and (3) the **feature section of
  that area** (screens, routes, settings, permissions, tests; unbuilt areas stay one "Planned" line). Simple English
  with a Bengali summary line per section. The owner reads it on GitHub. A new or moved docs file also gets its line
  in `docs/README.md`.
- **Docs on the server and in backups (CN-011):** every deploy copies `docs/` (with `README.md`, `BLUEPRINT.md`,
  `MASTER-REGISTER.md`) to the server, one way repo → server, for the admin's "PR register" and "Blueprint & files"
  tabs (PR 594; the copy step goes in `deploy.yml` / `infra/deploy/deploy.sh`). Every backup (PR 8 / 395 / 507, Blob
  and Drive) carries a dated docs bundle with the commit hash (`infra/server/bin/extas-backup`). Not built yet: build
  it with those PRs.
- **Organisation standard (CN-011), every PR:** lint and format checks pass, tests beside the code, clear names, a
  header comment on each package's `src/index.ts`, `docs/` kept current, blueprint and register changed only
  through CN notes.
- **Stage and PR pages** (owner, 20 Oct): after every merged PR, add its Bengali one-liner to `docs/stages/bn.json`
  (plain চলতি Bengali, Western digits, from its register row) and run `pnpm docs:stages`; commit `docs/stages/` and
  `README.md` with it. The generator also links the README's stage names, waves and PR numbers; CI fails when they are
  out of date. CN-011's README rule covers the rest.
- **Build the system, never ask for a number** (owner, 23 Oct, CN-018): every amount, percentage, limit or yes/no perk is a backend setting with options, off by default. Ask the owner only whether a system should exist.
- **Approved architecture** (CN-022): `docs/BACKEND-ARCHITECTURE.md` controls the admin and the backend design. Build every admin page and backend module to it.
- **Simple admin** (CN-018): follow `docs/ADMIN-ARCHITECTURE.md`, with about 10 sections, settings inside their section, rare options under "More options" and one search box. Never build a wall of switches.
- **Owner data is not a blocker** (owner, 20 Oct 12:11): delivery charges, free-delivery limit, courier rates, photos, prices, area lists and similar values are entered by the owner in the backend later. Ship empty/off defaults and never list them in `BLOCKED.md` as questions.
- **Plans and progress are counted in stages and PRs, never in days or hours** (owner's rule, 20 Oct): "S0A: 7/12 PR · S00: 3/19 PR · total 10/600". 621 PRs in 28 stages (615 active, 6 parked).
- After each PR: update `PROGRESS.md` (the English line is fine) and the register status.
- After each stage and wave:
  - Write `docs/reports/YYYY-MM-DD-<stage>.md` **in simple Bengali**: what got built, what passed, what is waiting
    for the owner.
  - Show the same short summary in the chat.
- Wave boundary: report in Bengali and continue. Don't wait (CN-006).

## Nothing reaches the owner broken (owner, 20 Oct 14:24 — CN-016)
- **Done means it works on new.extas.com.bd in a real browser,** not only that the tests pass on the branch.
- **After every deploy** the runner runs a smoke test with Playwright against new.extas.com.bd. It signs in with a dedicated check account whose password exists only on the server, then opens every built storefront page and every built admin page, including the pages right after login. A page passes only when it loads, has no error screen and no console error, and returns no failed request. Screenshots go to `docs/reports/smoke/latest/`.
- **If any page fails,** the deploy rolls back to the last good version by itself, and fixing it comes before any new PR.
- The same smoke test runs every night. Its result sits on the status page and in README.
- **Right the first time:** before calling anything done, check it yourself on staging in a real browser, at phone and desktop widths, as a customer and as admin. One build plus one check, never many rounds of rework. Rework burns the owner's money.
- **Scope added to an already merged PR** (a dated "Updated …" line or a CN note) becomes a follow-up PR. List each one under "Follow-ups" in `PROGRESS.md` and build them early, before new stages, so nothing filed is forgotten.
- The owner should never be the one who finds a broken page. If he finds one, add a smoke check for it in the same fix PR.

## Admin section guide (owner, 20 Oct 14:10 — CN-014)
- `docs/admin-guide/` has one Bengali file per admin section, plus `README.md` as the index. Each file covers: what the section is for, every menu and tab, what can be done, every switch and number with its default, and what happens next. Every PR that adds or changes an admin screen updates its guide in the same PR. Each admin section links to its guide.
- **Per page, not per section (CN-026):** every admin page and sub-page has its own guide (What · Why · How · every button/field · common mistakes · what happens next); the guide button opens the current page's guide; "?" hints on complex fields; clean formatting; the page-aware AI helper explains, walks through ("Show me"), shows marked screenshots and takes commands through the approval queue. CI fails when a page has no guide or a visible label is unexplained.
- New optional features: off by default, an on/off switch, every number editable, placed in the section where they belong.

## Think beyond the ask (owner, 20 Oct 13:52 — CN-013)
- Goal for every PR: the customer journey is **easy, smart and profitable**, better than an ordinary shop, and still right 2–3 years from now.
- Every finding gets: the fix, prevention (test/guard/setting), a review of the core decision, and growth ideas. Don't stop at the owner's list; add what is missing. Money, prices, COD or blocking ideas go to the owner as proposals.
- The real-life journey simulation (`docs/qa/SIMULATION-PLAN.md`) is a go-live gate: it runs again on new.extas.com.bd before real orders.

## Commits
- Branch per PR: `pr-<number>-<slug>`. ~~Squash-merge into `main` after the gates pass.~~
- **One register PR = one commit** (owner's audit, 20 Oct): a GitHub PR may carry several register PRs, but each one
  is exactly one commit, and the PR is **rebase-merged** so main keeps one commit per register PR. CI checks it
  (`tools/check-commits.mjs`).
- Commit message: `PR <number>: <what it does>` (one number). Owner change notes: `CN-###: …`. README, PROGRESS,
  BLOCKED and report-only commits: `Status: …`.
- **README.md is updated in every PR** (status table: stage counts, what is live, last deploy, what waits for the owner).
