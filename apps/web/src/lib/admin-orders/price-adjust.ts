// S28 · PR 664 — price adjust on every order, the order page's part (the service is @extas/orders price-adjust.ts):
//   · "Adjust price" in More actions: what to take off (a taka amount, a percent, the wallet, the delivery charge), the amount,
//     a reason from the owner's list, a note, and the owner's PIN where the person's own limit is passed;
//   · a yellow line while a request above someone's limit waits, with "Approve" (the owner's PIN) and "Refuse" for a person who
//     holds the approval key;
//   · the timeline words of the three ledger events.
// Nothing here decides a number: the limits, the reasons and the switch are the owner's settings, read by the service.
import * as od from '@extas/orders';
import { formatMoney, moneyOf, toMinor } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import type { CommandSpec, FieldSpec } from './spec';

export const PRICE_ADJUST_KINDS = od.ADJUST_KINDS;
/** `/api/admin/orders/:id/price-adjust` (POST: take money off; GET: the order's ledger). */
export const priceAdjustUrl = (orderId: string) => `/api/admin/orders/${orderId}/price-adjust`;
/** `/api/admin/orders/price-adjust/:requestId` (POST: approve or refuse a request). */
export const priceDecideUrl = (requestId: string) => `/api/admin/orders/price-adjust/${requestId}`;

type View = Pick<AdminView, 'dict' | 'lang' | 'locale'>;
const nameOf = (view: View, x: { en: string; bn: string }) => (view.lang === 'bn' ? x.bn || x.en : x.en);

/** The page's body of the dialog as the service takes it: a typed taka amount becomes minor units, a percent stays whole. */
export function priceAdjustBody(input: Record<string, unknown>, currency: string, locale = 'en'): Record<string, unknown> {
  const { value, ...rest } = input;
  const out: Record<string, unknown> = { ...rest };
  const kind = input.kind;
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (kind === 'FREE_DELIVERY' || text === '') return out;
  if (kind === 'PERCENT') {
    if (!/^\d{1,3}$/.test(text)) throw new od.OrdersError('INVALID_INPUT', 'a percent is a whole number', ['value']);
    out.value = Number(text);
    return out;
  }
  const minor = toMinor(text, moneyOf(currency, locale));
  if (minor === undefined || minor === null) throw new od.OrdersError('INVALID_INPUT', 'the amount is not valid', ['value']);
  out.value = minor;
  return out;
}

/** "Adjust price" (More actions), or null when this person cannot adjust this order now. */
export function priceAdjustSpec(view: View, o: { id: string; number: string; version: number; currency: string }, adj: od.PriceAdjustView): CommandSpec | null {
  if (!adj.canAdjust) return null;
  const d = view.dict;
  const money = moneyOf(o.currency, view.locale);
  const m = (v: number) => formatMoney(v, money);
  const kinds: FieldSpec = {
    name: 'kind',
    kind: 'select',
    label: t(d, 'orders.dlg.priceKind'),
    required: true,
    options: PRICE_ADJUST_KINDS.filter((k) => (k !== 'FREE_DELIVERY' || adj.deliveryChargeMinor > 0) && (k !== 'WALLET' || adj.walletBalanceMinor > 0)).map((k) => ({ value: k, label: t(d, `orders.dlg.priceKinds.${k}`) })),
  };
  const fields: FieldSpec[] = [
    kinds,
    { name: 'value', kind: 'text', label: t(d, 'orders.dlg.priceValue'), maxLength: 12, placeholder: t(d, 'orders.dlg.priceValuePh') },
    { name: 'reasonKey', kind: 'select', label: t(d, 'orders.dlg.priceReason'), required: true, options: [{ value: '', label: t(d, 'orders.dlg.pickReason') }, ...adj.reasons.map((r) => ({ value: r.key, label: nameOf(view, r), ...(r.noteRequired ? { noteRequired: true } : {}) }))] },
    { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), labelNeeded: t(d, 'orders.dlg.reasonRequired'), noteFor: 'reasonKey', maxLength: 500 },
    { name: 'pin', kind: 'text', secret: true, label: t(d, 'orders.dlg.pricePin'), maxLength: 12, placeholder: '••••' },
  ];
  const limit = adj.limit;
  const limitText =
    limit.amountMinor === null && limit.percent === null
      ? t(d, 'orders.eff.priceNoLimit')
      : t(d, 'orders.eff.priceLimit', { amount: m(limit.amountMinor ?? 0), percent: String(limit.percent ?? 0) });
  return {
    id: 'priceAdjust',
    label: t(d, 'orders.cmd.priceAdjust.label'),
    icon: 'wallet',
    url: priceAdjustUrl(o.id),
    version: o.version,
    title: t(d, 'orders.cmd.priceAdjust.title', { n: o.number }),
    effects: [t(d, 'orders.eff.priceDue', { due: m(adj.dueMinor) }), limitText, t(d, 'orders.eff.priceLedger'), t(d, 'orders.eff.priceNoRefund')],
    fields,
    ok: t(d, 'orders.cmd.priceAdjust.ok'),
    okTone: 'pri',
    done: t(d, 'orders.cmd.priceAdjust.done', { n: o.number }),
  };
}

/** The words for one waiting request: what, why. */
function requestWords(view: View, l: od.AdjustLine, adj: od.PriceAdjustView, currency: string): string {
  const d = view.dict;
  const m = (v: number) => formatMoney(v, moneyOf(currency, view.locale));
  const why = adj.reasons.find((r) => r.key === l.reasonKey);
  return t(d, 'orders.ev.priceLine', { kind: t(d, `orders.dlg.priceKinds.${l.kind}`), amount: m(l.amountMinor), reason: why ? nameOf(view, why) : l.reasonKey });
}

/** The yellow line while a request waits, with its two answers for a person who holds `orders.priceApprove`; null: none waiting. */
export function priceRequestBands(view: View, o: { number: string; currency: string }, adj: od.PriceAdjustView): { id: string; kind: 'stale'; text: string; specs: CommandSpec[] }[] {
  const d = view.dict;
  return adj.pending.map((l) => {
    const words = requestWords(view, l, adj, o.currency);
    const specs: CommandSpec[] = adj.canApprove
      ? [
          {
            id: `priceApprove-${l.id}`,
            label: t(d, 'orders.cmd.priceApprove.label'),
            tone: 'pri',
            icon: 'check',
            url: priceDecideUrl(l.id),
            version: null,
            fixed: { decision: 'approve' },
            title: t(d, 'orders.cmd.priceApprove.title', { n: o.number }),
            sub: words,
            effects: [t(d, 'orders.eff.priceApprove'), t(d, 'orders.eff.priceLedger')],
            fields: [
              { name: 'pin', kind: 'text', secret: true, required: true, label: t(d, 'orders.dlg.pricePinNeeded'), maxLength: 12, placeholder: '••••' },
              { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 500 },
            ],
            ok: t(d, 'orders.cmd.priceApprove.ok'),
            okTone: 'pri',
            done: t(d, 'orders.cmd.priceApprove.done', { n: o.number }),
          },
          {
            id: `priceRefuse-${l.id}`,
            label: t(d, 'orders.cmd.priceRefuse.label'),
            url: priceDecideUrl(l.id),
            version: null,
            fixed: { decision: 'reject' },
            title: t(d, 'orders.cmd.priceRefuse.title', { n: o.number }),
            sub: words,
            effects: [t(d, 'orders.eff.priceRefuse')],
            fields: [{ name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 500 }],
            ok: t(d, 'orders.cmd.priceRefuse.ok'),
            okTone: 'pri',
            done: t(d, 'orders.cmd.priceRefuse.done', { n: o.number }),
          },
        ]
      : [];
    return { id: `priceRequest-${l.id}`, kind: 'stale' as const, text: t(d, 'orders.band.priceRequest', { what: words }), specs };
  });
}

/** The timeline words of a ledger event: "−৳50 · Customer asked on the call · total ৳2,080 → ৳2,030". */
export function priceEventLine(view: View, data: unknown, currency: string): string | null {
  const x = (data ?? {}) as { kind?: unknown; amountMinor?: unknown; reason?: { en?: unknown; bn?: unknown } | null; totalBeforeMinor?: unknown; totalAfterMinor?: unknown };
  if (typeof x.kind !== 'string' || typeof x.amountMinor !== 'number') return null;
  const d = view.dict;
  const m = (v: number) => formatMoney(v, moneyOf(currency, view.locale));
  const why = x.reason ? (view.lang === 'bn' ? x.reason.bn || x.reason.en : x.reason.en) : null;
  const head = t(d, 'orders.ev.priceLine', { kind: t(d, `orders.dlg.priceKinds.${x.kind}`), amount: m(x.amountMinor), reason: typeof why === 'string' ? why : t(d, 'orders.list.none') });
  return typeof x.totalBeforeMinor === 'number' && typeof x.totalAfterMinor === 'number' && x.totalBeforeMinor !== x.totalAfterMinor ? `${head} · ${t(d, 'orders.ev.priceTotal', { before: m(x.totalBeforeMinor), after: m(x.totalAfterMinor) })}` : head;
}
