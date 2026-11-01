// S14 · PR 293 — the AI campaign writer (Blueprint C6.1 item 3): 2 or 3 versions of an offer e-mail or SMS, drafted in
// the owner's voice (`customers.aiWriter`: his greeting, sign-off and how he talks, per language) from what he says the
// message is about. Off twice over as shipped: AI for the whole shop (`ai.enabled`) and the writer itself. The writer
// is handed in by the caller (the app's AI connection: the practice writer until a provider's key is in the vault), so
// this package needs no adapter. Whatever comes back is checked before anyone sees it: only the {words} the channel can
// fill, within the lengths, nothing empty; a version that fails is left out. A draft only fills the form — nothing is
// saved, scheduled or sent here. Every draft is in the audit log (what was asked for, not the words).
import { audit, requirePermission } from '@extas/auth';
import type { AiWriterSettings } from '@extas/settings';
import { z } from 'zod';
import { checkStoreId, parse, setting, type CustomersDeps, type Who } from './context';
import { EMAIL_LOCALES, EMAIL_TOKENS, EMAIL_WRITE } from './email-marketing';
import { CustomersError } from './errors';

export const AI_COPY_CHANNELS = ['email', 'sms'] as const;
export type AiCopyChannel = (typeof AI_COPY_CHANNELS)[number];
/** The {words} an SMS template can fill (Messages › Templates; a subset of @extas/messages MESSAGE_TOKENS). */
export const SMS_COPY_TOKENS = ['customerName', 'storeName'] as const;
/** Who may ask: whoever may write that channel's words. */
export const AI_COPY_PERMISSION = { email: EMAIL_WRITE, sms: 'messages.templates.write' } as const;
/** An e-mail's longest subject and body (the e-mail forms' own limits). */
export const EMAIL_COPY_MAX = { subject: 150, body: 10_000 } as const;
/** The longest brief. */
export const BRIEF_MAX = 500;

/** What the caller's AI connection takes (the shape of @extas/adapters `AiCampaignInput`). */
export interface CampaignWriterInput {
  channel: AiCopyChannel;
  locale: 'en' | 'bn';
  brief: string;
  voice: { greeting: string; signOff: string; style: string };
  versions: number;
  words: readonly string[];
  max: { subject: number; body: number };
}

/** The caller's AI connection (the app passes the AI_PROVIDER adapter it reached). */
export interface CampaignWriterLink {
  api: { draftCampaign(input: CampaignWriterInput): Promise<{ versions: { subject?: string; body: string }[]; practice: boolean }> };
  provider: string;
  mode: string;
}

export interface AiCopy {
  versions: { subject: string | null; body: string }[];
  /** The practice writer's text (no AI provider yet). */
  practice: boolean;
  provider: string;
  mode: string;
}

const input = z
  .object({
    channel: z.enum(AI_COPY_CHANNELS),
    locale: z.enum(EMAIL_LOCALES),
    brief: z.string().trim().min(1).max(BRIEF_MAX),
  })
  .strict();

/** Is the writer on for this store (AI for the shop and the writer)? The pages show "Write with AI" only then. */
export async function aiWriterOn(deps: Pick<CustomersDeps, 'settings'>, storeId: number): Promise<boolean> {
  const [ai, s] = await Promise.all([deps.settings.value('ai.enabled', { storeId }), setting(deps, storeId, 'customers.aiWriter')]);
  return ai && s.enabled;
}

/** The {words} in a text that the channel cannot fill. */
function strayWords(text: string, allowed: readonly string[]): string[] {
  return [...text.matchAll(/\{([^{}]*)\}?/gu)].map((m) => m[1] ?? '').filter((w) => !allowed.includes(w));
}

/** Drafts 2–3 versions. Needs the channel's write key; refused while switched off; nothing is saved. Audited. */
export async function draftCampaignCopy(deps: CustomersDeps, who: Who, raw: unknown, writer: () => Promise<CampaignWriterLink>): Promise<AiCopy> {
  checkStoreId(who.storeId);
  const d = parse(input, raw, 'AI draft');
  const S = who.storeId;
  await requirePermission(deps.db, who.actor, AI_COPY_PERMISSION[d.channel], { storeId: S });
  if (!(await aiWriterOn(deps, S))) throw new CustomersError('SWITCHED_OFF', 'the AI campaign writer is switched off', ['customers.aiWriter']);
  const s: AiWriterSettings = await setting(deps, S, 'customers.aiWriter');
  const words: readonly string[] = d.channel === 'email' ? EMAIL_TOKENS : SMS_COPY_TOKENS;
  const max = d.channel === 'email' ? { ...EMAIL_COPY_MAX } : { subject: 0, body: s.smsMaxChars };

  let link: CampaignWriterLink;
  let out: Awaited<ReturnType<CampaignWriterLink['api']['draftCampaign']>>;
  try {
    link = await writer();
    out = await link.api.draftCampaign({ channel: d.channel, locale: d.locale, brief: d.brief, voice: { greeting: s.greeting[d.locale], signOff: s.signOff[d.locale], style: s.style[d.locale] }, versions: s.versions, words, max });
  } catch {
    throw new CustomersError('AI_UNAVAILABLE', 'the AI writer did not answer', ['ai']);
  }

  const len = (x: string) => [...x].length;
  const versions = out.versions
    .slice(0, s.versions)
    .map((v) => ({ subject: d.channel === 'email' ? (v.subject ?? '').trim() : null, body: (v.body ?? '').trim() }))
    .filter((v) => v.body && len(v.body) <= max.body && !strayWords(v.body, words).length)
    .filter((v) => v.subject === null || (v.subject && len(v.subject) <= max.subject && !strayWords(v.subject, words).length));
  if (!versions.length) throw new CustomersError('AI_UNAVAILABLE', 'the AI writer gave nothing usable', ['ai']);

  await audit(deps.db, who.actor, { action: 'customers.aiWriter.draft', entityType: 'AiCampaignDraft', entityId: d.channel, storeId: S, after: { channel: d.channel, locale: d.locale, briefChars: len(d.brief), versions: versions.length, provider: link.provider, mode: link.mode, practice: out.practice } }, who.ctx);
  return { versions, practice: out.practice, provider: link.provider, mode: link.mode };
}
