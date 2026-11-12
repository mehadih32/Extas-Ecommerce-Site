// S23 · PR 437 (Blueprint C5 · Social & content studio) — the studio's own switches (registry version 281). Labels:
// messages/admin-studio.<lang>.json (group `marketing`).
//
// - `studio.content`: the weekly cadence the auto-schedule rules (PR 442) read — how many image posts and reels a day,
//   and which weekdays (ISO, 1 Monday … 7 Sunday) it runs on. Off as it ships (0 posts, 0 reels, no days): nothing is
//   generated or queued until the owner sets a number (CN-018 — every number a setting, off by default).
// - `studio.voice`: the brand voice the caption writer (PR 439) and every template read — a short tone line, the
//   hashtag set added to every caption, and words the studio must never use. Empty as it ships.
// - `studio.ai.captions`: whether the AI writer drafts the hook and caption at all. Off as it ships (CLAUDE.md: AI is
//   off on the live site until the owner turns it on); while off, a job's caption comes from the template's own text
//   with its placeholders filled, never from the AI.
// Nothing here publishes, schedules or spends anything by itself — these are read by the jobs and pages that do.
import { z } from 'zod';
import { setting } from './define';

const V = 281;

export const studioContentSchema = z
  .object({
    /** Image/carousel posts a day, across every switched-on platform. 0 = nothing generated. */
    dailyPosts: z.number().int().min(0).max(20),
    /** Reels/Shorts a day. 0 = nothing generated. */
    dailyReels: z.number().int().min(0).max(10),
    /** ISO weekdays (1 Monday … 7 Sunday) the cadence runs on; empty = never, however high the counts. */
    activeWeekdays: z.array(z.number().int().min(1).max(7)).max(7),
  })
  .strict();
export type StudioContentSettings = z.infer<typeof studioContentSchema>;
export const STUDIO_CONTENT_DEFAULT: StudioContentSettings = { dailyPosts: 0, dailyReels: 0, activeWeekdays: [] };

export const studioVoiceSchema = z
  .object({
    toneEn: z.string().trim().max(300),
    /** Added to every caption after its own hashtags, without the leading "#" (added when shown). */
    hashtagSet: z.array(z.string().trim().min(1).max(40)).max(30),
    /** A caption that uses one of these words (case-insensitive) is refused before it is queued. */
    blockedWords: z.array(z.string().trim().min(1).max(40)).max(100),
  })
  .strict();
export type StudioVoiceSettings = z.infer<typeof studioVoiceSchema>;
export const STUDIO_VOICE_DEFAULT: StudioVoiceSettings = { toneEn: '', hashtagSet: [], blockedWords: [] };

export const studioSettings = {
  'studio.content': setting({
    schema: studioContentSchema,
    default: STUDIO_CONTENT_DEFAULT,
    scope: 'store',
    valueType: 'JSON',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.content.label',
    helpKey: 'studio.content.help',
    sortOrder: 10,
    version: V,
  }),
  'studio.voice': setting({
    schema: studioVoiceSchema,
    default: STUDIO_VOICE_DEFAULT,
    scope: 'store',
    valueType: 'JSON',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.voice.label',
    helpKey: 'studio.voice.help',
    sortOrder: 11,
    version: V,
  }),
  'studio.ai.captions': setting({
    schema: z.boolean(),
    default: false,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.ai.captions.label',
    helpKey: 'studio.ai.captions.help',
    sortOrder: 12,
    version: V,
  }),
};
