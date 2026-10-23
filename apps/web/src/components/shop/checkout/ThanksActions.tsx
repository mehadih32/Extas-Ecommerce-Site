'use client';
// PR 126 — the thank-you page's two buttons that act: "Copy" puts the order number on the clipboard (and says so), and
// "Try again" after a failed payment opens a new payment for the same order (never a second order, SIM-F-026).
import { useState } from 'react';
import { fill } from '@/lib/shop/dict';
import type { ShopLang } from '@/lib/shop/lang';
import { showToast } from '../toast';
import { PAYMENTS_URL, postJson } from './quote-client';

type W = Record<string, string>;
const say = (words: W, k: string, vars: Record<string, string> = {}) => fill(words[k] ?? k, vars);

export function CopyNumber({ number, words }: { number: string; words: W }) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      data-testid="ty-copy"
      onClick={(e) => {
        const el = e.currentTarget;
        void navigator.clipboard?.writeText(number).catch(() => {});
        showToast(el, say(words, 'ty.copied', { number }));
      }}
    >
      {say(words, 'ty.copy')}
    </button>
  );
}

export function RetryPayment({ number, lang, words }: { number: string; lang: ShopLang; words: W }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary btn-block mt12"
      disabled={busy}
      data-testid="ty-retry"
      onClick={async (e) => {
        const el = e.currentTarget;
        setBusy(true);
        const r = await postJson<{ ok: boolean; next?: string }>(PAYMENTS_URL, { number, action: 'retry', lang });
        if (r.data?.ok && r.data.next) return window.location.assign(r.data.next);
        setBusy(false);
        showToast(el, say(words, r.data ? 'err.other' : 'err.network'));
      }}
    >
      {say(words, busy ? 'mock.wait' : 'ty.retry')}
    </button>
  );
}
