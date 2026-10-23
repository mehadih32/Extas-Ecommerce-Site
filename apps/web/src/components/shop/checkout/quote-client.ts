'use client';
// PR 117 — the checkout page asks the server to price it again whenever the customer finishes something that changes
// the money (the address line, a band he picked, …). The answer replaces what the page shows; an answer that arrives
// after a newer question was sent is dropped, so a slow reply can never put an old charge back on the page.
import { useEffect, useRef, useState } from 'react';
import { createSettle, type SettleController } from '@extas/delivery/settle';
import type { CheckoutView } from '@extas/checkout/pure';
import type { Confirmed } from '@/lib/shop/checkout-model';

export const QUOTE_URL = '/api/checkout/quote';

/** Sends the customer's choices and returns the checkout as the server prices it (null when it did not answer). */
export async function postJson<T>(url: string, payload: unknown): Promise<{ status: number; data: T | null }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' });
    const data = (await r.json().catch(() => null)) as T | null;
    return { status: r.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

/** Latest-wins: each call gets a number; only the answer to the newest call is used. */
export function latest() {
  let n = 0;
  return {
    next: () => ++n,
    isLatest: (k: number) => k === n,
  };
}

/** Everything the page sends the server about the customer's choices (later PRs add payment, wallet …). */
export interface Choices {
  /** The finished address line last read. */
  line: string | null;
  /** The band (and place) he picked when he was asked (PR 118). */
  confirmed: Confirmed;
}

export async function fetchQuote(payload: Record<string, unknown>): Promise<CheckoutView | null> {
  const r = await postJson<{ ok: boolean; view?: CheckoutView }>(QUOTE_URL, payload);
  return r.data?.ok && r.data.view ? r.data.view : null;
}

export interface Settle {
  input(line: string): void;
  blur(): void;
  /** Forget the last read, so the same line is read again (a band chosen, then taken back). */
  reset(): void;
}

/**
 * The address box's "finished" controller (PR 551's settle rule): a read after a pause of `settleMs` once the line has
 * `minWords` words, or when the box is left. Typing again cancels a waiting read and the next pause reads again — the
 * pause always resumes. The controller lives as long as the page.
 */
export function useSettle(opts: { settleMs: number; minWords: number; onSettle: (line: string) => void }): Settle {
  const ref = useRef<SettleController | null>(null);
  const cb = useRef(opts.onSettle);
  useEffect(() => {
    cb.current = opts.onSettle;
  });
  useEffect(() => {
    const s = createSettle({ settleMs: opts.settleMs, minWords: opts.minWords, onSettle: (line) => cb.current(line) });
    ref.current = s;
    return () => {
      s.dispose();
      ref.current = null;
    };
  }, [opts.settleMs, opts.minWords]);
  const [api] = useState<Settle>(() => ({
    input: (line) => ref.current?.input(line),
    blur: () => ref.current?.blur(),
    reset: () => ref.current?.reset(),
  }));
  return api;
}
