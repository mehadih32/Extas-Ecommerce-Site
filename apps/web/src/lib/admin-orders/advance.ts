// S06 · PR 542 — "Request advance" and "Send again" on the order page (ORD-07), worked out on the server: the dialog's
// choices (what is asked — each kind with its amount for this order, the risk level's proposal first — and the ways:
// SMS, WhatsApp, a call), its "what will happen" lines (the order waits, a pay link is made, whether the order messages
// are on, a call task, never a COD rule, price or charge), and the band an order waiting for its advance shows (the
// amount, the pay link's page and how it stands). Only for a command the order service says is open now AND the person's
// `orders.advance.request`; the service checks both again. Nothing is sent until the person presses Send.
import type { AdvanceAmount, AdvanceRequestKind, AdvanceRequestView } from '@extas/orders';
import type { OrderCommand } from '@extas/orders/pure';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { commandUrl } from './commands';
import type { CommandSpec, FieldSpec } from './spec';

export const ADVANCE_PERM = 'orders.advance.request';
const KINDS: readonly AdvanceRequestKind[] = ['delivery', 'partial', 'full', 'codOff'];

/** One choice of the "what to ask" list: its words with the amount, or why it cannot be asked for this order. */
export function kindLabel(view: AdminView, kind: AdvanceRequestKind, a: AdvanceAmount, money: (minor: number) => string): string {
  const d = view.dict;
  return a.ok ? t(d, `orders.adv.kind.${kind}`, { amount: money(a.amountMinor) }) : `${t(d, `orders.adv.kindName.${kind}`)} — ${t(d, `orders.adv.no.${a.code}`)}`;
}

/** The request and resend buttons for one order (empty when neither is open, or the person lacks the key). */
export function advanceSpecs(
  view: AdminView,
  o: { id: string; number: string; version: number; currency: string },
  adv: AdvanceRequestView | null,
  allowed: readonly OrderCommand[],
  perms: ReadonlySet<string>,
): { request: CommandSpec | null; resend: CommandSpec | null } {
  if (!adv || !perms.has(ADVANCE_PERM)) return { request: null, resend: null };
  const d = view.dict;
  const money = (minor: number) => formatMoney(minor, moneyOf(o.currency, view.locale));
  const tt = (k: string, v?: Record<string, string>) => t(d, `orders.cmd.${k}`, v);
  const channels = (value: string[]): FieldSpec => ({
    name: 'channels',
    kind: 'checks',
    label: t(d, 'orders.adv.channels'),
    options: [
      { value: 'SMS', label: t(d, 'orders.adv.ch.SMS') },
      { value: 'WHATSAPP', label: t(d, 'orders.adv.ch.WHATSAPP') },
      { value: 'CALL', label: t(d, 'orders.adv.ch.CALL') },
    ],
    value,
  });
  const note: FieldSpec = { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 500, placeholder: t(d, 'orders.adv.notePh') };
  const msgLine = adv.messagesOn ? t(d, 'orders.adv.eff.messages') : t(d, 'orders.adv.eff.messagesOff');
  const common = [msgLine, t(d, 'orders.adv.eff.call'), t(d, 'orders.adv.eff.never')];
  const spec = (id: 'advanceRequest' | 'advanceResend', extra: Partial<CommandSpec>): CommandSpec => ({
    id,
    label: tt(`${id}.label`),
    icon: 'wallet',
    url: commandUrl(o.id, id),
    version: o.version,
    title: tt(`${id}.title`, { n: o.number }),
    effects: [],
    fields: [],
    ok: tt(`${id}.ok`),
    okTone: 'pri',
    done: tt(`${id}.done`, { n: o.number }),
    ...extra,
  });
  const usable = KINDS.filter((k) => adv.amounts[k].ok);
  const request =
    allowed.includes('awaitAdvance') && usable.length
      ? spec('advanceRequest', {
          ...(adv.proposed ? { tone: 'pri' as const } : {}),
          sub: adv.proposed ? t(d, 'orders.adv.proposed', { what: t(d, `orders.adv.kindName.${adv.proposed}`) }) : undefined,
          effects: [
            t(d, 'orders.eff.to', { st: t(d, 'orders.st.AWAITING_ADVANCE') }),
            t(d, 'orders.adv.eff.link'),
            ...common,
            adv.waitHours > 0 ? t(d, 'orders.adv.eff.wait', { h: String(adv.waitHours) }) : t(d, 'orders.adv.eff.noWait'),
          ],
          fields: [
            { name: 'kind', kind: 'select', label: t(d, 'orders.adv.kind.label'), options: KINDS.map((k) => ({ value: k, label: kindLabel(view, k, adv.amounts[k], money) })).filter((x) => adv.amounts[x.value as AdvanceRequestKind].ok), value: adv.defaultKind, required: true },
            channels(adv.channels),
            note,
          ],
        })
      : null;
  const resend =
    allowed.includes('advanceResend') && adv.link
      ? spec('advanceResend', {
          tone: 'ghost',
          effects: [t(d, 'orders.adv.eff.sameLink'), ...common],
          fields: [channels(adv.channels.length ? adv.channels : ['SMS']), note],
        })
      : null;
  return { request, resend };
}

/** The band of an order waiting for its advance: the amount, the pay link's page and how the last try stands. */
export function advanceBand(view: AdminView, adv: AdvanceRequestView | null, status: string, currency: string): string | null {
  if (status !== 'AWAITING_ADVANCE' || !adv?.link) return null;
  const d = view.dict;
  const l = adv.link;
  return t(d, 'orders.adv.band', {
    amount: formatMoney(l.amountMinor, moneyOf(currency, view.locale)),
    what: t(d, `orders.adv.kindName.${l.kind}`),
    path: l.path,
    state: t(d, `orders.money.pst.${l.status}`),
  });
}

/** The timeline line of a request or its "Send again": what was asked, by which ways. */
export function advanceSummary(view: AdminView, type: string, data: unknown, currency: string): string | null {
  const x = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as { request?: boolean; resend?: boolean; kind?: string; amountMinor?: number; channels?: string[]; newTry?: boolean };
  if (!(type === 'order.awaitAdvance' && x.request) && !(type === 'order.advanceResend' && x.resend)) return null;
  const d = view.dict;
  const ways = (x.channels ?? []).map((c) => t(d, `orders.adv.ch.${c}`)).join(', ');
  const amount = typeof x.amountMinor === 'number' ? formatMoney(x.amountMinor, moneyOf(currency, view.locale)) : '';
  const what = x.kind && (KINDS as readonly string[]).includes(x.kind) ? t(d, `orders.adv.kindName.${x.kind}`) : '';
  return [t(d, type === 'order.awaitAdvance' ? 'orders.adv.ev.asked' : 'orders.adv.ev.again', { amount, what, ways }), ...(x.newTry ? [t(d, 'orders.adv.ev.newTry')] : [])].filter(Boolean).join(' · ');
}
