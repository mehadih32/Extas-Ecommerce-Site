'use client';
// PR 27, 28 — the size chart screen (demo 82-admin-sizecharts.js, #/admin/size-charts): the three how-it-works steps,
// the chart list, the editor (name, type, measurement table in inches with cm worked out, paste from Excel, the Find my
// size ease, the how-to-measure drawing, the coverage check with "Add row", Save / Unsaved / Discard, Copy), where the
// chart is the default and which products use it, and "When you add a product". Every rule is the server's: this
// screen only shows what the API answers. The demo's "Read from spec sheet photo (AI)" waits for the AI stage.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { SizeChartDetail, SizeChartResolution, SizeChartSettings, SizeChartView } from '@extas/catalogue';
import { bothUnits, CHART_RUNS, parsePasted, sizeForBody, sortSizes, suggestRow, suggestSizeByWeight, type ChartRun } from '@extas/catalogue/size-chart-math';
import { t, type Dict } from '@/lib/i18n';
import { call, errorText, type Answer } from './api';
import { Icon } from './Icon';
import { showToast } from './lumen/Toast';

export interface SizeChartCategory {
  id: string;
  name: string;
  garmentTypeId: string | null;
}
export interface SizeChartGarmentType {
  id: string;
  name: string;
  fields: { key: string; label: string }[];
}

interface Props {
  dict: Dict;
  lang: 'bn' | 'en';
  charts: SizeChartView[];
  detail: SizeChartDetail | null;
  options: SizeChartSettings;
  categories: SizeChartCategory[];
  garmentTypes: SizeChartGarmentType[];
  /** The shop's sizes in its own order. */
  sizes: { key: string; label: string }[];
  canWrite: boolean;
}

interface Draft {
  name: string;
  rows: { size: string; values: string[] }[];
  easeInch: string;
  diagram: string | null;
  /** PR 972: the size finder's table (a line per size of the chart, typed as text), how the sizes run and the fit. */
  finder: { size: string; h1: string; h2: string; w1: string; w2: string }[];
  run: ChartRun;
  fitKey: string;
}

type Modal = { kind: 'paste' } | { kind: 'copy'; fromId: string } | { kind: 'new' } | { kind: 'change' } | null;

const API = '/api/admin/catalogue/size-charts';
const DESKTOP = '(min-width: 1024px)';

const draftOf = (c: SizeChartDetail): Draft => ({
  name: c.name,
  rows: c.rows.map((r) => ({ size: r.size, values: r.values.map(String) })),
  easeInch: String(c.easeInch),
  diagram: c.diagram?.key ?? null,
  finder: c.rows.map((r) => {
    const f = c.finder.find((x) => x.size === r.size);
    return { size: r.size, h1: f?.h1 ?? '', h2: f?.h2 ?? '', w1: f ? String(f.w1) : '', w2: f ? String(f.w2) : '' };
  }),
  run: c.run,
  fitKey: c.fitKey ?? '',
});
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

export function SizeCharts({ dict, lang, charts: initialCharts, detail, options, categories, garmentTypes, sizes, canWrite }: Props) {
  const tt = useCallback((key: string, vars?: Record<string, string | number>) => t(dict, `sizeCharts.${key}`, vars), [dict]);
  const loc = <T extends { en: string; bn: string }>(e: T | null | undefined) => (e ? e[lang] : '');
  const order = useMemo(() => sizes.map((s) => s.key), [sizes]);
  const sizeLabel = useCallback((k: string) => sizes.find((s) => s.key === k)?.label ?? k, [sizes]);
  const sep = tt('sep');

  const [charts, setCharts] = useState(initialCharts);
  const [details, setDetails] = useState<Record<string, SizeChartDetail>>(detail ? { [detail.id]: detail } : {});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sel, setSel] = useState<string | null>(detail?.id ?? initialCharts[0]?.id ?? null);
  const [cm, setCm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  // PR 806 (prototype v5): the page opens on the category cards; Edit opens one chart, with a way back
  const [view, setView] = useState<'list' | 'edit'>('list');
  const editorRef = useRef<HTMLDivElement>(null);

  // PR 635 (CN-036): the size chart screen speaks through the admin's one toast (showToast, read out by screen readers).
  const say = useCallback((text: string) => showToast({ text }), []);
  const sayError = (a: Answer) => {
    const code = a.data.error ?? '';
    const own = t(dict, `sizeCharts.errors.${code}`, {
      fields: (a.data.details ?? []).join(', '),
    });
    showToast({ text: own.startsWith('sizeCharts.') ? errorText(dict, a) : own, tone: 'bad' });
  };

  const reloadList = useCallback(async () => {
    const a = await call('GET', `${API}?includeArchived=1`);
    if (a.status === 200 && Array.isArray(a.data.sizeCharts)) setCharts(a.data.sizeCharts as SizeChartView[]);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const a = await call('GET', `${API}/${id}`);
    if (a.status === 200) setDetails((d) => ({ ...d, [id]: a.data.item as SizeChartDetail }));
    return a;
  }, []);

  const cur = sel ? details[sel] : undefined;
  const draft = sel ? (drafts[sel] ?? (cur ? draftOf(cur) : undefined)) : undefined;
  const isDirty = (id: string) => {
    const d = drafts[id];
    const c = details[id];
    return Boolean(d && c && JSON.stringify(d) !== JSON.stringify(draftOf(c)));
  };
  const edit = (fn: (d: Draft) => Draft) => {
    if (!sel || !draft) return;
    setDrafts((all) => ({ ...all, [sel]: fn(draft) }));
  };

  const pick = (id: string) => {
    setSel(id);
    setView('edit');
    if (!details[id]) void loadDetail(id);
    if (!window.matchMedia(DESKTOP).matches)
      requestAnimationFrame(() =>
        editorRef.current?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        }),
      );
  };

  // --- editor actions ---
  const setCell = (size: string, i: number, v: string) =>
    edit((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.size === size ? { ...r, values: r.values.map((x, k) => (k === i ? v : x)) } : r)),
    }));
  const removeRow = (size: string) => {
    if (!draft) return;
    if (draft.rows.length <= 1) return say(tt('toast.needOneRow'));
    edit((d) => ({ ...d, rows: d.rows.filter((r) => r.size !== size) }));
    say(tt('toast.rowRemoved', { size: sizeLabel(size) }));
  };
  const addRow = (size: string) => {
    if (!draft) return;
    const known = draft.rows.flatMap((r) => (r.values.every((v) => num(v) > 0) ? [{ size: r.size, values: r.values.map(num) }] : []));
    const values = suggestRow(known, order, size, options.stepInch);
    const rows = [...draft.rows, { size, values: values.map(String) }];
    const keys = sortSizes(
      rows.map((r) => r.size),
      order,
    );
    edit((d) => ({
      ...d,
      rows: keys.map((k) => rows.find((r) => r.size === k)!),
    }));
    say(
      tt('toast.rowAdded', {
        size: sizeLabel(size),
        values: values.join(tt('slash')),
      }),
    );
  };
  const discard = () => {
    if (!sel) return;
    setDrafts(({ [sel]: _gone, ...rest }) => rest);
    say(tt('toast.discarded'));
  };
  const save = async () => {
    if (!sel || !draft || !cur || busy) return;
    const rows = draft.rows.map((r) => ({
      size: r.size,
      values: r.values.map(num),
    }));
    if (rows.some((r) => r.values.some((v) => !(v > 0)))) return say(tt('toast.fillAll'));
    const ease = num(draft.easeInch);
    setBusy(true);
    const a = await call('PATCH', `${API}/${sel}`, {
      name: draft.name.trim(),
      rows,
      ...(ease >= 0 ? { easeInch: ease } : {}),
      ...(draft.diagram ? { diagram: draft.diagram } : {}),
      finder: draft.finder
        .filter((f) => rows.some((r) => r.size === f.size) && Number.isFinite(num(f.w1)) && Number.isFinite(num(f.w2)))
        .map((f) => ({ size: f.size, h1: f.h1.trim(), h2: f.h2.trim(), w1: num(f.w1), w2: num(f.w2) })),
      run: draft.run,
      ...(draft.fitKey && draft.fitKey !== cur.fitKey ? { fitKey: draft.fitKey } : {}),
    });
    setBusy(false);
    if (a.status !== 200) return sayError(a);
    const item = a.data.item as SizeChartDetail;
    setDetails((d) => ({ ...d, [sel]: item }));
    setDrafts(({ [sel]: _saved, ...rest }) => rest);
    await reloadList();
    say(
      tt(item.usedBy === 1 ? 'toast.savedOne' : 'toast.saved', {
        n: item.usedBy,
      }),
    );
  };
  const archive = async (on: boolean) => {
    if (!sel || !cur) return;
    if (on && !window.confirm(tt('archiveConfirm', { name: cur.name }))) return;
    const a = await call('PATCH', `${API}/${sel}`, { archived: on });
    if (a.status !== 200) return sayError(a);
    setDetails((d) => ({ ...d, [sel]: a.data.item as SizeChartDetail }));
    await reloadList();
    say(tt(on ? 'toast.archived' : 'toast.restored'));
  };
  const archiveChart = async (c: SizeChartView, on: boolean) => {
    if (on && !window.confirm(tt('archiveConfirm', { name: c.name }))) return;
    const a = await call('PATCH', `${API}/${c.id}`, { archived: on });
    if (a.status !== 200) return sayError(a);
    setDetails(({ [c.id]: _old, ...rest }) => rest);
    await reloadList();
    say(tt(on ? 'toast.archived' : 'toast.restored'));
  };
  const makeDefault = async (c: SizeChartView, categoryId: string, name: string) => {
    const a = await call('POST', `${API}/assign`, { sizeChartId: c.id, categoryId });
    if (a.status !== 200) return sayError(a);
    setDetails(({ [c.id]: _old, ...rest }) => rest);
    await reloadList();
    say(tt('toast.defaultSet', { name }));
  };
  const back = () => {
    if (sel && isDirty(sel) && !window.confirm(tt('leaveConfirm'))) return;
    setView('list');
  };
  const refresh = async (id: string) => {
    await Promise.all([loadDetail(id), reloadList()]);
  };
  const setDefault = async (categoryId: string) => {
    if (!sel) return;
    const a = await call('POST', `${API}/assign`, {
      sizeChartId: sel,
      categoryId,
    });
    if (a.status !== 200) return sayError(a);
    await refresh(sel);
    say(
      tt('toast.defaultSet', {
        name: categories.find((c) => c.id === categoryId)?.name ?? '',
      }),
    );
  };
  const stopDefault = async (categoryId: string, name: string) => {
    if (!sel) return;
    const a = await call('POST', `${API}/unassign`, {
      categoryId,
      sizeChartId: sel,
    });
    if (a.status !== 200) return sayError(a);
    await refresh(sel);
    say(tt('toast.defaultRemoved', { name }));
  };
  const backToAuto = async (productId: string) => {
    if (!sel) return;
    const a = await call('POST', `${API}/unassign`, { productId });
    if (a.status !== 200) return sayError(a);
    await refresh(sel);
    say(tt('toast.backAuto'));
  };
  const afterCreate = async (a: Answer, message: string) => {
    const item = a.data.created as SizeChartDetail;
    setDetails((d) => ({ ...d, [item.id]: item }));
    await reloadList();
    setModal(null);
    setSel(item.id);
    setView('edit');
    say(message);
  };

  // --- "When you add a product" ---
  const [catId, setCatId] = useState(categories.find((c) => c.garmentTypeId)?.id ?? categories[0]?.id ?? '');
  const [fit, setFit] = useState(options.fallbackFit);
  const [resolved, setResolved] = useState<SizeChartResolution | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  useEffect(() => {
    if (!catId) return;
    let live = true;
    void call('GET', `${API}/resolve?categoryId=${encodeURIComponent(catId)}&fitKey=${encodeURIComponent(fit)}`).then((a) => {
      if (live && a.status === 200) setResolved(a.data.resolution as SizeChartResolution);
    });
    return () => {
      live = false;
    };
  }, [catId, fit, charts]);
  const chosenId = manual ?? resolved?.chart?.id ?? null;
  const chosen = charts.find((c) => c.id === chosenId) ?? resolved?.chart ?? null;

  const fieldsLine = (c: SizeChartView) => c.fields.map((f) => (lang === 'bn' ? f.labelBn : f.labelEn)).join(sep);
  // PR 1238 (prototype v5): a card reads "S–XXL · Chest, Length, Shoulder, Sleeve" — the chart's first and last size in the
  // shop's order, then its first four measurements
  const cardLine = (c: SizeChartView) => {
    const ks = c.rows.map((r) => r.size).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const span = ks.length ? (ks.length > 1 ? `${sizeLabel(ks[0]!)}–${sizeLabel(ks[ks.length - 1]!)}` : sizeLabel(ks[0]!)) : '';
    const pts = c.fields.slice(0, 4).map((f) => (lang === 'bn' ? f.labelBn : f.labelEn)).join(', ');
    return span ? `${span}${sep}${pts}` : pts;
  };
  const gtName = (c: SizeChartView) => (lang === 'bn' ? c.garmentType.nameBn : c.garmentType.nameEn);
  const catName = (c: { nameEn: string; nameBn: string | null }) => (lang === 'bn' ? (c.nameBn ?? c.nameEn) : c.nameEn);

  // --- the editor ---
  const editor = () => {
    if (!cur || !draft) return <div className="sc-ed" ref={editorRef} id="sc-editor" aria-busy="true" />;
    const labels = cur.fields.map((f) => (lang === 'bn' ? f.labelBn : f.labelEn));
    const unit = (u: 'inch' | 'cm') => tt(u === 'cm' ? 'unitCm' : 'unitIn');
    const missing = cur.coverage.filter((g) => !draft.rows.some((r) => r.size === g.size));
    const dirty = isDirty(cur.id);
    const diagram = draft.diagram;
    const assignable = categories.filter(
      (c) => (c.garmentTypeId === null || c.garmentTypeId === cur.garmentType.id) && !cur.defaultFor.some((d) => d.id === c.id),
    );
    return (
      <div className="sc-ed" id="sc-editor" ref={editorRef} data-chart={cur.id}>
        <div className="sc-head">
          <div className="sc-namew">
            <label className="ad-label" htmlFor="sc-name">
              {tt('name')}
            </label>
            <input id="sc-name" className="ad-input" value={draft.name} disabled={!canWrite} onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div>
            <div className="ad-label">{tt('type')}</div>
            <span className="sc-tag plain sc-type">
              {tt('typeValue', {
                type: gtName(cur),
                fields: labels.join(tt('slash')).toLowerCase(),
              })}
            </span>
          </div>
        </div>

        <div className="sc-sec">
          <div className="sc-bar">
            <div className="ad-label sc-m0">
              {tt('measurements')} <span className="sc-dim">{tt('fromErp')}</span>
            </div>
            {canWrite ? (
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setModal({ kind: 'paste' })}>
                <Icon name="doc" size={15} />
                {tt('paste')}
              </button>
            ) : null}
          </div>
          <div className="sc-tblw">
            <table className="sc-tbl">
              <thead>
                <tr>
                  <th scope="col">{tt('size')}</th>
                  {cur.fields.map((f, i) => (
                    <th scope="col" key={f.key}>
                      {labels[i]} <span className="u">{unit(f.unit)}</span>
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sc-sr">{tt('removeCol')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((r) => (
                  <tr key={r.size}>
                    <td className="sz">{sizeLabel(r.size)}</td>
                    {r.values.map((v, i) => (
                      <td key={i}>
                        <input
                          className="ad-input sc-in"
                          type="number"
                          inputMode="decimal"
                          step={options.stepInch}
                          min={0}
                          max={options.maxValueInch}
                          value={v}
                          disabled={!canWrite}
                          aria-label={tt('cellLabel', {
                            size: sizeLabel(r.size),
                            field: labels[i] ?? '',
                          })}
                          aria-invalid={!(num(v) > 0) || undefined}
                          onChange={(e) => setCell(r.size, i, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      {canWrite ? (
                        <button
                          type="button"
                          className="sc-rm"
                          aria-label={tt('removeRow', {
                            size: sizeLabel(r.size),
                          })}
                          title={tt('removeRow', { size: sizeLabel(r.size) })}
                          onClick={() => removeRow(r.size)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sc-bar sc-mt8">
            <span className="sc-xs sc-dim sc-row">
              <Icon name="info" size={14} />
              {tt('inchOnly')}
            </span>
            <label className="sc-check">
              <input type="checkbox" checked={cm} onChange={(e) => setCm(e.target.checked)} /> {tt('showCm')}
            </label>
          </div>
          {cm ? (
            <div className="sc-tblw sc-soft">
              <table className="sc-tbl">
                <thead>
                  <tr>
                    <th scope="col">{tt('size')}</th>
                    {cur.fields.map((f, i) => (
                      <th scope="col" key={f.key}>
                        {labels[i]} {tt('unitCm')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((r) => (
                    <tr key={r.size}>
                      <td className="sz">{sizeLabel(r.size)}</td>
                      {r.values.map((v, i) => (
                        <td key={i} className="sc-dim">
                          {num(v) > 0 ? bothUnits(num(v), cur.fields[i]?.unit ?? 'inch', options.cmDecimals).cm : tt('none')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="sc-sec">
          <label className="ad-label" htmlFor="sc-ease">
            {tt('ease')}
          </label>
          <div className="sc-row sc-small">
            {tt('bodyPlus')}
            <input
              id="sc-ease"
              className="ad-input sc-in sc-ease"
              type="number"
              inputMode="decimal"
              step={options.stepInch}
              min={0}
              max={options.maxValueInch}
              value={draft.easeInch}
              disabled={!canWrite}
              onChange={(e) => edit((d) => ({ ...d, easeInch: e.target.value }))}
            />
            {tt('unitIn')}
          </div>
          <div className="sc-xs sc-dim sc-mt8">{tt('easeHelp')}</div>
        </div>

        <div className="sc-sec" data-testid="sc-finder">
          <div className="ad-label">
            {tt('finder.h')} <span className="sc-dim">{tt('finder.sub')}</span>
          </div>
          <div className="sc-tblw">
            <table className="sc-tbl">
              <thead>
                <tr>
                  <th scope="col">{tt('size')}</th>
                  <th scope="col">{tt('finder.h1')}</th>
                  <th scope="col">{tt('finder.to')}</th>
                  <th scope="col">{tt('finder.w1')}</th>
                  <th scope="col">{tt('finder.to')}</th>
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((r) => {
                  const f = draft.finder.find((x) => x.size === r.size) ?? { size: r.size, h1: '', h2: '', w1: '', w2: '' };
                  const put = (patch: Partial<Draft['finder'][number]>) =>
                    edit((d) => ({ ...d, finder: d.finder.some((x) => x.size === r.size) ? d.finder.map((x) => (x.size === r.size ? { ...x, ...patch } : x)) : [...d.finder, { ...f, ...patch }] }));
                  return (
                    <tr key={r.size}>
                      <td className="sz">{sizeLabel(r.size)}</td>
                      <td>
                        <input className="ad-input sc-in" aria-label={tt('finder.cell', { size: sizeLabel(r.size), what: tt('finder.h1') })} maxLength={16} value={f.h1} disabled={!canWrite} onChange={(e) => put({ h1: e.target.value })} />
                      </td>
                      <td>
                        <input className="ad-input sc-in" aria-label={tt('finder.cell', { size: sizeLabel(r.size), what: tt('finder.h2') })} maxLength={16} value={f.h2} disabled={!canWrite} onChange={(e) => put({ h2: e.target.value })} />
                      </td>
                      <td>
                        <input className="ad-input sc-in" type="number" inputMode="decimal" min={0} aria-label={tt('finder.cell', { size: sizeLabel(r.size), what: tt('finder.w1') })} value={f.w1} disabled={!canWrite} onChange={(e) => put({ w1: e.target.value })} />
                      </td>
                      <td>
                        <input className="ad-input sc-in" type="number" inputMode="decimal" min={0} aria-label={tt('finder.cell', { size: sizeLabel(r.size), what: tt('finder.w2') })} value={f.w2} disabled={!canWrite} onChange={(e) => put({ w2: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sc-f2 sc-mt8">
            <div>
              <label className="ad-label" htmlFor="sc-fit">
                {tt('fit')}
              </label>
              <select id="sc-fit" className="ad-input" value={draft.fitKey} disabled={!canWrite} onChange={(e) => edit((d) => ({ ...d, fitKey: e.target.value }))}>
                {options.fits.map((f) => (
                  <option key={f.key} value={f.key}>
                    {loc(f)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ad-label" htmlFor="sc-run">
                {tt('finder.run')}
              </label>
              <select id="sc-run" className="ad-input" value={draft.run} disabled={!canWrite} onChange={(e) => edit((d) => ({ ...d, run: e.target.value as ChartRun }))}>
                {CHART_RUNS.map((k) => (
                  <option key={k} value={k}>
                    {tt(`finder.run_${k}`)}
                  </option>
                ))}
              </select>
              <div className="sc-xs sc-dim">{tt('finder.runHelp')}</div>
            </div>
          </div>
          <FinderTry tt={tt} finder={draft.finder} run={draft.run} label={sizeLabel} />
        </div>

        <div className="sc-sec">
          <div className="ad-label">
            {tt('howTo')} <span className="sc-dim">{tt('howToSub')}</span>
          </div>
          <div className="sc-tiles">
            {options.diagrams.map((dg) => (
              <button
                type="button"
                key={dg.key}
                className={`sc-tile${diagram === dg.key ? ' on' : ''}`}
                aria-pressed={diagram === dg.key}
                disabled={!canWrite}
                onClick={() => edit((d) => ({ ...d, diagram: dg.key }))}
              >
                <Drawing kind={dg.key} />
                <div className="sc-small sc-bold sc-mt8">{loc(dg)}</div>
              </button>
            ))}
          </div>
          <ol className="sc-howto">
            {cur.fields.map((f, i) => (
              <li key={f.key}>{f.howTo ? f.howTo[lang] : labels[i]}</li>
            ))}
          </ol>
        </div>

        <CustomerPreview
          tt={tt}
          labels={labels}
          units={cur.fields.map((f) => f.unit)}
          rows={draft.rows.map((r) => ({ size: r.size, label: sizeLabel(r.size), values: r.values.map((v) => num(v)) }))}
          order={order}
          easeInch={Number.isFinite(num(draft.easeInch)) ? num(draft.easeInch) : 0}
          cmDecimals={options.cmDecimals}
        />

        <div className="sc-sec">
          <div className="ad-label">{tt('coverage')}</div>
          {missing.length ? (
            <div className="sc-cov bad">
              {missing.map((m) => {
                const first = m.products[0];
                return (
                  <div className="w" key={m.size}>
                    <span className="sc-small sc-row">
                      <Icon name="info" size={16} />
                      <span>
                        {m.products.length > 1
                          ? tt('missingMany', {
                              name: first?.nameEn ?? '',
                              more: m.products.length - 1,
                              size: m.label,
                            })
                          : tt('missingOne', {
                              name: first?.nameEn ?? '',
                              size: m.label,
                            })}
                      </span>
                    </span>
                    {canWrite ? (
                      <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => addRow(m.size)}>
                        <Icon name="plus" size={14} />
                        {tt('addRow')}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="sc-cov ok sc-small sc-row">
              <Icon name="check" size={16} />
              <span>
                {cur.usedBy === 1 ? tt('allCoveredOne') : tt('allCovered', { n: cur.usedBy })}
                <span className="sc-xs sc-hint">{tt('coverageHint')}</span>
              </span>
            </div>
          )}
        </div>

        {canWrite ? (
          <div className="sc-actions">
            <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" data-testid="sc-save" disabled={busy || cur.archived} onClick={save}>
              <Icon name="check" size={15} />
              {busy ? tt('saving') : tt('save')}
            </button>
            <span className="sc-row">
              {dirty ? (
                <>
                  <span className="sc-tag gold">{tt('unsavedChanges')}</span>
                  <button type="button" className="sc-link" onClick={discard}>
                    {tt('discard')}
                  </button>
                </>
              ) : (
                <span className="sc-xs sc-dim">{tt('allSaved')}</span>
              )}
            </span>
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm sc-push" onClick={() => setModal({ kind: 'copy', fromId: cur.id })}>
              <Icon name="layers" size={15} />
              {tt('copy')}
            </button>
          </div>
        ) : null}

        <div className="sc-sec">
          <div className="ad-label">
            {tt('defaults')} <span className="sc-dim">{tt('defaultsSub')}</span>
          </div>
          {cur.defaultFor.length ? (
            <div className="sc-chips">
              {cur.defaultFor.map((c) => (
                <span className="sc-tag" key={c.id}>
                  {tt('defaultFor', { name: catName(c) })}
                  {canWrite ? (
                    <button
                      type="button"
                      className="sc-x"
                      aria-label={tt('stopDefault', { name: catName(c) })}
                      title={tt('stopDefault', { name: catName(c) })}
                      onClick={() => stopDefault(c.id, catName(c))}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          ) : (
            <div className="sc-xs sc-dim sc-mt8">{tt('noDefaults')}</div>
          )}
          {canWrite && assignable.length && !cur.archived ? <DefaultPicker key={cur.id} tt={tt} options={assignable} onPick={setDefault} /> : null}
        </div>

        <div className="sc-sec">
          <div className="ad-label">
            {tt('products')} <span className="sc-dim">{tt('productsSub')}</span>
          </div>
          {cur.products.length ? (
            <div className="sc-plist">
              {cur.products.map((p) => (
                <div className="sc-prod" key={p.id}>
                  <div className="sc-grow">
                    <div className="sc-small sc-bold">{lang === 'bn' ? (p.nameBn ?? p.nameEn) : p.nameEn}</div>
                    <div className="sc-xs sc-dim">
                      {tt('erpSizes', {
                        sizes: p.sizes.map((s) => s.label).join(sep),
                      })}
                    </div>
                  </div>
                  {p.via === 'product' ? (
                    <span className="sc-row">
                      <span className="sc-tag plain">{tt('ownChart')}</span>
                      {canWrite ? (
                        <button type="button" className="sc-link" onClick={() => backToAuto(p.id)}>
                          {tt('backToAuto')}
                        </button>
                      ) : null}
                    </span>
                  ) : (
                    <span className="sc-xs sc-dim">{tt('viaCategory')}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="sc-xs sc-dim sc-mt8">{tt('noProducts')}</div>
          )}
        </div>

        {canWrite ? (
          <div className="sc-foot">
            <button type="button" className="sc-link" onClick={() => archive(!cur.archived)}>
              {cur.archived ? tt('restore') : tt('archive')}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const fitOptions = options.fits;
  return (
    <>
      {/* PR 965 (prototype v5): the three-step "how it works" card is gone from this screen (its words stay in the messages) */}
      {view === 'list' ? (
        <div className="sc-cats" data-testid="sizecharts-categories">
          {categories
            .filter((c) => c.garmentTypeId)
            .map((c) => {
              const list = charts.filter((x) => !x.archived && (x.defaultFor.some((d) => d.id === c.id) || x.garmentType.id === c.garmentTypeId));
              return (
                <section key={c.id} className="sc-grp" data-testid="sizechart-category">
                  <div className="sc-bar sc-listhd">
                    <h3 className="sc-h3">
                      {c.name} <span className="sc-dim">{tt('catCount', { n: list.length })}</span>
                    </h3>
                    {canWrite ? (
                      <button type="button" className="ad-btn ad-btn-sm" onClick={() => setModal({ kind: 'new' })}>
                        <Icon name="plus" size={14} />
                        {tt('newChart')}
                      </button>
                    ) : null}
                  </div>
                  <div className="sc-cards">
                    {list.length ? (
                      list.map((x) => {
                        const isDef = x.defaultFor.some((d) => d.id === c.id);
                        return (
                          <div className="ad-card sc-card" key={x.id} data-testid="sizechart-card">
                            <b className="sc-bold">{x.name}</b>
                            <span className="sc-xs sc-dim sc-block">{cardLine(x)}</span>
                            <span className="sc-chips sc-mt8">
                              {isDef ? <span className="sc-tag">{tt('badgeDefault')}</span> : null}
                              <span className="sc-tag plain">{tt(x.usedBy === 1 ? 'usedByOne' : 'usedByMany', { n: x.usedBy })}</span>
                              {x.fit ? <span className="sc-tag plain">{loc(x.fit)}</span> : null}
                              {isDirty(x.id) ? <span className="sc-tag gold">{tt('unsaved')}</span> : null}
                            </span>
                            <span className="sc-acts sc-mt8">
                              <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => pick(x.id)}>
                                {tt('edit')}
                              </button>
                              {canWrite ? (
                                <button type="button" className="ad-btn ad-btn-sm" onClick={() => setModal({ kind: 'copy', fromId: x.id })}>
                                  {tt('duplicate')}
                                </button>
                              ) : null}
                              {canWrite && !isDef ? (
                                <button type="button" className="ad-btn ad-btn-sm" onClick={() => void makeDefault(x, c.id, c.name)}>
                                  {tt('setDefault')}
                                </button>
                              ) : null}
                              {canWrite ? (
                                <button type="button" className="ad-btn ad-btn-sm" onClick={() => void archiveChart(x, true)}>
                                  {tt('archiveCard')}
                                </button>
                              ) : null}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="ad-card sc-card sc-dim sc-small">{tt('noChartForCat')}</div>
                    )}
                  </div>
                </section>
              );
            })}
          {charts.some((x) => x.archived) ? (
            <section className="sc-grp">
              <div className="sc-bar sc-listhd">
                <h3 className="sc-h3">{tt('archived')}</h3>
              </div>
              <div className="sc-cards">
                {charts
                  .filter((x) => x.archived)
                  .map((x) => (
                    <div className="ad-card sc-card" key={x.id}>
                      <b className="sc-bold">{x.name}</b>
                      {canWrite ? (
                        <span className="sc-acts sc-mt8">
                          <button type="button" className="ad-btn ad-btn-sm" onClick={() => void archiveChart(x, false)}>
                            {tt('bringBack')}
                          </button>
                        </span>
                      ) : null}
                    </div>
                  ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      <div className={view === 'list' ? 'sc-grid sc-one' : 'sc-grid sc-editing'}>
        {view === 'edit' ? (
          <div className="sc-edw">
            <button type="button" className="ad-btn ad-btn-sm sc-mb8" onClick={back} data-testid="sizechart-back">
              ← {tt('allCharts')}
            </button>
            {sel ? editor() : null}
          </div>
        ) : null}
        <div className="sc-addw" hidden={view === 'edit'}>
          <div className="ad-card">
            <div className="sc-h3">{tt('addTitle')}</div>
            <div className="sc-xs sc-text2 sc-mt2">{tt('addSub')}</div>
            <div className="sc-g2">
              <div>
                <label className="ad-label" htmlFor="sc-cat">
                  {tt('category')}
                </label>
                <select
                  id="sc-cat"
                  className="ad-input"
                  value={catId}
                  onChange={(e) => {
                    setCatId(e.target.value);
                    setManual(null);
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ad-label" htmlFor="sc-fit">
                  {tt('fit')}
                </label>
                <select
                  id="sc-fit"
                  className="ad-input"
                  value={fit}
                  onChange={(e) => {
                    setFit(e.target.value);
                    setManual(null);
                  }}
                >
                  {fitOptions.map((f) => (
                    <option key={f.key} value={f.key}>
                      {loc(f)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sc-auto">
              <Icon name="ruler" size={18} />
              <span>
                {tt('chosen')} <b>{chosen ? chosen.name : tt('none')}</b> <span className="sc-dim">{manual ? tt('byYou') : tt('auto')}</span>
              </span>
            </div>
            <div className="sc-links">
              {charts.length ? (
                <button type="button" className="sc-link" onClick={() => setModal({ kind: 'change' })}>
                  {tt('change')}
                </button>
              ) : null}
              {canWrite && chosenId ? (
                <button type="button" className="sc-link" onClick={() => setModal({ kind: 'copy', fromId: chosenId })}>
                  {tt('custom')}
                </button>
              ) : null}
              {manual ? (
                <button type="button" className="sc-link" onClick={() => setManual(null)}>
                  {tt('backToAuto')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {modal?.kind === 'paste' && cur && draft ? (
        <PasteSheet
          tt={tt}
          labels={cur.fields.map((f) => (lang === 'bn' ? f.labelBn : f.labelEn))}
          current={draft.rows.map((r) => [sizeLabel(r.size), ...r.values].join('\t')).join('\n')}
          sizes={sizes}
          order={order}
          onClose={() => setModal(null)}
          onUse={(rows, unknown) => {
            edit((d) => ({
              ...d,
              rows: rows.map((r) => ({
                size: r.size,
                values: r.values.map(String),
              })),
            }));
            setModal(null);
            say(
              unknown.length
                ? `${tt('toast.pasted', { n: rows.length })}${sep}${tt('pasteUnknown', { sizes: unknown.join(sep) })}`
                : tt('toast.pasted', { n: rows.length }),
            );
          }}
        />
      ) : null}
      {modal?.kind === 'copy' ? (
        <CopySheet
          tt={tt}
          from={charts.find((c) => c.id === modal.fromId) ?? null}
          fits={fitOptions.map((f) => ({ key: f.key, label: loc(f) }))}
          onClose={() => setModal(null)}
          onDone={(a) => (a.status === 201 ? afterCreate(a, tt('toast.copied')) : sayError(a))}
        />
      ) : null}
      {modal?.kind === 'new' ? (
        <NewSheet
          tt={tt}
          garmentTypes={garmentTypes}
          fits={fitOptions.map((f) => ({ key: f.key, label: loc(f) }))}
          defaultFit={options.fallbackFit}
          sizes={sizes}
          order={order}
          sep={sep}
          onClose={() => setModal(null)}
          onDone={(a) => (a.status === 201 ? afterCreate(a, tt('toast.created')) : sayError(a))}
        />
      ) : null}
      {modal?.kind === 'change' ? (
        <Sheet title={tt('changeTitle')} closeLabel={tt('close')} onClose={() => setModal(null)}>
          <div className="ad-modal-desc">{tt('changeSub')}</div>
          <div className="sc-list">
            {charts
              .filter((c) => !c.archived)
              .map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`sc-item${c.id === chosenId ? ' on' : ''}`}
                  onClick={() => {
                    setManual(c.id);
                    setModal(null);
                  }}
                >
                  <span className="sc-bold sc-small">{c.name}</span>
                  <span className="sc-xs sc-dim sc-block">{fieldsLine(c)}</span>
                </button>
              ))}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

type TT = (key: string, vars?: Record<string, string | number>) => string;

function DefaultPicker({ tt, options, onPick }: { tt: TT; options: SizeChartCategory[]; onPick(id: string): void }) {
  const [v, setV] = useState('');
  return (
    <div className="sc-pick">
      <label className="sc-sr" htmlFor="sc-def">
        {tt('pickCategory')}
      </label>
      <select id="sc-def" className="ad-input" value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">{tt('pickCategory')}</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={!v} onClick={() => v && onPick(v)}>
        {tt('setDefault')}
      </button>
    </div>
  );
}

/** A sheet (bottom sheet on phone, dialog on desktop): Escape closes, Tab stays inside, the first field gets focus. */
function Sheet({
  title,
  closeLabel,
  onClose,
  children,
  onSubmit,
}: {
  title: string;
  closeLabel: string;
  onClose(): void;
  children: ReactNode;
  onSubmit?(e: FormEvent): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    box.current?.querySelector<HTMLElement>('input, textarea, select, .ad-modal-bd button')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, textarea')];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const body = onSubmit ? (
    <form className="ad-modal-bd" onSubmit={onSubmit} noValidate autoComplete="off">
      {children}
    </form>
  ) : (
    <div className="ad-modal-bd">{children}</div>
  );
  return (
    <div className="ad-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-labelledby="sc-sheet-h" ref={box} onKeyDown={onKey}>
        <div className="ad-modal-hd">
          <h2 id="sc-sheet-h">{title}</h2>
          <button type="button" className="ad-iconbtn" aria-label={closeLabel} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

/** "Typed size → the shop's size key": by key or by label, any case. */
const sizeMatcher = (sizes: { key: string; label: string }[]) => (typed: string) => {
  const s = typed.trim().toLowerCase();
  return sizes.find((x) => x.key.toLowerCase() === s || x.label.toLowerCase() === s)?.key ?? null;
};

function PasteSheet({
  tt,
  labels,
  current,
  sizes,
  order,
  onClose,
  onUse,
}: {
  tt: TT;
  labels: string[];
  current: string;
  sizes: { key: string; label: string }[];
  order: string[];
  onClose(): void;
  onUse(rows: { size: string; values: number[] }[], unknown: string[]): void;
}) {
  const [text, setText] = useState(current);
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = parsePasted(text, labels.length, sizeMatcher(sizes));
    if (!r.rows.length) return setError(tt('pasteNone', { n: labels.length }));
    const keys = sortSizes(
      r.rows.map((x) => x.size),
      order,
    );
    onUse(
      keys.map((k) => r.rows.find((x) => x.size === k)!),
      r.unknownSizes,
    );
  };
  return (
    <Sheet title={tt('pasteTitle')} closeLabel={tt('close')} onClose={onClose} onSubmit={submit}>
      <div className="ad-modal-desc">{tt('pasteIntro')}</div>
      <div className="sc-chips">
        <span className="sc-tag dark">{tt('size')}</span>
        {labels.map((l) => (
          <span className="sc-tag plain" key={l}>
            {l}
          </span>
        ))}
      </div>
      <textarea className="ad-input sc-mono" rows={8} aria-label={tt('pasteRows')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="sc-xs sc-dim">{tt('pasteExample')}</div>
      {error ? (
        <p className="ad-modal-err" role="alert">
          {error}
        </p>
      ) : null}
      <div className="ad-modal-acts">
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose}>
          {tt('cancel')}
        </button>
        <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm">
          {tt('usePasted')}
        </button>
      </div>
    </Sheet>
  );
}

function CopySheet({
  tt,
  from,
  fits,
  onClose,
  onDone,
}: {
  tt: TT;
  from: SizeChartView | null;
  fits: { key: string; label: string }[];
  onClose(): void;
  onDone(a: Answer): void;
}) {
  const [name, setName] = useState(from ? tt('copyNameDefault', { name: from.name }) : '');
  const [fit, setFit] = useState(from?.fitKey ?? fits[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!from || !name.trim() || busy) return;
    setBusy(true);
    const a = await call('POST', `${API}/${from.id}/copy`, {
      name: name.trim(),
      fitKey: fit,
    });
    setBusy(false);
    onDone(a);
  };
  return (
    <Sheet title={tt('copyTitle')} closeLabel={tt('close')} onClose={onClose} onSubmit={submit}>
      <div className="ad-modal-desc">{tt('copyIntro')}</div>
      <div>
        <label className="ad-label" htmlFor="sc-copy-name">
          {tt('copyName')}
        </label>
        <input id="sc-copy-name" className="ad-input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="ad-label" htmlFor="sc-copy-fit">
          {tt('fit')}
        </label>
        <select id="sc-copy-fit" className="ad-input" value={fit} onChange={(e) => setFit(e.target.value)}>
          {fits.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="ad-modal-acts">
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose}>
          {tt('cancel')}
        </button>
        <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy || !name.trim()}>
          <Icon name="layers" size={15} />
          {tt('copyMake')}
        </button>
      </div>
    </Sheet>
  );
}

function NewSheet({
  tt,
  garmentTypes,
  fits,
  defaultFit,
  sizes,
  order,
  sep,
  onClose,
  onDone,
}: {
  tt: TT;
  garmentTypes: SizeChartGarmentType[];
  fits: { key: string; label: string }[];
  defaultFit: string;
  sizes: { key: string; label: string }[];
  order: string[];
  sep: string;
  onClose(): void;
  onDone(a: Answer): void;
}) {
  const usable = garmentTypes.filter((g) => g.fields.length);
  const [name, setName] = useState('');
  const [gt, setGt] = useState(usable[0]?.id ?? '');
  const [fit, setFit] = useState(defaultFit);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const type = usable.find((g) => g.id === gt);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!type || !name.trim() || busy) return;
    const r = parsePasted(text, type.fields.length, sizeMatcher(sizes));
    if (!r.rows.length) return setError(tt('pasteNone', { n: type.fields.length }));
    const keys = sortSizes(
      r.rows.map((x) => x.size),
      order,
    );
    setBusy(true);
    const a = await call('POST', API, {
      name: name.trim(),
      garmentTypeId: type.id,
      fitKey: fit,
      rows: keys.map((k) => r.rows.find((x) => x.size === k)!),
    });
    setBusy(false);
    onDone(a);
  };
  return (
    <Sheet title={tt('newTitle')} closeLabel={tt('close')} onClose={onClose} onSubmit={submit}>
      <div>
        <label className="ad-label" htmlFor="sc-new-name">
          {tt('name')}
        </label>
        <input id="sc-new-name" className="ad-input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="sc-g2 sc-m0">
        <div>
          <label className="ad-label" htmlFor="sc-new-type">
            {tt('garmentType')}
          </label>
          <select id="sc-new-type" className="ad-input" value={gt} onChange={(e) => setGt(e.target.value)}>
            {usable.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ad-label" htmlFor="sc-new-fit">
            {tt('fit')}
          </label>
          <select id="sc-new-fit" className="ad-input" value={fit} onChange={(e) => setFit(e.target.value)}>
            {fits.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="ad-label" htmlFor="sc-new-rows">
          {tt('newRows', {
            fields: (type?.fields ?? []).map((f) => f.label).join(sep),
          })}
        </label>
        <textarea id="sc-new-rows" className="ad-input sc-mono" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="sc-xs sc-dim sc-mt8">{tt('pasteExample')}</div>
      </div>
      {error ? (
        <p className="ad-modal-err" role="alert">
          {error}
        </p>
      ) : null}
      <div className="ad-modal-acts">
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={onClose}>
          {tt('cancel')}
        </button>
        <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm" disabled={busy || !name.trim() || !type}>
          <Icon name="plus" size={15} />
          {tt('create')}
        </button>
      </div>
    </Sheet>
  );
}

/** The how-to-measure drawings (demo sc_diaTop / sc_diaBottom): numbered points in the order of the measurements. */
function Drawing({ kind }: { kind: string }) {
  const dot = (x: number, y: number, n: number) => (
    <g key={n}>
      <circle cx={x} cy={y} r="8" className="sc-dot" />
      <text x={x} y={y + 3.5} className="sc-dotn" textAnchor="middle">
        {n}
      </text>
    </g>
  );
  if (kind === 'bottom') {
    return (
      <svg viewBox="0 0 200 222" aria-hidden="true">
        <path d="M58 10 L142 10 L152 212 L112 212 L100 74 L88 212 L48 212 Z" className="sc-shape" />
        <g className="sc-guide">
          <line x1="58" y1="16" x2="142" y2="16" />
          <line x1="55" y1="48" x2="145" y2="48" />
          <line x1="53" y1="84" x2="96" y2="84" />
          <line x1="160" y1="12" x2="160" y2="210" />
          <line x1="112" y1="204" x2="152" y2="204" />
        </g>
        {[
          [100, 16],
          [80, 48],
          [70, 84],
          [160, 120],
          [132, 204],
        ].map(([x, y], i) => dot(x!, y!, i + 1))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 222" aria-hidden="true">
      <path d="M62 22 L82 12 Q100 28 118 12 L138 22 L178 46 L162 82 L146 74 L146 208 L54 208 L54 74 L38 82 L22 46 Z" className="sc-shape" />
      <g className="sc-guide">
        <line x1="56" y1="92" x2="144" y2="92" />
        <line x1="122" y1="20" x2="122" y2="206" />
        <line x1="64" y1="30" x2="136" y2="30" />
        <line x1="140" y1="28" x2="170" y2="64" />
      </g>
      {[
        [80, 92],
        [122, 150],
        [100, 30],
        [162, 46],
      ].map(([x, y], i) => dot(x!, y!, i + 1))}
    </svg>
  );
}

// PR 831 (prototype v5): "What customers see" — the size guide the way the product page shows it, from the chart as it is typed
// now (not yet saved): an inch / cm switch, a size picked to stand out, and "Find my size" from a body measure in inches
// (the same rule-based finder the shop uses; it works with AI off). Read only; nothing here saves.
function CustomerPreview({
  tt,
  labels,
  units,
  rows,
  order,
  easeInch,
  cmDecimals,
}: {
  tt: TT;
  labels: string[];
  units: ('inch' | 'cm')[];
  rows: { size: string; label: string; values: number[] }[];
  order: string[];
  easeInch: number;
  cmDecimals: number;
}) {
  const [unit, setUnit] = useState<'inch' | 'cm'>('inch');
  const [pick, setPick] = useState(0);
  const [body, setBody] = useState('');
  const shown = (v: number, from: 'inch' | 'cm') => (Number.isFinite(v) && v > 0 ? (unit === 'cm' ? bothUnits(v, from, cmDecimals).cm : bothUnits(v, from, cmDecimals).inch) : tt('none'));
  const bodyNum = Number(body);
  const found = body.trim() !== '' && bodyNum > 0 ? sizeForBody(rows.map((r) => ({ size: r.size, values: r.values })), order, 0, bodyNum, easeInch) : null;
  const foundLabel = rows.find((r) => r.size === found)?.label ?? found;
  const at = Math.min(pick, Math.max(0, rows.length - 1));
  return (
    <div className="sc-sec sc-cust" data-testid="sc-customer-preview">
      <div className="sc-bar">
        <div className="ad-label sc-m0">{tt('preview.h')}</div>
        <div className="sc-seg" role="group" aria-label={tt('preview.unit')}>
          {(['inch', 'cm'] as const).map((u) => (
            <button key={u} type="button" className="ad-btn ad-btn-ghost ad-btn-sm" aria-pressed={unit === u} onClick={() => setUnit(u)} data-testid={`sc-preview-${u}`}>
              {u === 'cm' ? tt('unitCm') : tt('unitIn')}
            </button>
          ))}
        </div>
      </div>
      <div className="sc-pv-sizes">
        {rows.map((r, i) => (
          <button key={r.size} type="button" className={`sc-pv-sz${i === at ? ' on' : ''}`} aria-pressed={i === at} onClick={() => setPick(i)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="sc-tblw">
        <table className="sc-tbl">
          <thead>
            <tr>
              <th scope="col">
                <span className="sc-sr">{tt('size')}</span>
              </th>
              {rows.map((r, i) => (
                <th scope="col" key={r.size} className={i === at ? 'on' : undefined}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, fi) => (
              <tr key={l}>
                <td>{l}</td>
                {rows.map((r, i) => (
                  <td key={r.size} className={i === at ? 'on' : undefined}>
                    {shown(r.values[fi] ?? NaN, units[fi] ?? 'inch')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sc-pv-find">
        <label className="ad-label" htmlFor="sc-pv-body">
          {tt('preview.find')}
        </label>
        <input id="sc-pv-body" className="ad-input sc-in" type="number" inputMode="decimal" step="0.5" min={0} value={body} placeholder={tt('preview.body', { field: labels[0] ?? '' })} onChange={(e) => setBody(e.target.value)} />
        <div className="sc-xs sc-dim" role="status" data-testid="sc-pv-result">
          {found ? tt('preview.suggest', { size: foundLabel ?? '' }) : body.trim() !== '' && bodyNum > 0 ? tt('preview.none') : tt('preview.try')}
        </div>
      </div>
    </div>
  );
}

/** PR 972: "try it" under the size finder — a weight in, the size the table gives out (the same rule the shop uses). */
function FinderTry({ tt, finder, run, label }: { tt: TT; finder: Draft['finder']; run: ChartRun; label(k: string): string }) {
  const [kg, setKg] = useState('');
  const table = finder.flatMap((f) => (Number.isFinite(num(f.w1)) && Number.isFinite(num(f.w2)) ? [{ size: f.size, h1: f.h1, h2: f.h2, w1: num(f.w1), w2: num(f.w2) }] : []));
  const got = kg.trim() ? suggestSizeByWeight(table, run, num(kg)) : null;
  return (
    <div className="sc-row sc-small sc-mt8">
      <label htmlFor="sc-try">{tt('finder.try')}</label>
      <input id="sc-try" className="ad-input sc-in" type="number" inputMode="decimal" min={0} value={kg} onChange={(e) => setKg(e.target.value)} />
      <span aria-live="polite" data-testid="sc-try-out">
        {got ? tt('finder.suggest', { size: label(got) }) : kg.trim() ? tt('finder.none') : ''}
      </span>
    </div>
  );
}
