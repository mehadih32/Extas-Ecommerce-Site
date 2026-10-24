// S08 · PR 184 — what the courier tells us after booking (registry version 58). Labels: messages/courier-sync.<lang>.json.
// `account.track.courier`: the courier's own news on the customer's order page (out for delivery, a delivery try
// that failed, an address the rider could not find, "we are checking with the courier" for a lost or damaged parcel).
// Off by default: until the owner switches it on, the customer's page shows the order's steps as before (the order
// itself follows its parcel either way, through the order service).
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
};
