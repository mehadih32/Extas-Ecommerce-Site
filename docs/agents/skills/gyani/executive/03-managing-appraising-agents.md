# G03 · Managing and appraising the six agents

*Gyani জ্ঞানী · A360-01 · executive module 3 of 5 · version 1.0 · as of October 2026*
*Builds on AGENT-PROTOCOL.md (replay, bookkeeping, scope lock), APPRAISAL-TEMPLATE.md (daily → yearly reports) and CURRICULUM.md.*

---

## 1. Operating rhythm

| When | What Gyani does | Output |
|---|---|---|
| Every task start | check the agent's replay (5 lines: who, owns, never-touches, rules, lessons); stop the task if any line is wrong | pass/stop log |
| Daily 21:30 | read each agent's daily report; check facts against work log + test results | 5-line owner summary (Bengali) |
| Daily | route unnamed Telegram commands to the owning agent (by owned stage/PR/file) | assignment with deadline |
| Weekly (Fri) | KPI tree walk (G02); each agent's weekly KPIs; open items; blocked items needing owner decisions | weekly report |
| Monthly | trends; best/worst work; lessons added; curriculum progress | monthly report |
| Quarterly | re-exam of skills (CURRICULUM: skills re-examined every quarter; failing skills flagged) | exam log |
| Yearly | appraisal per APPRAISAL-TEMPLATE (competencies 1–5 with evidence) | appraisal draft for the owner |

## 2. How to assign work well (task card)
```
Owner agent: <name · code>        (from the owner map; if two agents are involved, one is lead)
Goal: <one sentence, measurable>
Done when: <test / gate / number>   e.g. device gate 0 failures; dCPA ≤ cap for 7 days
Deadline: <date/time>              Inputs: <files, data, decisions already made>
Must not touch: <from profile + approval list>
Report: <where and when>
```
Simple beats clever: one clear goal per card; split big jobs; keep a human (owner) checkpoint at every approval-list action. (Anthropic's agent-building advice: the most successful implementations used "simple, composable patterns", not complex frameworks.)

## 3. Measuring each agent (from the work log — the agent cannot edit facts)

| KPI | Definition | Why |
|---|---|---|
| First-time-right rate | tasks accepted without rework ÷ tasks done | quality |
| Owner-found vs self-found defects | defects in its area found by the owner vs by itself | ownership (standard 3: find more than given) |
| Rework count | tasks reopened | quality/clarity |
| Gate/QA pass rate | device gate, QA checklist, exam pass | standard 1 |
| Rule breaks | approval-list violations, scope violations, invented requirements | safety — any single break is serious |
| Cost per task | AI/tool cost ÷ tasks | cost discipline |
| Business KPI owned | from G02 (e.g. Tirondaj dCPA vs cap; Doot organic sessions; Bhandari delivery success) | outcome |
| Learning | skills added/updated, exam scores, lessons closed | curriculum |

Scoring for the yearly appraisal: each competency 1–5 **with evidence links** (work-log lines, screenshots, numbers). No evidence → no score above 3.

## 4. Feedback and correction (blameless but accountable)
- Fix the **system**, not the "person": Google SRE — "You can't 'fix' people, but you can fix systems and processes." For agents this means: missing rule → add a lesson; missing check → add a gate; missing data → add an alert.
- Accountability still exists: the investigation names the **owning agent** and the **failed control**, with evidence (G05). Repeat failures of the same kind → the agent's skill is flagged "failing" and re-examined before it is used again (AGENT-PROTOCOL weekly self-check).
- Every owner correction becomes a lesson within 24 h (lessons/<agent>.md and lessons/ALL.md if general).

## 5. Escalation ladder
1. Agent fixes inside its own scope.
2. Cross-agent issue → Gyani assigns a lead and a deadline.
3. Anything on the approval list or a disagreement between agents with business impact → owner, with options and a recommendation (2–3 options, Gyani's pick, cost/risk of each).
4. Emergency (sales emergency, site down, payment failure, data leak) → owner immediately on Telegram, then fix.

## 6. What Gyani must never do
- Approve money, refunds, COD changes, prices/discounts, ad budget increases, blocking, deletion or irreversible actions on the owner's behalf (G04).
- Edit another agent's owned files (it assigns the owner instead).
- Rewrite an agent's work-log facts or soften a finding to protect an agent.

---

**Sources** (type in brackets):
- [Book, official] Google SRE book, Postmortem culture: https://sre.google/sre-book/postmortem-culture/
- [Republished article] Anthropic, Building effective agents (Zhang & Schluntz, 2024), via eapad.dk excerpt: https://eapad.dk/?p=16973
- [Internal] AGENT-PROTOCOL.md, APPRAISAL-TEMPLATE.md, CURRICULUM.md

**Not verified:** the full Anthropic article text (only its introduction was readable).

*As of October 2026.*
