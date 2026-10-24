// S05 · order edits — PR 142: the team's edit of an order, with the reason the team picks and where the customer asked
// (B1.10: every edit records where it came from, with who and when), and the real-life reasons SIM-F-038 found missing
// (the parcel-refusal reasons). Registry version 37 (the set builder took 36). Labels: messages/orders.<lang>.json (the same Orders group); the
// starting lists are under `defaults.orders` there, in both languages, and the owner edits them in the admin.
//
// Nothing here changes a price, a discount, a delivery charge or COD: an edit changes who and where a parcel goes to and
// which size goes in it at the SAME price, and taking a piece out lowers the order's total by exactly that piece (a paid
// order's overpaid part only becomes a refund REQUEST; no money moves). SIM-F-004: every edit is refused once a courier
// is booked, so an edit never silently diverges from the parcel.
import { setting } from './define';
import { ordersDictionaryDefault } from './registry-orders';
import { dictionarySchema } from './schemas';

const V = 37;

const list = dictionarySchema.refine((l) => l.length > 0, { message: 'at least one entry' });

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
  // SIM-F-038: the parcel-refusal reasons (bought elsewhere, arrived after Eid …) for the outcome the courier reports.
  'orders.refusal.reasons': setting({
    ...base,
    schema: list,
    default: ordersDictionaryDefault('refusalReasons'),
    valueType: 'JSON',
    labelKey: 'orders.refusal.reasons.label',
    helpKey: 'orders.refusal.reasons.help',
    sortOrder: 250,
  }),
};
