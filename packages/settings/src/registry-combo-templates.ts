// S03 · the combo templates — PR 572 (a rule's category page, L1–L5), PR 573 (the pair page, P1–P5) and PR 574 (a set
// in the bag, B1–B5) (Blueprint D8.4; demo 42-combo-auto.js, 43-combo-tpl.js). Registry version 39. Labels:
// messages/combo-templates.<lang>.json. Which template a page uses is `combos.template.list|page|bag` (registry-combos,
// a rule may choose its own on /admin/combos); these settings only say how much each template shows, with the demo's
// own numbers. No money and no perk: the set prices are the owner's, per combo or per rule (`combos.prices`).
import { z } from 'zod';
import { setting } from './define';

const V = 39;

/** PR 572 — a rule's category page: past `seeAllOver` pairs the first `firstShown` show with "See all N" (L1, L5),
 * L4's big cards show `bigListShown` before "Show N more", and the "Pick your own colours" card leads or ends the grid. */
export const comboListPageSchema = z
  .object({
    seeAllOver: z.int().min(1).max(500),
    firstShown: z.int().min(1).max(500),
    bigListShown: z.int().min(1).max(500),
    builderCard: z.boolean(),
  })
  .strict()
  .refine((v) => v.firstShown <= v.seeAllOver, { message: 'show at most as many as the "See all" point', path: ['firstShown'] });

const base = { scope: 'store', isOwnerData: false, isPublic: true, group: 'combos', version: V } as const;

export const comboTemplateSettings = {
  'combos.list': setting({
    ...base,
    schema: comboListPageSchema,
    default: { seeAllOver: 15, firstShown: 8, bigListShown: 6, builderCard: true },
    valueType: 'JSON',
    labelKey: 'combos.list.label',
    helpKey: 'combos.list.help',
    sortOrder: 300,
  }),
  // A review aid, like the demo's template bar: `?tpl=L2` (or P3, `?btpl=B4` on the bag) shows another template on
  // the shop without changing the shop's choice; such a page is never shown to search engines.
  'combos.template.preview': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'combos.template.preview.label',
    helpKey: 'combos.template.preview.help',
    sortOrder: 310,
  }),
};
