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
import { z } from 'zod';
import { setting } from './define';

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
};
