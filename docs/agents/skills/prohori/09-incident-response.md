# R09 · Incident response and postmortems

*Prohori প্রহরী · A360-02 · module 9 of 11 · level: Post-graduate → PhD · version 1.0 · as of October 2026*

---

## 1. Frameworks we align to

- **NIST SP 800-61 Rev. 3** (finalised April 2025) replaces Rev. 2 and frames incident response inside cybersecurity risk management as a **CSF 2.0 Community Profile**; all six CSF functions — **Govern, Identify, Protect, Detect, Respond, Recover** — play a role **[OFFICIAL — NIST CSRC news]**.
- **Google SRE, Postmortem Culture:** define postmortem **triggers in advance**; postmortems are **blameless** ("you can't fix people, but you can fix systems and processes"); contain impact, actions taken, root cause(s), follow-up actions; they're **reviewed** — "an unreviewed postmortem might as well never have existed" **[OFFICIAL — sre.google]**.

## 2. EXTAS severity [HOUSE]

| Sev | Definition | Examples | Who is told |
|---|---|---|---|
| **S1** | customers can't order, money wrong, or data exposed | site down; checkout 5xx; orders marked paid without payment; customer data leak; admin takeover | owner immediately (Telegram + SMS), Gyani, Prohori |
| **S2** | major feature broken or degraded, workaround exists | courier booking failing (manual booking works); bKash down (COD works); p95 > 3 s | Gyani, Prohori, owner digest within 1 h |
| **S3** | minor/cosmetic, few customers | one page layout bug on one phone size | normal backlog |

## 3. The response loop [HOUSE, structured on CSF Detect → Respond → Recover]

```
DETECT     alert / owner report / agent finds it
   ↓  open incident (ID, sev, start time) in the admin + Telegram thread
TRIAGE     who is affected? money? data? → set sev; name ONE incident lead (Prohori by default; Gyani coordinates)
   ↓
MITIGATE   stop the bleeding first: rollback deploy · switch feature off · maintenance page · disable a payment method
           (anything on the approval list → owner taps approve; S1 safety actions pre-approved: rollback, feature off)
   ↓
COMMUNICATE every 30 min in the thread (S1): what we know, what we're doing, next update time — simple Bengali
   ↓
RECOVER    verify with real checks (smoke test, test order, payments reconcile); declare resolved
   ↓
POSTMORTEM within 48 h (S1/S2) — blameless; reviewed by Gyani; owner reads the Bengali summary
```

Security incidents add [HOUSE, from OWASP R05 leak order + NIST framing]: **preserve evidence** (logs, disk snapshot) before wiping; revoke and rotate exposed secrets; check what data left; **legal/notification questions go to the owner** (Bangladesh data-protection rules are an owner/lawyer matter — not decided by agents).

## 4. Postmortem triggers [OFFICIAL list from SRE, HOUSE thresholds]
- customer-visible downtime > 5 min or checkout errors > 2% for 10 min
- any data loss or exposure
- any rollback or manual emergency action
- resolution time > 2 h
- **monitoring failed** — the owner found it before an alert did
- the owner asks for one

## 5. Postmortem template (stored in the incident log; Bengali summary on top)

```
Title · ID · Sev · Date · Duration · Lead · Reviewer
সারাংশ (owner, 3 lines, চলতি বাংলা): কী হয়েছিল, কতজন কাস্টমার/কত টাকা, এখন কী অবস্থা
Impact: orders lost/delayed, revenue at risk, customers contacted, data affected
Timeline (BDT): detection → mitigation → resolution
Root cause(s) and contributing causes (systems and process, no names to blame)
What went well / what went badly / where we got lucky
Action items: owner-agent, due date, type (prevent | detect | mitigate), linked PR
Lessons → proposed skill/lesson entries (AGENT-PROTOCOL sandbox + approval)
```

## 6. Runbooks to keep ready (one page each)
Site down · Checkout 5xx · Payment gateway down · Courier API down · Disk full · Certificate expired · DB restore (R04) · Secret leaked (R05) · Admin account compromised · Bad deploy (R03 rollback) · Telegram down (SMS fallback).

## 7. Worked example — Eid-eve checkout outage (tabletop drill)
21:40 P1 "checkout 5xx 18%". Lead: Prohori. Triage: deploy at 21:20 changed delivery-charge code; COD orders fail when band = SUB_AREA. Mitigate 21:46: rollback (pre-approved). 21:52 errors 0%. Communicate: owner thread updates at 21:45/22:15. Recover: test orders in all three bands; 23 failed attempts found in logs → Doot sends an apology + link via WhatsApp (owner approves message). Postmortem: root cause = no test for SUB_AREA band; contributing = deploy during peak (calendar block missing). Actions: band test matrix in R10 (Prohori, 2 days), deploy freeze window on campaign days (Gyani, 1 day), alert threshold lowered to 2% (Prohori, done).

---

**Sources** (type in brackets):
- [Official — NIST CSRC] NIST revises SP 800-61 (Rev. 3, April 2025): https://csrc.nist.gov/News/2025/nist-revises-sp-800-61
- [Official — Google SRE book] Chapter 15, Postmortem Culture: Learning from Failure: https://sre.google/sre-book/postmortem-culture/
- [Official — OWASP] Secrets Management Cheat Sheet (leak response order): https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- [Internal] AGENT-PROTOCOL.md (approval list, chain of command), master register PR 423

**Could not read:** Google's Incident Management Guide PDF (redirect not permitted) — role names like "incident commander" are therefore not quoted from it.

*As of October 2026.*
