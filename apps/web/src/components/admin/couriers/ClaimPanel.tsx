'use client';
// S28 · PR 673 — Courier 360 › Claims: "New claim" for what the parcel's records cannot show (the courier handed in less
// than the parcel collected, a returned parcel came back short, or another cause). The amount is typed, in taka. One
// request key per form, so a double tap is one claim. A refusal is shown in words from `courierReport.err.<code>`.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { errWords } from '@/components/admin/courier-report/Parts';
import { showToast } from '@/components/admin/lumen/Toast';
import { t, type Dict } from '@/lib/i18n';

const API = '/api/admin/delivery/claims';
export const TYPED_KINDS = ['SHORT_COD', 'RETURN_SHORT', 'OTHER'] as const;

export interface ClaimParcel {
  id: string;
  label: string;
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const toMinor = (taka: string): number | null => {
  const n = Number(taka.replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export function RaiseClaim({ dict, parcels }: { dict: Dict; parcels: ClaimParcel[] }) {
  const router = useRouter();
  const id = useId();
  const key = useRef(newKey());
  const [open, setOpen] = useState(false);
  const [parcel, setParcel] = useState(parcels[0]?.id ?? '');
  const [kind, setKind] = useState<(typeof TYPED_KINDS)[number]>('SHORT_COD');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const c = (k: string) => t(dict, `cr.k.${k}`);
  const go = async () => {
    const minor = toMinor(amount);
    if (!parcel || minor === null || note.trim().length < 3) return setMsg(c('check'));
    setBusy(true);
    setMsg(null);
    let a: { status: number; data: Record<string, unknown> & { ok?: boolean; error?: string; details?: string[] } };
    try {
      const res = await fetch(API, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'idempotency-key': key.current },
        body: JSON.stringify({ shipmentId: parcel, kind, amountMinor: minor, note: note.trim() }),
      });
      a = { status: res.status, data: (await res.json().catch(() => ({ ok: false, error: 'default' }))) as typeof a.data };
    } catch {
      a = { status: 0, data: { ok: false, error: 'network' } };
    }
    setBusy(false);
    if (!a.data.ok) {
      if (a.status !== 0) key.current = newKey();
      return setMsg(errWords(dict, a));
    }
    key.current = newKey();
    setAmount('');
    setNote('');
    setOpen(false);
    showToast({ text: c('raised'), tone: 'ok' });
    router.refresh();
  };
  if (!parcels.length) return <p className="a2-xs a2-mute a2-mt6">{c('noParcels')}</p>;
  if (!open)
    return (
      <button type="button" className="a2-btn sm a2-mt6" onClick={() => setOpen(true)} data-testid="claim-new">
        {c('new')}
      </button>
    );
  return (
    <form
      className="a2-stack a2-mt6"
      style={{ gap: 6, maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault();
        void go();
      }}
      data-testid="claim-new-form"
    >
      <label className="a2-xs a2-mute" htmlFor={`${id}-kind`}>
        {c('kind')}
      </label>
      <select id={`${id}-kind`} className="a2-input" value={kind} onChange={(e) => setKind(e.target.value as (typeof TYPED_KINDS)[number])}>
        {TYPED_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(dict, `courierReport.claims.kind.${k}`)}
          </option>
        ))}
      </select>
      <label className="a2-xs a2-mute" htmlFor={`${id}-parcel`}>
        {c('parcel')}
      </label>
      <select id={`${id}-parcel`} className="a2-input" value={parcel} onChange={(e) => setParcel(e.target.value)}>
        {parcels.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <label className="a2-xs a2-mute" htmlFor={`${id}-amount`}>
        {c('amount')}
      </label>
      <input id={`${id}-amount`} className="a2-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label className="a2-xs a2-mute" htmlFor={`${id}-note`}>
        {c('note')}
      </label>
      <input id={`${id}-note`} className="a2-input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      <div className="a2-gap8">
        <button type="submit" className="a2-btn sm pri" disabled={busy}>
          {c('raise')}
        </button>
        <button type="button" className="a2-btn sm ghost" onClick={() => setOpen(false)}>
          {c('cancel')}
        </button>
      </div>
      {msg ? (
        <span className="a2-xs" role="alert" style={{ color: 'var(--bad)' }}>
          {msg}
        </span>
      ) : null}
    </form>
  );
}
