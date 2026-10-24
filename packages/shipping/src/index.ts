// @extas/shipping — courier shipping (S08; BACKEND-ARCHITECTURE §5.6, §6.5.2, §7.4, §7.7).
//
// PR 175: the courier framework's shop side — the store's courier accounts, each on its adapter's practice world until
// the owner's keys pass the Test in Keys & connections (accounts.ts); a parcel's events stored once each and its state
// worked out from them, out-of-order safe, with the courier's exceptions (a failed try, an address problem, lost,
// damaged) and their reasons, recorded by the courier or by staff (events.ts, SIM-F-017); the parcel list and one
// parcel (parcels.ts); the RTO cost book from the shop's own returned parcels only, both courier legs, every missing
// part named (rto.ts, SIM-F-027). The rules without a database are in `@extas/shipping/pure`.
//
// No money moves here: COD, refunds and returns wait for their own PRs and the owner.
export * from './context';
export * from './errors';
export * from './pure';
export * from './accounts';
export * from './events';
export * from './parcels';
export * from './rto';
