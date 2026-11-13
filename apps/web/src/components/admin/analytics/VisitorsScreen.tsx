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
}

const SPANS = [7, 30, 90]; // hardcode-ok: the choices of the range buttons, not business numbers

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
  const max = Math.max(1, ...v.days.map((d) => d.views));
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
  const list = (title: string, dim: 'sources' | 'pages' | 'paths' | 'devices' | 'regions', hint?: string) => {
    const rows = v[dim];
    const total = Math.max(1, rows.reduce((n, r) => n + r.views, 0));
    return (
      <section className="a2-card" aria-label={title} data-testid={`va-${dim}`}>
        <h2 className="a2-h3">{title}</h2>
        {rows.length ? (
          <div className="s28-list a2-mt6">
            {rows.map((r) => (
              <div key={r.key} className="a2-mt6">
                <div className="s28-row between"><span>{dim === 'paths' || dim === 'regions' ? r.key : label(dim, r.key)}</span><b>{c('lists.views', { n: r.views })}</b></div>
                <div className="s28-bar"><i style={{ width: `${Math.round((r.views / total) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{c('lists.empty')} {hint ?? ''}</p>
        )}
      </section>
    );
  };
  return (
    <>
      <div className="s28-row a2-mt12" role="tablist">
        <span className="s28-chip" aria-current="page">{c('tabs.overview')}</span>
        {p.canBehaviour ? <Link className="s28-chip" href="/admin/website/analytics/behaviour">{c('tabs.behaviour')}</Link> : null}
        <span className="a2-xs a2-mute grow" />
        <span className="a2-xs a2-mute">{c('range.label')}</span>
        {SPANS.map((n) => (
          <Link key={n} className="s28-chip" href={`/admin/website/analytics?days=${n}`} aria-current={p.span === n ? 'true' : undefined} style={p.span === n ? { fontWeight: 700 } : undefined}>{c('range.days', { n })}</Link>
        ))}
      </div>
      {!v.cfg.collect ? <p className="a2-sm a2-mt12" data-testid="va-off">{c('off')}</p> : null}
      <div className="s28-grid" data-testid="va-kpi">
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.visitors')}</div><b className="a2-h3">{v.totals.visitors}</b></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.sessions')}</div><b className="a2-h3">{v.totals.sessions}</b></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.views')}</div><b className="a2-h3">{v.totals.views}</b></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.orders')}</div><b className="a2-h3">{v.totals.orders}</b></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.conv')}</div><b className="a2-h3">{v.totals.conversionPct === null ? c('kpi.none') : `${v.totals.conversionPct}%`}</b></div>
        <div className="a2-card"><div className="a2-xs a2-mute">{c('kpi.live')}</div><b className="a2-h3" data-testid="va-live">{v.live.now}</b><div className="a2-xs a2-mute">{c('kpi.liveSub', { n: v.live.windowMinutes })}</div></div>
      </div>
      <section className="a2-card a2-mt12" aria-labelledby={`${id}-c`} data-testid="va-chart">
        <h2 className="a2-h3" id={`${id}-c`}>{c('chart.title')}</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, marginTop: 8 }} role="img" aria-label={c('chart.title')}>
          {v.days.map((d) => (
            <div key={d.day} title={`${d.day}: ${c('chart.views')} ${d.views}, ${c('chart.visitors')} ${d.visitors}`} style={{ flex: 1, minWidth: 2, height: `${Math.max(2, Math.round((d.views / max) * 100))}%`, background: 'var(--lm-chip)', borderTop: '2px solid currentColor' }} />
          ))}
        </div>
        <div className="s28-row between a2-xs a2-mute"><span>{v.from}</span><span>{v.to}</span></div>
      </section>
      <div className="s28-grid">
        {list(c('lists.sources'), 'sources')}
        {list(c('lists.pages'), 'pages')}
        {list(c('lists.paths'), 'paths')}
        {list(c('lists.devices'), 'devices')}
        {list(c('lists.regions'), 'regions', c('lists.regionHint'))}
      </div>
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
