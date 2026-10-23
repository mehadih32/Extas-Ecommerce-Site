// PR 116 — the checkout's typed details survive a reload or a pull-to-refresh (demo bug 14): kept in this tab's
// sessionStorage only (gone when the tab closes; only the owner's follow-up switch, SIM-F-026, sends it), cleared the moment the order is placed. PR 125:
// the order key lives here too, so a retry after a lost answer is the same order. Storage
// that is blocked (a private window, a preview) simply keeps nothing: the page works the same without it.
import { useSyncExternalStore } from 'react';
import type { DetailsForm } from '@extas/checkout/pure';

const KEY = 'co-draft';

export interface Draft {
  form: DetailsForm;
  /** Everything else the page keeps (payment, note, ticks …), added by later steps. */
  [k: string]: unknown;
}

export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const d = raw ? (JSON.parse(raw) as Partial<Draft>) : null;
    if (!d || typeof d !== 'object' || !d.form || typeof d.form !== 'object') return null;
    const f = d.form as Partial<DetailsForm>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return { ...d, form: { name: str(f.name), phone: str(f.phone), address: str(f.address) } };
  } catch {
    return null;
  }
}

let cache: { raw: string | null; draft: Draft | null } | null = null;
const noSubscribe = () => () => {};

/** The stored draft as a render-time snapshot (null while the server draws the page, then the tab's draft). */
export function useDraft(): Draft | null {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(KEY);
      } catch {
        raw = null;
      }
      if (!cache || cache.raw !== raw) cache = { raw, draft: loadDraft() };
      return cache.draft;
    },
    () => null,
  );
}

/** Keeps what changed, merged over what the tab already keeps (each step saves only its own part). */
export function saveDraft(patch: Partial<Draft>): void {
  try {
    const d = { ...(loadDraft() ?? { form: { name: '', phone: '', address: '' } }), ...patch };
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // storage blocked: nothing is kept
  }
}

/** PR 125 — a new order key (made once per order, kept in the draft until the order is in). */
export function newOrderKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // hardcode-ok: the UUID version 4 bits (RFC 9562)
  b[8] = (b[8]! & 0x3f) | 0x80; // hardcode-ok: the UUID variant bits (RFC 9562)
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // storage blocked: nothing was kept
  }
}

/**
 * Enter — or the phone keyboard's Go / Next — in a checkout field never places the order (demo R15 bug 3): it moves to
 * the next field, and the last one just closes the keyboard. Only a real press of Confirm submits.
 */
export function nextOnEnter(ev: React.KeyboardEvent<HTMLFormElement>): void {
  if (ev.key !== 'Enter' || ev.nativeEvent.isComposing) return;
  const el = ev.target as HTMLElement;
  if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
  ev.preventDefault();
  const list = [...ev.currentTarget.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select')].filter(
    (x) => !(x as HTMLInputElement).disabled && x.getClientRects().length > 0,
  );
  const i = list.indexOf(el);
  if (i >= 0 && i < list.length - 1) list[i + 1]!.focus();
  else el.blur();
}
