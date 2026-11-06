// PR 627/628 (CN-036, LUMEN-SPEC §3 and §5) — which shop actions the Lumen patterns may run in one tap and offer Undo
// for, and the one shape of a call they make. Pure: the queue, the list's bulk bar, the toast and the tests share it.
//
// Undo (and a "do all" button) exist only for reversible shop actions: confirm an order, assign a courier, change a
// status, hide, pause (and their own way back). Money, refunds, payouts marked received, COD changes, prices,
// discounts, blocking people and deleting data are never one tap: a pattern only opens their existing page, where the
// existing confirmation and the owner's written OK stay (CLAUDE.md hard rule 6). An action kind not listed as
// reversible is treated as one of those, so a new kind is safe until someone lists it here on purpose.

/** The reversible shop actions: one tap, a toast with Undo, allowed in a "do all". */
export const REVERSIBLE_ACTIONS = ['order.confirm', 'order.courier', 'order.status', 'hide', 'show', 'pause', 'resume', 'archive', 'unarchive', 'mark.read', 'setting.switch'] as const;

/** Kinds that are never one tap and never undone by a toast (their own page keeps its confirmation). */
export const GUARDED_ACTIONS = ['money', 'refund', 'payout.received', 'cod', 'price', 'discount', 'block', 'delete'] as const;

export type ReversibleAction = (typeof REVERSIBLE_ACTIONS)[number];
export type GuardedAction = (typeof GUARDED_ACTIONS)[number];

/** May this kind of action run in one tap with an Undo toast? Unknown kinds: no. */
export function undoAllowed(kind: string | null | undefined): kind is ReversibleAction {
  if (!kind) return false;
  if ((GUARDED_ACTIONS as readonly string[]).some((g) => kind === g || kind.startsWith(`${g}.`))) return false;
  return (REVERSIBLE_ACTIONS as readonly string[]).includes(kind);
}

/** A "do all" button only when every action in it is reversible (and there is at least one). */
export function doAllAllowed(kinds: readonly (string | null | undefined)[]): boolean {
  return kinds.length > 0 && kinds.every((k) => undoAllowed(k));
}

/** One request a pattern makes on the admin's own API (never another site, never a page). */
export interface LmCall {
  method: 'POST' | 'PUT' | 'PATCH';
  url: string;
  body?: Record<string, unknown>;
}

/** Only the admin API, a same-site path without tricks. */
export function callAllowed(c: LmCall | null | undefined): c is LmCall {
  if (!c || typeof c.url !== 'string') return false;
  if (!['POST', 'PUT', 'PATCH'].includes(c.method)) return false;
  return /^\/api\/admin\/[A-Za-z0-9/_\-.?=&%]*$/.test(c.url) && !c.url.includes('..') && !c.url.includes('//');
}

/** What a row or bulk action does once checked: run (one tap + Undo), open its own page, or nothing. */
export type ActMode = { mode: 'run'; call: LmCall; undo: LmCall } | { mode: 'open'; href: string } | { mode: 'none' };

export interface LmAction {
  kind: string;
  label: string;
  /** The call that does it (only used for a reversible kind with an undo call). */
  call?: LmCall;
  /** The call that takes it back. */
  undo?: LmCall;
  /** Its own page (for a guarded action: where the existing confirmation is). */
  href?: string;
}

const pageHref = (h: string | undefined) => (h && /^\/admin(\/|\?|$)/.test(h) && !h.includes('//') ? h : null);

/** Decide how an action is offered: a guarded kind (or one without both calls) can only open its own page. */
export function actMode(a: LmAction): ActMode {
  if (undoAllowed(a.kind) && callAllowed(a.call) && callAllowed(a.undo)) return { mode: 'run', call: a.call, undo: a.undo };
  const href = pageHref(a.href);
  return href ? { mode: 'open', href } : { mode: 'none' };
}

/** The call with extra body fields (the ids of a bulk action, the values of a form). */
export function withBody(c: LmCall, extra: Record<string, unknown>): LmCall {
  return { ...c, body: { ...(c.body ?? {}), ...extra } };
}

/** Run one call in the browser; true when the API said yes. */
export async function runCall(c: LmCall): Promise<boolean> {
  if (!callAllowed(c)) return false;
  try {
    const r = await fetch(c.url, { method: c.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(c.body ?? {}) });
    return r.ok;
  } catch {
    return false;
  }
}
