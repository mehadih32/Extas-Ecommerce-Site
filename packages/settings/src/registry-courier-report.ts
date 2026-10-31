// S08 · PR 192 (registry version 93, lane C's range; BACKEND-ARCHITECTURE §5 REP-06, DLV-05a, SUP-02; CN-014 d, CN-018
// (7); SIM-F-017, SIM-F-018, SIM-F-027) — the courier report's own switches. Labels: messages/courier-report.<lang>.json.
//
// - `delivery.courier.rtoBook`: the RTO cost book on Reports › Delivery & RTO, by district, campaign, product, courier
//   and reason (CN-014 d). Off as shipped; its figures are the owner's (Money › Costs & fees, `delivery.courier.rtoCost`)
//   and the shop's own returned parcels — never sample rows (SIM-F-027).
// - `delivery.courier.claims`: raising a claim with a courier for a lost or damaged parcel (its declared value) and
//   following it to settled or rejected (SIM-F-017). Off as shipped. A claim is a record: nothing here moves money.
// - `support.riderIssues`: Support › Rider issues (CN-018 (7)) — a customer's complaint that the rider took more than
//   the parcel asked, with proof; a person approves or rejects it, and approval opens the courier claim for the extra.
//   `proofRequired`: a complaint needs at least one photo; `maxPhotos`, `photoMaxMb`: the proof's limits. `refundAsk`:
//   an approved complaint may ask the refund of the exact extra — only ever a refund REQUEST, which still waits for the
//   owner's own approval on the refunds list and is paid by a person (PR 172; CLAUDE.md rule 6). Off as shipped.
import { z } from 'zod';
import { setting } from './define';

const V192 = 93;

const delivery = { scope: 'store', isOwnerData: false, isPublic: false, group: 'delivery', version: V192 } as const;
const support = { ...delivery, group: 'support' } as const;

export const rtoBookSchema = z.object({ enabled: z.boolean() }).strict();
export type RtoBookSettings = z.output<typeof rtoBookSchema>;

export const courierClaimsSchema = z.object({ enabled: z.boolean() }).strict();
export type CourierClaimsSettings = z.output<typeof courierClaimsSchema>;

export const riderIssuesSchema = z
  .object({
    enabled: z.boolean(),
    proofRequired: z.boolean(),
    maxPhotos: z.int().min(1).max(10),
    photoMaxMb: z.int().min(1).max(20),
    refundAsk: z.boolean(),
  })
  .strict();
export type RiderIssueSettings = z.output<typeof riderIssuesSchema>;

export const courierReportSettings = {
  'delivery.courier.rtoBook': setting({
    ...delivery,
    valueType: 'JSON',
    schema: rtoBookSchema,
    default: { enabled: false },
    labelKey: 'delivery.courier.rtoBook.label',
    helpKey: 'delivery.courier.rtoBook.help',
    sortOrder: 920,
  }),
  'delivery.courier.claims': setting({
    ...delivery,
    valueType: 'JSON',
    schema: courierClaimsSchema,
    default: { enabled: false },
    labelKey: 'delivery.courier.claims.label',
    helpKey: 'delivery.courier.claims.help',
    sortOrder: 921,
  }),
  'support.riderIssues': setting({
    ...support,
    valueType: 'JSON',
    schema: riderIssuesSchema,
    default: { enabled: false, proofRequired: true, maxPhotos: 3, photoMaxMb: 5, refundAsk: false },
    labelKey: 'support.riderIssues.label',
    helpKey: 'support.riderIssues.help',
    sortOrder: 600,
  }),
};
