// S14 · PR 288 — a customer's Journey tab (CUS-02; Blueprint B5.3): "How he first came" on top, then every touch newest
// first — what happened in words (`cus.jr.what.<code>`), its kind, when, and a link to the order or the conversation
// when the person may open it — with "Older" and "Newer" (`?tab=journey&page=`). Server-rendered, no state.
import Link from 'next/link';
import type { CustomerJourney, JourneyRow } from '@extas/customers';
import { formatMoney, formatNumber, type Money } from '@/components/admin/products/model';
import type { AdminView } from '@/lib/admin-page';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import { t } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';

const ICON: Record<JourneyRow['kind'], ShellIconName> = { profile: 'users', visit: 'globe', touch: 'mega', order: 'bag', exchange: 'uturn', message: 'msg', chat: 'headset', review: 'eye', wallet: 'wallet', consent: 'check', merge: 'users', note: 'edit' };

/** One touch in words: its code's sentence with the row's data filled in (codes and channels as words too). */
export function journeyText(view: AdminView, r: JourneyRow, money: Money): string {
  const d = view.dict;
  const word = (prefix: string, v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === '') return '';
    const k = `${prefix}.${v}`;
    const w = t(d, k);
    return w === k ? String(v) : w;
  };
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.data)) vars[k] = v === null ? '' : String(v);
  if (r.data.source !== undefined) vars.source = word('orders.source', r.data.source) || t(d, 'cus.jr.unknown');
  if (r.data.status !== undefined) vars.status = word(r.kind === 'order' ? 'orders.st' : 'cus.jr.status', r.data.status);
  if (r.data.channel !== undefined) vars.channel = word('cus.jr.channel', r.data.channel);
  if (typeof r.data.amount === 'number') vars.amount = formatMoney(r.data.amount, money);
  if (typeof r.data.total === 'number') vars.total = formatMoney(r.data.total, money);
  if (typeof r.data.pages === 'number') vars.pages = formatNumber(r.data.pages, view.locale);
  let text = t(d, `cus.jr.what.${r.what}`, vars);
  const extra = [r.data.campaign ? t(d, 'cus.jr.campaign', { campaign: String(r.data.campaign) }) : '', r.data.from ? t(d, 'cus.jr.from', { from: String(r.data.from) }) : '', typeof r.data.total === 'number' ? vars.total : ''].filter(Boolean);
  if (extra.length) text += ` · ${extra.join(' · ')}`;
  return text;
}

export function JourneyCard({ view, journey, money, stamp, canOrders, canSupport, here }: { view: AdminView; journey: CustomerJourney; money: Money; stamp: Intl.DateTimeFormat; canOrders: boolean; canSupport: boolean; here: string }) {
  const d = view.dict;
  const href = (r: JourneyRow) => (r.ref?.type === 'order' && canOrders ? `/admin/orders/${r.ref.id}` : r.ref?.type === 'conversation' && canSupport ? `/admin/support/c/${r.ref.id}` : null);
  const pageHref = (p: number) => `${here}?tab=journey${p > 1 ? `&page=${p}` : ''}`;
  if (!journey.enabled)
    return (
      <section className="a2-card" data-testid="cus-journey-off">
        <h2 className="a2-h3">{t(d, 'cus.jr.offTitle')}</h2>
        <p className="a2-sm a2-mute a2-mt6">{t(d, 'cus.jr.offBody')}</p>
      </section>
    );
  return (
    <>
      <section className="a2-card" data-testid="cus-journey-first">
        <h2 className="a2-h3">{t(d, 'cus.jr.firstTitle')}</h2>
        <p className="a2-sm a2-mt6">{journey.first ? `${journeyText(view, journey.first, money)} · ${stamp.format(journey.first.at)}` : t(d, 'cus.jr.firstNone')}</p>
      </section>
      <section className="a2-card" data-testid="cus-journey">
        <h2 className="a2-h3">{t(d, 'cus.jr.title')}</h2>
        <div className="a2-mt12">
          {journey.rows.length ? (
            journey.rows.map((r, i) => {
              const to = href(r);
              const body = (
                <>
                  <ShellIcon name={ICON[r.kind]} size={16} />
                  <div className="a2-prt">
                    <b>{journeyText(view, r, money)}</b>
                    <span>{`${t(d, `cus.jr.kind.${r.kind}`)} · ${stamp.format(r.at)}`}</span>
                  </div>
                </>
              );
              return to ? (
                <Link key={i} className="a2-prow full" href={to} data-testid="cus-journey-row" data-kind={r.kind}>
                  {body}
                </Link>
              ) : (
                <div key={i} className="a2-prow full" data-testid="cus-journey-row" data-kind={r.kind}>
                  {body}
                </div>
              );
            })
          ) : (
            <p className="a2-sm a2-mute">{t(d, 'cus.jr.none')}</p>
          )}
        </div>
        {journey.page > 1 || journey.hasMore ? (
          <div className="a2-gap8 a2-mt12">
            {journey.page > 1 ? (
              <Link className="a2-btn sm" href={pageHref(journey.page - 1)}>
                {t(d, 'cus.jr.newer')}
              </Link>
            ) : null}
            {journey.hasMore ? (
              <Link className="a2-btn sm" href={pageHref(journey.page + 1)} data-testid="cus-journey-older">
                {t(d, 'cus.jr.older')}
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
