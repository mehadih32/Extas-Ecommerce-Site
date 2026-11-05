// S14 · PR 533 — the customer history card at approval (Orders › To confirm, beside the call card; demo V12.4 97r
// "Phone history"): the chosen order's number, its earlier orders in tiles (orders, true deliveries, being checked,
// refused, charge-paid returns, our fault, returns after delivery, exchanges, cancels, calls not answered), why his
// parcels came back (the owner's refusal reasons, most first) and the newest orders with what became of each. Words
// from messages/admin-orders.<lang>.json; numbers in Western digits. It only shows: the person confirming decides.
// PR 534: the grade and verified mark his counts earn, beside the title (only while the owner's grading is on).
import type * as od from '@extas/orders';
import { formatNumber } from '@/components/admin/products/model';
import type { AdminView } from '@/lib/admin-page';
import { t } from '@/lib/i18n';
import { orderHref, type Tone } from './model';

export interface ApprovalCard {
  title: string;
  sub: string;
  /** null for a first order: the card says so instead of tiles. */
  tiles: { key: string; label: string; value: string; tone: Tone }[] | null;
  first: string;
  reasons: { label: string; value: string }[];
  reasonsTitle: string;
  noReason: string | null;
  recentTitle: string;
  recent: { number: string; href: string; outcome: string; tone: Tone; extra: string; placed: string }[];
  note: string;
  /** PR 534: his grade's name and the verified mark's word, each null when not earned (or grading is off). */
  grade: string | null;
  verified: string | null;
}

/** The tiles in their order; a tile with nothing in it is left out, except the first three. */
const TILES: { key: keyof od.ApprovalCounts; tone: Tone; always?: true }[] = [
  { key: 'orders', tone: 'mute', always: true },
  { key: 'delivered', tone: 'ok', always: true },
  { key: 'refused', tone: 'bad', always: true },
  { key: 'chargePaid', tone: 'bad' },
  { key: 'checking', tone: 'warn' },
  { key: 'returned', tone: 'warn' },
  { key: 'exchanges', tone: 'mute' },
  { key: 'cancelled', tone: 'warn' },
  { key: 'open', tone: 'mute' },
  { key: 'ourFault', tone: 'mute' },
  { key: 'noAnswer', tone: 'warn' },
];

const OUTCOME_TONE: Record<od.ApprovalOutcome, Tone> = { delivered: 'ok', checking: 'warn', refused: 'bad', chargePaid: 'bad', ourFault: 'mute', cancelled: 'warn', open: 'mute' };

/** The card's words and numbers. `reasonName` names a key of the owner's refusal reasons (the key itself when gone). */
export function approvalCard(view: AdminView, h: od.ApprovalHistoryView, reasonName: ReadonlyMap<string, string>): ApprovalCard {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const date = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' });
  const name = (k: string) => reasonName.get(k) ?? k;
  const c = h.counts;
  return {
    title: t(d, 'orders.appr.title'),
    sub: h.phone ? t(d, 'orders.appr.sub', { phone: h.phone, since: h.firstAt ? date.format(h.firstAt) : t(d, 'orders.list.none') }) : t(d, 'orders.appr.noPhone'),
    tiles: c.orders ? TILES.filter((x) => x.always || c[x.key] > 0).map((x) => ({ key: x.key, label: t(d, `orders.appr.tile.${x.key}`), value: n(c[x.key]), tone: x.tone })) : null,
    first: t(d, 'orders.appr.first'),
    reasonsTitle: t(d, 'orders.appr.reasons'),
    reasons: h.reasons.map((r) => ({ label: name(r.key), value: n(r.count) })),
    noReason: h.noReason ? t(d, 'orders.appr.noReason', { n: n(h.noReason) }) : null,
    recentTitle: t(d, 'orders.appr.recent'),
    recent: h.recent.map((r) => ({
      number: r.number,
      href: orderHref(r.id),
      outcome: t(d, `orders.appr.out.${r.outcome}`),
      tone: OUTCOME_TONE[r.outcome],
      extra: [r.reasonKey ? name(r.reasonKey) : null, r.returned ? t(d, 'orders.appr.tile.returned') : null, r.exchange ? t(d, 'orders.appr.exchange') : null].filter(Boolean).join(' · '),
      placed: date.format(r.placedAt),
    })),
    note: t(d, 'orders.appr.note'),
    grade: h.mark?.grade ? (view.lang === 'bn' && h.mark.grade.nameBn) || h.mark.grade.nameEn : null,
    verified: h.mark?.verified ? t(d, 'orders.appr.verified') : null,
  };
}
