// S22 · PR 429 (CN-031 lane C; Blueprint B4.6 bullets 1–2, B4.14 item 5) — selling from the chat: the catalogue drawer.
// Registry version 157 (lane C's range). Labels: messages/support-catalogue.<lang>.json; the admin's place is
// Support → Support settings (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// `support.catalogue` (per store):
// - `enabled`: the "Products" button in a chat's reply box — search the shop's products by name, SKU or colour, pick
//   the colour and size, and one press sends a card: its photos, the name, the price and the product's link with an
//   `r=` reference. A click on that link and an order placed from it are credited to the chat and the employee who sent
//   it. Off as it ships (CN-018: a new optional feature is off until the owner switches it on).
// - `photos`: how many of the product's photos go with the card (0–3; the chat's file rules still apply).
// - `results`: how many products one search shows (4–20).
// - `creditDays`: how long after the click an order from that browser is still credited to the chat (1–90 days).
//
// Nothing here moves money or changes a price, a discount, COD or an order's total: the link opens the shop's own page
// at the shop's own price; the credit only names the chat and the employee on the order. Nothing is owner data.
import { z } from 'zod';
import { setting } from './define';

const VID = 157;

export const supportCatalogueSchema = z
  .object({
    enabled: z.boolean(),
    photos: z.number().int().min(0).max(3),
    results: z.number().int().min(4).max(20),
    creditDays: z.number().int().min(1).max(90),
  })
  .strict();
export type SupportCatalogueSettings = z.output<typeof supportCatalogueSchema>;

export const supportCatalogueSettings = {
  'support.catalogue': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportCatalogueSchema,
    default: { enabled: false, photos: 3, results: 8, creditDays: 7 },
    labelKey: 'support.catalogue.label',
    helpKey: 'support.catalogue.help',
    sortOrder: 52,
    version: VID,
  }),
};
