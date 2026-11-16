'use client';
// PR 905 (prototype Customers › Loyalty & wallet, "Adjust points"): a button that opens a small form in place — find the
// customer (name or phone), type the points (+ to give, − to take away), the reason, and the owner's PIN — and sends one
// command (POST /api/admin/customers/points/adjust). The ledger only grows: a mistake is put right by another
// adjustment the other way. Every refusal is words from `cus.err.*`; the PIN is never kept or shown again.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import { cusError } from '@/lib/admin-customers/words';
import { t, type Dict } from '@/lib/i18n';

interface Found {
  id: string;
  name: string | null;
  phone: string | null;
}

const freshKey = () => `adj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function AdjustPoints({ dict }: { dict: Dict }) {
  const router = useRouter();
  const uid = useId();
  const key = useRef(freshKey());
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [who, setWho] = useState('');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const c = (k: string) => t(dict, `cus.loy.adj.${k}`);

  async function search() {
    setMsg(null);
    if (q.trim().length < 2) return setMsg(c('searchShort'));
    try {
      const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q.trim())}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = (await res.json()) as { ok?: boolean; rows?: { id: string; name: string | null; phone: { text?: string } | null }[] };
      const rows = (data.rows ?? []).map((r) => ({ id: r.id, name: r.name, phone: r.phone?.text ?? null }));
      setFound(rows);
      setWho(rows[0]?.id ?? '');
      if (!rows.length) setMsg(c('none'));
    } catch {
      setMsg(cusError(dict, undefined));
    }
  }

  async function send() {
    const n = Math.trunc(Number(points));
    if (!who) return setMsg(c('pickFirst'));
    if (!Number.isFinite(n) || n === 0) return setMsg(c('pointsBad'));
    if (note.trim().length < 3) return setMsg(c('noteBad'));
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/customers/points/adjust', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'idempotency-key': key.current },
        body: JSON.stringify({ customerId: who, points: n, note: note.trim(), key: key.current, pin }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; details?: string[] };
      if (!data.ok) {
        setMsg(cusError(dict, data.error, (data.details ?? []).join(', ')));
        return;
      }
      showToast({ text: c('done'), tone: 'ok' });
      key.current = freshKey();
      setPin('');
      setPoints('');
      setNote('');
      setFound([]);
      setWho('');
      setQ('');
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a2-stack" style={{ gap: 8 }} data-testid="loyalty-adjust">
      <button type="button" className="a2-btn" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="loyalty-adjust-open">
        {c('open')}
      </button>
      {open ? (
        <div className="a2-card tight a2-stack" style={{ gap: 10 }}>
          <label className="a2-stack" style={{ gap: 4 }} htmlFor={`${uid}-q`}>
            <span className="a2-sm">{c('who')}</span>
            <span className="a2-gap8">
              <input id={`${uid}-q`} className="a2-inp" value={q} maxLength={60} placeholder={c('whoHint')} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' ? (e.preventDefault(), void search()) : null)} />
              <button type="button" className="a2-btn sm" onClick={() => void search()}>
                {c('find')}
              </button>
            </span>
          </label>
          {found.length ? (
            <select className="a2-sel" value={who} onChange={(e) => setWho(e.target.value)} aria-label={c('who')}>
              {found.map((f) => (
                <option key={f.id} value={f.id}>
                  {[f.name ?? c('noName'), f.phone].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          ) : null}
          <label className="a2-stack" style={{ gap: 4 }}>
            <span className="a2-sm">{c('points')}</span>
            <input className="a2-inp" type="number" inputMode="numeric" value={points} placeholder="50" onChange={(e) => setPoints(e.target.value)} />
          </label>
          <label className="a2-stack" style={{ gap: 4 }}>
            <span className="a2-sm">{c('reason')}</span>
            <input className="a2-inp" value={note} maxLength={200} placeholder={c('reasonHint')} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="a2-stack" style={{ gap: 4 }}>
            <span className="a2-sm">{c('pin')}</span>
            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" value={pin} maxLength={12} onChange={(e) => setPin(e.target.value)} style={{ maxWidth: 160 }} />
          </label>
          {msg ? (
            <p className="a2-xs" role="alert" data-testid="loyalty-adjust-msg">
              {msg}
            </p>
          ) : null}
          <span className="a2-gap8">
            <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void send()} data-testid="loyalty-adjust-go">
              {busy ? c('busy') : c('go')}
            </button>
            <button type="button" className="a2-btn ghost" onClick={() => setOpen(false)}>
              {c('cancel')}
            </button>
          </span>
          <p className="a2-xs a2-mute">{c('note')}</p>
        </div>
      ) : null}
    </div>
  );
}
