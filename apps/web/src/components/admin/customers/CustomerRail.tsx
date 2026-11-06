// Follow-up 702 (PR 636, CN-036, LUMEN-SPEC §3 item 4 "List + detail split"): the list beside one customer's page. On a
// wide screen (customers/[id]/split.css) the list he was opened from sits on the left — the same view, words, filters
// and page, read with the same `customers.read` and masked numbers as All customers — and he fills the right; a press
// on another name opens that person in his place, and "Previous" / "Next" (CustomerSteps) move one tap along the list.
// On a phone or tablet the list is not drawn beside him: his page is a full page, as before, with the same steps.
// Server-drawn links only (no client state), so a deep link, Back and a new tab all work; the list's paging keeps the
// person open. Nothing here changes a customer.
import Link from 'next/link';
import type { CustomerList as ListData } from '@extas/customers';
import { formatNumber } from '@/components/admin/products/model';
import { customerHref, customersHref, placeIn, type CustomerQuery } from '@/lib/admin-customers/model';
import type { AdminView } from '@/lib/admin-page';
import { t } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';
import { GradePill } from './GradePill';
import { initials } from './PairCard';

export function CustomerRail({ view, data, list, current }: { view: AdminView; data: ListData; list: CustomerQuery; current: string }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const v = data.query.view;
  const page = data.query.page;
  return (
    <aside className="cus-rail lm-card" aria-label={t(d, 'cus.split.aria')} data-testid="cus-rail">
      <div className="cus-rail-h">
        <b>
          {t(d, `cus.list.view.${v}`)} <span className="a2-cnt">{n(data.counts[v] ?? 0)}</span>
        </b>
        <Link className="lm-btn sm gh" href={customersHref(list)} data-testid="cus-rail-full">
          {t(d, 'cus.split.full')}
        </Link>
      </div>
      {list.q ? <p className="cus-rail-q">“{list.q}”</p> : null}
      {data.rows.length ? (
        <ul className="cus-rail-list">
          {data.rows.map((r) => {
            const on = r.id === current;
            return (
              <li key={r.id}>
                <Link className={on ? 'on' : undefined} href={customerHref(r.id, list)} aria-current={on ? 'page' : undefined} scroll={false} data-testid="cus-rail-item" data-id={r.id}>
                  <span className="a2-av g" aria-hidden="true">
                    {initials(r.name)}
                  </span>
                  <span className="cus-rail-t">
                    <b>
                      {r.name ?? t(d, 'cus.side.noName')}
                      <GradePill mark={r.mark ?? null} lang={view.lang} verified={t(d, 'cus.grade.verified')} />
                    </b>
                    <small>{[r.phone?.text ?? t(d, 'cus.side.noPhone'), t(d, r.orders === 1 ? 'cus.split.order1' : 'cus.split.orders', { n: n(r.orders) })].join(' · ')}</small>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cus-rail-q">{t(d, 'cus.split.empty')}</p>
      )}
      {page > 1 || data.hasMore ? (
        <div className="cus-rail-f">
          {page > 1 ? (
            <Link className="lm-btn sm" href={customerHref(current, { ...list, page: page - 1 })} scroll={false}>
              {t(d, 'cus.split.newer')}
            </Link>
          ) : (
            <span />
          )}
          {data.hasMore ? (
            <Link className="lm-btn sm" href={customerHref(current, { ...list, page: page + 1 })} scroll={false} data-testid="cus-rail-more">
              {t(d, 'cus.split.more')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

/** "Previous · 3 of 50 · Next" above his page when he is on the list beside him (every width; one tap to the next). */
export function CustomerSteps({ view, data, list, current }: { view: AdminView; data: ListData; list: CustomerQuery; current: string }) {
  const d = view.dict;
  const at = placeIn(
    data.rows.map((r) => r.id),
    current,
  );
  if (!at || at.of < 2) return null;
  const n = (x: number) => formatNumber(x, view.locale);
  const step = (id: string | null, label: string, icon: 'cl' | 'cr', testId: string) =>
    id ? (
      <Link className="lm-btn sm" href={customerHref(id, list)} scroll={false} data-testid={testId}>
        {icon === 'cl' ? <ShellIcon name="cl" size={14} /> : null}
        {label}
        {icon === 'cr' ? <ShellIcon name="cr" size={14} /> : null}
      </Link>
    ) : (
      // the first or last person: nothing to press on that side (the place stays in the middle)
      <span />
    );
  return (
    <nav className="lm-split-nav cus-steps" aria-label={t(d, 'cus.split.stepsAria')} data-testid="cus-steps">
      {step(at.prev, t(d, 'cus.split.prev'), 'cl', 'cus-prev')}
      <span className="lm-split-pos">{t(d, 'cus.split.pos', { n: n(at.n), of: n(at.of) })}</span>
      {step(at.next, t(d, 'cus.split.next'), 'cr', 'cus-next')}
    </nav>
  );
}
