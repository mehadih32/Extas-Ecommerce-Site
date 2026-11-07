// S06 · PR 159 follow-up 324 — registry version 268, lane B. The customer may tap "Share my location for the rider" at
// checkout; the order keeps that rounded point only for the owner's days (`risk.capture`, the purge job clears it).
// This setting says where the team may use it while it is kept: a map link on the order page (Orders › the order's
// Customer card) and the point printed small under the address on the courier sticker, for the rider. Never on a gift
// (the checkout never asks there), never once the point is cleared or past its keep date.
//
// `orders.sharedLocation`: both parts off as shipped; `mapLink` is the map address the order page opens, with {lat} and
// {lng} filled in (any map service the owner prefers).
import { z } from 'zod';
import { setting } from './define';

const V324 = 268;

export const SHARED_LOCATION_LINK_MAX = 300;

export const sharedLocationSchema = z
  .object({
    orderPage: z.boolean(),
    sticker: z.boolean(),
    mapLink: z
      .string()
      .trim()
      .max(SHARED_LOCATION_LINK_MAX)
      .regex(/^https:\/\/[^\s]+$/)
      .refine((v) => v.includes('{lat}') && v.includes('{lng}'), { message: 'the map link needs {lat} and {lng}' }),
  })
  .strict();
export type SharedLocationSettings = z.output<typeof sharedLocationSchema>;

export const sharedLocationSettings = {
  'orders.sharedLocation': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'orders',
    version: V324,
    schema: sharedLocationSchema,
    // hardcode-ok: off as shipped — the owner switches each part on (Settings › Privacy & data); the map link is editable
    default: { orderPage: false, sticker: false, mapLink: 'https://www.google.com/maps/search/?api=1&query={lat},{lng}' },
    valueType: 'JSON',
    labelKey: 'orders.sharedLocation.label',
    helpKey: 'orders.sharedLocation.help',
    sortOrder: 342,
  }),
};
