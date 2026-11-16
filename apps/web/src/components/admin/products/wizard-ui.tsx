'use client';
// S28 · PR 1031 — the small pieces every wizard step uses (prototype v5 "Add product"): a field with its ERP / Auto / You tag and
// hint, a segmented choice, a switch, a callout, a check line and a modal box. Words come from the dictionary.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t, type Dict } from '@/lib/i18n';
import './wizard-steps.css';

export type TagKind = 'e' | 'a' | 'y';

export function Tag({ dict, kind }: { dict: Dict; kind: TagKind }) {
  return <span className={`wzp-tag ${kind}`}>{t(dict, `products.wiz.tag.${kind}`)}</span>;
}

export function Fld(p: { dict: Dict; label: ReactNode; tag?: TagKind; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="wzp-fld">
      <label className="lbl" htmlFor={p.htmlFor}>
        {p.label}
        {p.tag ? <Tag dict={p.dict} kind={p.tag} /> : null}
      </label>
      {p.children}
      {p.hint ? <div className="wzp-hint">{p.hint}</div> : null}
    </div>
  );
}

export function Seg<T extends string>(p: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return (
    <div className="wzp-seg" role="group" aria-label={p.label}>
      {p.options.map(([v, l]) => (
        <button key={v} type="button" className={v === p.value ? 'on' : ''} aria-pressed={v === p.value} disabled={p.disabled} onClick={() => p.onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Switch(p: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <span className="wzp-swrow">
      <label className="wzp-sw">
        <input id={p.id} type="checkbox" role="switch" checked={p.checked} disabled={p.disabled} aria-label={p.label} onChange={(e) => p.onChange(e.target.checked)} />
        <span />
      </label>
      <span className="wzp-swtxt">{p.label}</span>
    </span>
  );
}

export function Callout({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  return (
    <div className={`wzp-callout ${kind === 'info' ? '' : kind}`} role={kind === 'bad' || kind === 'warn' ? 'alert' : 'status'}>
      <span>{children}</span>
    </div>
  );
}

export function CheckLine({ state, children }: { state: 'ok' | 'no' | 'stop' | 'dash'; children: ReactNode }) {
  return (
    <div className={`wzp-ck ${state}`}>
      <span className="i" aria-hidden="true">
        {state === 'ok' ? '✓' : state === 'dash' ? '–' : '!'}
      </span>
      <span>{children}</span>
    </div>
  );
}

export function Modal(p: { title: string; onClose: () => void; foot: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [p]);
  return (
    <div className="wzp-modal-back" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="wzp-modal" role="dialog" aria-modal="true" aria-label={p.title} tabIndex={-1} ref={ref}>
        <h2>{p.title}</h2>
        {p.children}
        <footer>{p.foot}</footer>
      </div>
    </div>
  );
}

/** A text value that is sent on when typing stops (the wizard "saves by itself"). */
export function useDebounced<T>(value: T, ms: number, fn: (v: T) => void, skipFirst = true) {
  const first = useRef(skipFirst);
  const cb = useRef(fn);
  useEffect(() => {
    cb.current = fn;
  });
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const h = setTimeout(() => cb.current(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
}

export function useStateFrom<T>(initial: T): [T, (v: T) => void] {
  const [v, setV] = useState(initial);
  return [v, setV];
}
