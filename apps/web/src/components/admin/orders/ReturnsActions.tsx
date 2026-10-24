'use client';
// S08 · PR 185 — the returns page's buttons in the browser: a button sends one decision to the returns admin API
// (lib/returns-api.ts) with the case's version, optionally after asking for a note; the open-an-exchange form sends the
// piece chosen with an idempotency key (a second press opens nothing new). Every refusal is said in words from the
// page's messages; after a decision the page is read again from the server, so the buttons are the steps open now.
// PR 188 adds the size switcher of a piece going out.
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { call, type Answer } from '@/components/admin/api';
import { newKey } from '@/lib/admin-orders/commands';
import type { SizeChip } from '@/lib/admin-returns/model';

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
export function ReturnsAction({ label, url, body = {}, tone = '', note, texts, next, testId }: { label: string; url: string; body?: Record<string, unknown>; tone?: string; note?: { label: string; required: boolean }; texts: ActionTexts; next?: Next; testId?: string }) {
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
    const a = await post(url, { ...body, ...(note && text.trim() ? { note: text.trim() } : {}) }, null);
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
}

/** The last step of "Start an exchange": the piece chosen, the root cause of a wrong item, the SKU really coming back. */
export function OpenExchangeForm({ url, reason, orderItemId, newVariantId, causes, texts, caseHref, children }: { url: string; reason: string; orderItemId: string; newVariantId: string; causes: { key: string; label: string }[] | null; texts: OpenFormTexts; caseHref: string; children?: ReactNode }) {
  const router = useRouter();
  const ids = { cause: useId(), sku: useId(), note: useId() };
  const [key] = useState(newKey);
  const [cause, setCause] = useState('');
  const [sku, setSku] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const a = await post(
      url,
      {
        reason,
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
