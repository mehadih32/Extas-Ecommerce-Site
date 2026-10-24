// S08 · courier shipping (PR 175–177). Registry version 50. Labels: messages/shipping.<lang>.json (the Delivery group;
// the admin's place is Delivery → Delivery settings, DLV-08 of docs/BACKEND-ARCHITECTURE.md §5.6, on the new admin
// shell). Every courier runs on its practice world until the owner types its keys into Keys & connections.
//
// PR 175 (`delivery.courier.rtoCost`, SIM-F-027): what a parcel that came back cost the shop — both legs of the courier,
// packaging, handling and, when the owner counts it, the ad share. The courier's own charges come from its rate card
// (owner data, empty by default); packaging, handling and the ad share are the owner's figures here, empty until he
// types them. A counted part with no figure is shown as missing, never as zero. Nothing here moves money.
import { z } from 'zod';
import { setting } from './define';
import { moneyMinorSchema } from './schemas';

const V = 50;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'delivery', version: V } as const;

/**
 * PR 175 (SIM-F-027) — the RTO cost book. `count`: which parts of a returned parcel's cost are counted (the courier's
 * charge out, its charge back, packaging, handling, the ad share). `packagingMinor`, `handlingMinor`: the owner's cost
 * per parcel; `adShareMinor`: the ad cost he puts on each order. All empty until he types them.
 */
export const rtoCostSchema = z
  .object({
    count: z.object({ forward: z.boolean(), return: z.boolean(), packaging: z.boolean(), handling: z.boolean(), adShare: z.boolean() }).strict(),
    packagingMinor: moneyMinorSchema.nullable(),
    handlingMinor: moneyMinorSchema.nullable(),
    adShareMinor: moneyMinorSchema.nullable(),
  })
  .strict();

export const shippingSettings = {
  'delivery.courier.rtoCost': setting({
    ...base,
    valueType: 'JSON',
    schema: rtoCostSchema,
    default: { count: { forward: true, return: true, packaging: true, handling: true, adShare: false }, packagingMinor: null, handlingMinor: null, adShareMinor: null },
    labelKey: 'delivery.courier.rtoCost.label',
    helpKey: 'delivery.courier.rtoCost.help',
    sortOrder: 900,
  }),
};

export type RtoCostSettings = z.output<typeof rtoCostSchema>;
