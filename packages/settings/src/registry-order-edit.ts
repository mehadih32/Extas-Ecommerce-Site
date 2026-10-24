// S05 · order edits — PR 142: the team's edit of an order, with the reason the team picks and where the customer asked
// (B1.10: every edit records where it came from, with who and when), and the real-life reasons SIM-F-038 found missing
// (the parcel-refusal reasons). Registry version 37 (the set builder took 36). Labels: messages/orders.<lang>.json (the same Orders group); the
// starting lists are under `defaults.orders` there, in both languages, and the owner edits them in the admin.
//
// Nothing here changes a price, a discount, a delivery charge or COD: an edit changes who and where a parcel goes to and
// which size goes in it at the SAME price, and taking a piece out lowers the order's total by exactly that piece (a paid
// order's overpaid part only becomes a refund REQUEST; no money moves). SIM-F-004: every edit is refused once a courier
// is booked, so an edit never silently diverges from the parcel.
// PR 143: the customer's own edit from his order page — off by default (CN-018), capped, until processing starts.
// PR 146: the two-size follow-up — off by default; a family's sizes (the bag's "for different people" answer) are only a
// note (SIM-F-036), any other S + M asks the customer which he wants before packing.
import { z } from 'zod';
import { setting } from './define';
import { ordersDictionaryDefault } from './registry-orders';
import { dictionarySchema } from './schemas';

const V = 37;

const list = dictionarySchema.refine((l) => l.length > 0, { message: 'at least one entry' });

/**
 * PR 143 — the customer's own edit from his order page (B1.10 "may edit twice from the dashboard before packing";
 * demo 60-account.js ord_editCard). `until`: "placed" while the order is new, "confirmed" also after the team confirms
 * it, until picking starts (never after a courier is booked). `windowMinutes`: after placing (0: only the step counts).
 * `maxEdits`: how many saves per order. `phone`, `address`, `size`: what he may change (a size only to another size of
 * the same piece in the same colour at the same price, with stock).
 */
export const customerEditSchema = z
  .object({
    enabled: z.boolean(),
    until: z.enum(['placed', 'confirmed']),
    windowMinutes: z.int().min(0).max(60 * 24 * 14),
    maxEdits: z.int().min(1).max(20),
    phone: z.boolean(),
    address: z.boolean(),
    size: z.boolean(),
  })
  .strict();

/**
 * PR 146 — the two-size follow-up (Blueprint B1.10; demo 02-core.js "2 sizes — check" / "2 sizes — for someone else").
 * `enabled`: the check runs after each order. `askCustomer`: his order page asks which size he wants (keep all, or only
 * one). `callTask`: the confirmation caller also gets a call task (TWO_SIZE). With no answer, every piece goes.
 */
export const twoSizeSchema = z.object({ enabled: z.boolean(), askCustomer: z.boolean(), callTask: z.boolean() }).strict();

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

export const orderEditSettings = {
  'orders.edit.reasons': setting({
    ...base,
    schema: list,
    default: ordersDictionaryDefault('editReasons'),
    valueType: 'JSON',
    labelKey: 'orders.edit.reasons.label',
    helpKey: 'orders.edit.reasons.help',
    sortOrder: 210,
  }),
  'orders.edit.channels': setting({
    ...base,
    schema: list,
    default: ordersDictionaryDefault('editChannels'),
    valueType: 'JSON',
    labelKey: 'orders.edit.channels.label',
    helpKey: 'orders.edit.channels.help',
    sortOrder: 220,
  }),
  'orders.edit.customer': setting({
    ...base,
    isPublic: true,
    schema: customerEditSchema,
    default: { enabled: false, until: 'confirmed', windowMinutes: 0, maxEdits: 2, phone: true, address: true, size: true },
    valueType: 'JSON',
    labelKey: 'orders.edit.customer.label',
    helpKey: 'orders.edit.customer.help',
    sortOrder: 230,
  }),
  // SIM-F-038: the parcel-refusal reasons (bought elsewhere, arrived after Eid …) for the outcome the courier reports.
  'orders.twoSize': setting({
    ...base,
    schema: twoSizeSchema,
    default: { enabled: false, askCustomer: true, callTask: true },
    valueType: 'JSON',
    labelKey: 'orders.twoSize.label',
    helpKey: 'orders.twoSize.help',
    sortOrder: 240,
  }),
  // PR 157 (SIM-F-044, registry v43): "arrived late", "the wrong item" and "damaged" join the list — refusals the shop
  // caused, which `risk.history.ourFaultRefusals` keeps out of the customer's risk score.
  // PR 526 (registry v58): "didn't like it" and "ordered by mistake" join the list — the rider's words on a return;
  // the list now names why any parcel came back (refused at the door or sent back with the rider), not only refusals.
  'orders.refusal.reasons': setting({
    ...base,
    version: 58,
    schema: list,
    default: ordersDictionaryDefault('refusalReasons'),
    valueType: 'JSON',
    labelKey: 'orders.refusal.reasons.label',
    helpKey: 'orders.refusal.reasons.help',
    sortOrder: 250,
  }),
};
