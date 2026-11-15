'use client';
// S28 · PR 731 (admin prototype v5, Orders › To pack › "Peak / Eid mode" and "Print all in parts"): the banner under the page
// title. A switch turns the mode on; then the daily cap (with how many orders came in today and a bar), the words the shop says
// when the day is full (English and Bengali), who works on the busy days, and "Print all in parts of" with one button per part
// (each opens the print run cut to that part). Saved whole to /api/admin/packing/settings (`orders.peak`, `fulfilment.printSettings`).
// Off and empty as shipped (CN-018). The numbers and words are the owner's; nothing is typed here that the shop does not keep.
import Link from 'next/link';
import { useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { ShellIcon } from '../shell/ShellIcon';

export interface PeakValue {
  enabled: boolean;
  dailyCap: number | null;
  fullTextEn: string;
  fullTextBn: string;
  partSize: number | null;
  roster: { name: string; task: string; from: string; to: string }[];
}

export interface PeakTexts {
  title: string;
  on: string;
  off: string;
  hint: string;
  cap: string;
  capNone: string;
  today: string;
  full: string;
  left: string;
  fullEn: string;
  fullBn: string;
  fullHelp: string;
  parts: string;
  partsNone: string;
  partsOf: string;
  partsUnit: string;
  part: string;
  roster: string;
  rosterNone: string;
  name: string;
  task: string;
  from: string;
  to: string;
  add: string;
  remove: string;
  save: string;
  saved: string;
  readOnly: string;
  err: Record<string, string>;
}

const PARTS = [10, 25, 50, 100] as const; // hardcode-ok: the choices of a list, the size itself is the owner's setting

export function PeakCard({ screen, texts: x, canEdit, today, ready, printHref }: { screen: { value: PeakValue; version: string }; texts: PeakTexts; canEdit: boolean; today: number; ready: number; printHref: string }) {
  const [base, setBase] = useState(screen);
  const [v, setV] = useState<PeakValue>(screen.value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dirty = JSON.stringify(v) !== JSON.stringify(base.value);
  const set = (p: Partial<PeakValue>) => (setV((c) => ({ ...c, ...p })), setErr(''));
  const off = !canEdit || busy;
  const left = v.dailyCap === null ? null : Math.max(0, v.dailyCap - today);
  const partSizes = [...new Set([...PARTS, ...(v.partSize ? [v.partSize] : [])])].sort((a, b) => a - b);
  const size = v.partSize ?? 0;
  const parts = v.enabled && size > 0 && ready > 0 ? Math.ceil(ready / size) : 0;

  async function save() {
    setBusy(true);
    setErr('');
    const a = await call('PUT', '/api/admin/packing/settings', { key: 'orders.peak', value: v, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      const c = (a.data.cards as Record<string, { value: PeakValue; version: string }>)['orders.peak']!;
      setBase(c);
      setV(c.value);
      return showToast({ text: x.saved, tone: 'ok' });
    }
    const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
    setErr((x.err[code] ?? x.err.other ?? code).replace('{fields}', (a.data.details ?? []).join(', ')));
  }

  return (
    <section className={`a2-card tight pk-card${v.enabled ? ' on' : ''}`} aria-label={x.title} data-testid="peak-card" id="peak">
      <div className="pk-top">
        <div className="a2-gap8">
          <b>{x.title}</b>
          <span className={`a2-pill ${base.value.enabled ? 'warn' : 'line'}`}>{base.value.enabled ? x.on : x.off}</span>
        </div>
        <button type="button" className={`a2-sw${v.enabled ? ' on' : ''}`} role="switch" aria-checked={v.enabled} aria-label={x.title} disabled={off} onClick={() => set({ enabled: !v.enabled })} data-testid="peak-switch" />
      </div>
      {!v.enabled ? <p className="a2-xs a2-mute a2-mt6">{x.hint}</p> : null}
      {v.enabled ? (
        <div className="pk-grid">
          <div className="pk-cell">
            <span className="a2-lbl">{x.cap}</span>
            <input className="a2-inp" type="number" min={1} max={100000} inputMode="numeric" placeholder={x.capNone} value={v.dailyCap ?? ''} disabled={off} onChange={(e) => set({ dailyCap: e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value)) || 1) })} data-testid="peak-cap" />
            {v.dailyCap !== null ? (
              <>
                <div className="pk-bar" role="img" aria-label={x.today.replace('{n}', String(today)).replace('{cap}', String(v.dailyCap))}>
                  <i style={{ width: `${Math.min(100, (today / v.dailyCap) * 100)}%` }} className={today >= v.dailyCap ? 'full' : ''} />
                </div>
                <span className="a2-xs a2-mute">{today >= v.dailyCap ? x.full : x.left.replace('{n}', String(left)).replace('{today}', String(today)).replace('{cap}', String(v.dailyCap))}</span>
              </>
            ) : null}
          </div>
          <div className="pk-cell">
            <label className="a2-lbl" htmlFor="pk-en">
              {x.fullEn}
            </label>
            <input id="pk-en" className="a2-inp" maxLength={200} value={v.fullTextEn} disabled={off} onChange={(e) => set({ fullTextEn: e.target.value })} data-testid="peak-full-en" />
            <label className="a2-lbl" htmlFor="pk-bn">
              {x.fullBn}
            </label>
            <input id="pk-bn" className="a2-inp" maxLength={200} value={v.fullTextBn} disabled={off} onChange={(e) => set({ fullTextBn: e.target.value })} data-testid="peak-full-bn" />
            <span className="a2-xs a2-mute">{x.fullHelp}</span>
          </div>
          <div className="pk-cell">
            <span className="a2-lbl">{x.roster}</span>
            {v.roster.length ? (
              v.roster.map((r, i) => (
                <div className="pk-r" key={i}>
                  <input className="a2-inp" aria-label={x.name} placeholder={x.name} maxLength={80} value={r.name} disabled={off} onChange={(e) => set({ roster: v.roster.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) })} />
                  <input className="a2-inp" aria-label={x.task} placeholder={x.task} maxLength={80} value={r.task} disabled={off} onChange={(e) => set({ roster: v.roster.map((y, j) => (j === i ? { ...y, task: e.target.value } : y)) })} />
                  <input className="a2-inp" type="date" aria-label={x.from} value={r.from} disabled={off} onChange={(e) => set({ roster: v.roster.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)) })} />
                  <input className="a2-inp" type="date" aria-label={x.to} value={r.to} disabled={off} onChange={(e) => set({ roster: v.roster.map((y, j) => (j === i ? { ...y, to: e.target.value } : y)) })} />
                  <button type="button" className="a2-btn sm" disabled={off} onClick={() => set({ roster: v.roster.filter((_, j) => j !== i) })}>
                    {x.remove}
                  </button>
                </div>
              ))
            ) : (
              <span className="a2-xs a2-mute">{x.rosterNone}</span>
            )}
            <button type="button" className="a2-btn sm pk-add" disabled={off || v.roster.length >= 60} onClick={() => set({ roster: [...v.roster, { name: '', task: '', from: '', to: '' }] })} data-testid="peak-add">
              <ShellIcon name="plus" size={14} />
              {x.add}
            </button>
          </div>
        </div>
      ) : null}
      {v.enabled ? (
        <div className="pk-parts">
          <span className="a2-xs">
            <b>{x.parts}</b>
          </span>
          <select className="a2-sel" aria-label={x.partsOf} value={v.partSize ?? ''} disabled={off} onChange={(e) => set({ partSize: e.target.value === '' ? null : Number(e.target.value) })} data-testid="peak-part-size">
            <option value="">{x.partsNone}</option>
            {partSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="a2-xs a2-mute">{x.partsUnit}</span>
        </div>
      ) : null}
      {parts > 0 && !dirty ? (
        <div className="pk-partbtns" data-testid="peak-part-buttons">
          {Array.from({ length: parts }, (_, i) => (
            <Link key={i} className="a2-btn sm" href={`${printHref}${printHref.includes('?') ? '&' : '?'}part=${i + 1}`}>
              <ShellIcon name="print" size={14} />
              {x.part.replace('{n}', String(i + 1)).replace('{from}', String(i * size + 1)).replace('{to}', String(Math.min(ready, (i + 1) * size)))}
            </Link>
          ))}
        </div>
      ) : null}
      {err ? (
        <div className="a2-note bad" role="alert">
          <ShellIcon name="alert" size={15} />
          <span>{err}</span>
        </div>
      ) : null}
      <div className="pk-foot">
        {!canEdit ? <span className="a2-xs a2-mute">{x.readOnly}</span> : null}
        {canEdit && dirty ? (
          <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void save()} data-testid="peak-save">
            {x.save}
          </button>
        ) : null}
      </div>
    </section>
  );
}
