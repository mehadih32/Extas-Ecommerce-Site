'use client';
// S28 · PR 1034 — wizard step 5, "Price" (prototype v5): the buying price from the ERP (read only, only for those who may see prices), one
// selling price for the whole product, an optional crossed-out price, the profit and margin worked out live, and "Confirm price". The
// confirmation sets the price on every kept variant; with the price PIN setting on, the owner's PIN is asked first.
import { useState } from 'react';
import { profitOf } from '@extas/catalogue/wizard-model';
import { t } from '@/lib/i18n';
import { formatMoney, refusalText, toMajor, toMinor } from '../model';
import { say, sayBad } from '../useToast';
import { Callout, Fld, Modal, Tag } from '../wizard-ui';
import { postPrice } from './api';
import type { Ctx } from './ctx';

export function StepPrice({ c }: { c: Ctx }) {
  const { d, data, money } = c;
  const [price, setPrice] = useState(toMajor(data.priceMinor, money));
  const [compare, setCompare] = useState(toMajor(data.compareAtMinor, money));
  const [confirmed, setConfirmed] = useState(!!data.spec.priceConfirmedAt && data.priceMinor !== null);
  const [ask, setAsk] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const cost = data.costMinor;
  const pm = toMinor(price, money);
  const cm = toMinor(compare, money);
  const bad = pm === undefined || cm === undefined;
  const pr = typeof pm === 'number' && cost !== null ? profitOf(pm, cost) : null;
  const crossedBad = typeof pm === 'number' && typeof cm === 'number' && cm <= pm;

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setConfirmed(false);
    c.setLive({ confirmed: false });
  };
  const confirm = async (typedPin?: string) => {
    if (typeof pm !== 'number' || bad) return sayBad(t(d, 'products.wiz.price.needPrice'));
    if (c.requirePin && typedPin === undefined) {
      setPin('');
      return setAsk(true);
    }
    setBusy(true);
    const a = await postPrice(data.productId, { priceMinor: pm, compareAtMinor: typeof cm === 'number' ? cm : null, ...(typedPin !== undefined ? { pin: typedPin } : {}) });
    setBusy(false);
    if (a.status !== 200) {
      const code = String(a.data.error ?? '');
      return sayBad(code.startsWith('PIN_') || code === 'WRONG_PIN' ? t(d, `products.v5.pin.err.${code}`) : refusalText(d, a.data.error, a.data.details));
    }
    setAsk(false);
    setConfirmed(true);
    c.setLive({ priceMinor: pm, compareAtMinor: typeof cm === 'number' ? cm : null, confirmed: true });
    c.saved();
    say(t(d, 'products.wiz.price.done'));
    c.refresh();
  };
  const money1 = (n: number) => formatMoney(n, money);

  return (
    <>
      {c.can.prices ? (
        <div className="wzp-grid2">
          <Fld dict={d} label={t(d, 'products.wiz.price.cost')} tag="e">
            <div className="ad-input wzp-ro" data-testid="wiz-cost">{cost !== null && cost > 0 ? money1(cost) : '—'}</div>
          </Fld>
          <Fld dict={d} label={t(d, 'products.wiz.price.sell')} tag="a" htmlFor="wz-price">
            <input id="wz-price" className="ad-input" inputMode="decimal" value={price} onChange={(e) => edit(setPrice)(e.target.value)} placeholder={t(d, 'products.wiz.price.sellPh')} disabled={!c.can.write} />
          </Fld>
          <Fld dict={d} label={t(d, 'products.wiz.price.compare')} tag="y" htmlFor="wz-compare" hint={t(d, 'products.wiz.price.compareHint')}>
            <input id="wz-compare" className="ad-input" inputMode="decimal" value={compare} onChange={(e) => edit(setCompare)(e.target.value)} disabled={!c.can.write} />
          </Fld>
          <Fld dict={d} label={t(d, 'products.wiz.price.profit')}>
            <div className="ad-input wzp-ro" data-testid="wiz-profit">
              {pr ? `${money1(pr.profitMinor)} · ${t(d, 'products.wiz.price.margin', { pct: pr.marginPct })}` : '—'}
            </div>
          </Fld>
        </div>
      ) : (
        <Callout kind="warn">{t(d, 'products.wiz.price.noRight')}</Callout>
      )}
      {pr?.belowCost ? <Callout kind="bad">{t(d, 'products.wiz.price.belowCost')}</Callout> : null}
      {crossedBad ? <Callout kind="warn">{t(d, 'products.wiz.price.crossedBad')}</Callout> : null}
      {confirmed ? <Callout kind="good">{t(d, 'products.wiz.price.confirmed')}</Callout> : <div className="ad-mini">{t(d, 'products.wiz.price.mustConfirm')}</div>}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="ad-btn ad-btn-primary" onClick={() => void confirm()} disabled={busy || !c.can.prices || bad || !price || (pr?.belowCost ?? false) || crossedBad} data-testid="wiz-confirm-price">
          {t(d, 'products.wiz.price.confirm')}
        </button>{' '}
        <Tag dict={d} kind="a" />
      </div>
      {ask ? (
        <Modal
          title={t(d, 'products.v5.pin.h')}
          onClose={() => setAsk(false)}
          foot={
            <>
              <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setAsk(false)}>
                {t(d, 'products.wiz.cancel')}
              </button>
              <button type="button" className="ad-btn ad-btn-primary" disabled={busy || !pin} onClick={() => void confirm(pin)}>
                {t(d, 'products.wiz.price.confirm')}
              </button>
            </>
          }
        >
          <label className="wzp-fld">
            <span className="lbl">{t(d, 'products.v5.pin.label')}</span>
            <input className="ad-input" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
          </label>
        </Modal>
      ) : null}
    </>
  );
}
