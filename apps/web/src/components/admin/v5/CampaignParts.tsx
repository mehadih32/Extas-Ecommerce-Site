'use client';
// S28 · PR 697 — Marketing › Message campaigns: the test send (one template to the person's own phone or e-mail).
import { useState } from 'react';
import { call } from '../api';
import { errWords, Msg } from './Parts';
import { t, type Dict } from '@/lib/i18n';

export function TestSend({ dict, templates }: { dict: Dict; templates: { id: string; label: string }[] }) {
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `w5a.camp.${k}`, v);
  const [id, setId] = useState(templates[0]?.id ?? '');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!templates.length) return <p className="a2-sm a2-mute">{c('noTemplates')}</p>;
  async function go() {
    setBusy(true);
    const a = await call('POST', '/api/admin/marketing/message-campaigns/test', { templateId: id, to });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    const r = a.data.result as { ok: boolean; reason?: string; mode?: string | null };
    if (!r.ok) return setMsg({ ok: false, text: t(dict, `w5a.err.${r.reason}`) === `w5a.err.${r.reason}` ? t(dict, 'w5a.err.default') : t(dict, `w5a.err.${r.reason}`) });
    setMsg({ ok: true, text: r.mode === 'MOCK' ? c('testOk') : c('testOkLive') });
  }
  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="camp-test">
      <span className="a2-xs a2-mute">{c('testHint')}</span>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fTemplate')}</span>
        <select className="a2-inp" value={id} onChange={(e) => setId(e.target.value)} style={{ maxWidth: 360 }} data-testid="camp-test-template">
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fTo')}</span>
        <input className="a2-inp" value={to} maxLength={120} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 320 }} data-testid="camp-test-to" />
      </label>
      <div className="a2-gap8" style={{ alignItems: 'center' }}>
        <button type="button" className="a2-btn sm" disabled={busy || !to.trim()} onClick={go} data-testid="camp-test-go">
          {c('testGo')}
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}
