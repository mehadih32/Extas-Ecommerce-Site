// S15 · PR 341 (Blueprint D5.3, "weekly and monthly digests to Telegram and e-mail") — the digest's own settings.
// Off by default on both channels (CN-018: "new optional features: off by default, an on/off switch"), unlike
// `analytics.events` (registry-analytics.ts) whose capture has no outside effect — a digest reaches the owner's own
// Telegram and inbox, so it ships quiet until he turns a channel on. No automatic schedule is wired yet (there is no
// cross-domain report scheduler in `@extas/jobs` to hook into): the same honest gap `ads.costAlerts` (registry-ads-
// alerts.ts, PR 267) already ships with — "Check now" there, "Run now" here, both read-only (rule 6), both off until
// turned on. `reports.digest.ownerEmail` is the owner's own data (CLAUDE.md rule 4): empty until he types it, never
// shipped to a new installation, and the e-mail channel sends nothing while it is empty even if `emailOn` is true.
import { z } from 'zod';
import { setting } from './define';

const V = 289;

export const reportsDigestLangSchema = z.enum(['bn', 'en']);

export const reportsDigestSettings = {
  'reports.digest.telegramOn': setting({
    scope: 'store',
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    group: 'reports',
    labelKey: 'reports.digest.telegramOn.label',
    helpKey: 'reports.digest.telegramOn.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 10,
    version: V,
  }),
  'reports.digest.emailOn': setting({
    scope: 'store',
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    group: 'reports',
    labelKey: 'reports.digest.emailOn.label',
    helpKey: 'reports.digest.emailOn.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 20,
    version: V,
  }),
  /** Empty until the owner types it; the e-mail channel is a no-op while this is empty (never a BLOCKED.md question,
   *  CLAUDE.md "owner data is not a blocker"). Same shape as `contact.email` (registry.ts), the owner's other
   *  e-mail setting. */
  'reports.digest.ownerEmail': setting({
    scope: 'store',
    schema: z.email().max(254).nullable(),
    default: null,
    valueType: 'EMAIL',
    group: 'reports',
    labelKey: 'reports.digest.ownerEmail.label',
    helpKey: 'reports.digest.ownerEmail.help',
    isOwnerData: true,
    isPublic: false,
    sortOrder: 30,
    version: V,
  }),
  /** The language of both the Telegram message and the e-mail (the owner's admin language elsewhere; kept as its
   *  own setting here so a digest reads right even before PR 345's bengali-gate choice reaches this group). */
  'reports.digest.lang': setting({
    scope: 'store',
    schema: reportsDigestLangSchema,
    default: 'bn',
    valueType: 'ENUM',
    group: 'reports',
    labelKey: 'reports.digest.lang.label',
    helpKey: 'reports.digest.lang.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 40,
    version: V,
  }),
};
