'use client';
// CN-028 · PR 612 — the hand-back desk in the browser (/admin/orders/returns/handback): start a list for a courier and
// day, scan each parcel (a scanner types the consignment and Enter; typing works too) with the pieces counted, a short
// note and, when the owner asks for one, a photo of the sealed bag; correct a parcel while the list is open; close and
// send, send again, or put the refused parcels on a new list. Every refusal is said in words from the page's messages;
// after each step the page is read again from the server (lib/returns-erp-api.ts → @extas/orders handback.ts).
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { call, type Answer } from '@/components/admin/api';
import { uploadReturnPhoto } from './return-photo';

export interface HandbackTexts {
  courier: string;
  hand: string;
  day: string;
  openBtn: string;
  code: string;
  count: string;
  note: string;
  noteHint: string;
  unexpected: string;
  photo: string;
  photoDone: string;
  photoNeeded: string;
  scanBtn: string;
  fix: string;
  fixSave: string;
  cancel: string;
  errors: Record<string, string>;
}

const API = '/api/admin/returns/handback';
const errorOf = (a: Answer, t: Pick<HandbackTexts, 'errors'>) => t.errors[a.data.error ?? ''] ?? t.errors['server-error'] ?? '';

function Problem({ text }: { text: string }) {
  return text ? (
    <p className="a2-sm rt-bad" role="alert">
      {text}
    </p>
  ) : null;
}

/** Start a list: the courier (or the showroom) and the courier's own date. */
export function HandbackOpenForm({ couriers, today, here, texts }: { couriers: string[]; today: string; here: string; texts: HandbackTexts }) {
  const router = useRouter();
  const id = useId();
  const [courier, setCourier] = useState(couriers[0] ?? 'HAND');
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const a = await call('POST', `${API}/lists`, { courier, handedBackAt: day });
    setBusy(false);
    if (!a.data.ok) return setErr(errorOf(a, texts));
    const list = a.data.list as { id: string };
    router.push(`${here}?list=${list.id}`);
  };
  return (
    <div className="a2-stack" data-testid="handback-open">
      <div>
        <label className="a2-lbl" htmlFor={`${id}-c`}>
          {texts.courier}
        </label>
        <select id={`${id}-c`} className="a2-sel" value={courier} onChange={(e) => setCourier(e.target.value)} data-testid="handback-courier">
          {couriers.map((c) => (
            <option key={c} value={c}>
              {c === 'HAND' ? texts.hand : c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="a2-lbl" htmlFor={`${id}-d`}>
          {texts.day}
        </label>
        <input id={`${id}-d`} type="date" className="a2-inp" value={day} max={today} onChange={(e) => setDay(e.target.value)} data-testid="handback-day" />
      </div>
      <div className="rt-formr">
        <Problem text={err} />
        <button type="button" className="a2-btn pri" disabled={busy || !day} onClick={go} data-testid="handback-start">
          {texts.openBtn}
        </button>
      </div>
    </div>
  );
}

/** Scan one parcel onto the open list. The code field keeps the focus for the next scan. */
export function HandbackScanForm({ listId, photoRequired, texts }: { listId: string; photoRequired: boolean; texts: HandbackTexts }) {
  const router = useRouter();
  const id = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [unexpected, setUnexpected] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const n = Number(count);
  const ready = !!code.trim() && Number.isInteger(n) && n >= 0 && (!photoRequired || !!photo) && (!unexpected || !!note.trim());
  const go = async () => {
    if (!ready) return;
    setBusy(true);
    setErr('');
    const a = await call('POST', `${API}/lists/${listId}/scan`, { code: code.trim(), receivedCount: n, ...(note.trim() ? { note: note.trim() } : {}), ...(photo ? { photoAssetId: photo } : {}), ...(unexpected ? { unexpected: true } : {}) });
    setBusy(false);
    if (!a.data.ok) return setErr(errorOf(a, texts));
    setCode('');
    setCount('1');
    setNote('');
    setUnexpected(false);
    setPhoto(null);
    router.refresh();
    codeRef.current?.focus();
  };
  return (
    <div className="a2-stack" data-testid="handback-scan">
      <div className="rt-form">
        <div className="rt-formr">
          <label className="a2-lbl" htmlFor={`${id}-code`}>
            {texts.code}
          </label>
          <input
            id={`${id}-code`}
            ref={codeRef}
            className="a2-inp a2-mono"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={80}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void go();
            }}
            data-testid="handback-code"
          />
        </div>
        <div>
          <label className="a2-lbl" htmlFor={`${id}-n`}>
            {texts.count}
          </label>
          <input id={`${id}-n`} type="number" inputMode="numeric" min={0} max={100} className="a2-inp" value={count} onChange={(e) => setCount(e.target.value)} data-testid="handback-count" />
        </div>
        <div>
          <label className="a2-lbl" htmlFor={`${id}-note`}>
            {texts.note}
          </label>
          <input id={`${id}-note`} className="a2-inp" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} data-testid="handback-note" />
          <div className="a2-xs a2-mute">{texts.noteHint}</div>
        </div>
        <div className="rt-formr">
          <label className="rt-check">
            <input type="checkbox" checked={unexpected} onChange={(e) => setUnexpected(e.target.checked)} data-testid="handback-unexpected" />
            <span>{texts.unexpected}</span>
          </label>
        </div>
        {photoRequired ? (
          <div className="rt-formr">
            <label className="a2-lbl" htmlFor={`${id}-photo`}>
              {texts.photo}
            </label>
            <input
              id={`${id}-photo`}
              type="file"
              accept="image/*"
              capture="environment"
              className="a2-xs"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const got = await uploadReturnPhoto(file);
                setPhoto(got);
                if (!got) setErr(texts.errors['server-error'] ?? '');
              }}
            />
            <div className={`a2-xs ${photo ? 'a2-mute' : 'rt-bad'}`}>{photo ? texts.photoDone : texts.photoNeeded}</div>
          </div>
        ) : null}
      </div>
      <Problem text={err} />
      <div>
        <button type="button" className="a2-btn pri" disabled={busy || !ready} onClick={go} data-testid="handback-add">
          {texts.scanBtn}
        </button>
      </div>
    </div>
  );
}

/** Correct a parcel's count and note while the list is open. */
export function HandbackFixForm({ listId, parcelId, count, note, texts }: { listId: string; parcelId: string; count: number; note: string | null; texts: HandbackTexts }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(String(count));
  const [text, setText] = useState(note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open)
    return (
      <button type="button" className="a2-btn" onClick={() => setOpen(true)} data-testid="handback-fix">
        {texts.fix}
      </button>
    );
  const go = async () => {
    setBusy(true);
    setErr('');
    const a = await call('POST', `${API}/lists/${listId}/parcels/${parcelId}/fix`, { receivedCount: Number(n), ...(text.trim() ? { note: text.trim() } : {}) });
    setBusy(false);
    if (!a.data.ok) return setErr(errorOf(a, texts));
    setOpen(false);
    router.refresh();
  };
  return (
    <div className="a2-card tight a2-stack a2-mt6" data-testid="handback-fix-form">
      <div className="rt-form">
        <div>
          <label className="a2-lbl" htmlFor={`${id}-n`}>
            {texts.count}
          </label>
          <input id={`${id}-n`} type="number" inputMode="numeric" min={0} max={100} className="a2-inp" value={n} onChange={(e) => setN(e.target.value)} />
        </div>
        <div>
          <label className="a2-lbl" htmlFor={`${id}-t`}>
            {texts.note}
          </label>
          <input id={`${id}-t`} className="a2-inp" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </div>
      <Problem text={err} />
      <div className="a2-cmds">
        <button type="button" className="a2-btn pri" disabled={busy} onClick={go}>
          {texts.fixSave}
        </button>
        <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
          {texts.cancel}
        </button>
      </div>
    </div>
  );
}

/** One step on a list (close and send, send again, the refused parcels on a new list): then the list it names. */
export function HandbackStep({ listId, step, label, tone = '', here, texts, testId }: { listId: string; step: 'close' | 'send' | 'resend'; label: string; tone?: string; here: string; texts: Pick<HandbackTexts, 'errors'>; testId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const a = await call('POST', `${API}/lists/${listId}/${step}`, {});
    setBusy(false);
    if (!a.data.ok) {
      setErr(errorOf(a, texts));
      if (a.data.error === 'HANDBACK_STATE') router.refresh();
      return;
    }
    const list = a.data.list as { id: string } | undefined;
    if (list && list.id !== listId) router.push(`${here}?list=${list.id}`);
    else router.refresh();
  };
  return (
    <div className="a2-stack">
      <button type="button" className={`a2-btn ${tone}`} disabled={busy} onClick={go} data-testid={testId}>
        {label}
      </button>
      <Problem text={err} />
    </div>
  );
}
