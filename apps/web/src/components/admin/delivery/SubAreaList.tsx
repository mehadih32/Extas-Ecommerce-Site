'use client';
// S06 · PR 550 — the owner's sub-area list: find a place of the area list (prefix only, the same matching the checkout's
// autocomplete uses), see the band it sits in now, add it; take a place off (its row is archived, never deleted) and
// put it back. The search runs when the form is sent (the Find button or Enter), never on a timer. Adding and taking off
// need `delivery.areas`; the server checks it again.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ListedPlace, PlaceAnswer } from '@extas/delivery';
import { t, type Dict } from '@/lib/i18n';
import { call, type Answer } from '../api';
import { Icon } from '../Icon';
import { useToast } from '../products/useToast';
import { nameOf, placeLine, refusalText, type Lang } from './model';

/** One change's request (a call signature, so no arrow sits before the type). */
type Run = { (): Promise<Answer> };

interface Props {
  dict: Dict;
  lang: Lang;
  areas: ListedPlace[];
  /** Band names by id, in the admin's language. */
  bandNames: Record<string, string>;
  canEdit: boolean;
}

export function SubAreaList({ dict: d, lang, areas, bandNames, canEdit }: Props) {
  const router = useRouter();
  const [toast, say] = useToast();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PlaceAnswer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showOff, setShowOff] = useState(false);
  const live = areas.filter((a) => !a.archived);
  const off = areas.filter((a) => a.archived);
  const listed = new Set(live.map((a) => a.id));

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    setBusy('search');
    setError('');
    const a = await call('GET', `/api/admin/delivery/places?q=${encodeURIComponent(text)}`);
    setBusy(null);
    if (a.status === 200) setFound(a.data.places as PlaceAnswer[]);
    else setError(refusalText(d, a.data.error, a.data.details));
  };

  const change = async (key: string, name: string, run: Run, done: string) => {
    setBusy(key);
    setError('');
    const a = await run();
    setBusy(null);
    if (a.status === 200 || a.status === 201) {
      say(t(d, done, { name }));
      // the list (and whether a found place is on it) comes back from the server
      router.refresh();
    } else setError(refusalText(d, a.data.error, a.data.details));
  };
  const add = (p: { id: string; nameEn: string; nameBn: string | null }) => change(p.id, nameOf(lang, p), () => call('POST', '/api/admin/delivery/areas', { areaId: p.id }), 'delivery.list.added');
  const remove = (p: ListedPlace) => change(p.id, nameOf(lang, p), () => call('PATCH', `/api/admin/delivery/areas/${encodeURIComponent(p.id)}`, { archived: true }), 'delivery.list.removed');

  const row = (p: ListedPlace) => (
    <li key={p.id} className="dl-li" data-testid="dl-listed">
      <div className="dl-li-main">
        <b>{nameOf(lang, p)}</b>
        <div className="ad-mini">
          {placeLine(d, lang, p)}
          {p.missing ? `${t(d, 'delivery.sep')}${t(d, 'delivery.list.missing')}` : ''}
        </div>
      </div>
      {p.archived ? <span className="dl-pill">{t(d, 'delivery.list.offTag')}</span> : <span className="dl-pill on">{bandNames[p.bandId] ?? p.bandKey}</span>}
      {canEdit ? (
        p.archived ? (
          <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy === p.id || p.missing} onClick={() => add(p)}>
            {t(d, 'delivery.list.putBack')}
          </button>
        ) : (
          <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy === p.id} onClick={() => remove(p)}>
            {t(d, 'delivery.list.remove')}
          </button>
        )
      ) : null}
    </li>
  );

  return (
    <section className="ad-card dl-card" aria-labelledby="dl-list-h">
      <h2 id="dl-list-h">{t(d, 'delivery.list.title')}</h2>
      <p className="ad-sub">{t(d, 'delivery.list.sub')}</p>

      <form className="dl-find" onSubmit={search} role="search">
        <label className="ad-label" htmlFor="dl-q">
          {t(d, 'delivery.list.search')}
        </label>
        <div className="dl-find-row">
          <input id="dl-q" className="ad-input" type="search" value={q} placeholder={t(d, 'delivery.list.placeholder')} autoComplete="off" spellCheck={false} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy === 'search' || !q.trim()}>
            <Icon name="search" size={16} />
            {t(d, 'delivery.list.find')}
          </button>
        </div>
      </form>
      {error ? (
        <p className="ad-err" role="alert">
          {error}
        </p>
      ) : null}
      {found ? (
        <div className="dl-found" aria-live="polite">
          <div className="ad-mini dl-cap">{t(d, 'delivery.list.results')}</div>
          {found.length ? (
            <ul className="dl-list">
              {found.map((p) => {
                const here = listed.has(p.id);
                const band = p.bandId ? (bandNames[p.bandId] ?? p.bandKey ?? '') : '';
                return (
                  <li key={p.id} className="dl-li" data-testid="dl-found">
                    <div className="dl-li-main">
                      <b>{nameOf(lang, p)}</b>
                      <div className="ad-mini">
                        {placeLine(d, lang, p)}
                        {band ? `${t(d, 'delivery.sep')}${t(d, 'delivery.list.now', { band })}` : ''}
                        {p.via ? ` (${t(d, `delivery.list.via.${p.via}`)})` : ''}
                        {p.spans > 1 ? `${t(d, 'delivery.sep')}${t(d, 'delivery.list.spans')}` : ''}
                      </div>
                    </div>
                    {here ? (
                      <span className="dl-pill on">{t(d, 'delivery.list.onList')}</span>
                    ) : canEdit ? (
                      <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy === p.id} onClick={() => add(p)}>
                        <Icon name="plus" size={16} />
                        {t(d, 'delivery.list.add')}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ad-mini">{t(d, 'delivery.list.none')}</p>
          )}
        </div>
      ) : null}

      {live.length ? <ul className="dl-list dl-listed">{live.map(row)}</ul> : <p className="ad-mini dl-empty">{t(d, 'delivery.list.empty')}</p>}
      {off.length ? (
        <>
          <label className="dl-check">
            <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />
            <span>{t(d, 'delivery.list.showOff')}</span>
          </label>
          {showOff ? <ul className="dl-list">{off.map(row)}</ul> : null}
        </>
      ) : null}
      {toast ? (
        <div className="ad-toast" role="status">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
