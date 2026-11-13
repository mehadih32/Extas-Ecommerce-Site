'use client';
// S28 · PR 690 (admin prototype v5) — Reports › Report packs: four ready packs (PDF on the letterhead, spreadsheet file) and, for
// each, "Send automatically" (weekly or monthly, a short Telegram summary to the owner; off as shipped). Words: messages/admin-
// reports-packs.*.json (`reportsPacks.*`). Read-only: nothing here moves money or sends to a buyer or supplier.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fileUrl } from '@/lib/report-file-links';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface PackSchedule {
  pack: string;
  frequency: 'weekly' | 'monthly';
  channels: string[];
  enabled: boolean;
  lastSentAt: string | null;
}

export function PacksScreen(p: { dict: Dict; packs: readonly string[]; schedules: PackSchedule[]; lang: string }) {
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `reportsPacks.${k}`, vars);
  const [rows, setRows] = useState(p.schedules);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const set = (pack: string, patch: Partial<PackSchedule>) => setRows(rows.map((r) => (r.pack === pack ? { ...r, ...patch } : r)));

  async function save(pack: string) {
    const r = rows.find((x) => x.pack === pack)!;
    setBusy(pack);
    const a = await call('POST', '/api/admin/reports/packs', { pack, frequency: r.frequency, channels: r.channels, enabled: r.enabled });
    setBusy(null);
    if (a.status === 200) {
      showToast({ text: c('schedule.saved'), tone: 'ok' });
      setSaid(null);
      return router.refresh();
    }
    const error = (a.data as { error?: string }).error;
    setSaid(a.status === 403 ? c('err.forbidden') : error === 'INVALID_INPUT' ? c('err.INVALID_INPUT') : c('err.other'));
  }
  const toggle = (r: PackSchedule, ch: string) => set(r.pack, { channels: r.channels.includes(ch) ? r.channels.filter((x) => x !== ch) : [...r.channels, ch] });

  return (
    <div className="w4-stack" data-testid="packs-screen">
      <p className="a2-note">{c('letterhead')}</p>
      {p.packs.map((id) => {
        const r = rows.find((x) => x.pack === id)!;
        return (
          <section key={id} className="a2-card" data-testid={`pack-${id}`}>
            <h2 className="a2-h3">{c(`packs.${id}.name`)}</h2>
            <p className="a2-cs">{c(`packs.${id}.d`)}</p>
            <div className="w4-row a2-mt12">
              <a className="a2-btn pri" href={fileUrl(id, 'pdf', null, p.lang)} target="_blank" rel="noreferrer" data-testid={`pack-pdf-${id}`}>
                {c('pdf')}
              </a>
              <a className="a2-btn" href={fileUrl(id, 'xlsx', null, p.lang)} data-testid={`pack-xlsx-${id}`}>
                {c('xlsx')}
              </a>
              <a className="a2-btn" href={fileUrl(id, 'csv', null, p.lang)} data-testid={`pack-csv-${id}`}>
                {c('csv')}
              </a>
            </div>
            <h3 className="a2-h4 a2-mt12">{c('schedule.title')}</h3>
            <p className="a2-xs a2-mute">{c('schedule.sub')}</p>
            <div className="w4-row a2-mt6">
              <label className="a2-sm">
                <input type="checkbox" checked={r.enabled} onChange={(e) => set(id, { enabled: e.target.checked })} data-testid={`pack-on-${id}`} /> {c('schedule.on')}
              </label>
              <label className="a2-sm">
                <span className="a2-xs a2-mute">{c('schedule.frequency')} </span>
                <select className="a2-inp" value={r.frequency} onChange={(e) => set(id, { frequency: e.target.value as 'weekly' | 'monthly' })}>
                  <option value="weekly">{c('schedule.weekly')}</option>
                  <option value="monthly">{c('schedule.monthly')}</option>
                </select>
              </label>
              {(['telegram', 'email'] as const).map((ch) => (
                <label key={ch} className="a2-sm">
                  <input type="checkbox" checked={r.channels.includes(ch)} onChange={() => toggle(r, ch)} /> {c(`schedule.${ch}`)}
                </label>
              ))}
              <button type="button" className="a2-btn" disabled={busy === id} onClick={() => save(id)} data-testid={`pack-save-${id}`}>
                {busy === id ? c('schedule.saving') : c('schedule.save')}
              </button>
            </div>
            <p className="a2-xs a2-mute a2-mt6">
              {r.lastSentAt ? c('schedule.last', { when: new Date(r.lastSentAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }) : c('schedule.never')}
            </p>
          </section>
        );
      })}
      {said ? (
        <p className="a2-sm bk-warn" role="alert">
          {said}
        </p>
      ) : null}
    </div>
  );
}
