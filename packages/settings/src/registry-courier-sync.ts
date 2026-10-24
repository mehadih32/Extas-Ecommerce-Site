// S08 · PR 184 — what the courier tells us after booking (registry version 58). Labels: messages/courier-sync.<lang>.json.
// `account.track.courier`: the courier's own news on the customer's order page (out for delivery, a delivery try
// that failed, an address the rider could not find, "we are checking with the courier" for a lost or damaged parcel).
// Off by default: until the owner switches it on, the customer's page shows the order's steps as before (the order
// itself follows its parcel either way, through the order service).
// PR 525 — `delivery.truthCheck`: the true-delivery check (a "Delivered" the shop's own records contradict, for a person to
// resolve). Off by default; nothing in it moves money or changes COD.
import { z } from 'zod';
import { setting } from './define';

const V = 58;

/** `enabled`: the courier line on his order page. `exceptions`: also say when a try failed or the address is unclear. */
export const accountTrackCourierSchema = z
  .object({
    enabled: z.boolean(),
    exceptions: z.boolean(),
  })
  .strict();
export type AccountTrackCourier = z.output<typeof accountTrackCourierSchema>;

/**
 * PR 525 — the true-delivery check. `enabled`: look for a parcel the courier calls delivered while our records say it came
 * back. `holdOrder`: while such a check is open the order is not moved to delivered (a person decides). `lookbackDays`:
 * how far back a late sign (the courier's statement, the return received) still opens a check.
 */
export const deliveryTruthCheckSchema = z
  .object({
    enabled: z.boolean(),
    holdOrder: z.boolean(),
    lookbackDays: z.int().min(1).max(180),
  })
  .strict();
export type DeliveryTruthCheck = z.output<typeof deliveryTruthCheckSchema>;

export const courierSyncSettings = {
  'account.track.courier': setting({
    scope: 'store',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    version: V,
    group: 'accounts',
    schema: accountTrackCourierSchema,
    default: { enabled: false, exceptions: true },
    labelKey: 'account.track.courier.label',
    helpKey: 'account.track.courier.help',
    sortOrder: 125,
  }),
  'delivery.truthCheck': setting({
    scope: 'store',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    version: V,
    group: 'delivery',
    schema: deliveryTruthCheckSchema,
    default: { enabled: false, holdOrder: true, lookbackDays: 30 },
    labelKey: 'delivery.truthCheck.label',
    helpKey: 'delivery.truthCheck.help',
    sortOrder: 960,
  }),
};
