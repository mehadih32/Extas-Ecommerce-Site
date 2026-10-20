'use client';
// S06 · PR 551 — "Try an address": the owner types a line as a customer would and sees what checkout does with it. The
// line is read the way checkout reads it (the shared settle controller): never while typing; on leaving the box, or
// after a pause once it has enough words; typing again starts the wait over. A line still ambiguous asks "Where is this
// address?" with the bands in doubt (demo 51-checkout.js co-zask / co-zboth / co-zpick); picking one is kept, and a
// later sure read that disagrees asks again — nothing changes silently.
import { useEffect, useRef, useState } from 'react';
import type { ResolveView } from '@extas/delivery';
import { createSettle, type SettleController } from '@extas/delivery/settle';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { Icon } from '../Icon';
import type { Money } from '../products/model';
import { askLine, nameOf, optionLine, outCharge, hoursText, placeLabel, refusalText, type Lang } from './model';

interface Props {
  dict: Dict;
  lang: Lang;
  locale: string;
  money: Money;
  settleMs: number;
  minWords: number;
}

type Confirmed = { bandId: string; areaId: string | null } | null;

export function TryAddress({ dict: d, lang, locale, money, settleMs, minWords }: Props) {
  const [line, setLine] = useState('');
  const [read, setRead] = useState<ResolveView | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const confirmed = useRef<Confirmed>(null);
  const seq = useRef(0);
  const ctrl = useRef<SettleController | null>(null);

  const run = async (text: string) => {
    const n = ++seq.current;
    setWaiting(false);
    setError('');
    const a = await call('POST', '/api/admin/delivery/resolve', { line: text, confirmed: confirmed.current });
    if (n !== seq.current) return; // a newer read is on its way
    if (a.status === 200) setRead(a.data.read as ResolveView);
    else setError(refusalText(d, a.data.error, a.data.details));
  };
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    const c = createSettle({ settleMs, minWords, onSettle: (text) => void runRef.current(text) });
    ctrl.current = c;
    return () => c.dispose();
  }, [settleMs, minWords]);

  const onInput = (v: string) => {
    setLine(v);
    ctrl.current?.input(v);
    setWaiting(ctrl.current?.waiting ?? false);
  };
  const pick = (bandId: string, areaId: string | null) => {
    confirmed.current = { bandId, areaId };
    void run(line.trim());
  };
  const unpick = () => {
    confirmed.current = null;
    ctrl.current?.reset();
    void run(line.trim());
  };

  return (
    <section className="ad-card dl-card dl-wide" aria-labelledby="dl-try-h">
      <h2 id="dl-try-h">{t(d, 'delivery.try.title')}</h2>
      <p className="ad-sub">{t(d, 'delivery.try.sub')}</p>
      <label className="ad-label" htmlFor="dl-try">
        {t(d, 'delivery.try.label')}
      </label>
      <input
        id="dl-try"
        className="ad-input"
        value={line}
        placeholder={t(d, 'delivery.try.placeholder')}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onInput(e.target.value)}
        onBlur={(e) => {
          // the box's own value (text typed before the page was ready never reached onChange)
          if (e.currentTarget.value !== line) onInput(e.currentTarget.value);
          ctrl.current?.blur();
          setWaiting(false);
        }}
        data-testid="dl-try"
      />
      <div className="dl-try-out" aria-live="polite" data-testid="dl-try-out">
        {error ? <p className="ad-err">{error}</p> : null}
        {waiting ? <p className="ad-mini">{t(d, 'delivery.try.waiting')}</p> : null}
        {!waiting && read?.status === 'resolved' ? (
          <div className="dl-zone">
            <Icon name="truck" size={22} />
            <div className="dl-zone-main">
              <b>{nameOf(lang, read.band)}</b>
              <div className="ad-mini">
                {hoursText(d, read.band, locale)}
                {t(d, 'delivery.sep')}
                {read.area ? t(d, 'delivery.try.readFrom', { place: placeLabel(lang, read.area) }) : t(d, `delivery.try.via.${read.via}`)}
              </div>
              {!read.placeSure ? <div className="ad-mini">{t(d, 'delivery.try.placeUnsure')}</div> : null}
            </div>
            <b className="dl-zone-v">{outCharge(d, read.band, money)}</b>
            {read.via === 'choice' ? (
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={unpick}>
                {t(d, 'delivery.try.change')}
              </button>
            ) : null}
          </div>
        ) : null}
        {!waiting && read?.status === 'ask' ? (
          <div>
            <p className="dl-zask">{t(d, 'delivery.try.ask')}</p>
            <p className="dl-zboth">
              <Icon name="info" size={14} />
              <span>{askLine(d, lang, read)}</span>
            </p>
            <div className={`dl-zpick${read.options.length > 2 ? ' z3' : ''}`}>
              {read.options.map((o) => {
                const place = o.places.length === 1 ? o.places[0]! : null;
                return (
                  <button key={o.band.id} type="button" className="dl-zbtn" onClick={() => pick(o.band.id, place?.id ?? null)} data-testid="dl-zbtn">
                    <b>{place && read.reason !== 'wide-place' ? placeLabel(lang, place) : nameOf(lang, o.band)}</b>
                    <span>{optionLine(d, o.band, money, locale)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
