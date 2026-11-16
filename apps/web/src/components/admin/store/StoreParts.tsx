'use client';
// PR 991 — Settings › Store details, the prototype's own touches (m-settings.js renderStore): the one "Save changes" button
// in the page head (every card saves itself when asked), the "Web address" box (changed only with the owner's PIN), and
// "Preview sticker" (a sketch of the parcel sticker with the saved header and footer). Words come from the page.
import { useId, useRef, useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface SaveAllTexts {
  save: string;
  saving: string;
  saved: string;
  nothing: string;
  failed: string;
}

/** The page's one Save changes: asks every card (drawn `bare`) that has an unsaved change to save itself. */
export function StoreSaveAll({ texts: x, canEdit }: { texts: SaveAllTexts; canEdit: boolean }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const jobs: Promise<boolean>[] = [];
    window.dispatchEvent(new CustomEvent('extas:save-cards', { detail: { jobs } }));
    const results = await Promise.all(jobs);
    setBusy(false);
    if (!results.length) return showToast({ text: x.nothing, tone: 'info' });
    showToast(results.every(Boolean) ? { text: x.saved, tone: 'ok' } : { text: x.failed, tone: 'bad' });
  }
  return (
    <button type="button" className="a2-btn pri" disabled={!canEdit || busy} onClick={run} data-testid="store-save-all">
      {busy ? x.saving : x.save}
    </button>
  );
}

export interface WebAddressTexts {
  label: string;
  hint: string;
  none: string;
  change: string;
  newLabel: string;
  pin: string;
  cancel: string;
  ok: string;
  saving: string;
  saved: string;
  err: Record<string, string>;
}

/** The store's web address: shown as it is; changed with a new address and the owner's PIN. */
export function StoreWebAddress({ url, current, canEdit, texts: x }: { url: string; current: string; canEdit: boolean; texts: WebAddressTexts }) {
  const id = useId();
  const [host, setHost] = useState(current);
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState('');
  async function save() {
    setBusy(true);
    setBad('');
    const a = await call('POST', url, { domain: next, pin });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      setHost(String(a.data.webAddress ?? next));
      setOpen(false);
      setPin('');
      setNext('');
      return showToast({ text: x.saved, tone: 'ok' });
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    setBad(x.err[code] ?? x.err.other ?? code);
  }
  return (
    <div className="a2-fld" data-testid="store-web-address">
      <label className="a2-lbl" htmlFor={`${id}-h`}>
        {x.label}
      </label>
      <div className="a2-gap8" style={{ alignItems: 'center' }}>
        <input id={`${id}-h`} className="a2-inp" value={host} readOnly placeholder={x.none} style={{ flex: 1, minWidth: 0 }} />
        {canEdit && !open ? (
          <button type="button" className="a2-btn" onClick={() => setOpen(true)} data-testid="store-web-change">
            {x.change}
          </button>
        ) : null}
      </div>
      <span className="a2-xs a2-mute">{x.hint}</span>
      {open ? (
        <div className="a2-stack a2-mt6" style={{ gap: 8 }}>
          <label className="a2-lbl" htmlFor={`${id}-n`}>
            {x.newLabel}
          </label>
          <input id={`${id}-n`} className="a2-inp" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="off" />
          <label className="a2-lbl" htmlFor={`${id}-p`}>
            {x.pin}
          </label>
          <input id={`${id}-p`} className="a2-inp" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
          {bad ? (
            <span className="a2-sm" role="alert">
              {bad}
            </span>
          ) : null}
          <div className="a2-gap8">
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setOpen(false)}>
              {x.cancel}
            </button>
            <button type="button" className="a2-btn pri" disabled={busy || !next.trim() || !pin} onClick={save}>
              {busy ? x.saving : x.ok}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface StickerTexts {
  button: string;
  title: string;
  close: string;
  to: string;
  sample: string;
  cod: string;
}

/** "Preview sticker": the parcel sticker as the saved header and footer will print it (a sketch with made-up sample lines). */
export function StoreStickerPreview({ head, foot, next, texts: x }: { head: string; foot: string; next: string; texts: StickerTexts }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="a2-btn" onClick={() => ref.current?.showModal()} data-testid="store-sticker-preview">
        {x.button}
      </button>
      <dialog ref={ref} className="st-dlg" aria-label={x.title}>
        <h2 className="a2-h3">{x.title}</h2>
        <div className="st-sticker">
          <b className="st-sthead">{head}</b>
          <p className="a2-sm">
            {x.to}: {x.sample}
          </p>
          <div className="st-stline">
            <span className="a2-mono">{next}</span>
            <b>{x.cod}</b>
          </div>
          <p className="a2-xs a2-mute">{foot}</p>
        </div>
        <div className="a2-scbar">
          <span />
          <button type="button" className="a2-btn" onClick={() => ref.current?.close()}>
            {x.close}
          </button>
        </div>
      </dialog>
    </>
  );
}
