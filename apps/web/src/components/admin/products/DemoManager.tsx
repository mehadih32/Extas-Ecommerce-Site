'use client';
// S28 · PR 684 — Products › Demo products: sample products that fill every category so the shop never looks empty while
// real products arrive. The master switch, a switch for every category (a category's branch goes with it), "hide by
// itself" once a category has enough real products, the sample price, the "coming soon" pop-up words, and the list of
// demo products (turn one into a draft to finish). One Save writes the whole setting `catalogue.demo`; saving shows or
// hides the demo products at once. Nothing is deleted. Changing needs `catalogue.write` (the API checks again).
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { call } from '../api';
import { t, type Dict } from '@/lib/i18n';
import { refusalText } from './model';
import { say, sayBad } from './useToast';
import './photo-manager.css';

export interface DemoSetting {
  on: boolean;
  off: string[];
  auto: boolean;
  autoN: number;
  samplePriceMinor: number;
  popupEn: string;
  popupBn: string;
}
export interface DemoCat {
  id: string;
  parentId: string | null;
  name: string;
  demo: number;
  real: number;
  showing: boolean;
}
export interface DemoItem {
  id: string;
  name: string;
  category: string;
  showing: boolean;
}
export interface DemoManagerProps {
  dict: Dict;
  setting: DemoSetting;
  version: string;
  cats: DemoCat[];
  items: DemoItem[];
  canWrite: boolean;
  demoTotal: number;
  showingTotal: number;
  emptyCategories: number;
  /** The shop's price in major units per 100 minor (paisa). */
  minorPerMajor: number;
}

export function DemoManager(p: DemoManagerProps) {
  const d = p.dict;
  const router = useRouter();
  const [s, setS] = useState<DemoSetting>(p.setting);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(p.setting);
  const kids = useMemo(() => {
    const m = new Map<string | null, DemoCat[]>();
    for (const c of p.cats) m.set(c.parentId, [...(m.get(c.parentId) ?? []), c]);
    return m;
  }, [p.cats]);

  const run = async (ok: string, req: ReturnType<typeof call>) => {
    setBusy(true);
    try {
      const a = await req;
      if (a.status < 200 || a.status > 299) return sayBad(a.data.error === 'STALE' ? t(d, 'products.demo.stale') : refusalText(d, a.data.error, a.data.details));
      say(ok);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(t(d, 'products.demo.saved'), call('PUT', '/api/admin/products-v5-settings', { key: 'catalogue.demo', version: p.version, value: s }));
  const toggle = (id: string, on: boolean) => setS({ ...s, off: on ? s.off.filter((x) => x !== id) : [...new Set([...s.off, id])] });

  const node = (c: DemoCat, depth: number): React.ReactNode => (
    <li key={c.id} className="dm-node" style={{ paddingInlineStart: depth * 16 }} data-testid="demo-cat">
      <label className="dm-row">
        <input
          type="checkbox"
          checked={!s.off.includes(c.id)}
          disabled={!p.canWrite}
          onChange={(e) => toggle(c.id, e.target.checked)}
          aria-label={`${t(d, 'products.demo.showHere')}: ${c.name}`}
        />
        <span className="dm-name">{c.name}</span>
        <span className="a2-xs a2-mute">{t(d, 'products.demo.counts', { demo: String(c.demo), real: String(c.real) })}</span>
        {c.demo > 0 ? <span className={`a2-pill ${c.showing ? 'ok' : 'line'}`}>{t(d, c.showing ? 'products.demo.showingNow' : 'products.demo.hiddenNow')}</span> : null}
      </label>
      {(kids.get(c.id) ?? []).length ? <ul className="dm-kids">{(kids.get(c.id) ?? []).map((k) => node(k, depth + 1))}</ul> : null}
    </li>
  );

  return (
    <div data-testid="demo-manager">
      <section className="a2-card dm-hero">
        <label className="dm-row">
          <input type="checkbox" checked={s.on} disabled={!p.canWrite} onChange={(e) => setS({ ...s, on: e.target.checked })} data-testid="demo-master" />
          <span className="dm-name">{t(d, 'products.demo.master')}</span>
        </label>
        <p className="a2-sm" data-testid="demo-summary">
          {p.setting.on ? t(d, 'products.demo.summaryOn', { n: String(p.showingTotal) }) : t(d, 'products.demo.summaryOff')} ·{' '}
          {t(d, 'products.demo.madeTotal', { all: String(p.demoTotal), empty: String(p.emptyCategories) })}
        </p>
        {p.canWrite ? (
          <button
            type="button"
            className="a2-btn"
            disabled={busy}
            onClick={() => run(t(d, 'products.demo.seeded'), call('POST', '/api/admin/demo-products', { action: 'seed' }))}
            data-testid="demo-seed"
          >
            {t(d, 'products.demo.seed')}
          </button>
        ) : null}
      </section>
      <div className="fq-groups a2-mt12">
        <section className="a2-card">
          <h2 className="a2-h">{t(d, 'products.demo.where')}</h2>
          <p className="a2-xs a2-mute">{t(d, 'products.demo.whereSub')}</p>
          <ul className="dm-tree">{(kids.get(null) ?? []).map((c) => node(c, 0))}</ul>
        </section>
        <div className="a2-stack">
          <section className="a2-card">
            <h2 className="a2-h">{t(d, 'products.demo.auto')}</h2>
            <label className="dm-row">
              <input type="checkbox" checked={s.auto} disabled={!p.canWrite} onChange={(e) => setS({ ...s, auto: e.target.checked })} />
              <span>{t(d, 'products.demo.autoLabel')}</span>
            </label>
            <div className="lm-fl">
              <label htmlFor="dm-n">{t(d, 'products.demo.autoN')}</label>
              <input
                id="dm-n"
                className="lm-inp"
                type="number"
                min={1}
                max={500}
                value={s.autoN}
                disabled={!p.canWrite}
                onChange={(e) => setS({ ...s, autoN: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
              />
            </div>
            <div className="lm-fl">
              <label htmlFor="dm-price">{t(d, 'products.demo.price')}</label>
              <input
                id="dm-price"
                className="lm-inp"
                type="number"
                min={1}
                value={Math.round(s.samplePriceMinor / p.minorPerMajor)}
                disabled={!p.canWrite}
                onChange={(e) => setS({ ...s, samplePriceMinor: Math.max(100, Math.round((Number(e.target.value) || 1) * p.minorPerMajor)) })}
              />
            </div>
          </section>
          <section className="a2-card">
            <h2 className="a2-h">{t(d, 'products.demo.popup')}</h2>
            <p className="a2-xs a2-mute">{t(d, 'products.demo.popupSub')}</p>
            <div className="lm-fl">
              <label htmlFor="dm-pen">{t(d, 'products.demo.popupEn')}</label>
              <textarea
                id="dm-pen"
                className="lm-inp"
                rows={2}
                maxLength={300}
                value={s.popupEn}
                disabled={!p.canWrite}
                onChange={(e) => setS({ ...s, popupEn: e.target.value })}
              />
            </div>
            <div className="lm-fl">
              <label htmlFor="dm-pbn">{t(d, 'products.demo.popupBn')}</label>
              <textarea
                id="dm-pbn"
                className="lm-inp"
                rows={2}
                maxLength={300}
                value={s.popupBn}
                disabled={!p.canWrite}
                onChange={(e) => setS({ ...s, popupBn: e.target.value })}
              />
            </div>
          </section>
          <section className="a2-card">
            <h2 className="a2-h">{t(d, 'products.demo.never')}</h2>
            <ul className="a2-sm dm-never">
              {['google', 'feeds', 'ads', 'stock', 'reports', 'finance', 'erp'].map((k) => (
                <li key={k}>{t(d, `products.demo.never_${k}`)}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      {p.canWrite ? (
        <div className="fq-acts a2-mt12">
          <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="demo-save">
            {t(d, 'products.demo.save')}
          </button>
          {dirty ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setS(p.setting)}>
              {t(d, 'products.demo.discard')}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="a2-xs a2-mute a2-mt12">{t(d, 'products.demo.readOnly')}</p>
      )}
      <section className="a2-card a2-mt12" data-testid="demo-items">
        <h2 className="a2-h">{t(d, 'products.demo.items')}</h2>
        {p.items.length ? (
          p.items.map((i) => (
            <div key={i.id} className="fq-li" data-testid="demo-item">
              <div className="fq-q">
                {i.name}
                <span className={`a2-pill ${i.showing ? 'ok' : 'line'}`}>{t(d, i.showing ? 'products.demo.showingNow' : 'products.demo.hiddenNow')}</span>
              </div>
              <div className="a2-xs a2-mute">{i.category}</div>
              {p.canWrite ? (
                <div className="fq-acts">
                  <a className="a2-btn" href={`/admin/products/${i.id}`}>
                    {t(d, 'products.demo.open')}
                  </a>
                  <button
                    type="button"
                    className="a2-btn"
                    disabled={busy}
                    onClick={() =>
                      window.confirm(t(d, 'products.demo.confirmDraft')) &&
                      run(t(d, 'products.demo.drafted'), call('POST', '/api/admin/demo-products', { action: 'toDraft', productId: i.id }))
                    }
                  >
                    {t(d, 'products.demo.toDraft')}
                  </button>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="a2-sm a2-mute">{t(d, 'products.demo.itemsNone')}</p>
        )}
      </section>
    </div>
  );
}
