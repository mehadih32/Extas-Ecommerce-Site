// S12 · CN-031 lane A — the journal (blog): articles, categories, authors and their publish states (registry versions
// 222–229, lane A's After-launch run). Everything is off as it ships.
//   v222 · PR 239 `blog.journal` — the shop serves the journal (/journal, /bn/journal) only while `on`; until then the
//          page says "Coming soon" as before. The admin (Website › Blog & journal) works either way. Reading time is
//          the article's words over the words a reader reads a minute in its language, never less than `minMinutes`.
//          `reviewByAnother`: a person may not pass his own article's review steps (C11.2 "never the writer").
//          `aiNote`: the honest line on an AI author's page and byline; empty = the shop's own words (C11.3).
//   v223 · PR 242 `blog.clusters` — the topical cluster planner (C4.5, C11.2): which links an article of a cluster must
//          carry (to its pillar article, to the cluster's shop page; the pillar to each live article of its cluster),
//          shown on the planner always; `requireLinks` refuses publishing or scheduling while one is missing (off as
//          it ships). A new topic is compared word by word with every article and topic: from `dupNear` % it is
//          "a little alike", from `dupWarn` % "very close" and it needs a second press to add.
import { z } from 'zod';
import { setting } from './define';

const V239 = 222;
const V242 = 223;

const wpm = z.int().min(60).max(400);
const note = z.string().trim().max(200);

export const blogJournalSchema = z
  .object({
    /** The shop serves the journal pages; off = "Coming soon" (the admin still works). */
    on: z.boolean(),
    /** Articles on one listing page. */
    perPage: z.int().min(6).max(48),
    /** Words a reader reads in a minute, per language (reading time). */
    wordsPerMinuteEn: wpm,
    wordsPerMinuteBn: wpm,
    /** The shortest reading time shown, in minutes. */
    minMinutes: z.int().min(1).max(10),
    /** Products the article's product block shows at most (0 = no block). */
    relatedProducts: z.int().min(0).max(8),
    /** A person may not pass the review steps of an article he wrote himself. */
    reviewByAnother: z.boolean(),
    /** The honest line on an AI author's byline and page; empty = the shop's own words. */
    aiNote: z.object({ en: note, bn: note }).strict(),
  })
  .strict();
export type BlogJournalSettings = z.output<typeof blogJournalSchema>;

export const journalSettings = {
  'blog.journal': setting({
    scope: 'store',
    schema: blogJournalSchema,
    default: { on: false, perPage: 12, wordsPerMinuteEn: 200, wordsPerMinuteBn: 150, minMinutes: 2, relatedProducts: 4, reviewByAnother: false, aiNote: { en: '', bn: '' } },
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.journal.label',
    helpKey: 'blog.journal.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 10,
    version: V239,
  }),
};

export const blogClustersSchema = z
  .object({
    /** Publishing or scheduling an article of a cluster is refused while a required link is missing. */
    requireLinks: z.boolean(),
    /** A supporting article must link to its cluster's pillar article. */
    linkPillar: z.boolean(),
    /** A supporting article must link to its cluster's shop page (a collection or a product). */
    linkTarget: z.boolean(),
    /** The pillar article must link to every live supporting article of its cluster. */
    pillarLinksAll: z.boolean(),
    /** From this word overlap (%) a new topic is "a little alike" an article or topic. */
    dupNear: z.int().min(10).max(100),
    /** From this word overlap (%) it is "very close" and needs a second press to add. */
    dupWarn: z.int().min(10).max(100),
  })
  .strict()
  .refine((v) => v.dupNear <= v.dupWarn, { path: ['dupNear'] });
export type BlogClustersSettings = z.output<typeof blogClustersSchema>;

export const clusterSettings = {
  'blog.clusters': setting({
    scope: 'store',
    schema: blogClustersSchema,
    default: { requireLinks: false, linkPillar: true, linkTarget: true, pillarLinksAll: true, dupNear: 40, dupWarn: 60 },
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.clusters.label',
    helpKey: 'blog.clusters.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 20,
    version: V242,
  }),
};
