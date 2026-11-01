// S22 · PR 425 — the words of Support › Inbox, one conversation and Support settings: messages/admin-inbox.<lang>.json,
// everything under `sup.*`, merged into the page's dictionary. A few helpers the pages share: how long ago, the
// sender's label, a log line in words (PR 427: the lines of who is writing).
import type { AdminView } from '@/lib/admin-page';
import { mergeDicts } from '@/lib/admin-i18n';
import { t, type Dict } from '@/lib/i18n';
import { formatNumber } from '@/components/admin/products/model';
import bn from '../../../messages/admin-inbox.bn.json';
import en from '../../../messages/admin-inbox.en.json';

export const inboxDicts: Record<'bn' | 'en', Dict> = { bn: bn as Dict, en: en as Dict };

/** The admin view with the `sup.*` words of its language. */
export function withInbox(view: AdminView): AdminView {
  return { ...view, dict: mergeDicts(view.dict, inboxDicts[view.lang]) };
}

/** "just now", "12 min", "3 h", "2 d" (Western digits in both languages). */
export function ago(dict: Dict, locale: string, at: Date | string | null, now: Date): string {
  if (!at) return '';
  const min = Math.max(0, Math.floor((now.getTime() - new Date(at).getTime()) / 60_000));
  if (min < 1) return t(dict, 'sup.ago.now');
  if (min < 60) return t(dict, 'sup.ago.min', { n: formatNumber(min, locale) });
  const h = Math.floor(min / 60);
  if (h < 48) return t(dict, 'sup.ago.h', { n: formatNumber(h, locale) });
  return t(dict, 'sup.ago.d', { n: formatNumber(Math.floor(h / 24), locale) });
}

/** A channel kind's name ("WhatsApp", "Site chat"); an unknown kind as it is. */
export function kindName(dict: Dict, kind: string): string {
  const k = `sup.kind.${kind}`;
  const s = t(dict, k);
  return s === k ? kind : s;
}

/** Who wrote a message or did a step: the name kept with it, else the kind of sender. */
export function senderLabel(dict: Dict, type: string, name: string | null): string {
  if (name) return name;
  if (type === 'CUSTOMER') return t(dict, 'sup.msg.customer');
  if (type === 'AI_AGENT') return t(dict, 'sup.msg.ai');
  if (type === 'SYSTEM') return t(dict, 'sup.msg.system');
  return t(dict, 'sup.msg.someone');
}

/** One line of the who-did-what log in words. */
export function logLine(dict: Dict, e: { kind: string; actor: { type: string; name: string | null }; data: Record<string, unknown> | null }): string {
  const name = senderLabel(dict, e.actor.type, e.actor.name);
  const d = e.data ?? {};
  const status = (s: unknown) => (typeof s === 'string' ? t(dict, `sup.status.${s}`) : '');
  let line: string;
  if (e.kind === 'ASSIGNED') line = d.to && d.toName === e.actor.name ? t(dict, 'sup.log.TOOK', { name }) : t(dict, 'sup.log.ASSIGNED', { name, to: typeof d.toName === 'string' ? d.toName : t(dict, 'sup.msg.someone') });
  else if (e.kind === 'STATUS') line = t(dict, 'sup.log.STATUS', { name, from: status(d.from), to: status(d.to) });
  else if (['RECEIVED', 'REPLIED', 'NOTED', 'UNASSIGNED', 'REOPENED'].includes(e.kind)) line = t(dict, `sup.log.${e.kind}`, { name });
  // PR 427: who is writing (never the number itself)
  else if (e.kind === 'IDENTITY_PHONE') line = d.byHand === true ? t(dict, 'sup.log.id.phoneHand', { name }) : t(dict, d.via === 'channel' ? 'sup.log.id.phoneChannel' : 'sup.log.IDENTITY_PHONE');
  else if (e.kind === 'IDENTITY_CUSTOMER') line = d.byHand === true ? t(dict, 'sup.log.id.customerHand', { name }) : t(dict, 'sup.log.IDENTITY_CUSTOMER');
  else if (e.kind === 'IDENTITY_MERGED') line = t(dict, 'sup.log.IDENTITY_MERGED', { n: typeof d.contacts === 'number' ? String(d.contacts) : '1' });
  else if (e.kind === 'IDENTITY_UNLINKED' || e.kind === 'IDENTITY_SPLIT') line = t(dict, `sup.log.${e.kind}`, { name });
  else line = e.kind;
  return d.auto === true ? `${line} ${t(dict, 'sup.log.auto')}` : line;
}
