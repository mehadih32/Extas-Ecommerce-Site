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
//   v224 · PR 244 `blog.approval` — the approval queue (S12 answer 11; 19 Oct: the owner approves the topic list as a
//          monthly batch, not each post). `mode` 'owner' (as it ships): a topic from anyone but the owner waits for his
//          yes, month by month; 'auto': it is approved by itself (a very close one still waits while `holdAlike`), and
//          with `autoPublish` an article from an approved topic goes live as soon as its last review step passes. The
//          plan shows a digest of what was decided by itself over the last `digestDays` days.
//   v225 · PR 528 `blog.brief` — the brief form (S12 answer 11): word count, keywords, topic and language are chosen
//          before a word is written. A new brief starts at `wordsDefault` words and may ask between `wordsMin` and
//          `wordsMax`. With `requireForStart` (off as it ships) "Start writing" on a topic needs its brief first; an AI
//          draft (PR 243) always needs one.
//   v226 · PR 243 `blog.aiDraft` — AI drafting from the brief (S12 answer 11), in the brief's language, one article at a
//          time. Off as it ships, and it also needs AI for the whole shop (`ai.enabled`); until an AI provider's key is
//          entered the practice writer serves. At most `dailyMax` drafts in a day (the last 24 hours).
//   v227 · PR 245 `blog.schedule` — the publish calendar (C11.1 "3 a day … then 5 a day … an empty slot is never filled
//          with a weak post"; demo 94-admin-blog.js schedule tab). The day's publishing times (`slots`, shop time zone)
//          and how many articles a day: at least `perDayMin` (a day under it is flagged), `perDayTarget` (the fill
//          stops there), never more than `perDayMax`. "Fill the free times" places the finished articles (SEO checked,
//          nothing missing) in the free times of the next `daysAhead` days, never closer than `leadMinutes` from now.
//          With `autoFill` (off as it ships) an article is placed by itself as soon as its last review step passes.
//          The month view's week starts on `weekStart` (Saturday as it ships).
import { z } from 'zod';
import { setting } from './define';

const V239 = 222;
const V242 = 223;
const V244 = 224;
const V528 = 225;
const V243 = 226;
const V245 = 227;

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

export const blogApprovalSchema = z
  .object({
    /** 'owner': topics wait for the owner's yes (month by month); 'auto': approved by themselves. */
    mode: z.enum(['owner', 'auto']),
    /** In automatic mode a very close topic still waits for the owner. */
    holdAlike: z.boolean(),
    /** In automatic mode an article from an approved topic goes live once its last review step passes. */
    autoPublish: z.boolean(),
    /** The days the digest of what was decided by itself covers. */
    digestDays: z.int().min(1).max(31),
  })
  .strict();
export type BlogApprovalSettings = z.output<typeof blogApprovalSchema>;

export const approvalSettings = {
  'blog.approval': setting({
    scope: 'store',
    schema: blogApprovalSchema,
    default: { mode: 'owner', holdAlike: true, autoPublish: false, digestDays: 1 },
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.approval.label',
    helpKey: 'blog.approval.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 30,
    version: V244,
  }),
};

export const blogBriefSchema = z
  .object({
    /** "Start writing" on a topic needs its brief first. */
    requireForStart: z.boolean(),
    /** The word count a new brief starts at. */
    wordsDefault: z.int().min(100).max(10_000),
    /** The fewest and the most words a brief may ask for. */
    wordsMin: z.int().min(100).max(10_000),
    wordsMax: z.int().min(100).max(10_000),
  })
  .strict()
  .refine((v) => v.wordsMin <= v.wordsDefault && v.wordsDefault <= v.wordsMax, { path: ['wordsDefault'] });
export type BlogBriefSettings = z.output<typeof blogBriefSchema>;

export const briefSettings = {
  'blog.brief': setting({
    scope: 'store',
    schema: blogBriefSchema,
    default: { requireForStart: false, wordsDefault: 900, wordsMin: 300, wordsMax: 3000 },
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.brief.label',
    helpKey: 'blog.brief.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 40,
    version: V528,
  }),
};

export const blogAiDraftSchema = z
  .object({
    /** The brief page offers "Write the first draft with AI". */
    enabled: z.boolean(),
    /** The most AI drafts in a day (the last 24 hours). */
    dailyMax: z.int().min(1).max(50),
  })
  .strict();
export type BlogAiDraftSettings = z.output<typeof blogAiDraftSchema>;

export const aiDraftSettings = {
  'blog.aiDraft': setting({
    scope: 'store',
    schema: blogAiDraftSchema,
    default: { enabled: false, dailyMax: 6 },
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.aiDraft.label',
    helpKey: 'blog.aiDraft.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 50,
    version: V243,
  }),
};

/** A publishing time of day, `HH:MM` (24 hours). */
export const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const blogScheduleSchema = z
  .object({
    /** The day's publishing times, in the shop's time zone, comma separated (`09:00, 12:00`). */
    slots: z
      .string()
      .trim()
      .max(200)
      .refine((v) => {
        const all = v.split(',').map((x) => x.trim());
        return all.length >= 1 && all.length <= 24 && all.every((x) => SLOT_RE.test(x)) && new Set(all).size === all.length;
      }),
    /** At least this many articles a day (a day under it is flagged). */
    perDayMin: z.int().min(1).max(24),
    /** The fill stops at this many a day. */
    perDayTarget: z.int().min(1).max(24),
    /** Never more than this many a day. */
    perDayMax: z.int().min(1).max(24),
    /** How many days ahead the fill places articles and the calendar shows free times. */
    daysAhead: z.int().min(1).max(60),
    /** A free time closer than this many minutes from now is not used. */
    leadMinutes: z.int().min(0).max(1440),
    /** Place an article in the next free time as soon as its last review step passes. */
    autoFill: z.boolean(),
    /** The day the calendar's week starts on (0 Sunday … 6 Saturday). */
    weekStart: z.int().min(0).max(6),
  })
  .strict()
  .refine((v) => v.perDayMin <= v.perDayTarget && v.perDayTarget <= v.perDayMax, { path: ['perDayTarget'] });
export type BlogScheduleSettings = z.output<typeof blogScheduleSchema>;

export const scheduleSettings = {
  'blog.schedule': setting({
    scope: 'store',
    schema: blogScheduleSchema,
    default: { slots: '09:00, 12:00, 15:00, 18:00, 21:00', perDayMin: 3, perDayTarget: 5, perDayMax: 6, daysAhead: 7, leadMinutes: 15, autoFill: false, weekStart: 6 },
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.schedule.label',
    helpKey: 'blog.schedule.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 60,
    version: V245,
  }),
};
