// S11 · PR 588 (Blueprint C12.1, the Google traffic plan) — the Bengali translation gate (registry version 84; lane B's
// reserved run, CN-031). A `/bn` page is listed by search engines, named in the sitemap and given hreflang only once
// its page key is in `language.bengali.readyPages` (its main content translated and approved on Website › SEO ›
// Bengali pages). This setting says what a visitor sees on a Bengali page that is not ready yet:
// - `unlisted` (as it ships): the page shows in Bengali with whatever is translated, kept out of search engines;
// - `english`: the visitor is sent to the English twin (a temporary redirect) until the page is marked ready.
// Pages that are not content (bag, checkout, account, search) are never sent anywhere by it.
import { z } from 'zod';
import { setting } from './define';

const V = 84;

export const BENGALI_GATE_MODES = ['unlisted', 'english'] as const;
export const bengaliGateSchema = z.object({ notReady: z.enum(BENGALI_GATE_MODES) }).strict();
export type BengaliGateSettings = z.output<typeof bengaliGateSchema>;

export const bengaliSettings = {
  'language.bengali.gate': setting({
    scope: 'store',
    schema: bengaliGateSchema,
    default: { notReady: 'unlisted' },
    valueType: 'JSON',
    group: 'language',
    labelKey: 'language.bengali.gate.label',
    helpKey: 'language.bengali.gate.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 21,
    version: V,
  }),
};
