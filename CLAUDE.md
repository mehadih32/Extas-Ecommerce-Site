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
| `docs/MASTER-REGISTER.md` | All 604 PRs in 28 stages (598 active, 6 parked). **Nothing gets built unless it is in here.** |
| `docs/demo/EXTAS-demo-V12.html` | The approved clickable demo. **It is the UI truth.** The source is in `docs/demo/src/`. |
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
10. **2–3 agents in parallel at most**, each on its own git worktree. Days 1–2 run one agent alone on S0A and S00,
    including the full Prisma schema skeleton. Shared files (Prisma schema, design tokens, routing table) have one
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

## How to report
- After each PR: update `PROGRESS.md` (the English line is fine) and the register status.
- After each stage and wave:
  - Write `docs/reports/YYYY-MM-DD-<stage>.md` **in simple Bengali**: what got built, what passed, what is waiting
    for the owner.
  - Show the same short summary in the chat.
- Wave boundary (A1.1 rule 7): stop and ask in Bengali, "ঢেউ ১ শেষ। ঢেউ ২ শুরু করব?"

## Commits
- Branch per PR: `pr-<number>-<slug>`. Squash-merge into `main` after the gates pass.
- Commit message: `PR <number>: <what it does>`.
