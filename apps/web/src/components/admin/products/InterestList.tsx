'use client';
// PR 36 — who asked to be told when a product is back: tick people and mark them as told, take them off the list or
// put them back. Nothing is deleted. Contacts are only sent to a person with the back-in-stock list permission.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { InterestAction, InterestRequestView, InterestState } from '@extas/catalogue';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { formatNumber, refusalText } from './model';
import { contactOf } from './tools-model';
import { useToast } from './useToast';

interface Props {
  dict: Dict;
  locale: string;
  timeZone: string;
  state: InterestState;
  rows: InterestRequestView[];
}

export function InterestList({ dict: d, locale, timeZone, state, rows }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, say] = useToast();
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const all = rows.length > 0 && picked.length === rows.length;
  const actions: InterestAction[] = state === 'archived' ? ['restore'] : state === 'told' ? ['archive'] : ['told', 'archive'];

  const go = async (action: InterestAction) => {
    setBusy(true);
    try {
      const a = await call('POST', '/api/admin/catalogue/back-in-stock/requests', { action, ids: picked });
      if (a.status !== 200) return say(refusalText(d, a.data.error, a.data.details));
      say(t(d, 'interest.done', { n: formatNumber((a.data.result as { changed: number }).changed, locale) }));
      setPicked([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!rows.length) return <p className="pa-empty">{t(d, 'interest.listEmpty')}</p>;
  return (
    <>
      <label className="pa-selall">
        <input type="checkbox" checked={all} onChange={() => setPicked(all ? [] : rows.map((r) => r.id))} />
        {t(d, 'interest.selectAll')}
      </label>
      <ul className="pa-jobs">
        {rows.map((r) => {
          const on = picked.includes(r.id);
          const contact = contactOf(r);
          const size = r.variant ? [r.variant.colour, r.variant.size].filter(Boolean).join(' · ') || r.variant.sku : t(d, 'interest.anySize');
          return (
            <li key={r.id} className={`pa-job${on ? ' on' : ''}`}>
              <label className="pa-pick-row">
                <input type="checkbox" checked={on} aria-label={t(d, 'interest.select', { contact })} onChange={() => setPicked(on ? picked.filter((x) => x !== r.id) : [...picked, r.id])} />
                <span className="pa-main">
                  <span className="pa-nm" translate="no">
                    {contact}
                  </span>
                  <span className="ad-mini pa-block">
                    {size}
                    {t(d, 'products.row.metaSep')}
                    {t(d, 'interest.asked', { date: date(r.createdAt) })}
                    {r.notifiedAt ? `${t(d, 'products.row.metaSep')}${t(d, 'interest.toldAt', { date: date(r.notifiedAt) })}` : ''}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {picked.length ? (
        <div className="pa-bulk">
          <div className="pa-bulk-in">
            <span className="pa-bulk-n">{t(d, 'interest.selected', { n: formatNumber(picked.length, locale) })}</span>
            <div className="pa-bulk-acts">
              {actions.map((a) => (
                <button key={a} type="button" className={`ad-btn ad-btn-sm ${a === 'told' ? 'ad-btn-primary' : 'ad-btn-ghost'}`} disabled={busy} onClick={() => go(a)}>
                  {t(d, a === 'told' ? 'interest.markTold' : `interest.${a}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
