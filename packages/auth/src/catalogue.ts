// PR 16, 495 — the permission catalogue. Every action the admin can take is checked on the server against one of
// these keys (B6.5: "permission checks on every action, not only on the page"). The catalogue is code, because code
// does the checking; roles are data: the owner builds them in the role builder from these permissions. The `owner`
// role is seeded and always holds every permission in this list, including ones added later.
//
// Adding a permission = one line here + its labels in messages/auth.<lang>.json. The deploy's `auth sync` writes it to
// the Permission table and grants it to the owner role. A key removed from here stays in the table (nothing is
// deleted) but can no longer be granted or checked.
//
// Each later PR adds the keys of its own screens (orders, catalogue, customers, refunds …) when it builds them.
export const PERMISSIONS = {
  'settings.read': { group: 'settings' },
  'settings.write': { group: 'settings' },
  'vault.read': { group: 'settings' },
  'vault.write': { group: 'settings' },
  'roles.read': { group: 'staff' },
  'roles.manage': { group: 'staff' },
  'staff.read': { group: 'staff' },
  'staff.manage': { group: 'staff' },
  'audit.read': { group: 'security' },
  'security.read': { group: 'security' },
  // S18 · PR 380 — SET-04d Sign-in & security: change the sign-in rules, the admin address list, the page protection,
  // the request limits and the quiet bot check (`security.read` opens the page).
  'security.write': { group: 'security' },
  // PR 12 (CN-022) — the admin shell: open the Dashboard (the "Needs you now" queues of the sections the person can
  // see), see the money tiles (Sales and Ordered value, from @extas/metrics) and open the admin guides.
  'dashboard.read': { group: 'admin' },
  'metrics.read': { group: 'admin' },
  'help.read': { group: 'admin' },
  // PR 22, 25, 37 — the media library: see it; upload, describe and place photos; archive, restore and clean up.
  'media.read': { group: 'media' },
  'media.upload': { group: 'media' },
  'media.manage': { group: 'media' },
  // S01 · PR 19, 20, 30, 31, 590 — the catalogue: products, variants, colours, sizes, categories, garment types,
  // fabrics, brands, names and links. Publishing and bulk actions (PR 21) add their own keys.
  'catalogue.read': { group: 'catalogue' },
  'catalogue.write': { group: 'catalogue' },
  // Prices are the owner's decision (CLAUDE.md rule 6): setting a variant's sale or compare-at price is its own key.
  'catalogue.prices': { group: 'catalogue' },
  // S02 · PR 59 — Find My Size learning: train a version from the recorded answers and switch one on or off. It only
  // ever proposes an ease for a garment type and fit; a size chart is the owner's and is never changed by it.
  'catalogue.sizeAdvice': { group: 'catalogue' },
  // S02 · PR 65 — product reviews: see every review with its moderation state (`reviews.read`); approve, hide, reject
  // or mark a review verified (`reviews.moderate`); write or import a review the shop itself collected
  // (`reviews.write`, D3.16). Paying the photo-review reward is part of approving, and only while the owner has
  // switched that perk on with his own amount (`reviews.photoReward`); nobody can move money with another key.
  'reviews.read': { group: 'catalogue' },
  'reviews.moderate': { group: 'catalogue' },
  'reviews.write': { group: 'catalogue' },
  // PR 21, 35 — put a product on the shop or take it off (one by one or in bulk). Publishing always runs the publish
  // checklist first (PR 26, 29, 35); there is no way around it.
  'catalogue.publish': { group: 'catalogue' },
  // PR 34 — the catalogue CSV: bring in a file (preview, then apply; prices inside it still need catalogue.prices) and
  // take the catalogue out as a file.
  'catalogue.import': { group: 'catalogue' },
  'catalogue.export': { group: 'catalogue' },
  // PR 36 — the back-in-stock list: who asked to be told when a product is back (their phone or e-mail is the owner's
  // data, PR 509). Counts per product need only catalogue.read; seeing the contacts and marking them needs this key.
  'catalogue.interest': { group: 'catalogue' },
  // S09 · PR 195, 196, 201, 497 — stock and the ERP: see stock, locations and the ERP status; add, rename and archive
  // warehouses and locations (the damaged bin among them) and link them to ERP warehouses; switch a store's ERP mode
  // and set its ERP company and warehouse. Stock numbers themselves come from the ERP and are never typed in.
  'inventory.read': { group: 'inventory' },
  'inventory.locations': { group: 'inventory' },
  'inventory.erp': { group: 'inventory' },
  // S09 · PR 205, 206, 207 — run a stock re-sync now (all, or one product), send waiting or failed ERP documents again,
  // check all stock against the ERP. Nothing here types a stock number in: the ERP stays the master.
  'inventory.sync': { group: 'inventory' },
  // S09 · PR 203 — count a location by barcode and give a reason for each difference. Counting never changes stock:
  // the counted differences are corrected in the ERP.
  'inventory.audit': { group: 'inventory' },
  // S10 · PR 208–219 — Smart Rules: see the rules, their history, clashes and simulations; write and save drafts of
  // rules, notices and coupons; publish a rule or switch a notice on; and give the owner's OK for a rule that moves
  // money (a charge, a price, a discount, COD — CLAUDE.md rule 6). Only the owner role has `rules.approve` until the
  // owner hands it to someone in the role builder.
  'rules.read': { group: 'rules' },
  'rules.write': { group: 'rules' },
  'rules.publish': { group: 'rules' },
  'rules.approve': { group: 'rules' },
  // S03 · PR 89–104, 571, 575 — combos and sets: see the combos, their pages and the combo report; make and change combos
  // and auto colour-pair rules (names, pieces, pairing, templates); switch a combo or rule on or off, archive it or
  // bring it back; and set or change a set price (a price is the owner's decision, CLAUDE.md rule 6: only the owner
  // role has `combos.prices` until he hands it to someone in the role builder).
  'combos.read': { group: 'combos' },
  'combos.write': { group: 'combos' },
  'combos.publish': { group: 'combos' },
  'combos.prices': { group: 'combos' },
  // S06 · PR 550 — the delivery bands and the sub-area list (owner data): see them; set a band's charge, hours and COD
  // limit, switch it on (only with its charge) or off and choose the sub-area mode (charges are the owner's figures,
  // CLAUDE.md rule 6); put places on the sub-area list or take them off (archived, never deleted).
  'delivery.read': { group: 'delivery' },
  'delivery.charges': { group: 'delivery' },
  'delivery.areas': { group: 'delivery' },
  // S08 · PR 175, 176 — courier parcels (BACKEND-ARCHITECTURE §5.6): see parcels with their receiver and every courier
  // event (not a `.read` key on purpose: a parcel shows the receiver's name, phone and address); book a courier for
  // ready orders (through the one order service: never a cancelled, held or in-review order); record a courier
  // exception told on the phone (a failed try, an address problem, lost, damaged); add, rename, switch off or archive a
  // courier account. No key here moves money, changes COD or a charge, or blocks anyone.
  'delivery.parcels': { group: 'delivery' },
  'delivery.book': { group: 'delivery' },
  'delivery.exceptions': { group: 'delivery' },
  'delivery.couriers': { group: 'delivery' },
  // S08 · PR 525, 526 — what really happened at the door: resolve a true-delivery check (the courier said delivered, the
  // shop's records say it came back) and record why a parcel came back (the rider's note, the reason from the owner's
  // list). It never moves money, changes COD or decides a refund: a return is recorded, the money stays with payments.
  'delivery.outcomes': { group: 'delivery' },
  // S08 · PR 192 (SIM-F-017) — raise a claim with a courier for a lost or damaged parcel and record what became of it
  // (sent, settled with the amount the courier paid, rejected). A record only: nothing here pays or takes money.
  'delivery.claims': { group: 'delivery' },
  // S0A · PR 6 — the Server page: whether the background worker is alive, which one leads the scheduler, and the jobs
  // that failed with their reason and next try. Seeing only; nothing here changes anything.
  'system.read': { group: 'system' },
  // S02 · PR 602 — the Cache page (SET-08b): change how long each layer keeps a page, and "Clear all". Clearing loses
  // nothing (orders, products and settings are untouched); pages are built again on the next visit.
  'system.cache': { group: 'system' },
  // S19 · PR 507 (CN-030) — Settings → System → Backups: change the backup settings (time, days kept, the monthly
  // restore drill, Telegram) and ask the server for a backup or a restore drill now. A drill restores into a throw-away
  // copy, never the live database; restoring production is not this key (PR 396).
  'system.backup': { group: 'system' },
  // S19 · PR 396 — put a backup on the live shop (Settings → System → Backups › Restore): only the newest check copy
  // that passed, with RESTORE typed and the owner's PIN. The old data is kept on the server, never deleted.
  'system.restore': { group: 'system' },
  // S19 · PR 393 (CN-031) — Settings → System → Go-live: confirm the items a person checks before real orders (the QA
  // gate, the staging acceptance list, real phones …). Only a record of who checked what; nothing is switched by it.
  'system.golive': { group: 'system' },
  // S04 · PR 136 — open the invoice of any order of the store (its customer's name, phone and address are on it), to
  // print or send it. Not a `.read` key on purpose: the read-only smoke check account never gets customers' details.
  // The order screens of S05 add their own keys.
  'orders.invoice': { group: 'orders' },
  // S20 · PR 407 — Orders › Packing & print › Invoices: change what the invoice says (its parts, number pattern, note and
  // footer), how it prints, its chat picture and issuing. Seeing the cards is `fulfilment.read`. An invoice already
  // issued keeps its number; nothing here moves money or changes a price, COD or an order.
  'orders.invoiceSettings': { group: 'orders' },
  // S05 · PR 138, 144, 145, 147, 153 — orders (BACKEND-ARCHITECTURE §5.3, §9.10): see orders and their timeline; confirm
  // a new order; put an order on hold and release it (with a reason); cancel an order before a courier is booked (with
  // a reason; a paid order's cancel only records a refund request, never a payout); cancel after booking and record the
  // courier's answer (D5); approve or refuse a customer's cancel request; write notes and internal flags; see and decide
  // the duplicate-order review queue; put two orders of one customer in one parcel. No key here moves money, changes a
  // price, a discount or COD, or blocks anyone (CLAUDE.md rule 6). A key is never the start of another key (labels nest).
  'orders.read': { group: 'orders' },
  'orders.confirm': { group: 'orders' },
  'orders.hold': { group: 'orders' },
  'orders.cancel': { group: 'orders' },
  'orders.cancelAfterBooking': { group: 'orders' },
  'orders.cancelRequests': { group: 'orders' },
  'orders.notes': { group: 'orders' },
  'orders.risk.read': { group: 'orders' },
  'orders.risk.decide': { group: 'orders' },
  'orders.merge': { group: 'orders' },
  // S06 · PR 544 — the risk rules list (ORD-06): see every fraud and duplicate rule with its switch, and switch one on or
  // off. A rule only marks and proposes; switching it never blocks anyone, moves money or changes COD, a price or a charge.
  'risk.rules.read': { group: 'orders' },
  'risk.rules.write': { group: 'orders' },
  // S06 · PR 162 — the blocklist: list a phone number with a reason (owner, manager and customer-facing staff, answer 3),
  // and undo a listing with a reason. Listing never cancels an order or tells the customer; a person decides.
  'risk.block': { group: 'orders' },
  'risk.unblock': { group: 'orders' },
  // S06 · PR 163 — a repeat refuser's terms, the owner's choice per case (answer 5): nothing, the delivery charge or the
  // full amount first, or no cash on delivery, and "End". The terms only become a proposal on a new order; a person sends
  // it. Touches COD, so only the owner holds it until he gives it to someone (CLAUDE.md rule 6).
  'risk.refuser.terms': { group: 'orders' },
  // S06 · PR 164 — the fraud report (Reports › Fraud & RTO): what the risk steps caught, what was wrong, the cost they
  // probably avoided, and the RTO cost book by district, campaign, product, courier and reason. Reads only.
  'risk.report': { group: 'orders' },
  // S06 · PR 542 — ask a customer for an advance from the order ("Request advance"): the pay link, its SMS/WhatsApp and a
  // call task. The order waits for the money; nothing moves money, changes COD, a price or a charge, or blocks anyone.
  'orders.advance.request': { group: 'orders' },
  // S04 · PR 127 — add a line to an order not yet with the courier, or take out a line added after placing ("Add to
  // this parcel"): priced as its product page prices it, the order's COD amount grows by exactly that line.
  'orders.lines': { group: 'orders' },
  // S05 · PR 142 — edit an order not yet with the courier: the customer's name, phone and address, a size at the same
  // price, a piece taken out (with a reason and where the customer asked). Never a price, discount, charge or COD.
  'orders.edit': { group: 'orders' },
  // S05 · PR 151 — export the orders the list shows (its filters, or the ticked ones) as a CSV file; with
  // `orders.exportPersonal` the file also carries the customer's name, phone, e-mail and address. Every export is
  // audited. Nothing is changed by an export.
  'orders.export': { group: 'orders' },
  'orders.exportPersonal': { group: 'orders' },
  // S08 · PR 179 — Orders › Packing & print: print a booked parcel's courier sticker (it carries the receiver's name,
  // phone and address, so not a `.read` key) and a sample sticker to try the size. Printing never books, re-books or
  // changes a parcel, its COD or a charge.
  'fulfilment.print': { group: 'fulfilment' },
  // S08 · PR 180, 181 — Orders › Packing & print: see the print run, the recent prints, the handover lists and the
  // picking list, and print the picking list (order numbers, consignment ids, pieces and amounts; no customer's details).
  'fulfilment.read': { group: 'fulfilment' },
  // S08 · PR 180 — print the rider's handover sheet (it can carry the receivers' names) and mark a batch handed over to
  // the courier (each order moves to "handed over"). Never books, re-books or changes a parcel, its COD or a charge.
  'fulfilment.handover': { group: 'fulfilment' },
  // S08 · PR 182 — Orders › Packing & print › Pack: start picking, scan or type each piece's SKU, add the packing photo,
  // weigh the parcel and mark the order packed (every step through the order service). Never books, cancels, edits an
  // order or changes a parcel, its COD or a charge.
  'fulfilment.pack': { group: 'fulfilment' },
  // S08 · PR 182 (CN-014c, SIM-F-010) — the owner's override of a required packing photo for one order, with a reason
  // (audited). Only the owner role holds it until he gives it to another role.
  'fulfilment.photoWaive': { group: 'fulfilment' },
  // S05 · PR 148 — Messages › Order journey (MSG-01): see the journey (its steps, channels, caps and whether each channel
  // is live or on its mock); change it; and record a customer's self-confirm reply (1, 2 or 3) until the WhatsApp
  // provider's replies arrive by themselves. A 1 confirms the order only with `messages.selfConfirm.confirmOnYes`, as a
  // confirm by hand would; a reply never cancels an order: 2 and 3 go to the call queue.
  'messages.journey.read': { group: 'messages' },
  'messages.journey.write': { group: 'messages' },
  'messages.selfConfirm.reply': { group: 'messages' },
  // S05 · PR 149 — the message log: every message with its state, why it was skipped or blocked, and every try; and a
  // failed message tried again by hand. Not a `.read` key on purpose: the log shows customers' numbers, and the
  // read-only smoke check account never gets customers' details.
  'messages.log.view': { group: 'messages' },
  'messages.log.retry': { group: 'messages' },
  // S14 · PR 291, 292 — Messages › Channels & limits (MSG-05): see each channel's provider (live or mock), its credit,
  // the SMS masking name, the part prices, the master switch, the caps and the quiet hours; change them. Sends nothing.
  'messages.channels.read': { group: 'messages' },
  'messages.channels.write': { group: 'messages' },
  // S14 · PR 298 — consent and opt-out: see who stopped which messages (customers' numbers: a `.view` key, like the log)
  // and the stop words; record a customer's own stop or start at his request, change the stop words. Sends nothing.
  'messages.consent.view': { group: 'messages' },
  'messages.consent.write': { group: 'messages' },
  // S14 · PR 505 — Messages › Templates: see every SMS, WhatsApp and e-mail template with its preview on sample data in
  // both languages and where it is used (no customer's data: a `.read` key); change, add or reset a template's words.
  // Sends nothing; an edited WhatsApp template goes back for approval before a live send uses it.
  'messages.templates.read': { group: 'messages' },
  'messages.templates.write': { group: 'messages' },
  // S07 · PR 165 — payments (BACKEND-ARCHITECTURE §6.5.3): see an order's payments, its amount due and where its money
  // stands, with the reason of every mismatch (`payments.view`; not a `.read` key on purpose: it shows customers' payment
  // references, and the read-only smoke check account never gets them); record money received outside the checkout
  // (`payments.record`, F-040: with the amount confirmed, never more than the amount due, only while the owner has
  // `payments.manual` on). Recording is audited. No key here moves money, refunds anything or changes COD.
  'payments.view': { group: 'payments' },
  'payments.record': { group: 'payments' },
  // S07 · PR 166 — Cash on Delivery after the door (§6.5.5): record what the rider did and collected (`payments.door`),
  // approve or reject a partial delivery's money (`payments.partials`), import a courier's COD statement and mark a
  // checked mismatch resolved (`payments.settle`). Each is audited; none moves money or changes COD.
  'payments.door': { group: 'payments' },
  'payments.partials': { group: 'payments' },
  // PR 174: also a payment gateway's statement (bKash, Nagad, card) and its practice statement.
  'payments.settle': { group: 'payments' },
  // S07 · PR 171 — the wallet (§6.5.4 fact 4b, SIM-F-054): credit or debit a customer's wallet by hand with a reason, or put
  // an entry right with a new one the other way (`payments.wallet`, only while the owner has `payments.wallet.manual`
  // on); give the late-delivery apology credit on an order (`payments.apology`, only while `payments.wallet.apology` is
  // on). Each is a ledger line and an audit row; nothing is edited, nothing is paid out.
  'payments.wallet': { group: 'payments' },
  'payments.apology': { group: 'payments' },
  // S07 · PR 172 — refunds (§6.5.4 facts 4a/4b, F-041; BACKEND-ARCHITECTURE MNY-03): ask for a refund on an order
  // (`payments.refunds.request`, support and the desk), approve or reject one (`payments.refunds.approve`, the owner:
  // CLAUDE.md rule 6), and pay out an approved one — a wallet credit, or the reference of money a person sent back by
  // hand — or mark its payout failed (`payments.refunds.execute`, accounts). Nothing is ever paid out by itself.
  'payments.refunds.request': { group: 'payments' },
  'payments.refunds.approve': { group: 'payments' },
  'payments.refunds.execute': { group: 'payments' },
  // S07 · PR 173 — ask a pre-order's advance on an order (a part paid online now, the rest at the door), within the
  // owner's cap and only while `payments.partial` is on. It asks money; it never takes or moves any.
  'payments.advance': { group: 'payments' },
  // S08 · PR 185 — exchanges and returns (ORD-05): see the returns board and every case (`returns.view`); open an
  // exchange or a return, approve or refuse it, close it (`returns.decide`). None moves money, refunds anything or
  // changes a price, a discount or COD: a difference in the customer's favour is only a wallet-credit REQUEST.
  'returns.view': { group: 'orders' },
  'returns.decide': { group: 'orders' },
  // PR 187 — Receive & QC: mark a parcel received, check each piece (sellable or not) and send the sellable ones to the ERP.
  'returns.qc': { group: 'orders' },
  // PR 190 (CN-018 (5)) — waive an exchange's delivery charge with a logged reason, and decide a "your mistake" claim.
  'returns.waive': { group: 'orders' },
  'returns.claims.decide': { group: 'orders' },
  // S14 · PR 284–286 — customers (BACKEND-ARCHITECTURE §5.5, §9.10; Blueprint B5.1, Note 24.1): see the customer list and
  // one customer's page — the orders, the lifetime value, the exchanges and the support history — with the phone number
  // masked (`customers.read`; every profile open is logged); see, call and copy the full phone number, each copy and
  // call logged (`customers.phone`; not a `.read` key on purpose: the read-only smoke check account never gets
  // customers' numbers); merge two profiles of one person, split a merge again, or mark a pair "not the same person"
  // (`customers.merge`; nothing moves, nothing is deleted, every decision is audited). There is no customer export here:
  // PR 299 brings its own key.
  'customers.read': { group: 'customers' },
  'customers.phone': { group: 'customers' },
  'customers.merge': { group: 'customers' },
  // S18 · PR 382 — CUS-07: file and cancel a customer's erasure request and see the list (`customers.privacy`); only the
  // owner carries one out, with a typed confirmation (the service checks it again).
  'customers.privacy': { group: 'customers' },
  // S14 · PR 287 — CUS-03: save, change, copy and archive the store's segments (`customers.segments.write`; audited).
  // Seeing them and their counts needs `customers.read` only; a segment holds rules, never a customer's details.
  'customers.segments.write': { group: 'customers' },
  // S14 · PR 288 — Customers › Customer settings: switch the CRM features on or off and change their numbers (the
  // journey view first; later CRM PRs add theirs); audited.
  'customers.settings': { group: 'customers' },
  // S11 · PR 220–222 — Website → SEO: see which pages search engines may list, the title and description templates, the
  // AI drafts waiting and the structured data (`seo.read`); change them, write AI drafts and accept or discard a draft
  // (`seo.manage`). Nothing here touches a price, an order or a customer.
  'seo.read': { group: 'seo' },
  'seo.manage': { group: 'seo' },
  // CN-028 · PR 612, 614 (CN-029 Phase 0; docs/RETAIL-ERP-MODEL.md §12) — returns and exchanges through the ERP: count
  // and note the parcels a courier hands back and send the return list (`returns.handback`, packers and the desk; the
  // shop never decides whether a piece can be sold again, the owner does in the ERP); approve an exchange within 72
  // hours and mark its lines (`exchange.approve`). Neither moves money, refunds anything or changes COD.
  'returns.handback': { group: 'orders' },
  'exchange.approve': { group: 'orders' },
  // CN-028 · PR 615–618 (§12) — the books with the ERP: see the books, the match and every figure's parts
  // (`books.read`); run the match and write notes on a difference (`books.reconcile`); put a difference right by a
  // reversing and a new entry, with the owner's PIN, a reason and the ERP's matching event (`books.adjust`: Accounts and
  // the owner only); close a week, month or year, or close a month with differences (PIN, logged) (`books.close`: the
  // owner); see Retail's account at the ERP, the balance owed and the hold (`erp.account.read`); record a payment Retail
  // made to the ERP (`erp.payments.record`: Accounts and the owner only, the money rule); set a month's fixed costs
  // (`fixedcosts.write`). Only the owner role holds them until he gives them to a role in the role builder. None moves
  // money by itself: a payment is recorded after it was made, and nothing is ever edited (reversing and adding only).
  'books.read': { group: 'books' },
  'books.reconcile': { group: 'books' },
  'books.adjust': { group: 'books' },
  'books.close': { group: 'books' },
  'erp.account.read': { group: 'books' },
  'erp.payments.record': { group: 'books' },
  'fixedcosts.write': { group: 'books' },
  // S16 · PR 343, 345 (BACKEND-ARCHITECTURE §5 MNY-06) — the cost ledger and the costs & fees inputs: record a top-up of
  // a prepaid balance (SMS credit) the shop already paid for, set its low mark, and (PR 345) the costs & fees figures.
  // Records only: nothing here pays anyone or moves money.
  'costs.write': { group: 'books' },
  // S22 · PR 425 — the support inbox (B4.4, B4.12): open the inbox and every conversation with its who-did-what log
  // (`support.read`); reply, write an internal note, take a conversation, mark it solved or open (`support.reply`);
  // give a conversation to someone else or take it back from them (`support.assign`); change Support settings
  // (`support.settings`). A customer's number shows masked as everywhere else (`customers.phoneMask`), in full only
  // with `customers.phone` (PR 284).
  'support.read': { group: 'support' },
  'support.reply': { group: 'support' },
  'support.assign': { group: 'support' },
  'support.settings': { group: 'support' },
  // S08 · PR 192 (CN-018 (7), SUP-02) — Support › Rider issues: log a customer's overcharge complaint with its proof
  // (`support.riderIssues.write`); approve or reject one (`support.riderIssues.decide`, the owner and managers: approval
  // opens the courier claim for the exact extra). Asking the refund of the extra also needs `payments.refunds.request`,
  // and the refund itself still waits for the owner's own approval (PR 172). Nothing here pays anyone.
  'support.riderIssues.write': { group: 'support' },
  'support.riderIssues.decide': { group: 'support' },
  // S21 · PR 413 (REP-07) — Reports › Site health: see the hub's status lines (customer problems, the server, speed, the
  // site audit, the smoke test). Seeing only; no customer's name, phone or address is on these pages (CN-015).
  'health.read': { group: 'health' },
  // S21 · PR 423 (CN-015) — Customer problems: set a problem's status with its note (`health.problems.manage`); a problem
  // that needs the owner's permission, or waits for his check, moves on only with `health.problems.approve`. Nothing
  // here blocks anyone or changes the shop.
  'health.problems.manage': { group: 'health' },
  'health.problems.approve': { group: 'health' },
  // S21 · PR 418 (REP-07e) — Smoke runs: see the smoke test's pictures of admin pages, which can show customers' names
  // (the Orders list). The shop's own pages and every result need only `health.read`.
  'health.smoke.shots': { group: 'health' },
  // S21 · PR 420 (B7.3) — the approval gate for agent auto-fixes and new skills: file a proposal (the agents' and the
  // audit runner's account, `health.fixes.propose`, and only while `health.fixGate` allows proposals) and approve or
  // reject one (`health.fixes.approve`, the owner). Nobody approves their own proposal; nothing is fixed without an OK.
  'health.fixes.propose': { group: 'health' },
  'health.fixes.approve': { group: 'health' },
  // S13 · PR 257 (Blueprint C6.2) — Marketing › Tracking: see what the shop's server sent to the ad platforms
  // (`ads.tracking.read`); switch it on, tick the events and platforms, allow customer matching and send a test event
  // (`ads.tracking.manage`). Keys are typed on Keys & connections (`vault.write`), never here. No money moves.
  'ads.tracking.read': { group: 'ads' },
  'ads.tracking.manage': { group: 'ads' },
  // S08 · PR 192 (REP-06) — Reports › Delivery & RTO: courier performance (on time, refused, by zone), parcels past
  // their promise and the RTO cost book. Seeing only.
  'reports.read': { group: 'reports' },
} as const satisfies Record<string, { group: string }>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, key);
}

/** One branch of the role builder's access tree: a group and its permissions, in catalogue order. */
export interface AccessBranch {
  group: string;
  keys: readonly PermissionKey[];
}

/**
 * The access tree of the role builder (SET-04b "nested permission tree", PR 16, 495): every permission once, under its
 * group, groups in the order the catalogue first names them. Built from PERMISSIONS, so a key added above is in the
 * tree with no second list to forget (RETAIL-ERP-MODEL §12: "All also go into ACCESS_TREE").
 */
export const ACCESS_TREE: readonly AccessBranch[] = (() => {
  const byGroup = new Map<string, PermissionKey[]>();
  for (const key of PERMISSION_KEYS) {
    const g = PERMISSIONS[key].group;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(key);
  }
  return [...byGroup].map(([group, keys]) => ({ group, keys }));
})();

/**
 * CN-028 (§4.3, §4.4, §12): actions that also need the owner's PIN at the moment they are done (a shop correction of the
 * books; a month closed with differences or re-opened). The key alone is not enough; the service checks the PIN.
 */
export const PIN_PERMISSIONS: readonly PermissionKey[] = ['books.adjust', 'books.close'];

/** The seeded role that always holds every permission. Its key is structural, its names are labels. */
export const OWNER_ROLE_KEY = 'owner';

/** Label keys in messages/auth.<lang>.json. */
export const permissionLabelKey = (key: PermissionKey) => `permissions.${key}`;
export const permissionGroupLabelKey = (group: string) => `permissionGroups.${group}`;
