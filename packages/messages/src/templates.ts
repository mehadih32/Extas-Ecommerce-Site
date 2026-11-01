// S14 · PR 505 — Messages › Templates (MSG-03, ADMIN-ARCHITECTURE §4.6; demo V12.4 #/admin/messages/templates): every
// SMS, WhatsApp and e-mail template of the store, grouped by its key, with where each is used (which journey step or
// other message sends it, on which channels, whether that is on), the languages it is missing, what is wrong with its
// words, and its preview on the sample order (cash on delivery, prepaid, part-paid) in its own language — the same
// `render` the engine sends with, so a preview never promises what a message would not say (SIM-F-001, SIM-F-025,
// SIM-F-031). A template's words are saved with its version (its last change): a save over someone else's newer one is
// STALE. Its default (the general default pack) can be put back, and a missing language added. An edited WhatsApp
// template loses Meta's approval: a live send skips it (and tries the step's fallback) until it is approved again. The
// auto-reply's settings (`messages.autoReply`) are edited here too. Seeing needs `messages.templates.read`, changing
// `messages.templates.write`; every change is in the audit log. Nothing here sends a message.
import { defaultPack } from '@extas/seed/pack';
import { CRM_EMAIL_TEMPLATE_PREFIX, MESSAGE_CHANNELS, type MessageChannel } from '@extas/settings';
import { z } from 'zod';
import { groupVersion, readGroup, saveGroup, type GroupValues } from './channels';
import { allow, holds, logChange, MessagesError, parse, setting, type MessagesDeps, type SettingsWriter, type Who } from './context';
import { sampleSettingsOf } from './engine';
import {
  BLOCKING_PROBLEMS,
  MESSAGE_TOKENS,
  previewTemplate,
  templateProblems,
  templateUses,
  TEMPLATE_LIMITS,
  unknownTokens,
  waBodyProblems,
  type SamplePreview,
  type SampleSettings,
  type TemplateProblem,
  type TemplateUse,
  type WaBodyProblem,
} from './pure';
import { CONSENT_TEMPLATES } from './whatsapp';

/** The languages a template is written in (the shop's two). */
export const TEMPLATE_LOCALES = ['bn', 'en'] as const;
export type TemplateLocale = (typeof TEMPLATE_LOCALES)[number];

/** The auto-reply's setting, edited on this screen. */
export const AUTO_REPLY_SETTINGS = { autoReply: 'messages.autoReply' } as const;
export type AutoReplyConfig = GroupValues<typeof AUTO_REPLY_SETTINGS>;

const KEY = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/;

export interface TemplateView {
  id: string;
  key: string;
  channel: MessageChannel;
  locale: string;
  name: string;
  subject: string | null;
  body: string;
  /** Sent back with a save: the template's last change. */
  version: string;
  /** WhatsApp: Meta's word on it (null: never sent for approval, or edited since). */
  providerStatus: string | null;
  problems: TemplateProblem[];
  waProblems: WaBodyProblem[];
  previews: SamplePreview[];
  /** Differs from its default (null: the default pack has none for it). */
  edited: boolean | null;
}

export interface MissingTemplate {
  channel: MessageChannel;
  locale: TemplateLocale;
  /** The words to start from: its default, else the same language on another channel, else nothing. */
  draft: { body: string; subject: string | null };
}

export interface TemplateGroup {
  key: string;
  name: string;
  uses: TemplateUse[];
  rows: TemplateView[];
  missing: MissingTemplate[];
  /** Problems over every row (warnings and refusals). */
  problems: number;
  edited: boolean;
}

export interface TemplatesScreen {
  groups: TemplateGroup[];
  /** The tokens a template may use, in the order the editor lists them. */
  tokens: readonly string[];
  limits: typeof TEMPLATE_LIMITS;
  /** The shop's address is known (links can be made). */
  hasHost: boolean;
  /** The shop's own words for the sample order (the page's live preview fills a template as it is typed). */
  sample: SampleSettings;
  autoReply: { config: AutoReplyConfig; version: string };
  perms: { write: boolean };
}

const fromPack = (key: string, channel: string, locale: string) => defaultPack.notificationTemplates.find((t) => t.key === key && t.channel === channel && t.locale === locale) ?? null;

const isChannel = (c: string): c is MessageChannel => (MESSAGE_CHANNELS as readonly string[]).includes(c);

export async function templatesScreen(deps: MessagesDeps, who: Who): Promise<TemplatesScreen> {
  await allow(deps, who, 'messages.templates.read');
  const [write, sample, journey, cancelNotice, advance, consent, auto] = await Promise.all([
    holds(deps, who, 'messages.templates.write'),
    sampleSettingsOf(deps, who.storeId),
    setting(deps, who.storeId, 'messages.journey'),
    setting(deps, who.storeId, 'messages.cancelNotice'),
    setting(deps, who.storeId, 'orders.advanceRequest'),
    setting(deps, who.storeId, 'messages.consent'),
    readGroup(deps, who.storeId, AUTO_REPLY_SETTINGS),
  ]);
  const uses = templateUses({
    journey,
    duplicateTemplate: cancelNotice.duplicateTemplate,
    advance: { template: advance.template, channels: { SMS: advance.channels.SMS, WHATSAPP: advance.channels.WHATSAPP } },
    consentTemplates: Object.values(CONSENT_TEMPLATES),
    consentReplyOn: consent.confirmReply,
    autoReply: auto.autoReply,
  });
  const rows = await deps.db.notificationTemplate.findMany({
    // PR 290: the owner's offer e-mails live on Messages › E-mail, not here
    where: { storeId: who.storeId, archivedAt: null, NOT: { key: { startsWith: CRM_EMAIL_TEMPLATE_PREFIX } } },
    orderBy: [{ key: 'asc' }, { channel: 'asc' }, { locale: 'asc' }],
    select: { id: true, key: true, channel: true, locale: true, name: true, subject: true, body: true, updatedAt: true, providerStatus: true },
  });
  const hasHost = sample.host !== null;
  const byKey = new Map<string, TemplateView[]>();
  for (const r of rows) {
    if (!isChannel(r.channel)) continue;
    const words = { channel: r.channel, locale: r.locale, body: r.body, subject: r.subject };
    const d = fromPack(r.key, r.channel, r.locale);
    const view: TemplateView = {
      id: r.id,
      key: r.key,
      channel: r.channel,
      locale: r.locale,
      name: r.name,
      subject: r.subject,
      body: r.body,
      version: r.updatedAt.toISOString(),
      providerStatus: r.providerStatus,
      problems: templateProblems(words, hasHost),
      waProblems: r.channel === 'WHATSAPP' ? waBodyProblems(r.body) : [],
      previews: previewTemplate(words, sample),
      edited: d ? d.body !== r.body || (d.subject ?? null) !== (r.subject ?? null) : null,
    };
    byKey.set(r.key, [...(byKey.get(r.key) ?? []), view]);
  }
  const keys = [...new Set([...byKey.keys(), ...uses.keys()])].sort();
  const groups = keys.map((key): TemplateGroup => {
    const list = byKey.get(key) ?? [];
    const used = uses.get(key) ?? [];
    const channels = MESSAGE_CHANNELS.filter((ch) => list.some((r) => r.channel === ch) || used.some((u) => u.channels.includes(ch)));
    const missing = channels.flatMap((channel) =>
      TEMPLATE_LOCALES.filter((locale) => !list.some((r) => r.channel === channel && r.locale === locale)).map((locale): MissingTemplate => {
        const d = fromPack(key, channel, locale);
        const sibling = list.find((r) => r.locale === locale);
        return { channel, locale, draft: d ? { body: d.body, subject: d.subject ?? null } : { body: sibling?.body ?? '', subject: channel === 'EMAIL' ? (sibling?.subject ?? null) : null } };
      }),
    );
    return {
      key,
      name: list[0]?.name ?? defaultPack.notificationTemplates.find((t) => t.key === key)?.name ?? key,
      uses: used,
      rows: list,
      missing,
      problems: list.reduce((n, r) => n + r.problems.length + r.waProblems.length, 0),
      edited: list.some((r) => r.edited === true),
    };
  });
  return { groups, tokens: MESSAGE_TOKENS, limits: TEMPLATE_LIMITS, hasHost, sample, autoReply: { config: auto, version: groupVersion(auto) }, perms: { write } };
}

const wordsInput = z
  .object({
    body: z.string().max(TEMPLATE_LIMITS.body * 2),
    subject: z
      .string()
      .max(TEMPLATE_LIMITS.subject * 2)
      .nullable()
      .optional(),
    version: z.string().max(40),
  })
  .strict();

const clean = (s: string) => s.replace(/\r\n?/g, '\n').trim();

/** The words as they will be kept, refused with every reason when one of them stops a save. */
function checkedWords(channel: MessageChannel, locale: string, body: string, subject: string | null | undefined): { body: string; subject: string | null } {
  const w = { body: clean(body), subject: channel === 'EMAIL' ? clean(subject ?? '') || null : null };
  const bad = templateProblems({ channel, locale, ...w }, true).filter((p) => BLOCKING_PROBLEMS.has(p));
  if (bad.length) {
    const details = bad.flatMap((p) => (p === 'UNKNOWN_TOKEN' ? unknownTokens(w).map((k) => `body: {${k}}`) : [`${p === 'NO_SUBJECT' ? 'subject' : 'body'}: ${p}`]));
    throw new MessagesError('INVALID_INPUT', 'the template is not valid', details);
  }
  return w;
}

/** Writes a template's words over its own version; an edited WhatsApp body goes back for approval. Audited. */
async function writeWords(deps: MessagesDeps, who: Who, id: string, version: string, next: (row: { key: string; channel: MessageChannel; locale: string }) => { body: string; subject: string | null }, action: string): Promise<string> {
  const row = await deps.db.notificationTemplate.findFirst({ where: { id, storeId: who.storeId, archivedAt: null, NOT: { key: { startsWith: CRM_EMAIL_TEMPLATE_PREFIX } } }, select: { id: true, key: true, channel: true, locale: true, body: true, subject: true, updatedAt: true, providerStatus: true } });
  if (!row || !isChannel(row.channel)) throw new MessagesError('NOT_FOUND', 'no such template', ['id']);
  if (row.updatedAt.toISOString() !== version) throw new MessagesError('STALE', 'the template was changed by someone else; reload it', ['version'], { version: row.updatedAt.toISOString() });
  const w = next({ key: row.key, channel: row.channel, locale: row.locale });
  if (w.body === row.body && w.subject === (row.subject ?? null)) return row.key;
  const reapprove = row.channel === 'WHATSAPP' && w.body !== row.body && row.providerStatus !== null;
  const done = await deps.db.notificationTemplate.updateMany({
    where: { id: row.id, updatedAt: row.updatedAt },
    data: { body: w.body, subject: w.subject, ...(reapprove ? { providerStatus: null, providerReason: null, providerCheckedAt: null } : {}) },
  });
  if (done.count !== 1) throw new MessagesError('STALE', 'the template was changed by someone else; reload it', ['version']);
  await logChange(deps.db, who, { action, entityType: 'NotificationTemplate', entityId: row.id, before: { body: row.body, subject: row.subject, providerStatus: row.providerStatus }, after: { body: w.body, subject: w.subject, providerStatus: reapprove ? null : row.providerStatus } });
  return row.key;
}

/** Saves a template's words (`messages.templates.write`): only known `{tokens}`, an e-mail with its subject. */
export async function saveTemplate(deps: MessagesDeps, who: Who, id: string, input: unknown): Promise<TemplatesScreen> {
  await allow(deps, who, 'messages.templates.write');
  const d = parse(wordsInput, input, 'template');
  await writeWords(deps, who, id, d.version, (r) => checkedWords(r.channel, r.locale, d.body, d.subject), 'messages.template.save');
  return templatesScreen(deps, who);
}

/** Puts a template's default words back (the general default pack); a template the pack has none for is NOT_FOUND. */
export async function resetTemplate(deps: MessagesDeps, who: Who, id: string, input: unknown): Promise<TemplatesScreen> {
  await allow(deps, who, 'messages.templates.write');
  const d = parse(z.object({ version: z.string().max(40) }).strict(), input, 'template');
  await writeWords(
    deps,
    who,
    id,
    d.version,
    (r) => {
      const p = fromPack(r.key, r.channel, r.locale);
      if (!p) throw new MessagesError('NOT_FOUND', 'this template has no default', ['default']);
      return { body: p.body, subject: r.channel === 'EMAIL' ? (p.subject ?? null) : null };
    },
    'messages.template.reset',
  );
  return templatesScreen(deps, who);
}

const createInput = z
  .object({
    key: z.string().regex(KEY, { message: 'dotted camelCase key' }).max(80),
    channel: z.enum(MESSAGE_CHANNELS),
    locale: z.enum(TEMPLATE_LOCALES),
    body: z.string().max(TEMPLATE_LIMITS.body * 2),
    subject: z
      .string()
      .max(TEMPLATE_LIMITS.subject * 2)
      .nullable()
      .optional(),
  })
  .strict();

/**
 * Adds a template a key lacks in one channel and language (`messages.templates.write`; audited). One that was archived
 * comes back with the new words; one that is there already is STALE.
 */
export async function createTemplate(deps: MessagesDeps, who: Who, input: unknown): Promise<TemplatesScreen> {
  await allow(deps, who, 'messages.templates.write');
  const d = parse(createInput, input, 'template');
  const w = checkedWords(d.channel, d.locale, d.body, d.subject);
  const where = { storeId_key_channel_locale: { storeId: who.storeId, key: d.key, channel: d.channel, locale: d.locale } };
  const there = await deps.db.notificationTemplate.findUnique({ where, select: { id: true, archivedAt: true } });
  if (there && !there.archivedAt) throw new MessagesError('STALE', 'this template is there already; reload the page', ['key']);
  const name = fromPack(d.key, d.channel, d.locale)?.name ?? (await deps.db.notificationTemplate.findFirst({ where: { storeId: who.storeId, key: d.key }, select: { name: true } }))?.name ?? d.key;
  const made = there
    ? await deps.db.notificationTemplate.update({ where: { id: there.id }, data: { ...w, archivedAt: null, providerStatus: null, providerReason: null, providerCheckedAt: null }, select: { id: true } })
    : await deps.db.notificationTemplate.create({ data: { storeId: who.storeId, key: d.key, channel: d.channel, locale: d.locale, name, ...w, enabled: true }, select: { id: true } });
  await logChange(deps.db, who, { action: 'messages.template.create', entityType: 'NotificationTemplate', entityId: made.id, before: null, after: { key: d.key, channel: d.channel, locale: d.locale, ...w } });
  return templatesScreen(deps, who);
}

/** Saves the auto-reply's settings (`messages.templates.write`); STALE over a newer save. */
export async function saveAutoReply(deps: MessagesDeps & { settings: MessagesDeps['settings'] & SettingsWriter }, who: Who, input: unknown, version?: string): Promise<TemplatesScreen> {
  await allow(deps, who, 'messages.templates.write');
  await saveGroup(deps, who, AUTO_REPLY_SETTINGS, input, version, { name: 'auto-reply', reason: 'Messages › Templates', action: 'messages.autoReply.save', entityType: 'MessageAutoReply' });
  return templatesScreen(deps, who);
}
