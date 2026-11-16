'use client';
// S28 · PR 1035 — wizard step 6, "Description & size chart" (prototype v5): the product text and key points, the fit and how the sizes run,
// the model's height, weight and size, the size chart (from the ERP, one saved chart, or a new one), the size finder's height and weight
// ranges, and the questions shoppers ask. Every change saves by itself.
import { useState } from 'react';
import Link from 'next/link';
import { finderRows, WIZARD_FITS, WIZARD_RUNS, type WizardFit, type WizardRun } from '@extas/catalogue/wizard-model';
import { t } from '@/lib/i18n';
import { call } from '../../api';
import { ErpChartPanel } from '../ErpChartPanel';
import { say } from '../useToast';
import { Callout, Fld, Seg, Tag, useDebounced } from '../wizard-ui';
import { addFaq, patchProduct, postSpec, removeFaq } from './api';
import type { Ctx } from './ctx';

type Mode = 'ERP' | 'PICK' | 'NEW';

export function StepText({ c }: { c: Ctx }) {
  const { d, data } = c;
  const id = data.productId;
  const sp = data.spec;
  const [desc, setDesc] = useState(data.descriptionEn ?? '');
  const [points, setPoints] = useState(sp.keyPoints ?? '');
  const [fit, setFit] = useState<WizardFit | ''>(sp.fit ?? '');
  const [run, setRun] = useState<WizardRun | ''>(sp.sizesRun ?? '');
  const [mh, setMh] = useState(sp.modelHeight ?? '');
  const [mw, setMw] = useState(sp.modelWeightKg === null ? '' : String(sp.modelWeightKg));
  const [mwears, setMwears] = useState(sp.modelWears ?? '');
  const [mode, setMode] = useState<Mode>(data.chart.assignedId ? 'PICK' : data.chart.erp.state === 'applied' || data.chart.erp.state === 'available' ? 'ERP' : 'PICK');
  const [chartId, setChartId] = useState(data.chart.assignedId ?? '');
  const [finder, setFinder] = useState(sp.finder);
  const [fq, setFq] = useState('');
  const [fa, setFa] = useState('');
  const [faqs, setFaqs] = useState(data.faqs);

  const ok = async (p: Promise<{ status: number; data: Record<string, unknown> }>, after?: (r: Record<string, unknown>) => void) => {
    const a = await p;
    if (a.status === 200 || a.status === 201) {
      c.saved();
      after?.(a.data);
    } else c.refuse(a as never);
  };
  useDebounced(desc, 700, (v) => void ok(patchProduct(id, { descriptionEn: v })));
  useDebounced(points, 700, (v) => void ok(postSpec(id, { keyPoints: v || null })));
  useDebounced(mh, 700, (v) => void ok(postSpec(id, { modelHeight: v || null })));
  useDebounced(mw, 700, (v) => {
    const n = Number(v);
    if (v === '' || (Number.isFinite(n) && n > 0)) void ok(postSpec(id, { modelWeightKg: v === '' ? null : Math.round(n) }));
  });
  useDebounced(mwears, 700, (v) => void ok(postSpec(id, { modelWears: v || null })));
  useDebounced(finder, 900, (v) => void ok(postSpec(id, { finder: v })));
  const sizes = data.sizes.map((s) => s.label);
  const hasFinder = finder.length > 0;
  const setCell = (i: number, k: 'h1' | 'h2' | 'w1' | 'w2', v: string) => setFinder(finder.map((r, j) => (j === i ? { ...r, [k]: k[0] === 'w' ? Number(v) || 0 : v } : r)));
  c.setLive({ description: desc, keyPoints: points, modelHeight: mh, modelWeightKg: mw, modelWears: mwears });

  const pick = async (cid: string) => {
    setChartId(cid);
    if (!cid) return void ok(call('POST', '/api/admin/catalogue/size-charts/unassign', { productId: id }));
    await ok(call('POST', '/api/admin/catalogue/size-charts/assign', { sizeChartId: cid, productId: id }), () => c.refresh());
  };
  const chartsForGarment = c.lists.charts.filter((x) => !data.garmentKey || x.garmentKey === data.garmentKey);

  return (
    <>
      <Fld dict={d} label={t(d, 'products.wiz.txt.desc')} tag="a" htmlFor="wz-desc" hint={t(d, 'products.wiz.txt.descHint')}>
        <textarea id="wz-desc" className="ad-input" rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!c.can.write} maxLength={5000} />
      </Fld>
      <Fld dict={d} label={t(d, 'products.wiz.txt.points')} tag="a" htmlFor="wz-points" hint={t(d, 'products.wiz.txt.pointsHint')}>
        <textarea id="wz-points" className="ad-input" rows={3} value={points} onChange={(e) => setPoints(e.target.value)} disabled={!c.can.write} maxLength={1000} />
      </Fld>
      <div className="wzp-grid2">
        <Fld dict={d} label={t(d, 'products.wiz.txt.fit')} tag="y">
          <Seg label={t(d, 'products.wiz.txt.fit')} value={fit || 'REGULAR'} options={WIZARD_FITS.map((k) => [k, t(d, `products.wiz.txt.fit_${k}`)] as [WizardFit, string])} onChange={(v) => { setFit(v); void ok(postSpec(id, { fit: v })); }} disabled={!c.can.write} />
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.txt.run')} tag="y">
          <Seg label={t(d, 'products.wiz.txt.run')} value={run || 'TRUE'} options={WIZARD_RUNS.map((k) => [k, t(d, `products.wiz.txt.run_${k}`)] as [WizardRun, string])} onChange={(v) => { setRun(v); void ok(postSpec(id, { sizesRun: v })); }} disabled={!c.can.write} />
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.txt.mHeight')} tag="y" htmlFor="wz-mh">
          <input id="wz-mh" className="ad-input" value={mh} onChange={(e) => setMh(e.target.value)} placeholder={t(d, 'products.wiz.txt.mHeightPh')} disabled={!c.can.write} maxLength={20} />
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.txt.mWeight')} tag="y" htmlFor="wz-mw">
          <input id="wz-mw" className="ad-input" inputMode="decimal" value={mw} onChange={(e) => setMw(e.target.value)} disabled={!c.can.write} />
        </Fld>
        <Fld dict={d} label={t(d, 'products.wiz.txt.mWears')} tag="y" htmlFor="wz-mwears">
          <select id="wz-mwears" className="ad-input" value={mwears} onChange={(e) => setMwears(e.target.value)} disabled={!c.can.write}>
            <option value="">—</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Fld>
      </div>

      <div className="wzp-box" data-testid="wiz-chart">
        <div className="ad-mini" style={{ marginBottom: 8 }}>
          <b>{t(d, 'products.wiz.txt.chart')}</b> <Tag dict={d} kind="y" />
        </div>
        <Seg
          label={t(d, 'products.wiz.txt.chart')}
          value={mode}
          options={[
            ['ERP', t(d, 'products.wiz.txt.chartErp')],
            ['PICK', t(d, 'products.wiz.txt.chartPick')],
            ['NEW', t(d, 'products.wiz.txt.chartNew')],
          ]}
          onChange={setMode}
        />
        <div style={{ marginTop: 10 }}>
          {mode === 'ERP' ? <ErpChartPanel dict={d} productId={id} canWrite={c.can.write} settingsHref={c.settingsHref} chart={data.chart.erp} /> : null}
          {mode === 'PICK' ? (
            <Fld dict={d} label={t(d, 'products.wiz.txt.chartSaved')} htmlFor="wz-chart">
              <select id="wz-chart" className="ad-input" value={chartId} onChange={(e) => void pick(e.target.value)} disabled={!c.can.write}>
                <option value="">{t(d, 'products.wiz.txt.chartAuto')}</option>
                {chartsForGarment.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {x.sizes.join(' ')}
                  </option>
                ))}
              </select>
            </Fld>
          ) : null}
          {mode === 'NEW' ? (
            <div className="ad-mini">
              {t(d, 'products.wiz.txt.chartNewNote')}{' '}
              <Link className="ad-btn ad-btn-ghost" href="/admin/size-charts" target="_blank">
                {t(d, 'products.wiz.txt.chartOpen')}
              </Link>
            </div>
          ) : null}
          {data.chart.assignedName ? <div className="ad-mini" style={{ marginTop: 6 }}>{t(d, 'products.wiz.txt.chartUsing', { name: data.chart.assignedName })}</div> : null}
        </div>
      </div>

      <div className="wzp-box" data-testid="wiz-finder">
        <div className="ad-mini" style={{ marginBottom: 6 }}>
          <b>{t(d, 'products.wiz.txt.finder')}</b> <Tag dict={d} kind="y" />
        </div>
        <div className="ad-mini" style={{ marginBottom: 8 }}>{t(d, 'products.wiz.txt.finderNote')}</div>
        {!hasFinder ? (
          <button type="button" className="ad-btn ad-btn-ghost" disabled={!c.can.write || !sizes.length} onClick={() => setFinder(finderRows(sizes, finder))}>
            {t(d, 'products.wiz.txt.finderStart')}
          </button>
        ) : (
          <div className="wzp-tw">
            <table className="wzp-tbl">
              <thead>
                <tr>
                  <th>{t(d, 'products.wiz.txt.fSize')}</th>
                  <th>{t(d, 'products.wiz.txt.fH1')}</th>
                  <th>{t(d, 'products.wiz.txt.fH2')}</th>
                  <th>{t(d, 'products.wiz.txt.fW1')}</th>
                  <th>{t(d, 'products.wiz.txt.fW2')}</th>
                </tr>
              </thead>
              <tbody>
                {finder.map((r, i) => (
                  <tr key={r.size}>
                    <td><b>{r.size}</b></td>
                    {(['h1', 'h2', 'w1', 'w2'] as const).map((k) => (
                      <td key={k}>
                        <input className="ad-input" aria-label={`${r.size} ${t(d, `products.wiz.txt.f${k.toUpperCase()}`)}`} value={String(r[k] ?? '')} onChange={(e) => setCell(i, k, e.target.value)} disabled={!c.can.write} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="wzp-box" data-testid="wiz-faq">
        <div className="ad-mini" style={{ marginBottom: 6 }}>
          <b>{t(d, 'products.wiz.txt.faq')}</b> <Tag dict={d} kind="y" />
        </div>
        {data.categoryFaqs ? <div className="ad-mini" style={{ marginBottom: 6 }}>{t(d, 'products.wiz.txt.faqCat', { n: data.categoryFaqs })}</div> : null}
        {faqs.map((f) => (
          <div key={f.id} className="wzp-faq">
            <div>
              <b>{f.q}</b>
              <div className="ad-mini">{f.a}</div>
            </div>
            <button
              type="button"
              className="ad-btn ad-btn-ghost"
              disabled={!c.can.write}
              onClick={() =>
                void ok(removeFaq(f.id), () => {
                  setFaqs(faqs.filter((x) => x.id !== f.id));
                })
              }
            >
              {t(d, 'products.wiz.txt.faqRemove')}
            </button>
          </div>
        ))}
        {!faqs.length ? <div className="ad-mini">{t(d, 'products.wiz.txt.faqNone')}</div> : null}
        <div className="wzp-grid2" style={{ marginTop: 8 }}>
          <input className="ad-input" aria-label={t(d, 'products.wiz.txt.faqQ')} placeholder={t(d, 'products.wiz.txt.faqQ')} value={fq} onChange={(e) => setFq(e.target.value)} disabled={!c.can.write} maxLength={300} />
          <input className="ad-input" aria-label={t(d, 'products.wiz.txt.faqA')} placeholder={t(d, 'products.wiz.txt.faqA')} value={fa} onChange={(e) => setFa(e.target.value)} disabled={!c.can.write} maxLength={1000} />
        </div>
        <button
          type="button"
          className="ad-btn ad-btn-ghost"
          style={{ marginTop: 8 }}
          disabled={!c.can.write || !fq.trim() || !fa.trim()}
          onClick={() =>
            void ok(addFaq(id, fq.trim(), fa.trim()), (r) => {
              const row = (r.faq ?? r.created) as { id: string } | undefined;
              setFaqs([...faqs, { id: row?.id ?? `${Date.now()}`, q: fq.trim(), a: fa.trim() }]);
              setFq('');
              setFa('');
              say(t(d, 'products.wiz.txt.faqAdded'));
            })
          }
        >
          {t(d, 'products.wiz.txt.faqAdd')}
        </button>
      </div>
      {desc.trim().length < 40 ? <Callout kind="warn">{t(d, 'products.wiz.txt.shortDesc')}</Callout> : null}
    </>
  );
}
