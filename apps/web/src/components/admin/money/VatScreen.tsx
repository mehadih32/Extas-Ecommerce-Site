'use client';
// S16 · PR 350 — the cards of Money → VAT (/admin/money/vat): the VAT system's switch (and VAT on the delivery charge),
// then the owner's rates in one card — the default rate, a rate per category (in tree order; empty takes the parent's or
// the default, and each row says which rate its products get now) and a rate per product (find a product by name, style
// code or SKU, see the rate it gets now and why, give it its own rate, remove one). Saving asks once more ("Save" →
// "Yes, save") and sends the version it was read at. Without `vat.manage` it is read-only. Prices are VAT inclusive, so
// nothing here changes a price, a delivery charge or COD.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { VatFound, VatView } from '@/lib/vat-api';
import { bpsToPercent, percentToBps } from '@/lib/vat-percent';
import type { VatRate } from '@extas/metrics';
import { call } from '../api';

export interface VatScreenProps {
  dict: Dict;
  lang: 'en' | 'bn';
  view: VatView;
  canEdit: boolean;
  /** "Example: a ৳1,000 price holds ৳130.43 VAT at 15 %", from the saved default rate (null without one). */
  example: { price: string; vat: string; pct: string } | null;
}

type ProductRow = { productId: string; name: string; text: string; without: VatRate | null };

export function VatScreen(p: VatScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `moneyVat.${k}`, vars);
  const errText = (code: string | undefined) => {
    const k = `moneyVat.err.${code ?? 'other'}`;
    const v = t(p.dict, k);
    return v === k ? c('err.other') : v;
  };
  const nameOf = (x: { nameEn: string; nameBn: string | null }) => (p.lang === 'bn' && x.nameBn ? x.nameBn : x.nameEn);
  const catName = (catId: string | null) => (catId && p.view.categoryNames[catId] ? nameOf(p.view.categoryNames[catId]) : '');
  const applies = (r: VatRate) => (r.bps === null ? c('rates.applies.none') : c(`rates.applies.${r.source}`, { pct: bpsToPercent(r.bps), name: catName(r.fromCategoryId) }));
  const off = !p.canEdit;
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ where: string; text: string; bad: boolean } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const tell = (where: string, text: string, bad: boolean) => setSaid({ where, text, bad });

  const [sys, setSys] = useState(p.view.system.value);
  const saved = p.view.rates.value;
  const [def, setDef] = useState(saved?.defaultBps === null || saved?.defaultBps === undefined ? '' : bpsToPercent(saved.defaultBps));
  const [cats, setCats] = useState<Record<string, string>>(Object.fromEntries(p.view.categories.map((k) => [k.id, k.bps === null ? '' : bpsToPercent(k.bps)])));
  const [prods, setProds] = useState<ProductRow[]>(p.view.products.map((r) => ({ productId: r.productId, name: nameOf(r), text: bpsToPercent(r.bps), without: r.without })));
  const [q, setQ] = useState('');
  const [found, setFound] = useState<VatFound[] | null>(null);

  async function put(where: 'system' | 'rates', value: unknown, version: number) {
    if (confirm !== where) return setConfirm(where);
    setConfirm(null);
    setBusy(true);
    const a = await call('PUT', `/api/admin/money/vat/${where}`, { value, version });
    setBusy(false);
    if (a.status === 200) {
      tell(where, c('saved'), false);
      return router.refresh();
    }
    tell(where, errText(a.status === 0 ? 'network' : a.data.error), true);
  }
  function saveRates() {
    const bad = () => tell('rates', c('rates.bad'), true);
    const defaultBps = def.trim() ? percentToBps(def) : null;
    if (def.trim() && defaultBps === null) return bad();
    const categories = [];
    for (const k of p.view.categories) {
      const text = (cats[k.id] ?? '').trim();
      if (!text) continue;
      const bps = percentToBps(text);
      if (bps === null) return bad();
      categories.push({ categoryId: k.id, bps });
    }
    const products = [];
    for (const r of prods) {
      const bps = percentToBps(r.text.trim());
      if (bps === null) return bad();
      products.push({ productId: r.productId, bps });
    }
    const value = defaultBps === null && !categories.length && !products.length ? null : { defaultBps, categories, products };
    return put('rates', value, p.view.rates.version);
  }
  async function find() {
    setBusy(true);
    const a = await call('GET', `/api/admin/money/vat/find?q=${encodeURIComponent(q.trim())}`);
    setBusy(false);
    if (a.status === 200) return setFound((a.data.products as VatFound[] | undefined) ?? []);
    tell('find', errText(a.status === 0 ? 'network' : a.data.error), true);
  }
  function addProduct(f: VatFound) {
    if (!prods.some((r) => r.productId === f.productId)) setProds([...prods, { productId: f.productId, name: nameOf(f), text: f.rate.bps === null ? '' : bpsToPercent(f.rate.bps), without: f.rate.source === 'product' ? null : f.rate }]);
    tell('find', c('rates.added'), false);
  }
  const say = (where: string) =>
    said?.where === where ? (
      <p className={`a2-sm a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid={`vat-said-${where}`}>
        {said.text}
      </p>
    ) : null;
  const saveBtn = (where: string, label: string, onClick: () => void, testId: string) => (
    <button type="button" className={`a2-btn ${confirm === where ? 'pri' : ''}`} disabled={off || busy} onClick={onClick} data-testid={testId}>
      {confirm === where ? c('confirm') : label}
    </button>
  );
  const sw = (on: boolean, label: string, onChange: (v: boolean) => void, testId: string) => (
    <div className="a2-swl">
      <span id={`${id}-${testId}`}>{label}</span>
      <button type="button" className={`a2-sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-labelledby={`${id}-${testId}`} disabled={off || busy} onClick={() => onChange(!on)} data-testid={testId} />
    </div>
  );

  return (
    <>
      <section className="a2-card a2-mt12" aria-labelledby={`${id}-s`} data-testid="vat-system">
        <h2 className="a2-h3" id={`${id}-s`}>
          {c('system.title')}
        </h2>
        <p className="a2-cs">{c('system.sub')}</p>
        <p className={`a2-sm a2-mt12 ${p.view.system.value.enabled ? '' : 'a2-mute'}`} data-testid="vat-state">
          <b>{p.view.system.value.enabled ? c('system.on') : c('system.off')}</b>
        </p>
        <div className="a2-mt12">
          {sw(sys.enabled, c('system.enabled'), (v) => setSys({ ...sys, enabled: v }), 'vat-enabled')}
          {sw(sys.onDelivery, c('system.onDelivery'), (v) => setSys({ ...sys, onDelivery: v }), 'vat-on-delivery')}
          <p className="a2-xs a2-mute">{c('system.onDeliveryHint')}</p>
        </div>
        <p className="a2-xs a2-mute a2-mt12">{c('system.inclusive')}</p>
        {p.canEdit ? <div className="ct-actions a2-mt12">{saveBtn('system', c('save'), () => put('system', sys, p.view.system.version), 'vat-system-save')}</div> : null}
        {say('system')}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby={`${id}-r`} data-testid="vat-rates">
        <h2 className="a2-h3" id={`${id}-r`}>
          {c('rates.title')}
        </h2>
        <p className="a2-cs">{c('rates.sub')}</p>
        <div className="ct-grid a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-def`}>
              {c('rates.default')}
            </label>
            <input id={`${id}-def`} className="a2-inp" inputMode="decimal" value={def} disabled={off || busy} onChange={(e) => setDef(e.target.value)} data-testid="vat-default" />
            <p className="a2-xs a2-mute">{c('rates.defaultHint')}</p>
            {p.example ? (
              <p className="a2-xs a2-mute" data-testid="vat-example">
                {c('rates.example', p.example)}
              </p>
            ) : null}
          </div>
        </div>

        <h3 className="a2-h3 a2-mt12">{c('rates.categories')}</h3>
        {!p.view.categories.length ? <p className="a2-xs a2-mute">{c('rates.noCategories')}</p> : null}
        {p.view.categories.map((k) => (
          <div key={k.id} className="a2-rule" data-testid="vat-cat-row">
            <span style={{ paddingInlineStart: `${Math.min(k.depth, 6) * 16}px` }}>
              <label htmlFor={`${id}-c-${k.id}`}>
                <b>{nameOf(k)}</b>
                {k.archived ? <span className="a2-xs a2-mute"> · {c('rates.archived')}</span> : null}
              </label>
              <span className="a2-xs a2-mute cl-sub" data-testid="vat-cat-applies">
                {applies(k.applies)}
              </span>
            </span>
            <input id={`${id}-c-${k.id}`} className="a2-inp vat-pct" inputMode="decimal" aria-label={`${nameOf(k)} ${c('rates.catField')}`} value={cats[k.id] ?? ''} disabled={off || busy} onChange={(e) => setCats({ ...cats, [k.id]: e.target.value })} data-testid="vat-cat-input" />
          </div>
        ))}

        <h3 className="a2-h3 a2-mt12">{c('rates.products')}</h3>
        {!prods.length ? <p className="a2-xs a2-mute">{c('rates.noProducts')}</p> : null}
        {prods.map((r, i) => (
          <div key={r.productId} className="a2-rule" data-testid="vat-prod-row">
            <span>
              <label htmlFor={`${id}-p-${r.productId}`}>
                <b>{r.name}</b>
              </label>
              {r.without ? <span className="a2-xs a2-mute cl-sub">{c('rates.without', { text: applies(r.without) })}</span> : null}
            </span>
            <span className="ct-actions vat-act">
              <input id={`${id}-p-${r.productId}`} className="a2-inp vat-pct" inputMode="decimal" value={r.text} disabled={off || busy} onChange={(e) => setProds(prods.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} data-testid="vat-prod-input" />
              {p.canEdit ? (
                <button
                  type="button"
                  className={`a2-btn ${confirm === `rm-${r.productId}` ? 'pri' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    if (confirm !== `rm-${r.productId}`) return setConfirm(`rm-${r.productId}`);
                    setConfirm(null);
                    setProds(prods.filter((x) => x.productId !== r.productId));
                  }}
                  data-testid="vat-prod-remove"
                >
                  {confirm === `rm-${r.productId}` ? c('rates.removeSure') : c('rates.remove')}
                </button>
              ) : null}
            </span>
          </div>
        ))}

        <div className="ct-form a2-mt12" data-testid="vat-find">
          <div className="ct-grid">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-q`}>
                {c('rates.find')}
              </label>
              <input
                id={`${id}-q`}
                className="a2-inp"
                placeholder={c('rates.findHint')}
                value={q}
                disabled={busy}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && q.trim().length >= 2) void find();
                }}
                data-testid="vat-find-q"
              />
            </div>
            <div className="ct-actions">
              <button type="button" className="a2-btn" disabled={busy || q.trim().length < 2} onClick={() => void find()} data-testid="vat-find-btn">
                {c('rates.findBtn')}
              </button>
            </div>
          </div>
          {found && !found.length ? <p className="a2-xs a2-mute">{c('rates.noneFound')}</p> : null}
          {found?.map((f) => (
            <div key={f.productId} className="a2-rule" data-testid="vat-found-row">
              <span>
                <b>{nameOf(f)}</b>
                <span className="a2-xs a2-mute cl-sub">{applies(f.rate)}</span>
              </span>
              {p.canEdit && !prods.some((r) => r.productId === f.productId) ? (
                <button type="button" className="a2-btn" disabled={busy} onClick={() => addProduct(f)} data-testid="vat-found-add">
                  {c('rates.add')}
                </button>
              ) : null}
            </div>
          ))}
          {say('find')}
        </div>

        {p.canEdit ? <div className="ct-actions a2-mt12">{saveBtn('rates', c('rates.save'), saveRates, 'vat-rates-save')}</div> : null}
        {say('rates')}
      </section>
      {off ? <p className="a2-xs a2-mute a2-mt12">{c('readOnly')}</p> : null}
    </>
  );
}
