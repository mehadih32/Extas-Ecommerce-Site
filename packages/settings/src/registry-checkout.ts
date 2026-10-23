// S04 · PR 115–126 — the checkout (Sawdagor, Shilpi). The order and its money are rows (Order, OrderItem, Payment);
// prices, offers, free delivery and COD are the Smart Rules' and the owner's; the delivery charge is the band's figure
// from the delivery-zone engine (S06). These settings only hold how the checkout behaves and what it shows (CN-012:
// the field order, the try-on line …). Every word the checkout shows is in the shop dictionary
// (apps/web/messages/shop.<lang>.json, `checkout.*`), editable in both languages through `language.labels`. Labels:
// messages/checkout.<lang>.json. Registry version 20.
//
// CN-018: nothing here makes a claim on its own, and every optional feature ships off. No money sits here as a default:
// an amount the owner fixes has no default (null) and needs his OK.
import { z } from 'zod';
import { setting } from './define';

const V = 20;

/** A field of "Delivery details". */
export const checkoutFieldSchema = z.enum(['name', 'phone', 'address']);

const base = { scope: 'store', isOwnerData: false, group: 'checkout', version: V } as const;

export const checkoutSettings = {
  // ---- PR 115 · the page ----
  'checkout.fieldOrder': setting({
    ...base,
    schema: z.array(checkoutFieldSchema).min(1).max(3),
    default: ['name', 'phone', 'address'],
    valueType: 'JSON',
    labelKey: 'checkout.fieldOrder.label',
    helpKey: 'checkout.fieldOrder.help',
    sortOrder: 10,
  }),
  'checkout.tryOn.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.tryOn.enabled.label',
    helpKey: 'checkout.tryOn.enabled.help',
    sortOrder: 20,
  }),
  'checkout.help.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.help.enabled.label',
    helpKey: 'checkout.help.enabled.help',
    sortOrder: 30,
  }),

  // ---- PR 116 · name, phone and address: the shortest name and address the order takes (letters, not bytes) ----
  'checkout.form.nameMin': setting({
    ...base,
    schema: z.int().min(1).max(20),
    default: 2,
    valueType: 'INT',
    labelKey: 'checkout.form.nameMin.label',
    helpKey: 'checkout.form.nameMin.help',
    sortOrder: 40,
  }),
  'checkout.form.addressMin': setting({
    ...base,
    schema: z.int().min(4).max(60),
    default: 8,
    valueType: 'INT',
    labelKey: 'checkout.form.addressMin.label',
    helpKey: 'checkout.form.addressMin.help',
    sortOrder: 50,
  }),
};
