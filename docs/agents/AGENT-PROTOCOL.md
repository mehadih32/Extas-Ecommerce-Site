# How the seven agents keep their skills and never forget their duties (PR 577 + PR 321–323)

Plain idea: an AI agent forgets everything when a task ends. So the memory is not inside the agent — it is a
**library** the agent must read before it works and must write to when it finishes. Same library on this
blueprint now, and in the live dashboard's AI section later (Skill Library PR 321, sandbox PR 322,
continuous training PR 323, profiles PR 577).

## The library (one folder per agent)

```
agents/
  <name>.md                 profile: role, owned stages/PRs/files, never-touches, plan, performance
  skills/<name>/<skill>.md  one file per skill: when to use it, the steps, the rules, examples, version
  lessons/<name>.md         every correction the owner ever made in its area, turned into a rule
  worklog/<name>.log        one line per task: date · task · PRs · files · test result · cost
  STANDARDS (in MASTER-REGISTER "What every one of them is held to")
```

## Before every task — "replay" (compulsory, automatic)

1. The task runner gives the agent: its profile, the standards, the skills tagged for this kind of task,
   its last 20 work-log lines, its lessons file, and the open items it owns.
2. The agent writes back, in five lines: who it is, what it owns, what it must never touch, which rules
   apply to this task, which earlier lessons apply. If any line is wrong or missing, the runner stops the
   task (it has not "remembered" properly) and reloads.
3. Only then does it start.

## While working

- Edits only the files/sections it owns; asks the owner of any other file.
- Measures before claiming (device gate, QA checklist), never guesses a requirement (BLOCKED.md).

## After every task — automatic bookkeeping

1. The runner appends the work-log line itself (task, PRs, files changed, gate result, time, cost) —
   the agent cannot skip or edit it.
2. Anything new the agent learned (or any owner correction) is written as a **proposed skill / lesson**.
3. The proposal runs in the **sandbox** on real data (PR 322). If it passes, it waits for the owner's tap
   (or the lead's, for small wording) — nothing becomes a skill without approval (PR 420 gate).
4. Approved → new version in the library; the old version kept for one-tap rollback (PR 321).

## Safety — so it can never harm the shop

- Scope lock: an agent can only touch its own sections; money, stock, prices, customer data and anything
  live need the owner's approval.
- Spend cap per agent per month (PR 309), AI master switch (PR 305), the whole site works with AI off (PR 506).
- Every action logged; the library is in the nightly encrypted Google Drive backup (PR 395/507).
- A weekly self-check: each agent re-runs its skills' tests; a skill that starts failing is flagged, not used.

## Performance (what the owner sees on each profile)

First-time-right rate · bugs it found itself vs bugs the owner found · rework count · tasks done · cost per
task · last gate/QA result · skills learned this month.

## Strong memory (PR 582)
Each agent has a long-term memory store in the system, separate from the skill library:
- **What goes in:** owner instructions and corrections (verbatim, dated), decisions and their reasons, every task and its outcome, campaigns and results, mistakes and the lesson, facts about the shop (suppliers, seasons, best sellers).
- **How it is used:** before every task the agent searches its memory for the task's subject and reads the top matches as part of the replay; the owner's corrections always load. Nothing is forgotten because a chat ended — memory is in the database, not in the model.
- **Shared vs own:** owner rules and shop facts are shared by all seven; each agent's work memory is its own; the chief (Gyani) can read everyone's.
- **Upkeep:** weekly the agent condenses old entries into lessons; nothing the owner said is ever deleted except on his request. The owner can view, edit or delete any entry from the profile.

## Chain of command and Telegram (PR 583–584)
- Owner → **Gyani A360-01 (chief)** → Prohori A360-02, Bhandari A360-03, Sawdagor A360-04, Shilpi A360-05, Doot A360-06, Tirondaj A360-07.
- Every Telegram message starts with the sender's identity line (emoji, name, Bengali name, code, role).
- A command naming an agent or code is assigned to that agent automatically; unnamed → Gyani routes it.
- The approval list (money, refunds, COD changes, prices, ad budget increases, blocking, deletion, irreversible actions) is enforced by code for every agent including the chief.
