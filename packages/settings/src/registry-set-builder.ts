// S03 · "Build your own set" — PR 98 and PR 100 (Blueprint D3.9 "Build-your-own set", D3.11 tier box; demo 41-set.js
// PAGES.set). Registry version 36 (the reviews took 35). Labels: messages/set-builder.<lang>.json. Every
// word the page shows is in the shop dictionary (apps/web/messages/shop-build.<lang>.json, `build.*`), editable in both
// languages through `language.labels`.
//
// Nothing here holds money: the set prices are the set tier rules' own ("any 2 for X, any 3 for Y"), written and
// switched only in Smart Rules (`setTier`, S10 · PR 212; read by S03 · PR 99), and the bag prices the pieces with the
// same rules. These settings only say whether customers may build their own sets and where. Blueprint D3.9: "customer-
// built sets sit behind a global and per-category toggle, default OFF" — so the whole page ships off (CN-018), and
// `rules` / `categories` narrow it once it is on.
import { z } from 'zod';
import { setting } from './define';

const V = 36;

/** A Smart Rules key (the set tier rules the builder offers). */
const ruleKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);

/** PR 98, 100 — the set builder page `/combos/build-your-own` and its entries. */
export const setBuilderSchema = z
  .object({
    /** The builder is open to customers (the global toggle, off until the owner turns it on). */
    on: z.boolean(),
    /** Which set tier rules the builder offers, by their Smart Rules key; empty = every live set tier rule. */
    rules: z.array(ruleKey).max(50),
    /** In which categories the builder shows products (and sub-categories); empty = every category its rules cover. */
    categories: z.array(z.uuid()).max(200),
    /** The most styles one group shows (the best-ranked first). */
    maxStyles: z.int().min(1).max(200),
    /** "৳X per item" under each tier's price. */
    perItem: z.boolean(),
    /** The "Build your own" row on the sets landing page and the link beside "More sets" (only while the builder is on). */
    entries: z.boolean(),
  })
  .strict();
export type SetBuilderSettings = z.infer<typeof setBuilderSchema>;

const base = { scope: 'store', isOwnerData: false, isPublic: true, group: 'combos', version: V } as const;

export const setBuilderSettings = {
  'combos.builder': setting({
    ...base,
    schema: setBuilderSchema,
    default: { on: false, rules: [], categories: [], maxStyles: 24, perItem: true, entries: true },
    valueType: 'JSON',
    labelKey: 'combos.builder.label',
    helpKey: 'combos.builder.help',
    sortOrder: 260,
  }),
};
