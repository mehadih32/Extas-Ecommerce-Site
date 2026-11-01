'use client';
// S16 · PR 352 — the badge settings on Reports → Team: on/off, the period (the week Saturday to Friday, or the month),
// the "most in each" badge and a minimum per measure (empty = none; none as shipped). Saving asks once more ("Save" →
// "Yes, save") and sends the version it was read at. Without `staff.performance` it is read-only. Recognition only.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { TeamBadgesSettings } from '@extas/settings';
import { call } from '../api';

const MEASURES = ['confirmed', 'packed', 'handedOver', 'replies'] as const;

export function TeamBadgesCard(p: { dict: Dict; value: TeamBadgesSettings; version: number; canEdit: boolean }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `reportsTeam.${k}`, vars);
  const [v, setV] = useState(p.value);
  const [mins, setMins] = useState<Record<string, string>>(Object.fromEntries(MEASURES.map((m) => [m, p.value.mins[m] === null ? '' : String(p.value.mins[m])])));
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const off = !p.canEdit || busy;
  const sw = (on: boolean, label: string, flip: () => void, testId: string) => (
    <div className="a2-swl">
      <span id={`${id}-${testId}`}>{label}</span>
      <button type="button" className={`a2-sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-labelledby={`${id}-${testId}`} disabled={off} onClick={flip} data-testid={testId} />
    </div>
  );

  async function save() {
    const out: Record<string, number | null> = {};
    for (const m of MEASURES) {
      const text = (mins[m] ?? '').trim();
      const n = Number(text);
      if (text && (!Number.isInteger(n) || n < 1)) return setSaid({ text: c('card.bad'), bad: true });
      out[m] = text ? n : null;
    }
    if (!sure) return setSure(true);
    setSure(false);
    setBusy(true);
    const a = await call('PUT', '/api/admin/reports/team', { value: { ...v, mins: out }, version: p.version });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: c('card.saved'), bad: false });
      return router.refresh();
    }
    const k = `reportsTeam.card.err.${a.status === 0 ? 'network' : String(a.data.error ?? 'other')}`;
    setSaid({ text: t(p.dict, k) === k ? c('card.err.other') : t(p.dict, k), bad: true });
  }

  return (
    <section className="a2-card a2-mt12" aria-labelledby={`${id}-t`} data-testid="team-settings">
      <h2 className="a2-h3" id={`${id}-t`}>
        {c('card.title')}
      </h2>
      <p className="a2-cs">{c('card.sub')}</p>
      <div className="a2-mt12">
        {sw(v.enabled, c('card.on'), () => setV({ ...v, enabled: !v.enabled }), 'team-on')}
        {sw(v.top, c('card.top'), () => setV({ ...v, top: !v.top }), 'team-top')}
      </div>
      <div className="ct-grid a2-mt12">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-p`}>
            {c('card.period')}
          </label>
          <select id={`${id}-p`} className="a2-sel" value={v.period} disabled={off} onChange={(e) => setV({ ...v, period: e.target.value as TeamBadgesSettings['period'] })} data-testid="team-period">
            <option value="week">{c('card.week')}</option>
            <option value="month">{c('card.month')}</option>
          </select>
        </div>
        {MEASURES.map((m) => (
          <div key={m} className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-${m}`}>
              {c('card.min', { measure: c(`m.${m}`) })}
            </label>
            <input id={`${id}-${m}`} className="a2-inp" inputMode="numeric" value={mins[m] ?? ''} disabled={off} onChange={(e) => setMins({ ...mins, [m]: e.target.value })} data-testid={`team-min-${m}`} />
          </div>
        ))}
      </div>
      {p.canEdit ? (
        <div className="ct-actions a2-mt12">
          <button type="button" className={`a2-btn ${sure ? 'pri' : ''}`} disabled={busy} onClick={() => void save()} data-testid="team-save">
            {sure ? c('card.confirm') : c('card.save')}
          </button>
        </div>
      ) : (
        <p className="a2-xs a2-mute a2-mt12">{c('card.readOnly')}</p>
      )}
      {said ? (
        <p className={`a2-sm a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="team-said">
          {said.text}
        </p>
      ) : null}
    </section>
  );
}
