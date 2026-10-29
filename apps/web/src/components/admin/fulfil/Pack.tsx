'use client';
// S08 · PR 182 — the client parts of Orders › Packing & print › Pack (ORD-04): the scan box (a scanner types the code
// and Enter; a typed SKU goes with "Check" when the owner allows it), the tick of a line when the shop packs without a
// scanner, the packing photo (the phone's camera), "Mark packed" (with the parcel's weight when the owner checks it, and
// the "the weight is right" answer to a big gap), and "Book courier" for one packed order. Every press goes to the admin
// API, which runs the step through the order service; a refusal is shown in words from the page's messages
// (`ful.err.<code>`), never the server's own wording. "Mark packed" sends an Idempotency-Key kept until it is answered,
// so a second tap after a lost answer never packs twice.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { call } from '@/components/admin/api';
import { fulError } from '@/lib/admin-fulfil/words';
import { t, type Dict } from '@/lib/i18n';

const API = '/api/admin/packing/orders';

const newKey = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
};

type Msg = { ok: boolean; text: string } | null;

function Said({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <span className={`a2-xs ${msg.ok ? 'a2-mute' : ''}`} role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
      {msg.text}
    </span>
  );
}

const refusal = (dict: Dict, status: number, data: { error?: string; details?: string[] }) => (status === 0 ? fulError(dict, 'network') : fulError(dict, data.error, (data.details ?? []).join(', ')));

/** The scan box: Enter (what a scanner sends) checks a scanned code; "Check" a typed SKU, when the owner allows it. */
export function ScanBox({ dict, orderId, allowTyped }: { dict: Dict; orderId: string; allowTyped: boolean }) {
  const router = useRouter();
  const id = useId();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const send = async (source: 'scan' | 'typed') => {
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true);
    setMsg(null);
    const a = await call('POST', `${API}/${orderId}/piece`, { code: c, source });
    setBusy(false);
    if (!a.data.ok) {
      setMsg({ ok: false, text: refusal(dict, a.status, a.data) });
      return;
    }
    setCode('');
    setMsg({ ok: true, text: t(dict, 'ful.pack.matched', { sku: c.toUpperCase() }) });
    router.refresh();
  };
  return (
    <div className="a2-stack a2-mt12" style={{ gap: 6 }} data-testid="pack-scan">
      <form
        className="a2-gap8"
        style={{ flexWrap: 'nowrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          void send('scan');
        }}
      >
        <label className="a2-sr" htmlFor={`${id}-c`}>
          {t(dict, 'ful.pack.scanLabel')}
        </label>
        <input id={`${id}-c`} className="a2-inp" value={code} maxLength={80} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={t(dict, allowTyped ? 'ful.pack.typePh' : 'ful.pack.scanPh')} onChange={(e) => setCode(e.target.value)} disabled={busy} data-testid="pack-code" />
        {allowTyped ? (
          <button type="button" className="a2-btn" onClick={() => void send('typed')} disabled={busy || !code.trim()} data-testid="pack-check">
            {t(dict, 'ful.pack.scanGo')}
          </button>
        ) : null}
      </form>
      <Said msg={msg} />
    </div>
  );
}

/** A tick on one line (the shop packs without a scanner): the line's remaining pieces are checked. */
export function TickLine({ dict, orderId, lineId }: { dict: Dict; orderId: string; lineId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const go = async () => {
    setBusy(true);
    setMsg(null);
    const a = await call('POST', `${API}/${orderId}/piece`, { lineId, source: 'tick' });
    setBusy(false);
    if (!a.data.ok) {
      setMsg({ ok: false, text: refusal(dict, a.status, a.data) });
      return;
    }
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 4, alignItems: 'flex-end' }}>
      <button type="button" className="a2-btn sm" onClick={go} disabled={busy} data-testid="pack-tick">
        {t(dict, 'ful.pack.tick')}
      </button>
      <Said msg={msg} />
    </span>
  );
}

/** "Take photo": the phone opens its camera; the photo is uploaded, its metadata stripped by the server. */
export function PhotoUpload({ dict, orderId, label }: { dict: Dict; orderId: string; label: string }) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.append('file', file);
    let status = 0;
    let data: { ok?: boolean; error?: string; details?: string[] } = { ok: false, error: 'network' };
    try {
      const res = await fetch(`${API}/${orderId}/photo`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', body: form });
      status = res.status;
      data = (await res.json().catch(() => ({ ok: false, error: 'server-error' }))) as typeof data;
    } catch {
      /* network */
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    if (!data.ok) {
      setMsg({ ok: false, text: refusal(dict, status, data) });
      return;
    }
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 4, marginLeft: 'auto', alignItems: 'flex-end' }}>
      <label className="a2-sr" htmlFor={`${id}-f`}>
        {label}
      </label>
      <input ref={input} id={`${id}-f`} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void upload(e.target.files?.[0])} data-testid="pack-photo-file" />
      <button type="button" className="a2-btn sm" onClick={() => input.current?.click()} disabled={busy} data-testid="pack-photo">
        {busy ? t(dict, 'ful.pack.photoSending') : label}
      </button>
      <Said msg={msg} />
    </span>
  );
}

interface Gap {
  gapGrams?: number;
  gapPercent?: number;
}

/**
 * "Mark packed". With the owner's weight check on, the parcel's reading in grams goes with it; a big gap from the
 * pieces' weight comes back as WEIGHT_GAP, and the packer either weighs again or answers "the weight is right".
 */
export function PackButton({ dict, orderId, disabled, weight, primary }: { dict: Dict; orderId: string; disabled: boolean; weight: { enabled: boolean; required: boolean }; primary: boolean }) {
  const router = useRouter();
  const id = useId();
  const press = useRef<{ key: string; what: string } | null>(null);
  const [grams, setGrams] = useState('');
  const [gap, setGap] = useState<Gap | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const go = async (confirmed: boolean) => {
    const g = grams.trim() ? Number(grams.trim()) : undefined;
    if (g !== undefined && (!Number.isInteger(g) || g < 1)) {
      setMsg({ ok: false, text: fulError(dict, 'INVALID_INPUT', t(dict, 'ful.pack.weight.label')) });
      return;
    }
    const body = { ...(g !== undefined ? { weighedGrams: g } : {}), ...(confirmed ? { weightConfirmed: true } : {}) };
    const what = JSON.stringify(body);
    if (press.current?.what !== what) press.current = { key: newKey(), what };
    setBusy(true);
    setMsg(null);
    let status = 0;
    let data: { ok?: boolean; error?: string; details?: string[]; data?: Gap } = { ok: false, error: 'network' };
    try {
      const res = await fetch(`${API}/${orderId}/pack`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json', 'idempotency-key': press.current.key }, body: what });
      status = res.status;
      data = (await res.json().catch(() => ({ ok: false, error: 'server-error' }))) as typeof data;
    } catch {
      /* network: the same key goes with the next press */
    }
    setBusy(false);
    if (!data.ok) {
      if (status !== 0) press.current = null;
      if (data.error === 'WEIGHT_GAP') {
        setGap(data.data ?? {});
        return;
      }
      setMsg({ ok: false, text: refusal(dict, status, data) });
      return;
    }
    press.current = null;
    setGap(null);
    setGrams('');
    setMsg({ ok: true, text: t(dict, 'ful.pack.packedDone') });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 6 }} data-testid="pack-packed-box">
      {weight.enabled ? (
        <span className="a2-gap8" style={{ flexWrap: 'nowrap' }}>
          <label className="a2-xs a2-mute" htmlFor={`${id}-g`} style={{ whiteSpace: 'nowrap' }}>
            {t(dict, 'ful.pack.weight.label')}
          </label>
          <input
            id={`${id}-g`}
            className="a2-inp"
            style={{ width: 120 }}
            inputMode="numeric"
            value={grams}
            maxLength={6}
            placeholder={t(dict, weight.required ? 'ful.pack.weight.need' : 'ful.pack.weight.optional')}
            onChange={(e) => {
              setGrams(e.target.value.replace(/[^\d]/g, ''));
              setGap(null);
            }}
            data-testid="pack-grams"
          />
        </span>
      ) : null}
      <span className="a2-gap8">
        <button type="button" className={`a2-btn ${primary ? 'pri lg' : ''}`.trim()} onClick={() => void go(false)} disabled={busy || disabled} data-testid="pack-packed">
          {busy ? t(dict, 'ful.pack.packing') : t(dict, 'ful.pack.packed')}
        </button>
      </span>
      {gap ? (
        <span className="a2-note warn" role="alert" style={{ marginTop: 0 }} data-testid="pack-gap">
          <span>
            {t(dict, 'ful.pack.weight.gap', { g: String(gap.gapGrams ?? ''), p: String(gap.gapPercent ?? '') })}{' '}
            <button type="button" className="a2-btn sm" onClick={() => void go(true)} disabled={busy} data-testid="pack-gap-ok">
              {t(dict, 'ful.pack.weight.confirm')}
            </button>
          </span>
        </span>
      ) : null}
      <Said msg={msg} />
    </span>
  );
}

/** "Book courier" for one packed order: the courier account, then the Delivery booking (its own checks and words). */
export function BookOne({ dict, orderId, couriers, codeWords }: { dict: Dict; orderId: string; couriers: { id: string; name: string }[]; codeWords: Record<string, string> }) {
  const router = useRouter();
  const id = useId();
  const [courierAccountId, setCourier] = useState(couriers[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const go = async () => {
    setBusy(true);
    setMsg(null);
    const a = await call('POST', '/api/admin/delivery/bookings', { courierAccountId, orderIds: [orderId] });
    setBusy(false);
    if (!a.data.ok) {
      setMsg({ ok: false, text: refusal(dict, a.status, a.data) });
      return;
    }
    const r = (a.data.results as { outcome?: string; code?: string | null; consignmentId?: string | null }[] | undefined)?.[0];
    if (r?.outcome === 'booked') setMsg({ ok: true, text: t(dict, 'ful.pack.bookDone', { cid: r.consignmentId ?? '' }) });
    else setMsg({ ok: false, text: t(dict, 'ful.pack.bookNot', { why: (r?.code && codeWords[r.code]) || t(dict, 'ful.err.default') }) });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 6 }}>
      <span className="a2-gap8">
        <label className="a2-sr" htmlFor={`${id}-c`}>
          {t(dict, 'ful.pack.bookPick')}
        </label>
        <select id={`${id}-c`} className="a2-sel" value={courierAccountId} onChange={(e) => setCourier(e.target.value)} disabled={busy}>
          {couriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="a2-btn pri lg" onClick={go} disabled={busy || !courierAccountId} data-testid="pack-book">
          {busy ? t(dict, 'ful.pack.booking') : t(dict, 'ful.pack.book')}
        </button>
      </span>
      <Said msg={msg} />
    </span>
  );
}

/** "Start picking" for every order on the Pick step: how many moved on, and which were left out and why. */
export function StartAll({ dict, count }: { dict: Dict; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const go = async () => {
    if (!window.confirm(t(dict, 'ful.pack.startAllAsk', { n: String(count) }))) return;
    setBusy(true);
    setMsg(null);
    const a = await call('POST', `${API}/pick-all`, {});
    setBusy(false);
    if (!a.data.ok) {
      setMsg({ ok: false, text: refusal(dict, a.status, a.data) });
      return;
    }
    const started = Array.isArray(a.data.started) ? a.data.started.length : 0;
    const skipped = Array.isArray(a.data.skipped) ? (a.data.skipped as { orderNumber?: string; reason?: string }[]) : [];
    const left = skipped.map((s) => `${s.orderNumber ?? ''} (${fulError(dict, s.reason)})`);
    setMsg({ ok: true, text: left.length ? t(dict, 'ful.pack.startAllSome', { n: String(started), left: left.join(', ') }) : t(dict, 'ful.pack.startAllDone', { n: String(started) }) });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 4 }}>
      <button type="button" className="a2-btn" onClick={go} disabled={busy || !count} data-testid="pack-start-all">
        {t(dict, 'ful.pack.startAll')}
      </button>
      <Said msg={msg} />
    </span>
  );
}
