// S20 · PR 409 (ORD-04d; B2.1 "every word of the invoice is editable from the dashboard") — the invoice's own words:
// every word the invoice prints (the shop dictionary's `account.invoice.*`) with the owner's own text in English and
// Bengali, kept where every other shop word the owner changes is kept (`language.labels`, his words win over ours).
// Only these keys are read or changed here; every other word in `language.labels` stays as it is. An empty box gives
// the word back to the dictionary. A {slot} the dictionary's word does not have is refused (it would print as is).
//   read: `fulfilment.read` · save: `orders.invoiceSettings` (audited; a save in between is STALE)
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { labelOverridesSchema, storeTarget } from '@extas/settings';
import type { AdminDeps } from '../admin-auth';
import { keysOf, SHOP_DICTS, shopT, type LabelOverrides } from '../shop/dict';

export const INVOICE_WORD_PREFIX = 'account.invoice.';
/** The longest word the owner may set (the shop's own limit for a word). */
const MAX = 300;

export interface InvoiceWord {
  key: string;
  /** The dictionary's word (what prints when the owner leaves the box empty). */
  byDefault: { en: string; bn: string };
  /** The owner's own word, or '' for none. */
  en: string;
  bn: string;
}

export class InvoiceWordsError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

/** Every word the invoice prints, in dictionary order. */
export function invoiceWordKeys(): string[] {
  return keysOf(SHOP_DICTS.en).filter((k) => k.startsWith(INVOICE_WORD_PREFIX));
}

const slots = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));
const versionOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);
/** The dictionary's own word (its {slots} left as they are). */
const DICT = { en: shopT('en'), bn: shopT('bn') };
const word = (lang: 'en' | 'bn', key: string) => DICT[lang](key);

type Deps = Pick<AdminDeps, 'db' | 'resolver'>;
interface Who {
  actor: Actor;
  ctx: RequestContext;
  storeId: number;
}

/** The words with the owner's own text (`fulfilment.read`). */
export async function invoiceWords(deps: Deps, who: Who): Promise<{ version: string; words: InvoiceWord[] }> {
  await requirePermission(deps.db, who.actor, 'fulfilment.read', { storeId: who.storeId });
  const labels = ((await deps.resolver.value('language.labels', { storeId: who.storeId })) ?? null) as LabelOverrides | null;
  return {
    version: versionOf(labels),
    words: invoiceWordKeys().map((key) => ({ key, byDefault: { en: word('en', key), bn: word('bn', key) }, en: labels?.[key]?.en ?? '', bn: labels?.[key]?.bn ?? '' })),
  };
}

/** Saves the invoice's words (`orders.invoiceSettings`): only `account.invoice.*`; empty = the dictionary's word. */
export async function saveInvoiceWords(deps: Deps, who: Who, input: unknown): Promise<{ version: string; words: InvoiceWord[] }> {
  await requirePermission(deps.db, who.actor, 'orders.invoiceSettings', { storeId: who.storeId });
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(input) || !isObj(input.words) || typeof input.version !== 'string') throw new InvoiceWordsError('INVALID_INPUT', 400, ['words']);
  const known = new Set(invoiceWordKeys());
  const before = ((await deps.resolver.value('language.labels', { storeId: who.storeId })) ?? null) as LabelOverrides | null;
  if (input.version !== versionOf(before)) throw new InvoiceWordsError('STALE', 409);
  const next: LabelOverrides = { ...(before ?? {}) };
  const bad: string[] = [];
  for (const [key, raw] of Object.entries(input.words)) {
    if (!known.has(key) || !isObj(raw)) {
      bad.push(key);
      continue;
    }
    const own: { en?: string; bn?: string } = {};
    for (const lang of ['en', 'bn'] as const) {
      const v = raw[lang];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'string' || v.length > MAX) {
        bad.push(`${key}.${lang}`);
        continue;
      }
      const text = v.trim();
      if (!text) continue;
      const allowed = slots(word(lang, key));
      if ([...slots(text)].some((x) => !allowed.has(x))) {
        bad.push(`${key}.${lang}`);
        continue;
      }
      own[lang] = text;
    }
    if (own.en || own.bn) next[key] = own;
    else delete next[key];
  }
  if (bad.length) throw new InvoiceWordsError('INVALID_INPUT', 400, bad);
  const value = Object.keys(next).length ? next : null;
  const ok = labelOverridesSchema.nullable().safeParse(value);
  if (!ok.success) throw new InvoiceWordsError('INVALID_INPUT', 400, ['words']);
  if (versionOf(value) !== versionOf(before)) {
    await deps.resolver.set('language.labels', ok.data as never, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Orders › Packing & print › Invoices › Every word' });
    const pick = (o: LabelOverrides | null) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => k.startsWith(INVOICE_WORD_PREFIX)));
    await audit(deps.db, who.actor, { storeId: who.storeId, action: 'orders.invoiceWords.save', entityType: 'Setting', entityId: 'language.labels', before: pick(before), after: pick(value) }, who.ctx);
  }
  return invoiceWords(deps, who);
}
