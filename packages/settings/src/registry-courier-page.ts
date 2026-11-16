// PR 1010 (final round, lane D11; admin prototype v5 m-settings.js `renderCouriers`) — registry version 1010. Settings › Couriers keeps two
// things the prototype shows and the shop had no place for:
//   `delivery.courier.pickup`   — where the courier picks up (the warehouse or the office, whose addresses are on Settings › Store details)
//                                  and the daily pick-up time ("Daily pickup time"; empty = not set).
//   `delivery.courier.autoBook` — "Auto-booking": when an order is packed, the parcel is booked with the default courier. OFF as shipped.
//                                  `byStaffId` is the person who switched it on; the worker books in that person's name, with their
//                                  permission checked on every run (a person who lost it stops the booking, and it is logged).
// Nothing here reaches a customer, moves money or changes a price. Labels: messages/courier-page.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V1010 = 1010;

export const PICKUP_FROM = ['warehouse', 'office'] as const;
export type PickupFrom = (typeof PICKUP_FROM)[number];

export const courierPickupSchema = z
  .object({
    from: z.enum(PICKUP_FROM),
    /** 24-hour HH:MM, or empty. */
    time: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
  })
  .strict();
export type CourierPickupSettings = z.output<typeof courierPickupSchema>;

export const courierAutoBookSchema = z
  .object({
    enabled: z.boolean(),
    /** The staff member whose name the booking runs in (empty while it is off). */
    byStaffId: z.union([z.literal(''), z.uuid()]),
    /** How often the worker looks for packed orders to book (minutes). */
    everyMinutes: z.int().min(1).max(60),
  })
  .strict();
export type CourierAutoBookSettings = z.output<typeof courierAutoBookSchema>;

export const courierPageSettings = {
  'delivery.courier.pickup': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'delivery',
    version: V1010,
    schema: courierPickupSchema,
    // hardcode-ok: the warehouse as shipped; the daily time is the owner's to type (empty until then)
    default: { from: 'warehouse', time: '' },
    valueType: 'JSON',
    labelKey: 'delivery.courier.pickup.label',
    helpKey: 'delivery.courier.pickup.help',
    sortOrder: 972,
  }),
  'delivery.courier.autoBook': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'delivery',
    version: V1010,
    schema: courierAutoBookSchema,
    // hardcode-ok: off as shipped; staff press "Book" on each order until the owner switches it on
    default: { enabled: false, byStaffId: '', everyMinutes: 5 },
    valueType: 'JSON',
    labelKey: 'delivery.courier.autoBook.label',
    helpKey: 'delivery.courier.autoBook.help',
    sortOrder: 973,
  }),
};
