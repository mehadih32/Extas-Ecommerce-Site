// S14 · customers (PR 284–286). Registry version 60. Labels: messages/customers.<lang>.json (the "customers" group; the
// admin's place is the Customers section, docs/BACKEND-ARCHITECTURE.md §5.5, on the new admin shell). Nothing here moves
// money, changes a price, COD or a charge, or blocks anyone.
//
// PR 284 (`customers.merge`, `customers.phoneMask`): one customer record per phone number (Blueprint B5.5); two profiles
// of one person (a second number, an old account) are merged only by a person, never by the shop itself. The merge
// rules say which matches put a pair on the "To review" list: the same e-mail, one profile's WhatsApp number being the
// other's phone, the same name with the same address, or the same identity in the order identity graph (S06 PR 519,
// only while the owner has it on). "Not the same person" takes a pair off the list for good. How many pairs the list
// reads at a time. The phone number is shown in full to a person who holds the "full phone number" permission (Note
// 24.1: the owner sees every number); everyone else sees it masked, with this many digits kept at the start and the end.
//
// PR 285 (`customers.list`): the Customers list — how many customers one page shows, how many orders make a customer
// "Returning" (fewer is "New"), after how many days without an order a customer who had a delivery is "At risk", and the
// delivered spend that makes a customer VIP (empty: no VIP view until the owner types his own figure, CN-018).
//
// PR 286 (`customers.profile`): one customer's page — how many orders, exchanges and support conversations each list
// shows before "Older", and how many lines of "Who looked at this customer" it shows.
import { z } from 'zod';
import { setting } from './define';
import { moneyMinorSchema } from './schemas';

const V = 60;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'customers', version: V } as const;

/** PR 284 — the matches that put two profiles on the "To review" list (`identity` reads the S06 identity graph). */
export const MERGE_SIGNALS = ['email', 'whatsapp', 'nameAddress', 'identity'] as const;
export type MergeSignal = (typeof MERGE_SIGNALS)[number];

/** PR 284 — the merge rules: whether pairs are suggested at all, by which matches, how many at a time. */
export const mergeRulesSchema = z
  .object({
    suggest: z.boolean(),
    signals: z.array(z.enum(MERGE_SIGNALS)).max(MERGE_SIGNALS.length),
    /** How many suggested pairs the list reads and shows at a time. */
    perPage: z.int().min(1).max(200),
    /** A note is needed to merge (a split always needs one). */
    noteRequired: z.boolean(),
  })
  .strict()
  .refine((v) => new Set(v.signals).size === v.signals.length, { message: 'every signal once' });

/** PR 284 — the digits kept at the start and the end of a masked phone number (01712-345678 → 017•••••678). */
export const phoneMaskSchema = z.object({ first: z.int().min(0).max(5), last: z.int().min(0).max(5) }).strict();

/** PR 285 — the list and its views. */
export const customerListSchema = z
  .object({
    pageSize: z.int().min(10).max(100),
    /** Orders that make a customer "Returning"; fewer is "New". */
    returningMinOrders: z.int().min(2).max(50),
    /** Days without an order after which a customer who had a delivery is "At risk". */
    atRiskDays: z.int().min(7).max(3650),
    /** Delivered spend (minor units) that makes a customer VIP; null: no VIP view. */
    vipMinSalesMinor: moneyMinorSchema.nullable(),
  })
  .strict();

/** PR 286 — one customer's page. */
export const customerProfileSchema = z
  .object({
    ordersPerPage: z.int().min(5).max(100),
    listsPerPage: z.int().min(3).max(50),
    accessLogShown: z.int().min(0).max(100),
  })
  .strict();

export const customerSettings = {
  'customers.merge': setting({
    ...base,
    schema: mergeRulesSchema,
    default: { suggest: true, signals: ['email', 'whatsapp', 'nameAddress', 'identity'], perPage: 20, noteRequired: false }, // hardcode-ok: registry default (a page of pairs)
    valueType: 'JSON',
    labelKey: 'customers.merge.label',
    helpKey: 'customers.merge.help',
    sortOrder: 100,
  }),
  'customers.phoneMask': setting({
    ...base,
    schema: phoneMaskSchema,
    default: { first: 3, last: 3 }, // hardcode-ok: registry default (digits kept visible)
    valueType: 'JSON',
    labelKey: 'customers.phoneMask.label',
    helpKey: 'customers.phoneMask.help',
    sortOrder: 110,
  }),
  'customers.list': setting({
    ...base,
    schema: customerListSchema,
    default: { pageSize: 50, returningMinOrders: 2, atRiskDays: 60, vipMinSalesMinor: null }, // hardcode-ok: registry default (demo 91-admin-crm.js: 2+ orders, 60 days)
    valueType: 'JSON',
    labelKey: 'customers.list.label',
    helpKey: 'customers.list.help',
    sortOrder: 120,
  }),
  'customers.profile': setting({
    ...base,
    schema: customerProfileSchema,
    default: { ordersPerPage: 20, listsPerPage: 10, accessLogShown: 10 }, // hardcode-ok: registry default (rows per list)
    valueType: 'JSON',
    labelKey: 'customers.profile.label',
    helpKey: 'customers.profile.help',
    sortOrder: 130,
  }),
};
