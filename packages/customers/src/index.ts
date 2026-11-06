// @extas/customers — the shop's customers (S14; BACKEND-ARCHITECTURE §5.5; Blueprint B5).
//
// PR 284: the customer model on what S04–S07 built (the shop account, the phone history and risk, the orders, the
// wallet): one record keyed by phone (B5.5), and a person as the profile he stays under plus the profiles merged into
// it (family.ts). The single view of a person by phone — every number, what his orders came to, his lifetime value as
// Sales (delivered only) beside Ordered value from @extas/metrics (CN-022) — and "Who looked at this customer"
// (view.ts, access.ts; Note 24.1). The merge rules (an e-mail, a WhatsApp number, a name with an address, the identity
// graph; the owner's `customers.merge` setting), and merges, "not the same person" and splits by a person only:
// reversible, audited, nothing moved or deleted, no money touched (merge.ts). Phone numbers are masked for anyone
// without `customers.phone` (`customers.phoneMask`). The rules without a database are in `@extas/customers/pure`.
//
// PR 285: the Customers list — one row per person with his orders, Sales beside Ordered value, refusals that were not
// the shop's fault and exchanges; the owner's views (New, Returning, VIP, At risk, Refused before, Exchanged, No offers)
// with their counts, search by name, e-mail or any of his numbers, a source filter and five sorts (list.ts).
//
// PR 286: one customer's page — his orders over every profile and number a page at a time, his exchanges, his support
// history (empty until S22) and "Who looked at this customer" for the owner (profile.ts).
// S18 · PR 382: erasure requests (CUS-07, D9): filed by `customers.privacy`, carried out by the owner alone with a typed
// word, never while an order is on its way; the personal details are anonymised, money and stock stay (erasure.ts).
// PR 287: segments from real behaviour, saved and reusable (segments.ts; the conditions in segment-rules.ts, also in
// `@extas/customers/pure`): counted live over the list's own people (people-sql.ts), the list's views as built-in
// segments, the Customers list narrowed to one (`?segment=`); off as shipped (`customers.segments`).
// PR 288: the journey view (journey.ts) — every touch of a person in order, from what the shop already keeps (profiles,
// visits, touches, orders and how they ended, exchanges, messages, chats, reviews, wallet, consent, merges, notes);
// off as shipped (`customers.journey`), nothing new stored.
// PR 289: automations (journeys.ts, journey-rules.ts) — customer journeys that start on a trigger (days after a delivered
// order, days without an order, days after joining), wait, check and queue offer messages for the Messages engine;
// off as shipped (`customers.journeys`), each journey saved off.
// PR 290: e-mail marketing (email-marketing.ts) — the owner's e-mail templates and e-mail sends to a saved segment, queued
// at the throttle for the Messages engine (offers: his yes, the quiet hours, the weekly cap, the unsubscribe line), with
// each send's delivery log and results; off as shipped (`customers.email`).
// PR 293: the AI campaign writer (campaign-writer.ts) — 2–3 versions of an offer e-mail or SMS in the owner's voice, from
// the caller's AI connection (the practice writer until a key), checked before anyone sees them; off as shipped
// (`ai.enabled` and `customers.aiWriter`); it only fills the form.
// PR 294: who and when to send (send-advice.ts) — the saved segments ranked by recent buyers who can be reached, and
// the busiest order hours and weekday outside the quiet hours, with the numbers; rule-based, off as shipped.
// PR 296: rewards and points (rewards.ts) — points for each delivered order by the owner's own rule, given after the
// exchange window by the jobs worker, and turned into wallet credit by the customer himself at the owner's rate; the
// Loyalty & wallet page's figures. Off as shipped (`customers.points`, every number 0).
// PR 297: tags and internal notes (notes.ts) — "Note or #tag" on a customer's page: a tag put on or taken off (archived,
// never deleted), notes for the team pinned or put away (`customers.notes`); an erasure clears a note's words.
// PR 299: the customer export (export.ts) — the list's people as one CSV file with a reason, under the retention rule
// (never an erased or archived profile, an address or a location; numbers as the person may see them); its own key
// `customers.export`, an ExportJob row and an audit line each time; off as shipped.
// PR 300: win-back campaigns (winback.ts) — Messages › Campaigns: an SMS or WhatsApp from the shop's own template to the
// people who stopped ordering (the owner's rule, a saved segment), shown with its reach and estimated cost, scheduled by
// a person with the send key, queued at the throttle for the Messages engine (offers: his yes, the quiet hours, the
// weekly cap, the gap between win-backs, the stop line), with each campaign's results; off as shipped.
// PR 277: the campaign blast (winback.ts, Broadcast kind `blast`) — the same builder, run and engine for one message to a
// saved segment (or every customer, only when allowed), with no lapse rule and no win-back gap; its own switch
// (`customers.blast`, off as shipped); an e-mail campaign is Messages › E-mail.
// PR 303: the customer report (report.ts) — Reports › Customers: new, returning and quiet (churned) buyers over a period
// and the repeat rate, overall and per saved segment; counts only, `reports.read`; off as shipped (`customers.report`).
// CN-028 · PR 620: the ERP's live customer list (erp-page.ts): one row per person who ordered, with his address, number,
// total spent (Sales), orders and first and last order; the shop never pushes it, the ERP asks when the owner clicks.
// PR 534: customer grading (grades.ts) — the owner's own grades and a verified mark from true deliveries, shown to the
// team, written on each profile by the daily run for Marketing › Audiences; never blocks, never changes COD; off as shipped.
// PR 535: the legacy customer import (legacy-csv.ts, legacy-import.ts) — the old shop's order list previewed, then brought
// in as history only (never an order, nothing sent, nothing here overwritten); an import's undo archives, never deletes.
export * from './access';
export * from './chat-context';
export * from './context';
export * from './erasure';
// S18 · PR 623 — the customer's own privacy request (copy or erasure), filed into PR 382's list
export * from './privacy-requests';
export * from './erp-page';
export * from './export';
export * from './errors';
export * from './family';
export * from './grades';
export * from './journey';
export * from './campaign-writer';
export * from './email-marketing';
export * from './journeys';
export * from './legacy-csv';
export * from './legacy-import';
export * from './list';
export * from './merge';
export * from './notes';
export * from './people-sql';
export * from './profile';
export * from './report';
export * from './rewards';
export * from './pure';
export * from './segments';
export * from './send-advice';
export * from './settings';
export * from './view';
export * from './winback';
