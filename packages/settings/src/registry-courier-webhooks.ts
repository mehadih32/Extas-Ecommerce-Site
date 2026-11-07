// S08 · PR 176/177 follow-up 372 — registry version 269, lane B. The couriers' own status calls (webhooks): Steadfast
// and Pathao call the shop at /api/courier/<courier>/webhook when a parcel moves, each call proved by the token or
// secret the owner types into Keys & connections. Each call is kept once and goes into the same parcel events as a
// status read (`applyEvents`), and the parcel's order follows it; a parcel told by its courier is not read again until
// `delivery.courier.tracking`'s minutes pass, so the hourly read becomes the fallback. One address serves every store,
// so the mother store's value counts.
//
// `delivery.courier.webhooks`: off as shipped (every call is answered "not found" and the reads go on as before);
// `maxBodyKb` is the largest call read (a longer one is refused unread).
import { z } from 'zod';
import { setting } from './define';

const V372 = 269;

export const courierWebhooksSchema = z
  .object({
    enabled: z.boolean(),
    maxBodyKb: z.int().min(1).max(1024),
  })
  .strict();
export type CourierWebhooksSettings = z.output<typeof courierWebhooksSchema>;

export const courierWebhookSettings = {
  'delivery.courier.webhooks': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'delivery',
    version: V372,
    schema: courierWebhooksSchema,
    // hardcode-ok: off as shipped — the owner switches it on once a courier's webhook page has the shop's address; the size is editable
    default: { enabled: false, maxBodyKb: 64 },
    valueType: 'JSON',
    labelKey: 'delivery.courier.webhooks.label',
    helpKey: 'delivery.courier.webhooks.help',
    sortOrder: 904,
  }),
};
