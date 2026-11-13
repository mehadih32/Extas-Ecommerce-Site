// S28 · PR 670 (CN-048, admin prototype v5, GAP-MAP C-01..C-15) — registry version 310. Couriers section: the default
// courier (`delivery.couriers.defaultCourierId`; empty text = the first courier, as before) — the courier a booking offers
// first and Courier 360 / the Couriers overview list first. Wave 2 adds its other settings to this file (671 payouts, 673
// claims, 674 messages), each with its own version; every number or switch here is off or empty as shipped.
// Labels: messages/couriers-v5.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V670 = 310;

export const couriersSchema = z.object({ defaultCourierId: z.union([z.uuid(), z.literal('')]) }).strict();
export type CouriersSettings = z.output<typeof couriersSchema>;

export const couriersV5Settings = {
  'delivery.couriers': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'delivery',
    version: V670,
    schema: couriersSchema,
    // hardcode-ok: empty as shipped (the first courier is the default until the owner picks one)
    default: { defaultCourierId: '' },
    valueType: 'JSON',
    labelKey: 'delivery.couriers.label',
    helpKey: 'delivery.couriers.help',
    sortOrder: 970,
  }),
};
