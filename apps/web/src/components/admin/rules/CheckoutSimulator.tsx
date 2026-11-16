'use client';
// Parity round 3, lane F5 · PR 858 (admin prototype v5, Rules › "Checkout simulator") — pick a delivery area, a cart value, the pieces, a
// category, how the customer pays, a coupon and whether it is a new customer: see exactly what that customer pays with every live rule
// working together (the checkout's own engine, `POST /api/admin/rules/hub/sim`). Read only: nothing is saved, sent or counted.
import { useEffect, useRef, useState } from 'react';
import { formatValue } from '@extas/rules/pure';
import type { CheckoutSimChoices, CheckoutSimResult } from '@extas/rules';
import { call } from '../api';
import { Icon } from '../Icon';
import { t, type Dict } from '@/lib/i18n';
import { moneyFromInput, moneyToInput, rulesRefusal, type Lang, type RulesEnv } from './model';

const API = '/api/admin/rules/hub/sim';
const WAIT_MS = 350; // hardcode-ok: a typing pause before the what-if runs

export function CheckoutSimulator({ dict: d, lang, env }: { dict: Dict; lang: Lang; env: Pick<RulesEnv, 'ctx'> }) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `rulesHub.sim.${k}`, vars);
  const money = (n: number | null) => (n === null ? tt('notSet') : (formatValue('money', n, env.ctx) ?? String(n)));
  const [choices, setChoices] = useState<CheckoutSimChoices | null>(null);
  const [band, setBand] = useState('');
  const [cart, setCart] = useState(() => moneyToInput(240_000, env.ctx.currency)); // hardcode-ok: the prototype's example cart, only a starting figure
  const [pieces, setPieces] = useState('2');
  const [cat, setCat] = useState('');
  const [pay, setPay] = useState('COD');
  const [coupon, setCoupon] = useState('');
  const [fresh, setFresh] = useState(true);
  const [refused, setRefused] = useState(false); // PR 949: "Phone number refused parcels before"
  const [out, setOut] = useState<CheckoutSimResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    void call('GET', API).then((a) => {
      const c = a.data.choices as CheckoutSimChoices | undefined;
      if (a.status !== 200 || !c) return setProblem(rulesRefusal(d, a.data.error, a.data.details ?? []));
      setChoices(c);
      setBand((x) => x || c.bands.find((b) => b.enabled)?.key || c.bands[0]?.key || '');
      setCat((x) => x || c.categories[0]?.id || '');
    });
  }, [d]);

  useEffect(() => {
    const cartMinor = moneyFromInput(cart, env.ctx.currency);
    const n = Number(pieces);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the answer when the form is not complete
    if (!band || cartMinor === null || Number.isNaN(cartMinor) || cartMinor < 1 || !Number.isInteger(n) || n < 1) return setOut(null);
    const mine = ++seq.current;
    const h = setTimeout(() => {
      void call('GET', `${API}?q=${encodeURIComponent(JSON.stringify({ bandKey: band, cartMinor, pieces: n, categoryId: cat || null, paymentMethod: pay, couponCode: coupon.trim() || null, newCustomer: fresh }))}`).then((a) => {
        if (mine !== seq.current) return;
        if (a.status !== 200 || !a.data.sim) {
          setOut(null);
          return setProblem(rulesRefusal(d, a.data.error, a.data.details ?? []));
        }
        setProblem(null);
        setOut(a.data.sim as CheckoutSimResult);
      });
    }, WAIT_MS);
    return () => clearTimeout(h);
  }, [band, cart, pieces, cat, pay, coupon, fresh, d, env.ctx.currency]);

  const name = (x: { nameEn: string; nameBn: string | null }) => (lang === 'bn' && x.nameBn ? x.nameBn : x.nameEn);
  const q = out?.quote;
  const hrs = out?.hours;
  const cp = out?.coupon ?? null;
  const bandName = choices?.bands.find((b) => b.key === band);
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
  const cutoff = q?.cutoffs.find((c) => c.bandKey === band) ?? null;
  const codWhy = q && q.cod.allowed === false ? (q.cod.reason === 'OVER_MAX' && q.cod.maxOrderMinor !== null ? tt('codOver', { max: money(q.cod.maxOrderMinor) }) : tt('codOff')) : '';
  return (
    <section className="rh-card rh-sim" data-testid="rh-sim" aria-labelledby="rh-sim-h">
      <h3 id="rh-sim-h">{tt('title')}</h3>
      <p className="rh-hint">{tt('sub')}</p>
      <div className="rh-fields">
        <div>
          <label className="ad-label" htmlFor="rh-sim-band">
            {tt('area')}
          </label>
          <select id="rh-sim-band" className="ad-input" value={band} onChange={(e) => setBand(e.target.value)}>
            {choices?.bands.map((b) => (
              <option key={b.key} value={b.key}>
                {name(b)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ad-label" htmlFor="rh-sim-cart">
            {tt('cart')}
          </label>
          <input id="rh-sim-cart" className="ad-input" inputMode="decimal" value={cart} onChange={(e) => setCart(e.target.value)} />
        </div>
        <div>
          <label className="ad-label" htmlFor="rh-sim-pcs">
            {tt('pieces')}
          </label>
          <input id="rh-sim-pcs" className="ad-input" type="number" min={1} max={200} value={pieces} onChange={(e) => setPieces(e.target.value)} />
        </div>
        <div>
          <label className="ad-label" htmlFor="rh-sim-cat">
            {tt('category')}
          </label>
          <select id="rh-sim-cat" className="ad-input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{tt('anyCategory')}</option>
            {choices?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ad-label" htmlFor="rh-sim-pay">
            {tt('pay')}
          </label>
          <select id="rh-sim-pay" className="ad-input" value={pay} onChange={(e) => setPay(e.target.value)}>
            {(choices?.payments ?? ['COD']).map((p) => (
              <option key={p} value={p}>
                {tt(`payWay.${p}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ad-label" htmlFor="rh-sim-cp">
            {tt('coupon')}
          </label>
          <select id="rh-sim-cp" className="ad-input" value={coupon} onChange={(e) => setCoupon(e.target.value)}>
            <option value="">{tt('noCoupon')}</option>
            {choices?.coupons.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
                {c.on ? '' : tt('couponOff')}
              </option>
            ))}
          </select>
        </div>
        <label className="rh-sw">
          <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} /> <span>{tt('newCustomer')}</span>
        </label>
        <label className="rh-sw">
          <input type="checkbox" checked={refused} onChange={(e) => setRefused(e.target.checked)} /> <span>{tt('refusedBefore')}</span>
        </label>
      </div>
      {problem ? <div className="ad-note warn">{problem}</div> : null}
      {q ? (
        <div className="rh-sees" data-testid="rh-sim-out" role="status">
          <div className="rh-sim-ln">
            <span>{tt('products', { n: Number(pieces) })}</span>
            <b>{money(q.subtotalMinor)}</b>
          </div>
          {q.applied
            .filter((a) => a.amountMinor && (a.effect === 'discount' || a.effect === 'setTier'))
            .map((a, i) => (
              <div className="rh-sim-ln" key={i}>
                <span>{tt(`offer.${a.effect}`, { rule: a.rule.key, n: Number(pieces) })}</span>
                <b className="good">−{money(a.amountMinor)}</b>
              </div>
            ))}
          <div className="rh-sim-ln">
            <span>{bandName ? tt('delivery', { area: name(bandName), days: hrs && hrs.min !== null && hrs.max !== null ? `${Math.ceil(hrs.min / 24)}–${Math.ceil(hrs.max / 24)}` : '—' }) : tt('deliveryPlain')}</span>
            <b>
              {q.delivery.chargeMinor === null ? (
                tt('notSet')
              ) : q.delivery.free ? (
                <>
                  <span className="good">{tt('free')}</span> {bandName && bandName.chargeMinor > 0 ? <s className="rh-hint">{money(bandName.chargeMinor)}</s> : null}
                </>
              ) : (
                money(q.delivery.chargeMinor)
              )}
            </b>
          </div>
          <div className="rh-sim-ln tot">
            <span>{tt('pays')}</span>
            <b data-testid="rh-sim-total">{q.totalKnown ? money(q.totalMinor) : `${money(q.totalMinor)} + ${tt('deliveryUnknown')}`}</b>
          </div>
          {pay === 'COD' ? (
            q.cod.allowed === false ? (
              <div className="rh-call bad">
                <Icon name="info" size={15} /> <span>{tt('codNo', { why: codWhy })}</span>
              </div>
            ) : (
              <div className="rh-call good">
                <Icon name="check" size={15} /> <span>{tt('codOk')}</span>
              </div>
            )
          ) : (
            <div className="rh-call good">
              <Icon name="check" size={15} /> <span>{tt('prepaid')}</span>
            </div>
          )}
          {pay === 'COD' && refused ? (
            <div className={`rh-call ${choices?.advanceOn ? 'warn' : 'good'}`} data-testid="rh-sim-refused">
              <Icon name={choices?.advanceOn ? 'info' : 'check'} size={15} /> <span>{tt(choices?.advanceOn ? 'refusedAdvanceOn' : 'refusedAdvanceOff')}</span>
            </div>
          ) : null}
          {q.delivery.remainingMinor ? <p className="rh-note-sm">{tt('toFree', { amount: money(q.delivery.remainingMinor) })}</p> : null}
          {cp && cp.state !== 'unlocks' ? <p className="rh-note-sm">{tt(`couponState.${cp.state}`, { code: cp.code })}</p> : null}
          {cutoff ? <p className="rh-note-sm">{tt('eidLast', { date: day(cutoff.at) })}</p> : null}
          {q.waiting.map((w, i) => (
            <p className="rh-hint" key={i}>
              {tt(`waiting.${w.why}`, { rule: w.rule.key, n: w.morePieces ?? 0 })}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
