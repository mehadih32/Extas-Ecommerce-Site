// PR 745–749 (owner order 15 Nov 2026, the customisation gaps report groups ক and খ) — the owner changes the shop's
// look from the admin, with no code. Three settings join the registry (registry version 745); everything else those PRs
// edit already had a setting. Labels: messages/customise.<lang>.json.
//   • `brand.ogImage` — the picture a link to the shop shows in WhatsApp, Facebook and search (Open Graph). Not set = no
//     picture, as before.
//   • `card.tagBadges` — which product tag becomes the badge on a product card, in what order, with which words. Empty =
//     the product's first tag, as before.
//   • `catalogue.collections.order` — the owner's own order of the collection list. Empty = by name, as before.
import { z } from 'zod';
import { setting } from './define';
import { dictionaryKeySchema, mediaRefSchema } from './schemas';

const V = 745;

const wordsPair = z.object({ en: z.string().trim().min(1).max(24), bn: z.string().trim().min(1).max(24) }).strict();
const eachOnce = (what: string) => ({ message: `each ${what} once` });

/** `card.tagBadges`: `order` is the tag links that may show as a badge (first match wins), `hidden` are tags that never
 * show, `labels` replaces a tag's own name on the card (in both languages). */
export const tagBadgesSchema = z
  .object({
    order: z.array(dictionaryKeySchema).max(60).refine((a) => new Set(a).size === a.length, eachOnce('tag')),
    hidden: z.array(dictionaryKeySchema).max(60).refine((a) => new Set(a).size === a.length, eachOnce('tag')),
    labels: z.record(dictionaryKeySchema, wordsPair).refine((r) => Object.keys(r).length <= 60, { message: 'too many labels' }),
  })
  .strict();
export type TagBadgesSetting = z.output<typeof tagBadgesSchema>;

export const collectionOrderSchema = z.array(dictionaryKeySchema).max(200).refine((a) => new Set(a).size === a.length, eachOnce('collection'));

export const customiseSettings = {
  'brand.ogImage': setting({
    schema: mediaRefSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'MEDIA_REF',
    group: 'brand',
    labelKey: 'brand.ogImage.label',
    helpKey: 'brand.ogImage.help',
    isOwnerData: true,
    sortOrder: 50,
    version: V,
  }),
  'card.tagBadges': setting({
    schema: tagBadgesSchema,
    default: { order: [], hidden: [], labels: {} },
    scope: 'store',
    valueType: 'JSON',
    group: 'home',
    labelKey: 'card.tagBadges.label',
    helpKey: 'card.tagBadges.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 310,
    version: V,
  }),
  'catalogue.collections.order': setting({
    schema: collectionOrderSchema,
    default: [],
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.collections.order.label',
    helpKey: 'catalogue.collections.order.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 320,
    version: V,
  }),
};
