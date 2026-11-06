'use client';
// S02 · PR 600 — Website › More › On-page edit, in the Lumen look: the switch (off as shipped), "Open the shop", the
// phone options (light version on a phone, "Apply to phone too?", which phone checks run), and under "More options" the
// tap sizes, the wait per phone preview and the phone screens checked (name, width, height; add, remove one, back to
// the shipped list). Then the on-page publishes (undo is on Launch default or the bar). Save sends everything at once
// (PUT /api/admin/website/page-edit-settings, `website.layout.write`; the API checks again).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { PageEdit, PageEditPhone } from '@extas/settings';
import { showToast } from '@/components/admin/lumen/Toast';
import type { PageEditSettingsView } from '@/lib/website/page-edit-settings';

const API = '/api/admin/website/page-edit-settings';
const CHECKS = ['sideways', 'cut', 'taps', 'buyFold'] as const;
const OPTIONS = ['phoneLight', 'askPhone'] as const;

type Dict = { [k: string]: string | Dict };

export function PageEditSettings(p: { view: PageEditSettingsView; shipped: PageEdit['phones']; canEdit: boolean; lang: 'en' | 'bn'; tz: string; w: Dict }) {
  const router = useRouter();
  const uid = useId();
  const g = (k: string, vars: Record<string, string | number> = {}): string => {
    const v = k.split('.').reduce<string | Dict | undefined>((o, part) => (o && typeof o === 'object' ? o[part] : undefined), p.w);
    return typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (m, x: string) => (x in vars ? String(vars[x]) : m)) : k;
  };
  const [cfg, setCfg] = useState<PageEdit>(p.view.cfg);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(p.view.cfg);
  const fmt = (iso: string) => new Intl.DateTimeFormat(p.lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: p.tz }).format(new Date(iso));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cfg, version: p.view.version }) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string };
      if (data.ok) {
        showToast({ text: g('saved'), tone: 'ok' });
        router.refresh();
      } else {
        const code = data.error ?? (res.status === 403 ? 'forbidden' : 'other');
        if (code === 'STALE') router.refresh();
        showToast({ text: g(`err.${code}`) === `err.${code}` ? g('err.other') : g(`err.${code}`), tone: 'bad' });
      }
    } catch {
      showToast({ text: g('err.network'), tone: 'bad' });
    }
    setBusy(false);
  };

  const sw = (label: string, on: boolean, set: (v: boolean) => void, test: string, hint?: string) => (
    <div className="lm-setr" key={test}>
      <div>
        <h3 id={`${uid}-${test}`}>{label}</h3>
        {hint ? <p>{hint}</p> : null}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={`${uid}-${test}`} className={`lm-sw${on ? ' on' : ''}`} disabled={!p.canEdit} onClick={() => set(!on)} data-testid={`pe-${test}`}>
        <span aria-hidden="true" />
      </button>
    </div>
  );
  const int = (label: string, value: number, min: number, max: number, set: (v: number) => void, id: string) => (
    <div className="lm-fl" key={id}>
      <label htmlFor={`${uid}-${id}`}>{label}</label>
      <input id={`${uid}-${id}`} className="lm-inp" type="number" inputMode="numeric" step={1} min={min} max={max} value={value} disabled={!p.canEdit} onChange={(e) => set(Math.min(max, Math.max(min, Math.round(Number(e.target.value) || min))))} data-testid={`pe-${id}`} />
    </div>
  );
  const setPhone = (i: number, q: Partial<PageEditPhone>) => setCfg({ ...cfg, phones: cfg.phones.map((x, j) => (j === i ? { ...x, ...q } : x)) });

  return (
    <div className="pex" data-testid="pe-editor">
      <section className="lm-setc" aria-labelledby={`${uid}-enabled`}>
        {sw(g('master.title'), cfg.enabled, (v) => setCfg({ ...cfg, enabled: v }), 'enabled', cfg.enabled ? g('master.on') : g('master.off'))}
        <p className="lm-hint">{g('master.who')}</p>
        <p className="pex-open">
          <a className="lm-btn" href="/" target="_blank" rel="noopener" data-testid="pe-open">
            {g('open')}
          </a>
        </p>
      </section>

      <section className="lm-card pex-card" aria-labelledby={`${uid}-ph`}>
        <h2 id={`${uid}-ph`}>{g('phone.title')}</h2>
        <p className="lm-sub">{g('phone.sub')}</p>
        {OPTIONS.map((k) => sw(g(`phone.${k}`), cfg[k], (v) => setCfg({ ...cfg, [k]: v }), k, g(`phone.${k}Hint`)))}
        <h3 className="pex-h3">{g('checks.title')}</h3>
        {CHECKS.map((k) => sw(g(`checks.${k}`), cfg.checks[k], (v) => setCfg({ ...cfg, checks: { ...cfg.checks, [k]: v } }), `check-${k}`))}
        <p className="lm-hint">{g('checks.farm')}</p>
        <details className="a2-more-opts pex-more" data-testid="pe-more">
          <summary>{g('more.title')}</summary>
          <p className="lm-hint">{g('more.sub')}</p>
          <div className="lm-fold">
            {int(g('more.tapMinPx'), cfg.tapMinPx, 24, 96, (v) => setCfg({ ...cfg, tapMinPx: v }), 'tapMinPx')}
            {int(g('more.inlineLinkMinPx'), cfg.inlineLinkMinPx, 16, 96, (v) => setCfg({ ...cfg, inlineLinkMinPx: v }), 'inlineLinkMinPx')}
            {int(g('more.waitMs'), cfg.waitMs, 2000, 60000, (v) => setCfg({ ...cfg, waitMs: v }), 'waitMs')}
          </div>
          <h3 className="pex-h3">{g('more.phones')}</h3>
          <ul className="pex-phones">
            {cfg.phones.map((ph, i) => (
              <li key={i} className="pex-phone" data-testid="pe-phone">
                <div className="lm-fl pex-name">
                  <label htmlFor={`${uid}-pn-${i}`}>{g('more.name')}</label>
                  <input id={`${uid}-pn-${i}`} className="lm-inp" value={ph.name} maxLength={60} disabled={!p.canEdit} onChange={(e) => setPhone(i, { name: e.target.value })} />
                </div>
                {int(g('more.w'), ph.w, 280, 600, (v) => setPhone(i, { w: v }), `pw-${i}`)}
                {int(g('more.h'), ph.h, 480, 1400, (v) => setPhone(i, { h: v }), `ph-${i}`)}
                {p.canEdit && cfg.phones.length > 1 ? (
                  <button type="button" className="lm-btn gh" onClick={() => setCfg({ ...cfg, phones: cfg.phones.filter((_, j) => j !== i) })} aria-label={g('more.removeOne', { name: ph.name })}>
                    {g('more.remove')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {p.canEdit ? (
            <div className="pex-bar">
              <button type="button" className="lm-btn" disabled={cfg.phones.length >= 15} onClick={() => setCfg({ ...cfg, phones: [...cfg.phones, { name: g('more.newPhone'), w: 360, h: 800 }] })} data-testid="pe-add-phone">
                {g('more.add')}
              </button>
              <button type="button" className="lm-btn gh" onClick={() => setCfg({ ...cfg, phones: p.shipped })}>
                {g('more.reset')}
              </button>
            </div>
          ) : null}
        </details>
      </section>

      <section className="lm-card pex-card" aria-labelledby={`${uid}-log`}>
        <h2 id={`${uid}-log`}>{g('log.title')}</h2>
        <p className="lm-sub">{g('log.sub')}</p>
        {p.view.drafts ? <p className="lm-hint">{g('log.drafts', { n: p.view.drafts })}</p> : null}
        {p.view.log.length ? (
          <ul className="pex-log" data-testid="pe-log">
            {p.view.log.map((r) => (
              <li key={r.id}>
                <b>{fmt(r.at)}</b> · {r.by ?? g('log.someone')}
                {r.undone ? <span className="lm-hint"> · {g('log.undone')}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="lm-hint">{g('log.empty')}</p>
        )}
        <p>
          <Link className="pex-link" href="/admin/website/launch-default">
            {g('log.undoWhere')}
          </Link>
        </p>
      </section>

      {p.canEdit && (dirty || busy) ? (
        <div className="pex-save">
          <p className="lm-hint" role="status">
            {g('unsaved')}
          </p>
          <div className="pex-bar">
            <button type="button" className="lm-btn pri" disabled={busy || !dirty} onClick={() => void save()} data-testid="pe-save">
              {busy ? g('saving') : g('save')}
            </button>
            <button type="button" className="lm-btn" disabled={busy} onClick={() => setCfg(p.view.cfg)}>
              {g('discard')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
