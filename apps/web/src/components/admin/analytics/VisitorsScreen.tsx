'use client';
// S28 · PR 700 — Website → Analytics → Overview: the cards (visitors, sessions, page views, orders, visit to order, live
// now), the daily chart, the top lists and the settings (collect on or off, keep days) with the owner's PIN. Data is made on
// the server (lib/analytics/visitors.ts); the settings write to /api/admin/analytics-visitors/settings.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { VisitorsView } from '@/lib/analytics/visitors';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface VisitorsScreenProps {
  dict: Dict;
  view: VisitorsView;
  canEdit: boolean;
  canBehaviour: boolean;
  span: number;
  /** PR 912: which of the prototype's five ranges is open (today, 7d, 30d, month, last). */
  range: string;
  locale: string;
}

const RANGES = ['today', '7d', '30d', 'month', 'last'] as const;

export function VisitorsScreen(p: VisitorsScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `webAnalytics.${k}`, vars);
  const v = p.view;
  const [collect, setCollect] = useState(v.cfg.collect);
  const [keep, setKeep] = useState(String(v.cfg.keepDays));
  const [live, setLive] = useState(String(v.cfg.liveWindowMinutes));
  const [top, setTop] = useState(String(v.cfg.topCount));
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const label = (dim: 'sources' | 'pages' | 'devices', key: string) => {
    if (dim === 'sources' && key === 'direct') return c('lists.direct');
    if (dim === 'pages') return t(p.dict, `webAnalytics.lists.page.${key}`) === `webAnalytics.lists.page.${key}` ? key : c(`lists.page.${key}`);
    if (dim === 'devices') return t(p.dict, `webAnalytics.lists.device.${key}`) === `webAnalytics.lists.device.${key}` ? key : c(`lists.device.${key}`);
    return key;
  };
  async function save() {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', '/api/admin/analytics-visitors/settings', { collect, keepDays: Number(keep), liveWindowMinutes: Number(live), topCount: Number(top), pin });
    setBusy(false);
    if (a.data.ok) {
      setPin('');
      showToast({ text: c('settings.saved'), tone: 'ok' });
      router.refresh();
    } else {
      const k = `webAnalytics.errors.${a.status === 0 ? 'network' : (a.data.error ?? 'server-error')}`;
      const m = t(p.dict, k);
      setSaid({ text: m === k ? c('errors.server-error') : m, bad: true });
    }
  }
  const nf = new Intl.NumberFormat(p.locale, { numberingSystem: 'latn' });
  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
  const dv = pct(v.totals.visitors, v.prev?.totals.visitors ?? 0);
  const ds = pct(v.totals.sessions, v.prev?.totals.sessions ?? 0);
  const dc = v.totals.conversionPct !== null && v.prev?.totals.conversionPct ? pct(v.totals.conversionPct, v.prev.totals.conversionPct) : null;
  const delta = (x: number | null) => (x === null ? null : <span className={`va-d ${x >= 0 ? 'up' : 'dn'}`}>{x >= 0 ? '▲' : '▼'} {nf.format(Math.abs(Math.round(x * 10) / 10))}%</span>);
  const W2 = 1000; // hardcode-ok: the drawing's own coordinate width
  const H2 = 220; // hardcode-ok: the drawing's own coordinate height
  const yMax = Math.max(1, ...v.days.map((d) => d.visitors), ...(v.prev?.days ?? []).map((d) => d.visitors));
  const pt = (i: number, n: number, val: number) => `${n > 1 ? (i / (n - 1)) * W2 : W2 / 2},${H2 - (val / yMax) * (H2 - 10)}`;
  const line = (arr: { visitors: number }[]) => arr.map((d, i) => pt(i, arr.length, d.visitors)).join(' ');
  const peak = v.days.reduce((a, d, i) => (d.visitors > (v.days[a]?.visitors ?? -1) ? i : a), 0);
  const dayName = (ymd: string) => new Intl.DateTimeFormat(p.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T00:00:00Z`));
  const ticks = v.days.length > 1 ? [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => v.days[Math.round(f * (v.days.length - 1))]!.day) : v.days.map((d) => d.day); // hardcode-ok: label positions
  const sources = v.sources;
  const srcTotal = Math.max(1, sources.reduce((n, r) => n + r.views, 0));
  const devTotal = Math.max(1, v.devices.reduce((n, r) => n + r.views, 0));
  const devTop = v.devices[0];
  const topPct = devTop ? Math.round((devTop.views / devTotal) * 100) : 0; // hardcode-ok: percent
  const tone = ['var(--lm-ac)', 'var(--lm-info)', 'var(--lm-ok)'];
  let acc = 0;
  const donut = v.devices.length
    ? `conic-gradient(${v.devices.slice(0, 3).map((r, i) => { const a = acc; acc += (r.views / devTotal) * 100; return `${tone[i]} ${a}% ${acc}%`; }).join(', ')}, var(--lm-chip) ${acc}% 100%)`
    : 'var(--lm-chip)';
  const dTotal = Math.max(1, v.districts.reduce((n, r) => n + r.orders, 0));
  const rangeHref = (r: string) => `/admin/website/analytics?range=${r}`;
  return (
    <>
      <div className="va-bar a2-mt12">
        <span className="a2-xs a2-mute grow" />
        <nav className="va-seg" aria-label={c('range.label')} data-testid="va-range">
          {RANGES.map((r) => (
            <Link key={r} href={rangeHref(r)} aria-current={p.range === r ? 'true' : undefined} className={p.range === r ? 'on' : undefined}>
              {c(`range.${r}`)}
            </Link>
          ))}
        </nav>
      </div>
      {!v.cfg.collect ? <p className="a2-sm a2-mt12" data-testid="va-off">{c('off')}</p> : null}
      <div className="va-ai a2-mt12" role="note" data-testid="va-summary">
        <b>{c('ai.head')}</b> · {dv === null ? c('ai.none') : c(dv >= 0 ? 'ai.up' : 'ai.down', { n: nf.format(Math.abs(Math.round(dv))) })} {v.totals.conversionPct === null ? '' : c('ai.conv', { n: nf.format(v.totals.conversionPct) })}
      </div>
      <div className="va-kpis a2-mt12" data-testid="va-kpi">
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.visitors')}</div><b className="va-n">{nf.format(v.totals.visitors)}</b>{delta(dv)}</div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.sessions')}</div><b className="va-n">{nf.format(v.totals.sessions)}</b>{delta(ds)}</div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.live')}</div><b className="va-n" data-testid="va-live">{nf.format(v.live.now)}</b><div className="a2-xs a2-mute">{c('kpi.liveSub', { n: v.live.windowMinutes })}</div></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.newReturning')}</div><b className="va-n">{v.newPct === null ? c('kpi.none') : `${nf.format(v.newPct)} / ${nf.format(100 - v.newPct)}`}</b><div className="a2-xs a2-mute">{c('kpi.percent')}</div></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.conv')}</div><b className="va-n">{v.totals.conversionPct === null ? c('kpi.none') : `${nf.format(v.totals.conversionPct)}%`}</b>{delta(dc)}<span className="a2-xs a2-mute"> {c('kpi.ordersSub', { n: nf.format(v.totals.orders) })}</span></div>
      </div>
      <section className="a2-card a2-mt12" aria-labelledby={`${id}-c`} data-testid="va-chart">
        <h2 className="a2-h3" id={`${id}-c`}>{c('chart.perDay')}</h2>
        <div className="va-leg a2-xs a2-mute"><span><i className="a" /> {c('chart.thisPeriod')}</span><span><i className="b" /> {c('chart.before')}</span></div>
        <svg className="va-svg" viewBox={`0 0 ${W2} ${H2}`} preserveAspectRatio="none" role="img" aria-label={c('chart.perDay')}>
          {v.days.length ? <polygon points={`0,${H2} ${line(v.days)} ${W2},${H2}`} fill="var(--lm-acbg)" /> : null}
          {v.prev && v.prev.days.length ? <polyline points={line(v.prev.days)} fill="none" stroke="var(--lm-ink2)" strokeWidth="2" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" /> : null}
          <polyline points={line(v.days)} fill="none" stroke="var(--lm-ac)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="va-x a2-xs a2-mute">{ticks.map((d, i) => <span key={`${d}-${i}`}>{dayName(d)}</span>)}</div>
        {v.days[peak] && v.days[peak]!.visitors > 0 ? <p className="a2-xs a2-mute">{c('chart.peak', { n: nf.format(v.days[peak]!.visitors), day: dayName(v.days[peak]!.day) })}</p> : null}
      </section>
      <div className="va-3 a2-mt12">
        <section className="a2-card" aria-label={c('lists.sources')} data-testid="va-sources">
          <h2 className="a2-h3">{c('lists.sourcesShort')}</h2>
          {sources.length ? sources.map((r) => (
            <div key={r.key} className="a2-mt6">
              <div className="s28-row between"><span>{label('sources', r.key)}</span><b>{nf.format(r.views)} · {Math.round((r.views / srcTotal) * 100)}%</b></div>
              <div className="s28-bar" style={{ color: 'var(--lm-ac)' }}><i style={{ width: `${Math.round((r.views / srcTotal) * 100)}%` }} /></div>
            </div>
          )) : <p className="a2-sm a2-mute a2-mt6">{c('lists.empty')}</p>}
        </section>
        <section className="a2-card" aria-label={c('lists.devices')} data-testid="va-devices">
          <h2 className="a2-h3">{c('lists.devices')}</h2>
          {v.devices.length ? (
            <div className="va-dev">
              <div className="va-donut" style={{ background: donut }} role="img" aria-label={`${topPct}%`}><span>{topPct}%</span></div>
              <ul>{v.devices.slice(0, 3).map((r, i) => <li key={r.key}><i style={{ background: tone[i] }} /> {label('devices', r.key)} <b>{Math.round((r.views / devTotal) * 100)}%</b></li>)}</ul>
            </div>
          ) : <p className="a2-sm a2-mute a2-mt6">{c('lists.empty')}</p>}
        </section>
        <section className="a2-card" aria-label={c('lists.districts')} data-testid="va-districts">
          <h2 className="a2-h3">{c('lists.districts')}</h2>
          {v.districts.length ? v.districts.map((r) => (
            <div key={r.name} className="a2-mt6">
              <div className="s28-row between"><span>{p.locale.startsWith('bn') && r.nameBn ? r.nameBn : r.name}</span><b>{Math.round((r.orders / dTotal) * 100)}%</b></div>
              <div className="s28-bar" style={{ color: 'var(--lm-ac)' }}><i style={{ width: `${Math.round((r.orders / dTotal) * 100)}%` }} /></div>
            </div>
          )) : <p className="a2-sm a2-mute a2-mt6">{c('lists.empty')}</p>}
        </section>
      </div>
      <section className="a2-card a2-mt12" aria-label={c('lists.paths')} data-testid="va-paths">
        <h2 className="a2-h3">{c('lists.paths')}</h2>
        {v.paths.length ? (
          <div className="a2-tblw">
            <table className="a2-tbl">
              <thead><tr><th>{c('top.page')}</th><th className="r">{c('top.views')}</th><th className="r">{c('top.avg')}</th><th className="r">{c('top.orders')}</th></tr></thead>
              <tbody>{v.paths.map((r) => <tr key={r.key}><td><b>{r.key}</b></td><td className="r a2-num">{nf.format(r.views)}</td><td className="r a2-num">—</td><td className="r a2-num">—</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="a2-sm a2-mute a2-mt6">{c('lists.empty')}</p>}
      </section>
      {p.canEdit ? (
        <section className="a2-card a2-mt12" data-testid="va-settings">
          <h2 className="a2-h3">{c('settings.title')}</h2>
          <label className="a2-chkl s28-row a2-mt6"><input type="checkbox" checked={collect} onChange={(e) => setCollect(e.target.checked)} data-testid="va-collect" /> {c('settings.collect')}</label>
          <p className="a2-xs a2-mute">{c('settings.privacy')}</p>
          <div className="s28-row a2-mt6">
            <label>{c('settings.keep')}<input className="a2-inp" inputMode="numeric" value={keep} style={{ width: 90 }} onChange={(e) => setKeep(e.target.value)} /></label>
            <label>{c('settings.live')}<input className="a2-inp" inputMode="numeric" value={live} style={{ width: 90 }} onChange={(e) => setLive(e.target.value)} /></label>
            <label>{c('settings.top')}<input className="a2-inp" inputMode="numeric" value={top} style={{ width: 90 }} onChange={(e) => setTop(e.target.value)} /></label>
          </div>
          <div className="s28-row a2-mt12">
            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pin} placeholder={c('settings.pin')} aria-label={c('settings.pin')} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 160 }} />
            <button type="button" className="a2-btn" disabled={busy || !pin.trim()} onClick={save} data-testid="va-save">{c('settings.save')}</button>
          </div>
          {said ? <p className={`a2-sm a2-mt6 ${said.bad ? 's28-bad' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'}>{said.text}</p> : null}
        </section>
      ) : null}
    </>
  );
}
