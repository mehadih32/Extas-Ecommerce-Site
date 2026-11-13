'use client';
// S28 · PR 695 — Influencers & affiliates: add a partner, pause / resume / archive, and Pay (off until the owner says so) and
// the ledger's Reverse. Refusals are words from `w5a.err.*`.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';
import { errWords, Msg } from './Parts';
import { t, type Dict } from '@/lib/i18n';

const API = '/api/admin/marketing/affiliates';
const PLATFORMS = ['YouTube', 'Instagram', 'TikTok', 'Facebook', 'Other'] as const;

export function AddPartner({ dict, coupons, defaultPct }: { dict: Dict; coupons: { id: string; code: string }[]; defaultPct: number }) {
  const router = useRouter();
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `w5a.aff.${k}`, v);
  const [f, setF] = useState({ name: '', handle: '', platform: 'Instagram', code: '', couponId: '', pct: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function go() {
    setBusy(true);
    const a = await call('POST', `${API}/add`, { name: f.name, ...(f.handle ? { handle: f.handle } : {}), platform: f.platform, code: f.code, ...(f.couponId ? { couponId: f.couponId } : {}), ...(f.pct ? { commissionPct: Number(f.pct) } : {}) });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    setF({ name: '', handle: '', platform: 'Instagram', code: '', couponId: '', pct: '' });
    setMsg(null);
    router.refresh();
  }
  const pick = (code: string, id: string) => setF((x) => ({ ...x, couponId: id, code: id ? code : x.code }));
  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="aff-add">
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fName')}</span>
        <input className="a2-inp" value={f.name} maxLength={120} onChange={set('name')} data-testid="aff-name" />
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fHandle')}</span>
        <input className="a2-inp" value={f.handle} maxLength={200} onChange={set('handle')} />
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fPlatform')}</span>
        <select className="a2-inp" value={f.platform} onChange={set('platform')} style={{ maxWidth: 220 }}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fCoupon')}</span>
        <select className="a2-inp" value={f.couponId} onChange={(e) => pick(coupons.find((x) => x.id === e.target.value)?.code ?? '', e.target.value)} style={{ maxWidth: 260 }} data-testid="aff-coupon">
          <option value="">{c('fCouponNone')}</option>
          {coupons.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code}
            </option>
          ))}
        </select>
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fCode')}</span>
        <input className="a2-inp a2-mono" value={f.code} maxLength={20} onChange={set('code')} style={{ maxWidth: 220 }} data-testid="aff-code" />
      </label>
      <label className="a2-stack" style={{ gap: 4 }}>
        <span className="a2-sm">{c('fPct', { pct: defaultPct })}</span>
        <input className="a2-inp" type="number" inputMode="decimal" min={0} max={100} step={0.5} value={f.pct} onChange={set('pct')} style={{ maxWidth: 120 }} />
      </label>
      <div className="a2-gap8" style={{ alignItems: 'center' }}>
        <button type="button" className="a2-btn pri sm" disabled={busy} onClick={go} data-testid="aff-create">
          {c('create')}
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}

export function PartnerActions({ dict, id, name, status, dueMinor, dueText, payoutsOn, canPay }: { dict: Dict; id: string; name: string; status: string; dueMinor: number; dueText: string; payoutsOn: boolean; canPay: boolean }) {
  const router = useRouter();
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `w5a.aff.${k}`, v);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(dueMinor / 100));
  const [how, setHow] = useState('bKash');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function status_(to: string) {
    const a = await call('POST', `${API}/status`, { id, status: to });
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    router.refresh();
  }
  async function pay() {
    const minor = Math.round(Number(amount) * 100);
    if (!Number.isFinite(minor) || minor <= 0) return setMsg({ ok: false, text: t(dict, 'w5a.err.INVALID_INPUT', { fields: 'amount' }) });
    if (!window.confirm(c('payConfirm', { name, amount: amount }))) return;
    const a = await call('POST', `${API}/pay`, { affiliateId: id, amountMinor: minor, method: how });
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    setOpen(false);
    router.refresh();
  }
  return (
    <div className="a2-stack" style={{ gap: 6, alignItems: 'flex-end' }}>
      <span className="a2-gap8" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button type="button" className="a2-btn sm" data-testid="aff-toggle" onClick={() => status_(status === 'ON' ? 'PAUSED' : 'ON')}>
          {status === 'ON' ? c('pause') : c('resume')}
        </button>
        <button type="button" className="a2-btn sm" onClick={() => status_('ARCHIVED')}>
          {c('archive')}
        </button>
        {canPay ? (
          <button type="button" className="a2-btn sm" disabled={!payoutsOn || dueMinor <= 0} onClick={() => setOpen((v) => !v)} data-testid="aff-pay" title={payoutsOn ? dueText : c('payOff')}>
            {c('pay')}
          </button>
        ) : null}
      </span>
      {open ? (
        <span className="a2-gap8" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input className="a2-inp" aria-label={c('payAmount')} type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 110 }} />
          <input className="a2-inp" aria-label={c('payMethod')} value={how} maxLength={40} onChange={(e) => setHow(e.target.value)} style={{ maxWidth: 130 }} />
          <button type="button" className="a2-btn pri sm" onClick={pay}>
            {c('payGo')}
          </button>
        </span>
      ) : null}
      <Msg m={msg} />
    </div>
  );
}

export function ReversePayout({ dict, id }: { dict: Dict; id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="a2-stack" style={{ gap: 4 }}>
      <button
        type="button"
        className="a2-btn sm"
        onClick={async () => {
          const a = await call('POST', `${API}/reverse`, { id });
          if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
          router.refresh();
        }}
      >
        {t(dict, 'w5a.aff.reverse')}
      </button>
      <Msg m={msg} />
    </span>
  );
}
