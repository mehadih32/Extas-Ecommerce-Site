# Review decision log: EXTAS backend architecture draft, revision 2 (23 Oct 2026)

## 1. Revision summary

The third-party notes were checked one by one against the draft, the repository (`main` at `80e6c1e`, after `git
pull`), `docs/ADMIN-ARCHITECTURE.md`, CN-012 to CN-021, the ERP contract and the three admin pictures. The draft
(`EXTAS-BACKEND-ARCHITECTURE-DRAFT.md`, now 3,533 lines; previous copy `draft-v2-before-review.md`) keeps all
correct v1 material and its section numbers. The main changes:

- The owner's 23 Oct decisions D1–D5 are now applied through the body. v1.1 had recorded them in §16.0 only, and the
  body still said "re-book" (ORD-07, §6.4, F-004), "conflict C1" and "MNY-05 Later".
- New sections: four separate status dimensions (§6.5.0); cancel and replace after booking (§6.5.7); a per-sync table
  plus stale/missing price rules (§7.9); a worker dependency table (§9.4); a permissions matrix (§9.10); a metric table
  (§10.2); four separate decision lists and scope classes (§16); a design review with verified counts (§19); a
  proposed usability test (§19.8); a risk register (§20); a revision history (§21).
- Release marks are now Gate / Plan / Deferred / Parked. AI agents, full ads control and the studio are **Plan**: in
  scope, built in the current plan, not a go-live gate. Owner question Q1 asks whether any must be live before the
  first real order.
- New findings: the dashboard picture labels sales "Delivered and booked" and shows "profit today" (C18); the section
  count is 13, 14 or 15 depending on the source, and three sections have more than 6 tabs (C20); v1 wrongly proposed
  `ReturnItem.qcResult`, but `qcStatus` already exists; Blueprint E3 puts S17 in wave 8 and S24/S25 in wave 7 (C19);
  D1–D5 are not yet in the register (C21).

## 2. Decision log

| # | Reviewer item | Disposition | Reason and evidence |
|---|---|---|---|
| 1 | Check the owner decisions against the controlling documents | Adopted | Conflicts flagged, not edited: C17 (contract and blueprint QC values vs D4), C19 (E3 waves), C21 (D1–D5 not in the register) |
| 2 | 1A ERP owns price and cost | Adapted | D1 was in §16.0 only. Now in §6.1–6.2, PRD-01/02 and §7.9 A, with freshness and stale/missing rules ("never zero"). The mirror is not built (G3); the endpoint exists but its fields are parsed and not applied (`http-client.ts`) |
| 3 | 1A reading of D1 for sale, coupon and combo prices | Owner clarification needed | Q2. Without it, the editing rules for `catalogue.prices` are ambiguous |
| 4 | 1B Month-end expense push | Adopted | Required workflow (D2). MNY-05 is Plan but must be live before the first month end. The missing endpoint is a technical gap (G4), not an open business decision. `MonthClose` and `RetailExpense.erpPushId` are schema-only |
| 5 | 1C "Sales" = delivered only | Adopted | §10.2 M1–M4; DSH-01 corrected; picture conflict C18 |
| 6 | 1D Returns: inspect, sellable to the ERP, unsellable as a loss | Adopted | §6.5.4: dispositions, ERP-confirmed restock, retries, duplicate lock, audit, tests needed (none run) |
| 7 | 1D Does the loss go in the month-end push? | Owner clarification needed | Q3. Neither D2 nor D4 says |
| 8 | 1E Change after booking = cancel plus new order | Adopted | §6.5.7: reasons, courier confirmation, replacement link, booking block, messages, audit. Removed the re-book text from ORD-07, §6.4, §6.5.1, F-004 and DLV-02 |
| 9 | 1F AI, ads, studio: scope vs first launch | Adapted | Class Plan (built in this plan, not a gate); dependencies, security, cost limits and acceptance in §16.5; sequence unchanged |
| 10 | 1F Which of them must be a gate | Owner clarification needed | Q1. Recommended: follow right after go-live, because the gates are the money path, the courier, returns and backups |
| 11 | 1G Deferred scope and sequence | Adapted | Only S17 is deferred (plus parked S26/S27). v1's roadmap had moved S24/S25 after go-live; they are now back in E3 wave order. Register untouched |
| 12 | 2 Status dimensions and lifecycle | Adopted | §6.5.0 (order, courier, payment, return/refund, mapping rules) and §11 rows 29–32 |
| 13 | 2 ERP sync detail | Adopted | §7.9: trigger, payload, confirmation, retries, dedupe, visibility, staff action, reconciliation, status label |
| 14 | 2 Financial metric definitions | Adopted | §10.2: 14 metrics plus rates, each with definition, source, basis, exclusions and status |
| 15 | 2 Financial edge cases (exchange legs, wallet credit, prepaid reward, cost snapshot, late refunds) | Owner clarification needed | Q4–Q8. v1's defaults for these were withdrawn and are shown on separate lines until answered (§10.5) |
| 16 | 2 Background jobs and reliability | Already addressed | v1 §9.4 (job catalogue) and §11 (failure table) cover it; re-checked that `bullmq` is still absent. A short consequence table was added |
| 17 | 2 Permissions and audit | Adopted | §9.10: verified keys (36, `catalogue.ts`) vs proposed keys. Default roles are now labelled proposals (only the owner role is seeded) |
| 18 | 3 Sitemap review | Adopted | §19.1: Keep with improvements (month-end tab, one ERP sync view, return-case timeline) |
| 19 | 3 Shell review | Adopted | §19.2: Keep with improvements (hide Ask AI while AI is off, breadcrumbs, contrast check) |
| 20 | 3 Dashboard review | Adopted | §19.3: Keep with improvements. The KPI cards conflict with D3 and with each other (average order ৳1,298 = sales ÷ placed orders) |
| 21 | 3 Page-level workflows | Adopted | §19.4: step counts from the specs. Verdict: Insufficient visual evidence |
| 22 | 3 Role-specific landing views | Adapted | Proposed as R3 (needs approval), not built into the design: role start pages, §19.5 |
| 23 | 3 Mobile use | Adopted | §19.6: built pages verified by the device gate; unbuilt pages are an assumption |
| 24 | 3 Check the 14-section and 161-page counts | Adopted | 161 confirmed by recount; 133 Gate · 26 Plan · 1 Deferred · 1 Parked; the section count differs by source (C20) |
| 25 | 3 Usability test | Adopted | §19.8: tasks T1–T9, labelled proposed, not done |
| 26 | 4 Status labels | Adapted | Mapped onto the existing codes; added SO, PROP and NV (§2.5) |
| 27 | 4 Evidence references | Already addressed | Paths in §2 and §17; refreshed to `80e6c1e` (§2.6) |
| 28 | 4 Keep the four categories apart | Adopted | §16.0 resolved · §16.2 open business · §16.3 technical gaps · §16.4 recommendations |
| 29 | 5 Suggested structure | Adapted | Existing numbering kept so references stay valid; a topic map in the header; §19–21 added |

**Counts: Adopted 17 · Adapted 6 · Already addressed 2 · Owner clarification needed 4 · Not applicable 0 (29 items).**

## 3. Unresolved owner questions (yes/no; recommended answer in brackets)

- Q1: Must any of the AI agents, full ads control or the studio be live before the first real order? [No: follow right after]
- Q2: Do sale prices, coupons and combo prices stay shop rules, with the base price and cost coming from the ERP? [Yes]
- Q3: Does the unsellable-return loss go in the month-end push as a cost, with no change to ERP stock? [Yes]
- Q4: Is product cost taken at placement? [Yes]
- Q5: Does a refund made after a closed month show in the next open month? [Yes]
- Q6: Is the exchange pickup and re-delivery courier cost its own line inside Contribution, not part of RTO? [Yes]
- Q7: Is a goodwill or apology wallet credit a cost on the day it is given? [Yes]
- Q8: Is the prepaid reward a discount on the order? [Yes]
- Still open from v1: D7 partial delivery counts as success [Yes] · D9 anonymise, never delete [Yes] · D11 hand refund approval to the Manager [No] · D12 only the owner and Accounts record payments made outside checkout [Yes]

## 4. Technical gaps and missing evidence

- **Gaps (§16.3):**
  - No worker or scheduler (G1).
  - No webhook receiver (G2).
  - The ERP price/cost mirror is not built (G3).
  - The contract has no month-end expense endpoint (G4); refunds, bank/cash and "received as" are missing (G5); there is no packing-damage call (G6); what the ERP's answer to a return means is not written (G7).
  - The real ERP has not been verified from this repo; it is reported LIVE only (G8).
  - Four unique constraints are missing (G9).
  - There is no order, payment, courier or return code (G10).
  - There are no replacement-link or disposition fields (G11).
  - The audit log is append-only by convention only (G12).
  - Observability is missing (G13).
  - Offsite backups are waiting for the owner's keys (G14).
  - New modules' permission keys are not added yet (G21).
- **Evidence missing:**
  - Pictures of 158 of 161 admin pages, and any phone picture (G20).
  - No running app was used, and test counts were not recounted at `80e6c1e`.
  - The ERP repository and `cn005-readiness.md`.
  - Vault key custody (G15); export audit (G16); courier capabilities (G17); payment gateways (G18); Bangladesh legal rules (G19).
  - The storefront demo was not opened.

## 5. Confirmation

No code, database, schema, migration, API, test, CI/CD workflow, deployment configuration, production data, Main
Blueprint (`docs/BLUEPRINT.md`) or Master Register (`docs/MASTER-REGISTER.md`) was changed. The only git action was
`git pull` on `/home/claude/extas-ecommerce-site`, which was already up to date at `80e6c1e`. Nothing was committed or
pushed. The only files written are in the session scratchpad: the revised draft, its pre-revision copy
(`draft-v2-before-review.md`), this log, and the working text fragments and edit script under `scratchpad/rev2/`.
