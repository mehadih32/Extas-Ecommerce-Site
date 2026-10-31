'use client';
// S08 · PR 192 — the client parts of Reports › Delivery & RTO, Delivery › Couriers › a courier (claims) and Support ›
// Rider issues: an owner's switch, raising and moving a claim, logging a rider issue with its photos, deciding it and
// asking the refund of its extra (a request only). Every raise or log sends one Idempotency-Key per form (a double tap
// is one record). Refusals are words from `courierReport.err.<code>`, never the server's own wording.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';

interface Answer {
  status: number;
  data: Record<string, unknown> & { ok?: boolean; error?: string; details?: string[] };
}

async function send(url: string, body: unknown, key?: string): Promise<Answer> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json().catch(() => ({ ok: false, error: 'default' }))) as Answer['data'] };
  } catch {
    return { status: 0, data: { ok: false, error: 'network' } };
  }
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** A refusal as words. */
export function errWords(dict: Dict, a: Answer): string {
  const code = a.status === 0 ? 'network' : (a.data.error ?? 'default');
  const key = `courierReport.err.${code}`;
  const text = t(dict, key, { fields: (a.data.details ?? []).join(', ') });
  return text === key ? t(dict, 'courierReport.err.default') : text;
}

const toMinor = (taka: string): number | null => {
  const n = Number(taka.replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <span className="a2-xs" role={m.ok ? 'status' : 'alert'} style={m.ok ? undefined : { color: 'var(--bad)' }}>
      {m.text}
    </span>
  );
}

/** An owner's on/off switch: sends the new value with the value the page showed (a stale save is refused). */
export function SwitchButton({ dict, url, settingKey, before, label, tone = '', testId }: { dict: Dict; url: string; settingKey?: string; before: Record<string, unknown>; label: string; tone?: '' | 'pri'; testId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setBusy(true);
    const a = await send(url, { ...(settingKey ? { key: settingKey } : {}), before, value: { ...before, enabled: !before.enabled } });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 4 }}>
      <button type="button" className={`a2-btn sm ${tone}`.trim()} onClick={go} disabled={busy} data-testid={testId}>
        {label}
      </button>
      <Msg m={msg} />
    </span>
  );
}

/** A step with an optional typed field first (a note, an amount, a reference): opens, then sends. */
export function StepButton({
  dict,
  url,
  body,
  label,
  field,
  confirmText,
  withKey,
  tone = '',
  testId,
}: {
  dict: Dict;
  url: string;
  body: Record<string, unknown>;
  label: string;
  /** The field typed first: `money` sends minor units. Optional fields may stay empty. */
  field?: { name: string; label: string; money?: boolean; optional?: boolean };
  confirmText?: string;
  withKey?: boolean;
  tone?: '' | 'pri' | 'bad' | 'ghost';
  testId?: string;
}) {
  const router = useRouter();
  const id = useId();
  const key = useRef(newKey());
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    if (field && !open) return setOpen(true);
    const extra: Record<string, unknown> = {};
    if (field && text.trim()) {
      if (field.money) {
        const m = toMinor(text);
        if (m === null) return setMsg({ ok: false, text: t(dict, 'courierReport.err.INVALID_INPUT', { fields: field.label }) });
        extra[field.name] = m;
      } else extra[field.name] = text.trim();
    } else if (field && !field.optional) return setMsg({ ok: false, text: t(dict, 'courierReport.err.INVALID_INPUT', { fields: field.label }) });
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    const a = await send(url, { ...body, ...extra }, withKey ? key.current : undefined);
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    setOpen(false);
    setText('');
    key.current = newKey();
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 6 }}>
      {open && field ? (
        <span className="a2-stack" style={{ gap: 4 }}>
          <label className="a2-xs a2-mute" htmlFor={`${id}-f`}>
            {field.label}
          </label>
          <input id={`${id}-f`} className="a2-inp" value={text} maxLength={field.money ? 12 : 300} inputMode={field.money ? 'decimal' : undefined} onChange={(e) => setText(e.target.value)} />
        </span>
      ) : null}
      <span className="a2-gap8">
        <button type="button" className={`a2-btn sm ${tone}`.trim()} onClick={go} disabled={busy} data-testid={testId}>
          {label}
        </button>
        {open && field ? (
          <button type="button" className="a2-btn sm ghost" onClick={() => setOpen(false)} disabled={busy}>
            ✕
          </button>
        ) : null}
      </span>
      <Msg m={msg} />
    </span>
  );
}

/** Log a rider issue: the order number, what the customer paid, his words and the proof photos (uploaded first). */
export function RiderIssueForm({ dict, maxPhotos }: { dict: Dict; maxPhotos: number }) {
  const router = useRouter();
  const id = useId();
  const key = useRef(newKey());
  const [order, setOrder] = useState('');
  const [charged, setCharged] = useState('');
  const [words, setWords] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `courierReport.rider.${k}`, v);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/support/rider-issues/proof', { method: 'POST', credentials: 'same-origin', body: form });
      const data = (await res.json().catch(() => ({ ok: false, error: 'default' }))) as Answer['data'];
      if (!data.ok) setMsg({ ok: false, text: errWords(dict, { status: res.status, data }) });
      else setPhotos((p) => [...p, String((data.file as { id: string }).id)]);
    } catch {
      setMsg({ ok: false, text: t(dict, 'courierReport.err.network') });
    }
    setBusy(false);
  };
  const submit = async () => {
    const chargedMinor = toMinor(charged);
    if (!order.trim() || chargedMinor === null || words.trim().length < 3) return setMsg({ ok: false, text: t(dict, 'courierReport.err.INVALID_INPUT', { fields: [!order.trim() ? c('order') : '', chargedMinor === null ? c('charged') : '', words.trim().length < 3 ? c('words') : ''].filter(Boolean).join(', ') }) });
    setBusy(true);
    setMsg(null);
    const a = await send('/api/admin/support/rider-issues', { orderNumber: order.trim(), chargedMinor, words: words.trim(), proofMediaIds: photos }, key.current);
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    key.current = newKey();
    setOrder('');
    setCharged('');
    setWords('');
    setPhotos([]);
    setMsg({ ok: true, text: c('logged') });
    router.refresh();
  };
  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="rider-form">
      <div className="a2-row a2-r2">
        <label className="a2-stack" style={{ gap: 4 }} htmlFor={`${id}-o`}>
          <span className="a2-xs a2-mute">{c('order')}</span>
          <input id={`${id}-o`} className="a2-inp" value={order} maxLength={40} onChange={(e) => setOrder(e.target.value)} />
        </label>
        <label className="a2-stack" style={{ gap: 4 }} htmlFor={`${id}-c`}>
          <span className="a2-xs a2-mute">{c('charged')}</span>
          <input id={`${id}-c`} className="a2-inp" value={charged} maxLength={12} inputMode="decimal" onChange={(e) => setCharged(e.target.value)} />
        </label>
      </div>
      <label className="a2-stack" style={{ gap: 4 }} htmlFor={`${id}-w`}>
        <span className="a2-xs a2-mute">{c('words')}</span>
        <textarea id={`${id}-w`} className="a2-inp" rows={3} value={words} maxLength={2000} onChange={(e) => setWords(e.target.value)} />
      </label>
      <div className="a2-gap8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="a2-xs a2-mute">{c('photos')}</span>
        {photos.length < maxPhotos ? (
          <label className="a2-btn sm" htmlFor={`${id}-p`}>
            {c('addPhoto')}
            <input id={`${id}-p`} type="file" accept="image/*" style={{ display: 'none' }} disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        ) : null}
        {photos.length ? <span className="a2-xs">{c('photoDone', { n: photos.length })}</span> : null}
      </div>
      <div className="a2-gap8">
        <button type="button" className="a2-btn pri" onClick={submit} disabled={busy} data-testid="rider-submit">
          {c('submit')}
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}

/** The rider issue settings (More options): saved with the value the page showed. */
export function RiderSettingsForm({ dict, before }: { dict: Dict; before: { enabled: boolean; proofRequired: boolean; maxPhotos: number; photoMaxMb: number; refundAsk: boolean } }) {
  const router = useRouter();
  const id = useId();
  const [v, setV] = useState(before);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const c = (k: string) => t(dict, `courierReport.rider.${k}`);
  const save = async () => {
    setBusy(true);
    const a = await send('/api/admin/support/rider-issues/settings', { before, value: v });
    setBusy(false);
    if (!a.data.ok) return setMsg({ ok: false, text: errWords(dict, a) });
    setMsg({ ok: true, text: c('saved') });
    router.refresh();
  };
  const tick = (k: 'enabled' | 'proofRequired' | 'refundAsk', label: string) => (
    <label className="a2-gap8 a2-sm" style={{ minHeight: 44, alignItems: 'center' }} htmlFor={`${id}-${k}`}>
      <input id={`${id}-${k}`} type="checkbox" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
      {label}
    </label>
  );
  const num = (k: 'maxPhotos' | 'photoMaxMb', label: string, max: number) => (
    <label className="a2-stack" style={{ gap: 4 }} htmlFor={`${id}-${k}`}>
      <span className="a2-xs a2-mute">{label}</span>
      <input id={`${id}-${k}`} className="a2-inp" type="number" min={1} max={max} value={v[k]} onChange={(e) => setV({ ...v, [k]: Math.max(1, Math.min(max, Math.round(Number(e.target.value) || 1))) })} />
    </label>
  );
  return (
    <div className="a2-stack" style={{ gap: 8 }} data-testid="rider-settings">
      {tick('enabled', c('enabled'))}
      {tick('proofRequired', c('proofRequired'))}
      <div className="a2-row a2-r2">
        {num('maxPhotos', c('maxPhotos'), 10)}
        {num('photoMaxMb', c('photoMaxMb'), 20)}
      </div>
      {tick('refundAsk', c('refundAskLabel'))}
      <div className="a2-gap8">
        <button type="button" className="a2-btn sm pri" onClick={save} disabled={busy}>
          {c('save')}
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}
