'use client';
// PR 627 (CN-036, LUMEN-SPEC §3 item 7) — the admin's one toast. Any admin screen calls `showToast({ text })`; the
// shell's ToastHost draws it at the bottom centre (above the phone's bottom bar) and reads it out (role=status).
// Undo: a toast offers "Undo" for `admin.patterns.undoSeconds` (5 as shipped) only when its action kind is a
// reversible shop action (lib/admin-lumen/safety.ts: confirm an order, assign a courier, change a status, hide,
// pause …). For money, refunds, COD, prices, discounts, blocking and deleting no Undo is ever drawn: those keep their
// own confirmation. A newer toast replaces the one showing (its Undo is then gone: the action stays done).
// The clock waits while the mouse, a finger or the keyboard is on the toast, each with its own flag, and runs on when
// that one leaves (hard rule 7; model.ts pauseAfter). Esc closes it.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { NO_PAUSE, pauseAfter, paused, type PauseEvent, type PauseFlags } from '@/lib/admin-lumen/model';
import { undoAllowed } from '@/lib/admin-lumen/safety';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { useLumen } from './context';

export interface ToastUndo {
  /** The action's kind (safety.ts); only a reversible kind gets the Undo button. */
  kind: string;
  /** Takes the action back; false (or a throw) shows "could not undo". */
  run(): Promise<boolean> | boolean;
}

export interface ToastAsk {
  text: string;
  tone?: 'ok' | 'bad' | 'info';
  undo?: ToastUndo;
}

/** The window event the host listens to (one host per page, mounted by the shell). */
export const TOAST_EVENT = 'lm-toast';

/** Show the one toast (from any client component in the admin). */
export function showToast(ask: ToastAsk): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastAsk>(TOAST_EVENT, { detail: ask }));
}

interface Shown extends ToastAsk {
  id: number;
  canUndo: boolean;
}

/** The toast as it will be drawn: Undo dropped for any kind that is not reversible. */
export function toastShown(ask: ToastAsk, id: number): Shown {
  return { ...ask, id, canUndo: !!ask.undo && undoAllowed(ask.undo.kind) };
}

/** The text a toast is drawn with (no Undo button: the static markup the tests read). */
export function ToastView({ toast, undoLabel, closeLabel, onUndo, onClose, left }: { toast: Shown; undoLabel: string; closeLabel: string; onUndo?(): void; onClose?(): void; left?: number }) {
  return (
    <div className={`lm-toast${toast.tone ? ` ${toast.tone}` : ''}`} data-testid="lm-toast">
      <ShellIcon name={toast.tone === 'bad' ? 'alert' : 'check'} size={18} />
      <span className="lm-toast-t">{toast.text}</span>
      {toast.canUndo ? (
        <button type="button" className="lm-toast-u" onClick={onUndo} data-testid="lm-toast-undo">
          {undoLabel}
          {left !== undefined ? <small aria-hidden="true">{left}</small> : null}
        </button>
      ) : null}
      <button type="button" className="lm-toast-x" aria-label={closeLabel} onClick={onClose}>
        <ShellIcon name="x" size={16} />
      </button>
    </div>
  );
}

export function ToastHost() {
  const { undoSeconds, lt } = useLumen();
  const [toast, setToast] = useState<Shown | null>(null);
  const [left, setLeft] = useState(0);
  const [flags, flag] = useReducer((f: PauseFlags, e: PauseEvent | 'reset') => (e === 'reset' ? NO_PAUSE : pauseAfter(f, e)), NO_PAUSE);
  const seq = useRef(0);
  // Time left in ms; counts down only while nothing holds the toast.
  const remaining = useRef(0);

  useEffect(() => {
    const on = (ev: Event) => {
      const ask = (ev as CustomEvent<ToastAsk>).detail;
      if (!ask || typeof ask.text !== 'string') return;
      seq.current += 1;
      const shown = toastShown(ask, seq.current);
      remaining.current = (shown.canUndo ? undoSeconds : Math.min(undoSeconds, 4)) * 1000;
      setLeft(Math.ceil(remaining.current / 1000));
      flag('reset');
      setToast(shown);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, [undoSeconds]);

  const close = useCallback(() => {
    setToast(null);
    flag('reset');
  }, []);

  useEffect(() => {
    if (!toast || paused(flags)) return;
    const step = 250;
    const h = window.setInterval(() => {
      remaining.current -= step;
      setLeft(Math.max(0, Math.ceil(remaining.current / 1000)));
      if (remaining.current <= 0) close();
    }, step);
    return () => window.clearInterval(h);
  }, [toast, flags, close]);

  useEffect(() => {
    if (!toast) return;
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toast, close]);

  const undo = async () => {
    const u = toast?.undo;
    if (!toast || !u || !toast.canUndo) return;
    let ok = false;
    try {
      ok = (await u.run()) !== false;
    } catch {
      ok = false;
    }
    seq.current += 1;
    remaining.current = 4000;
    flag('reset');
    setToast(toastShown({ text: ok ? lt('undone') : lt('undoFailed'), tone: ok ? 'info' : 'bad' }, seq.current));
  };

  return (
    <div
      className="lm-toast-slot"
      role="status"
      aria-live="polite"
      onMouseEnter={() => flag('mouseenter')}
      onMouseLeave={() => flag('mouseleave')}
      onTouchStart={() => flag('touchstart')}
      onTouchEnd={() => flag('touchend')}
      onTouchCancel={() => flag('touchend')}
      onFocus={() => flag('focusin')}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) flag('focusout');
      }}
    >
      {toast ? <ToastView key={toast.id} toast={toast} undoLabel={lt('undo')} closeLabel={lt('close')} onUndo={undo} onClose={close} left={toast.canUndo ? left : undefined} /> : null}
    </div>
  );
}
