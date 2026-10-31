'use client';
// S16 · PR 345 — the cards of Money → Costs & fees (/admin/money/fees): payment gateway fees (a row per provider: share
// in %, fixed amount), the packaging cost of one order, the USD rate (a new rate from now; the old ones stay) and the
// courier rates (per courier: add a rate for a delivery band and weight band, end one). Saving a setting asks once more
// before it is kept ("Save" → "Yes, save") and sends the version it was read at, so two people never overwrite each
// other unseen. Amounts are read like the Books pages (`typedMinor`). Without `costs.write` it is read-only. Nothing
// here charges a customer or changes a price, a delivery charge or COD.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { typedMinor } from '@/lib/admin-books/money';
import type { FeesView } from '@/lib/fees-api';
import { call } from '../api';
import { formatMoney, toMajor, type Money } from '../products/model';

export interface FeesScreenProps {
  dict: Dict;
  lang: 'en' | 'bn';
  money: Money;
  view: FeesView;
  canEdit: boolean;
}

type FeeRow = { provider: string; percent: string; fixed: string };

export function FeesScreen(p: FeesScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `moneyFees.${k}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const minorOf = (s: string) => (s.trim() ? typedMinor(s, p.money.digits) : null);
  const errText = (code: string | undefined) => {
    const k = `moneyFees.err.${code ?? 'other'}`;
    const v = t(p.dict, k);
    return v === k ? c('err.other') : v;
  };
  const off = !p.canEdit;
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ where: string; text: string; bad: boolean } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const tell = (where: string, text: string, bad: boolean) => setSaid({ where, text, bad });

  const [fees, setFees] = useState<FeeRow[]>((p.view.gatewayFees.value ?? []).map((f) => ({ provider: f.provider, percent: String(f.percentBps / 100), fixed: f.fixedMinor ? String(toMajor(f.fixedMinor, p.money)) : '' })));
  const [pack, setPack] = useState(p.view.packaging.value ? String(toMajor(p.view.packaging.value.perOrderMinor, p.money)) : '');
  const [usd, setUsd] = useState('');
  const firstCourier = p.view.couriers[0]?.id ?? '';
  const [card, setCard] = useState({ courierAccountId: firstCourier, zoneKey: p.view.bands[0]?.key ?? '', from: '0', to: '1000', charge: '', cod: '', ret: '' });

  async function put(where: 'gateway-fees' | 'packaging', value: unknown, version: number) {
    if (confirm !== where) return setConfirm(where);
    setConfirm(null);
    setBusy(true);
    const a = await call('PUT', `/api/admin/money/fees/${where}`, { value, version });
    setBusy(false);
    if (a.status === 200) {
      tell(where, c('saved'), false);
      return router.refresh();
    }
    tell(where, errText(a.status === 0 ? 'network' : a.data.error), true);
  }
  function saveFees() {
    const out = [];
    for (const f of fees) {
      if (!f.provider.trim() && !f.percent.trim() && !f.fixed.trim()) continue;
      const pct = Number(f.percent.trim() || '0');
      const fixed = f.fixed.trim() ? minorOf(f.fixed) : 0;
      if (!/^[a-z0-9_-]{1,40}$/.test(f.provider.trim().toLowerCase()) || !Number.isFinite(pct) || pct < 0 || pct > 20 || fixed === null) return tell('gateway-fees', c('fees.bad'), true);
      out.push({ provider: f.provider.trim().toLowerCase(), percentBps: Math.round(pct * 100), fixedMinor: fixed });
    }
    return put('gateway-fees', out.length ? out : null, p.view.gatewayFees.version);
  }
  function savePack() {
    const v = minorOf(pack);
    if (pack.trim() && v === null) return tell('packaging', c('badAmount'), true);
    return put('packaging', v === null ? null : { perOrderMinor: v }, p.view.packaging.version);
  }
  async function saveUsd() {
    setBusy(true);
    const a = await call('POST', '/api/admin/money/fees/usd-rate', { rate: usd });
    setBusy(false);
    if (a.status === 201) {
      setUsd('');
      tell('usd', c('saved'), false);
      return router.refresh();
    }
    tell('usd', errText(a.status === 0 ? 'network' : a.data.error), true);
  }
  async function addCard() {
    const charge = minorOf(card.charge);
    const ret = card.ret.trim() ? minorOf(card.ret) : null;
    const cod = card.cod.trim() ? Math.round(Number(card.cod) * 100) : null;
    if (charge === null || (card.ret.trim() && ret === null) || (cod !== null && !Number.isFinite(cod))) return tell('cards', c('badAmount'), true);
    setBusy(true);
    const a = await call('POST', '/api/admin/money/fees/rate-cards', { courierAccountId: card.courierAccountId, zoneKey: card.zoneKey, weightFromGrams: Number(card.from), weightToGrams: Number(card.to), chargeMinor: charge, codFeeBps: cod, returnChargeMinor: ret });
    setBusy(false);
    if (a.status === 201) {
      setCard((x) => ({ ...x, charge: '', cod: '', ret: '' }));
      tell('cards', c('saved'), false);
      return router.refresh();
    }
    tell('cards', errText(a.status === 0 ? 'network' : a.data.error), true);
  }
  async function endCard(cardId: string) {
    if (confirm !== `end-${cardId}`) return setConfirm(`end-${cardId}`);
    setConfirm(null);
    setBusy(true);
    const a = await call('POST', `/api/admin/money/fees/rate-cards/${cardId}/end`, {});
    setBusy(false);
    if (a.status === 200) return router.refresh();
    tell('cards', errText(a.status === 0 ? 'network' : a.data.error), true);
  }
  const say = (where: string) =>
    said?.where === where ? (
      <p className={`a2-sm a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid={`fe-said-${where}`}>
        {said.text}
      </p>
    ) : null;
  const saveBtn = (where: string, onClick: () => void, testId: string) => (
    <button type="button" className={`a2-btn ${confirm === where ? 'pri' : ''}`} disabled={off || busy} onClick={onClick} data-testid={testId}>
      {confirm === where ? c('confirm') : c('save')}
    </button>
  );
  const band = (key: string) => {
    const b = p.view.bands.find((x) => x.key === key);
    return b ? (p.lang === 'bn' && b.nameBn ? b.nameBn : b.nameEn) : key;
  };

  return (
    <>
      <section className="a2-card a2-mt12" aria-labelledby={`${id}-g`} data-testid="fe-gateway">
        <h2 className="a2-h3" id={`${id}-g`}>
          {c('fees.title')}
        </h2>
        <p className="a2-cs">{c('fees.sub')}</p>
        {!fees.length ? <p className="a2-xs a2-mute">{c('fees.none')}</p> : null}
        {fees.map((f, i) => (
          <div key={i} className="ct-grid a2-mt12" data-testid="fe-fee-row">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-p${i}`}>
                {c('fees.provider')}
              </label>
              <input id={`${id}-p${i}`} className="a2-inp" value={f.provider} disabled={off || busy} onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, provider: e.target.value } : x)))} />
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-q${i}`}>
                {c('fees.percent')}
              </label>
              <input id={`${id}-q${i}`} className="a2-inp" inputMode="decimal" value={f.percent} disabled={off || busy} onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} />
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-f${i}`}>
                {c('fees.fixed')} ({p.money.currency})
              </label>
              <input id={`${id}-f${i}`} className="a2-inp" inputMode="decimal" value={f.fixed} disabled={off || busy} onChange={(e) => setFees(fees.map((x, j) => (j === i ? { ...x, fixed: e.target.value } : x)))} />
            </div>
          </div>
        ))}
        {p.canEdit ? (
          <div className="ct-actions a2-mt12">
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setFees([...fees, { provider: '', percent: '', fixed: '' }])} data-testid="fe-fee-add">
              {c('fees.add')}
            </button>
            {saveBtn('gateway-fees', saveFees, 'fe-fee-save')}
          </div>
        ) : null}
        {say('gateway-fees')}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby={`${id}-k`} data-testid="fe-packaging">
        <h2 className="a2-h3" id={`${id}-k`}>
          {c('pack.title')}
        </h2>
        <p className="a2-cs">{c('pack.sub')}</p>
        <div className="ct-grid a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-pk`}>
              {c('pack.field')} ({p.money.currency})
            </label>
            <input id={`${id}-pk`} className="a2-inp" inputMode="decimal" value={pack} disabled={off || busy} onChange={(e) => setPack(e.target.value)} data-testid="fe-pack" />
          </div>
        </div>
        {p.canEdit ? <div className="ct-actions a2-mt12">{saveBtn('packaging', savePack, 'fe-pack-save')}</div> : null}
        {say('packaging')}
        <p className="a2-xs a2-mute a2-mt12">
          {c('pack.rto')}{' '}
          <Link href="/admin/delivery/couriers" className="bk-act">
            {c('pack.rtoLink')}
          </Link>
        </p>
      </section>

      <section className="a2-card a2-mt12" aria-labelledby={`${id}-u`} data-testid="fe-usd">
        <h2 className="a2-h3" id={`${id}-u`}>
          {c('usd.title')}
        </h2>
        <p className="a2-cs">{c('usd.sub', { currency: p.view.currency })}</p>
        <p className="a2-sm a2-mt12" data-testid="fe-usd-now">
          {p.view.usd.current ? c('usd.now', { rate: p.view.usd.current.rate, currency: p.view.currency, from: p.view.usd.current.from.slice(0, 10) }) : c('usd.none')}
        </p>
        {p.view.usd.history.length ? <p className="a2-xs a2-mute">{c('usd.before', { list: p.view.usd.history.map((h) => `${h.rate} (${h.from.slice(0, 10)})`).join(' · ') })}</p> : null}
        {p.canEdit ? (
          <div className="ct-grid a2-mt12">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-usd`}>
                {c('usd.field', { currency: p.view.currency })}
              </label>
              <input id={`${id}-usd`} className="a2-inp" inputMode="decimal" value={usd} disabled={busy} onChange={(e) => setUsd(e.target.value)} data-testid="fe-usd-rate" />
            </div>
            <div className="ct-actions">
              <button type="button" className="a2-btn" disabled={busy || !usd.trim()} onClick={saveUsd} data-testid="fe-usd-save">
                {c('usd.save')}
              </button>
            </div>
          </div>
        ) : null}
        {say('usd')}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby={`${id}-c`} data-testid="fe-cards">
        <h2 className="a2-h3" id={`${id}-c`}>
          {c('cards.title')}
        </h2>
        <p className="a2-cs">{c('cards.sub')}</p>
        {!p.view.couriers.length ? <p className="a2-xs a2-mute">{c('cards.noCourier')}</p> : null}
        {p.view.couriers.map((k) => (
          <div key={k.id} className="a2-mt12">
            <h3 className="a2-h3">{k.name}</h3>
            {k.cards.length ? (
              k.cards.map((r) => (
                <div key={r.id} className="a2-rule" data-testid="fe-card-row">
                  <span>
                    <b>{band(r.zoneKey)}</b>
                    <span className="a2-xs a2-mute cl-sub">{c('cards.band', { from: r.weightFromGrams, to: r.weightToGrams, since: r.from.slice(0, 10) })}</span>
                  </span>
                  <span className="a2-xs a2-mute">
                    {[r.codFeeBps !== null ? c('cards.codShow', { pct: r.codFeeBps / 100 }) : null, r.returnChargeMinor !== null ? c('cards.retShow', { amount: m(r.returnChargeMinor) }) : null].filter(Boolean).join(' · ')}
                    {p.canEdit ? (
                      <>
                        {' '}
                        <button type="button" className={`a2-btn ${confirm === `end-${r.id}` ? 'pri' : ''}`} disabled={busy} onClick={() => endCard(r.id)} data-testid="fe-card-end">
                          {confirm === `end-${r.id}` ? c('cards.endSure') : c('cards.end')}
                        </button>
                      </>
                    ) : null}
                  </span>
                  <b>{m(r.chargeMinor)}</b>
                </div>
              ))
            ) : (
              <p className="a2-xs a2-mute">{c('cards.none')}</p>
            )}
          </div>
        ))}
        {p.canEdit && p.view.couriers.length ? (
          <div className="ct-form a2-mt12" data-testid="fe-card-form">
            <div className="ct-grid">
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-ck`}>
                  {c('cards.courier')}
                </label>
                <select id={`${id}-ck`} className="a2-sel" value={card.courierAccountId} disabled={busy} onChange={(e) => setCard({ ...card, courierAccountId: e.target.value })}>
                  {p.view.couriers.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-cz`}>
                  {c('cards.zone')}
                </label>
                {p.view.bands.length ? (
                  <select id={`${id}-cz`} className="a2-sel" value={card.zoneKey} disabled={busy} onChange={(e) => setCard({ ...card, zoneKey: e.target.value })}>
                    {p.view.bands.map((b) => (
                      <option key={b.key} value={b.key}>
                        {band(b.key)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input id={`${id}-cz`} className="a2-inp" value={card.zoneKey} disabled={busy} onChange={(e) => setCard({ ...card, zoneKey: e.target.value })} />
                )}
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-cf`}>
                  {c('cards.from')}
                </label>
                <input id={`${id}-cf`} className="a2-inp" inputMode="numeric" value={card.from} disabled={busy} onChange={(e) => setCard({ ...card, from: e.target.value })} />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-ct`}>
                  {c('cards.to')}
                </label>
                <input id={`${id}-ct`} className="a2-inp" inputMode="numeric" value={card.to} disabled={busy} onChange={(e) => setCard({ ...card, to: e.target.value })} />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-cc`}>
                  {c('cards.charge')} ({p.money.currency})
                </label>
                <input id={`${id}-cc`} className="a2-inp" inputMode="decimal" value={card.charge} disabled={busy} onChange={(e) => setCard({ ...card, charge: e.target.value })} data-testid="fe-card-charge" />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-cd`}>
                  {c('cards.cod')}
                </label>
                <input id={`${id}-cd`} className="a2-inp" inputMode="decimal" value={card.cod} disabled={busy} onChange={(e) => setCard({ ...card, cod: e.target.value })} />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-cr`}>
                  {c('cards.ret')} ({p.money.currency})
                </label>
                <input id={`${id}-cr`} className="a2-inp" inputMode="decimal" value={card.ret} disabled={busy} onChange={(e) => setCard({ ...card, ret: e.target.value })} />
              </div>
            </div>
            <div className="ct-actions">
              <button type="button" className="a2-btn" disabled={busy} onClick={addCard} data-testid="fe-card-add">
                {c('cards.add')}
              </button>
            </div>
          </div>
        ) : null}
        {say('cards')}
      </section>
      {off ? <p className="a2-xs a2-mute a2-mt12">{c('readOnly')}</p> : null}
    </>
  );
}
