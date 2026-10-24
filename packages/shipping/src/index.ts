// @extas/shipping — courier shipping (S08; BACKEND-ARCHITECTURE §5.6, §6.5.2, §7.4, §7.7).
//
// PR 175: the courier framework's shop side — the store's courier accounts, each on its adapter's practice world until
// the owner's keys pass the Test in Keys & connections (accounts.ts); a parcel's events stored once each and its state
// worked out from them, out-of-order safe, with the courier's exceptions (a failed try, an address problem, lost,
// damaged) and their reasons, recorded by the courier or by staff (events.ts, SIM-F-017); the parcel list and one
// parcel (parcels.ts); the RTO cost book from the shop's own returned parcels only, both courier legs, every missing
// part named (rto.ts, SIM-F-027). The rules without a database are in `@extas/shipping/pure`.
//
// PR 176: booking — a staff action only, through the order service's `bookWith` (never a cancelled, held or in-review
// order: SIM-F-002, SIM-F-014), to the order's delivery target with a gift held until its day (SIM-F-007), the live
// amount due (SIM-F-004), the pieces' weight (SIM-F-029); a lost answer is recovered by the shop's reference before
// booking again (booking.ts). Status polling of the parcels the couriers hold (tracking.ts; the worker's
// `courier.track` job). Steadfast is the first real courier behind the contract (`@extas/adapters`).
//
// PR 177: Pathao, the second courier, behind the same contract: the same booking and tracking, its zone ids and weight.
//
// PR 554: the courier zone sync — each courier's own place list read through its adapter, paired with the gazetteer
// (exact names only, unclear ones left for a person), dropped places and pairs archived, never deleted; a booking to an
// area without a pair waits with its reason instead of failing at the courier (zones.ts, zone-match.ts).
//
// PR 179: the courier sticker's data — the print run of booked parcels still with us in packing order, and printing:
// the courier's COD equal to the live amount due and the receiver the courier has, else refused (SIM-F-004); a gift's
// receiver, sender and day (SIM-F-007); the consignment id and tracking code (follow-up 376); every print counted and a
// second print a reprint (fulfil.ts, fulfil-pure.ts). The PDF itself is drawn by `@extas/documents`.
//
// PR 180: the print queue — every press one print job, a repeated press key the same job counted once, a reprint the
// same parcel with its reason when the owner asks why, the recent prints (fulfil.ts); the rider's handover sheet — one
// open batch per courier, the ready parcels with their consignment ids and amounts to collect, and "handed over"
// through the order machine (handover.ts).
//
// PR 181: the daily consolidated picking list — every order still with us (approved, or booked and not picked up),
// held and problem orders apart and uncounted, the pieces category → style → colour → size with the most pieces first,
// shortages against the shop's stock, the summary line; printing it keeps the list (picking.ts, picking-pure.ts).
// PR 184: the order follows its parcel — each read's courier word moves the order through the one order service (in
// transit, delivered, returned, partly delivered once the kept pieces are named), the courier's "out for delivery" on the
// order's timeline, the orders behind their parcel caught up on every run (sync.ts); late parcels past their band's
// promise in their own list (parcels.ts, SIM-F-018); the order page reads the courier's last word through the order service's detail.
//
// No money moves here: COD, refunds and returns wait for their own PRs and the owner.
export * from './context';
export * from './errors';
export * from './pure';
export * from './accounts';
export * from './events';
export * from './parcels';
export * from './rto';
export * from './booking';
export * from './tracking';
export * from './zone-match';
export * from './zones';
export * from './fulfil-pure';
export * from './fulfil';
export * from './handover';
export * from './picking-pure';
export * from './picking';
export * from './sync';
