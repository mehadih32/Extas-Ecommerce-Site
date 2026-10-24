'use client';
// S08 · PR 185 — the returns page's buttons in the browser: a button sends one decision to the returns admin API
// (lib/returns-api.ts) with the case's version, optionally after asking for a note; the open-an-exchange form sends the
// piece chosen with an idempotency key (a second press opens nothing new). Every refusal is said in words from the
// page's messages; after a decision the page is read again from the server, so the buttons are the steps open now.
// PR 188 adds the size switcher of a piece going out; PR 189 the form of a return after receipt; PR 190 the claim form
// and the one-trip swap box.
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { call, type Answer } from '@/components/admin/api';
import { newKey } from '@/lib/admin-orders/commands';
import type { SizeChip } from '@/lib/admin-returns/model';
import { uploadReturnPhoto } from './return-photo';

export interface ActionTexts {
  send: string;
  cancel: string;
  errors: Record<string, string>;
}

const errorOf = (a: Answer, texts: ActionTexts) => texts.errors[a.data.error ?? ''] ?? texts.errors['server-error'] ?? '';

/** Where the answer says to go next (a new case), else the page again. */
type Next = (data: Answer['data']) => string | null;

async function post(url: string, body: Record<string, unknown>, key: string | null): Promise<Answer> {
  if (!key) return call('POST', url, body);
  try {
    const res = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
    return { status: res.status, data: (await res.json().catch(() => ({ ok: false, error: 'server-error' }))) as Answer['data'] };
  } catch {
    return { status: 0, data: { ok: false, error: 'network' } };
  }
}

/** One decision button; with `note`, it first opens a small note box (required when `note.required`). */
export function ReturnsAction({ label, url, body = {}, tone = '', note, noteKey = 'note', texts, next, testId }: { label: string; url: string; body?: Record<string, unknown>; tone?: string; note?: { label: string; required: boolean }; noteKey?: string; texts: ActionTexts; next?: Next; testId?: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    if (note?.required && !text.trim()) return;
    setBusy(true);
    setErr('');
    const a = await post(url, { ...body, ...(note && text.trim() ? { [noteKey]: text.trim() } : {}) }, null);
    setBusy(false);
    if (!a.data.ok) {
      setErr(errorOf(a, texts));
      if (a.data.error === 'STALE' || a.data.error === 'EXCHANGE_STATE') router.refresh();
      return;
    }
    setOpen(false);
    setText('');
    const to = next?.(a.data);
    if (to) router.push(to);
    else router.refresh();
  };
  if (note && open)
    return (
      <div className="a2-card tight a2-stack" data-testid={testId ? `${testId}-form` : undefined}>
        <label className="a2-lbl" htmlFor={id}>
          {note.label}
        </label>
        <textarea id={id} className="a2-ta" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        {err ? (
          <p className="a2-xs rt-bad" role="alert">
            {err}
          </p>
        ) : null}
        <div className="a2-cmds">
          <button type="button" className={`a2-btn ${tone || 'pri'}`} disabled={busy || (note.required && !text.trim())} onClick={go}>
            {texts.send}
          </button>
          <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
            {texts.cancel}
          </button>
        </div>
      </div>
    );
  return (
    <>
      <button type="button" className={`a2-btn ${tone}`} disabled={busy} onClick={() => (note ? setOpen(true) : go())} data-testid={testId}>
        {label}
      </button>
      {err ? (
        <p className="a2-xs rt-bad" role="alert">
          {err}
        </p>
      ) : null}
    </>
  );
}

export interface OpenFormTexts extends ActionTexts {
  open: string;
  rootCause: string;
  received: string;
  reasonNote: string;
  /** PR 190: the one-trip swap's box, when the owner offers it here. */
  oneTrip?: string;
}

/** The last step of "Start an exchange": the piece chosen, the root cause of a wrong item, the SKU really coming back. */
export function OpenExchangeForm({ url, reason, orderItemId, newVariantId, causes, texts, caseHref, children }: { url: string; reason: string; orderItemId: string; newVariantId: string; causes: { key: string; label: string }[] | null; texts: OpenFormTexts; caseHref: string; children?: ReactNode }) {
  const router = useRouter();
  const ids = { cause: useId(), sku: useId(), note: useId() };
  const [key] = useState(newKey);
  const [cause, setCause] = useState('');
  const [sku, setSku] = useState('');
  const [note, setNote] = useState('');
  const [trip, setTrip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const a = await post(
      url,
      {
        reason,
        ...(trip ? { oneTrip: true } : {}),
        ...(cause ? { rootCause: cause } : {}),
        ...(note.trim() ? { reasonNote: note.trim() } : {}),
        items: [{ orderItemId, newVariantId, ...(sku.trim() ? { receivedSku: sku.trim() } : {}) }],
      },
      key,
    );
    setBusy(false);
    if (!a.data.ok) return setErr(errorOf(a, texts));
    const ex = a.data.exchange as { exchangeId?: string } | undefined;
    router.push(ex?.exchangeId ? `${caseHref}${ex.exchangeId}` : caseHref);
  };
  return (
    <div className="a2-stack" data-testid="open-exchange">
      {children}
      {causes ? (
        <div>
          <label className="a2-lbl" htmlFor={ids.cause}>
            {texts.rootCause}
          </label>
          <select id={ids.cause} className="a2-sel" value={cause} onChange={(e) => setCause(e.target.value)}>
            <option value="">—</option>
            {causes.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {reason === 'wrong' ? (
        <div>
          <label className="a2-lbl" htmlFor={ids.sku}>
            {texts.received}
          </label>
          <input id={ids.sku} className="a2-inp" maxLength={64} value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
      ) : null}
      <div>
        <label className="a2-lbl" htmlFor={ids.note}>
          {texts.reasonNote}
        </label>
        <input id={ids.note} className="a2-inp" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {texts.oneTrip ? (
        <label className="rt-check">
          <input type="checkbox" checked={trip} onChange={(e) => setTrip(e.target.checked)} data-testid="open-exchange-onetrip" />
          <span>{texts.oneTrip}</span>
        </label>
      ) : null}
      {err ? (
        <p className="a2-xs rt-bad" role="alert">
          {err}
        </p>
      ) : null}
      <div className="a2-cmds">
        <button type="button" className="a2-btn pri" disabled={busy || (!!causes && reason === 'wrong' && !cause)} onClick={go} data-testid="open-exchange-go">
          {texts.open}
        </button>
      </div>
    </div>
  );
}

/** PR 188: another size of the piece going out — one press switches it (with the case's version). */
export function SizeSwitch({ url, exchangeItemId, version, chips, title, texts }: { url: string; exchangeItemId: string; version: number; chips: SizeChip[]; title: string; texts: ActionTexts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (newVariantId: string) => {
    setBusy(true);
    setErr('');
    const a = await post(url, { exchangeItemId, newVariantId, version }, null);
    setBusy(false);
    if (!a.data.ok) {
      setErr(errorOf(a, texts));
      if (a.data.error === 'STALE' || a.data.error === 'EXCHANGE_STATE') router.refresh();
      return;
    }
    router.refresh();
  };
  return (
    <div className="a2-mt6" data-testid="exchange-sizes">
      <div className="a2-seg" role="group" aria-label={title}>
        {chips.map((c) => (
          <button key={c.variantId} type="button" className={c.current ? 'on' : undefined} aria-pressed={c.current} disabled={busy || c.current || !!c.why} title={c.why ?? undefined} onClick={() => go(c.variantId)} data-testid="exchange-size" data-current={c.current ? '1' : undefined}>
            {c.label}
            {c.why ? <span className="a2-xs a2-mute rt-ml">{c.why}</span> : null}
          </button>
        ))}
      </div>
      {err ? (
        <p className="a2-xs rt-bad" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

export interface OpenReturnTexts extends ActionTexts {
  reason: string;
  quantity: string;
  note: string;
  noteOther: string;
  open: string;
}

/** PR 189: a return after receipt for the chosen line (only offered when the policy allows a reason), with a key. */
export function OpenReturnForm({ url, orderItemId, max, reasons, texts, nextHref }: { url: string; orderItemId: string; max: number; reasons: { code: string; label: string }[]; texts: OpenReturnTexts; nextHref: string | null }) {
  const router = useRouter();
  const ids = { reason: useId(), qty: useId(), note: useId() };
  const [key] = useState(newKey);
  const [reason, setReason] = useState(reasons[0]?.code ?? '');
  const [qty, setQty] = useState(max);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const needsNote = reason === 'other';
  const go = async () => {
    setBusy(true);
    setErr('');
    const a = await post(url, { reason, ...(note.trim() ? { note: note.trim() } : {}), items: [{ orderItemId, quantity: qty }] }, key);
    setBusy(false);
    if (!a.data.ok) return setErr(errorOf(a, texts));
    const ret = a.data.result as { returnId?: string } | undefined;
    if (nextHref && ret?.returnId) router.push(`${nextHref}${ret.returnId}`);
    else router.refresh();
  };
  return (
    <div className="a2-stack" data-testid="open-return">
      <div className="rt-form">
        <div>
          <label className="a2-lbl" htmlFor={ids.reason}>
            {texts.reason}
          </label>
          <select id={ids.reason} className="a2-sel" value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="a2-lbl" htmlFor={ids.qty}>
            {texts.quantity}
          </label>
          <input id={ids.qty} className="a2-inp" type="number" inputMode="numeric" min={1} max={max} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
        </div>
      </div>
      <div>
        <label className="a2-lbl" htmlFor={ids.note}>
          {needsNote ? texts.noteOther : texts.note}
        </label>
        <input id={ids.note} className="a2-inp" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {err ? (
        <p className="a2-xs rt-bad" role="alert">
          {err}
        </p>
      ) : null}
      <div className="a2-cmds">
        <button type="button" className="a2-btn pri" disabled={busy || !reason || (needsNote && !note.trim())} onClick={go} data-testid="open-return-go">
          {texts.open}
        </button>
      </div>
    </div>
  );
}

export interface ClaimTexts extends ActionTexts {
  open: string;
  note: string;
  photo: string;
  photoDone: string;
  photoNeeded: string;
  save: string;
}

/** PR 190: records the customer's "your mistake" claim — his note and a photo (when the setting asks) — for a person to decide. */
export function ClaimForm({ url, version, photoNeeded, texts }: { url: string; version: number; photoNeeded: boolean; texts: ClaimTexts }) {
  const router = useRouter();
  const ids = { note: useId(), photo: useId() };
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const a = await post(url, { note: note.trim(), ...(photo ? { photoAssetIds: [photo] } : {}), version }, null);
    setBusy(false);
    if (!a.data.ok) {
      setErr(errorOf(a, texts));
      if (a.data.error === 'STALE' || a.data.error === 'EXCHANGE_STATE') router.refresh();
      return;
    }
    setOpen(false);
    router.refresh();
  };
  if (!open)
    return (
      <button type="button" className="a2-btn" onClick={() => setOpen(true)} data-testid="exchange-claim">
        {texts.open}
      </button>
    );
  return (
    <div className="a2-card tight a2-stack" data-testid="exchange-claim-form">
      <div>
        <label className="a2-lbl" htmlFor={ids.note}>
          {texts.note}
        </label>
        <textarea id={ids.note} className="a2-ta" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div>
        <label className="a2-lbl" htmlFor={ids.photo}>
          {texts.photo}
        </label>
        <input
          id={ids.photo}
          type="file"
          accept="image/*"
          className="a2-xs"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const got = await uploadReturnPhoto(file);
            setPhoto(got);
            if (!got) setErr(texts.errors['server-error'] ?? '');
          }}
        />
        {photo ? <div className="a2-xs a2-mute">{texts.photoDone}</div> : photoNeeded ? <div className="a2-xs rt-bad">{texts.photoNeeded}</div> : null}
      </div>
      {err ? (
        <p className="a2-xs rt-bad" role="alert">
          {err}
        </p>
      ) : null}
      <div className="a2-cmds">
        <button type="button" className="a2-btn pri" disabled={busy || !note.trim() || (photoNeeded && !photo)} onClick={go} data-testid="exchange-claim-go">
          {texts.save}
        </button>
        <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
          {texts.cancel}
        </button>
      </div>
    </div>
  );
}
