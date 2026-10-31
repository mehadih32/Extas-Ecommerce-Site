// S08 · PR 564 (registry version 95, lane C's range; Blueprint §60.13, D3.12 point 6 as replaced on 18 Oct; demo
// 92-admin-couriers.js "Band mismatch log"; SIM-F-003) — the charge mismatch log: when the courier's real charge shows it
// read the parcel's place as another band than the one the customer paid for, the gap is only recorded. Nothing on the
// order changes, nobody is messaged, no charge is corrected (the difference is small and the cases are rare; a
// correction would cost more in refused parcels than it brings back). Reports › Delivery & RTO shows how many cases
// each month and what they came to, so the owner can decide later from the number. Off as shipped.
// Labels: messages/charge-mismatch.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V564 = 95;

export const chargeMismatchSchema = z.object({ enabled: z.boolean() }).strict();
export type ChargeMismatchSettings = z.output<typeof chargeMismatchSchema>;

export const chargeMismatchSettings = {
  'delivery.chargeMismatch': setting({
    scope: 'store',
    group: 'delivery',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: chargeMismatchSchema,
    default: { enabled: false },
    labelKey: 'delivery.chargeMismatch.label',
    helpKey: 'delivery.chargeMismatch.help',
    sortOrder: 931,
    version: V564,
  }),
};
