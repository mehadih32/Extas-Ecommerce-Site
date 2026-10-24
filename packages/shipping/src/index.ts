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
