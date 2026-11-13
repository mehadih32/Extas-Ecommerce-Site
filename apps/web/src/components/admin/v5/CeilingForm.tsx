'use client';
// S28 · PR 698 — the owner's cost ceilings: the two monthly ceilings (typed in the shop's money, blank = none), the warning
// share, the cheapest-channel switch and the on/off switch, saved together with the value the page read (a stale save is
// refused: STALE). The setting keeps minor units; the form shows whole money.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { errWords, Msg } from './Parts';
import { t, type Dict } from '@/lib/i18n';

interface Value {
  enabled: boolean;
  smsMonthlyMinor: number | null;
  whatsappMonthlyMinor: number | null;
  warnPct: number;
  fallbackToCheapest: boolean;
}

export function CeilingForm({ dict, before, currency, unit }: { dict: Dict; before: Value; currency: string; unit: number }) {
  const router = useRouter();
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `w5a.ceil.${k}`, v);
  const show = (m: number | null) => (m === null ? '' : String(m / unit));
  const [f, setF] = useState({ enabled: before.enabled, sms: show(before.smsMonthlyMinor), wa: show(before.whatsappMonthlyMinor), warn: String(before.warnPct), cheap: before.fallbackToCheapest });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const minor = (s: string): number | null | undefined => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * unit) : undefined;
  };
  async function save() {
    const sms = minor(f.sms);
    const wa = minor(f.wa);
    const warn = Number(f.warn);
    if (sms === undefined || wa === undefined || !Number.isInteger(warn) || warn < 1 || warn > 100) return setMsg({ ok: false, text: t(dict, 'w5a.err.INVALID_INPUT', { fields: '' }) });
    setBusy(true);
    const a = await call('POST', '/api/admin/messages/cost-ceiling/settings', { before, value: { enabled: f.enabled, smsMonthlyMinor: sms, whatsappMonthlyMinor: wa, warnPct: warn, fallbackToCheapest: f.cheap } });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    setMsg({ ok: true, text: c('saved') });
    router.refresh();
  }
  return (
    <div className="a2-stack" style={{ gap: 12 }} data-testid="ceiling-form">
      <span className="a2-xs a2-mute">{c('unit', { c: currency })}</span>
      <label className="a2-chkl a2-gap8">
        <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} data-testid="ceiling-enabled" />
        <span className="a2-sm">{c('fEnabled')}</span>
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fSms')}</span>
        <input className="a2-inp" type="number" inputMode="decimal" min={0} value={f.sms} onChange={(e) => setF({ ...f, sms: e.target.value })} style={{ maxWidth: 200 }} data-testid="ceiling-sms" />
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fWa')}</span>
        <input className="a2-inp" type="number" inputMode="decimal" min={0} value={f.wa} onChange={(e) => setF({ ...f, wa: e.target.value })} style={{ maxWidth: 200 }} data-testid="ceiling-wa" />
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fWarn')}</span>
        <input className="a2-inp" type="number" inputMode="numeric" min={1} max={100} value={f.warn} onChange={(e) => setF({ ...f, warn: e.target.value })} style={{ maxWidth: 120 }} data-testid="ceiling-warn" />
      </label>
      <label className="a2-chkl a2-gap8">
        <input type="checkbox" checked={f.cheap} onChange={(e) => setF({ ...f, cheap: e.target.checked })} data-testid="ceiling-cheap" />
        <span className="a2-sm">{c('fCheapest')}</span>
      </label>
      <div className="a2-gap8" style={{ alignItems: 'center' }}>
        <button type="button" className="a2-btn pri sm" disabled={busy} onClick={save} data-testid="ceiling-save">
          {c('save')}
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}
