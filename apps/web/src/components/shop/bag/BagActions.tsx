'use client';
// PR 105–112 — the bag page's one small script: it sends each button and choice (`data-bag-act`, `data-bag-change`,
// `data-bag-form`) to the bag's API, then asks the server to draw the page again (every amount comes back from the
// engines, nothing is worked out here). Taking a line out or saving it shows a message with Undo that holds while the
// mouse rests on it or the keyboard is on it (hold-timer.ts, L33.23); the phone's checkout bar shows only while the
// summary's Checkout button is out of sight (L33.28), in both scroll directions.
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { holdTimer, type HoldTimer } from '@/lib/shop/hold-timer';

export interface BagWords {
  undo: string;
  removed: string;
  setRemoved: string;
  saved: string;
  moved: string;
  restored: string;
  kept: string;
  changed: string;
  error: string;
  stock: string;
  tooMany: string;
  notForSale: string;
  codeEmpty: string;
  codeRemoved: string;
  /** PR 71 (follow-up 43): "Moved to your wishlist", and the list is full. */
  wished?: string;
  wishFull?: string;
}

const API = '/api/bag';

/** Fills `{name}` slots (the dictionary's own words, resolved on the server). */
const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

type Send = { url: string; method: string; body?: unknown };

async function send(s: Send): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch(s.url, {
    method: s.method,
    headers: s.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: s.body === undefined ? undefined : JSON.stringify(s.body),
    credentials: 'same-origin',
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok && data.ok === true, status: r.status, data };
}

/** `stamp` changes whenever the bag does, so the checkout bar watches the button that is on the page now. */
export function BagActions({ words, undoMs, bagHref, stamp }: { words: BagWords; undoMs: number; bagHref: string; stamp: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const toastRef = useRef<{ el: HTMLElement; timer: HoldTimer | null } | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-bag-root]');
    if (!root) return;

    const clearToast = () => {
      const tt = toastRef.current;
      if (!tt) return;
      tt.timer?.cancel();
      tt.el.remove();
      toastRef.current = null;
    };
    /** A short message; with `undo`, a button that runs it, and the clock holds while the message is in use. */
    const toast = (text: string, undo?: () => void) => {
      clearToast();
      const host = root.closest('.shop') ?? document.body;
      host.querySelector('.toast')?.remove();
      const el = document.createElement('div');
      el.className = undo ? 'toast cb-toast' : 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('data-testid', 'bag-toast');
      const span = document.createElement('span');
      span.textContent = text;
      el.appendChild(span);
      if (undo) {
        const a = document.createElement('a');
        a.href = bagHref;
        a.textContent = words.undo;
        a.setAttribute('data-testid', 'bag-undo');
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          clearToast();
          undo();
        });
        el.appendChild(a);
      }
      host.appendChild(el);
      const timer = holdTimer({ ms: undo ? undoMs : 2_600, onDone: () => clearToast() });
      if (undo) {
        el.addEventListener('pointerover', (ev) => ev.pointerType !== 'touch' && timer.hold('mouse'));
        el.addEventListener('pointerout', (ev) => ev.pointerType !== 'touch' && !el.contains(ev.relatedTarget as Node | null) && timer.release('mouse'));
        el.addEventListener('focusin', (ev) => (ev.target as Element).matches?.(':focus-visible') && timer.hold('key'));
        el.addEventListener('focusout', (ev) => !el.contains(ev.relatedTarget as Node | null) && timer.release('key'));
      }
      toastRef.current = { el, timer };
    };
    const refusal = (code: unknown) => (code === 'OUT_OF_STOCK' ? words.stock : code === 'TOO_MANY' ? words.tooMany : code === 'NOT_FOR_SALE' ? words.notForSale : words.error);

    /** One change: send it, then draw the page again from the server. */
    const run = async (s: Send | Send[], after?: (data: Record<string, unknown>) => void) => {
      if (busy.current) return;
      busy.current = true;
      root.setAttribute('aria-busy', 'true');
      try {
        let last: Record<string, unknown> = {};
        for (const one of Array.isArray(s) ? s : [s]) {
          const r = await send(one);
          if (!r.ok) {
            toast(refusal(r.data.error));
            return false;
          }
          last = r.data;
        }
        after?.(last);
        return true;
      } catch {
        toast(words.error);
        return false;
      } finally {
        busy.current = false;
        root.removeAttribute('aria-busy');
        router.refresh();
      }
    };
    const line = (id: string) => `${API}/lines/${encodeURIComponent(id)}`;
    const restore = (ids: string[]) => void run(ids.map((id) => ({ url: `${line(id)}/restore`, method: 'POST' })), () => toast(words.restored));

    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as Element).closest<HTMLElement>('[data-bag-act]');
      if (!el || !root.contains(el)) return;
      const act = el.dataset.bagAct;
      const id = el.dataset.id ?? '';
      if (act === 'qty') void run({ url: line(id), method: 'PATCH', body: { quantity: Number(el.dataset.q) } });
      else if (act === 'remove')
        void run({ url: line(id), method: 'DELETE' }, (d) => {
          const ids = Array.isArray(d.lineIds) ? (d.lineIds as string[]) : [id];
          toast(el.dataset.set ? words.setRemoved : fill(words.removed, { name: el.dataset.name ?? '' }), () => restore(ids.slice(0, 1)));
        });
      else if (act === 'save') void run({ url: line(id), method: 'PATCH', body: { saved: true } }, () => toast(words.saved, () => void run({ url: line(id), method: 'PATCH', body: { saved: false } })));
      else if (act === 'wish') {
        // PR 71: the line leaves the bag (archived, Undo brings it back) and the product goes on the wishlist with the
        // colour and size it had; Undo also takes it off the list when this move put it there
        const pid = el.dataset.pid ?? '';
        void (async () => {
          const w = await send({ url: '/api/wishlist', method: 'POST', body: { items: [{ productId: pid, variantId: el.dataset.variant || null }] } }).catch(() => null);
          const ids = w?.ok && Array.isArray(w.data.ids) ? (w.data.ids as string[]) : [];
          if (!ids.includes(pid)) return toast(w?.data.full ? (words.wishFull ?? words.error) : words.error);
          const added = Array.isArray(w?.data.added) && (w.data.added as string[]).includes(pid);
          await run({ url: line(id), method: 'DELETE' }, () =>
            toast(words.wished ?? words.saved, () => {
              restore([id]);
              if (added) void send({ url: '/api/wishlist', method: 'DELETE', body: { productId: pid } });
            }),
          );
        })();
      } else if (act === 'move') void run({ url: line(id), method: 'PATCH', body: { saved: false } }, () => toast(words.moved));
      else if (act === 'sizes') void run({ url: `${API}/sizes`, method: 'PUT', body: { key: el.dataset.key, answer: el.dataset.v || null } });
      else if (act === 'keep-one') {
        const ids = (el.dataset.remove ?? '').split(',').filter(Boolean);
        void run(
          ids.map((x) => ({ url: line(x), method: 'DELETE' })),
          () => toast(fill(words.kept, { size: el.dataset.keep ?? '' }), () => restore(ids)),
        );
      } else if (act === 'code-open') {
        const form = root.querySelector<HTMLFormElement>('[data-bag-form="code"]');
        if (!form) return;
        form.hidden = false;
        el.setAttribute('aria-expanded', 'true');
        el.hidden = true;
        form.querySelector('input')?.focus();
      } else if (act === 'code-remove') void run({ url: `${API}/code`, method: 'DELETE' }, () => toast(words.codeRemoved));
    };
    const onChange = (ev: Event) => {
      const el = ev.target as HTMLSelectElement;
      if (!el.matches?.('[data-bag-change="variant"]') || !root.contains(el)) return;
      const was = el.dataset.was ?? '';
      void run({ url: line(el.dataset.id ?? ''), method: 'PATCH', body: { variantId: el.value } }, () => toast(fill(words.changed, { now: el.selectedOptions[0]?.textContent ?? '' }))).then((ok) => {
        if (ok === false && was) el.value = was;
      });
    };
    const onSubmit = (ev: SubmitEvent) => {
      const form = ev.target as HTMLFormElement;
      if (form.dataset.bagForm !== 'code' || !root.contains(form)) return;
      ev.preventDefault();
      const input = form.querySelector('input');
      const code = (input?.value ?? '').trim();
      if (!code) {
        input?.setAttribute('aria-invalid', 'true');
        toast(words.codeEmpty);
        input?.focus();
        return;
      }
      void run({ url: `${API}/code`, method: 'POST', body: { code } });
    };
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', onSubmit);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.removeEventListener('submit', onSubmit);
    };
  }, [router, words, undoMs, bagHref]);

  // The phone's checkout bar: hidden while the summary's own Checkout button is in view (both scroll directions).
  useEffect(() => {
    const btn = document.querySelector('[data-bag-root] [data-testid="bag-checkout"]');
    const bar = document.querySelector<HTMLElement>('.bg-mbar');
    if (!btn || !bar || !('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver((es) => bar.classList.toggle('bg-mbar-off', es[0]?.isIntersecting ?? false), { threshold: 0.9, rootMargin: '0px 0px -12px 0px' }); // hardcode-ok: how much of the button must be in view (the demo's layout value, not a business number)
    obs.observe(btn);
    return () => obs.disconnect();
  }, [stamp]);

  // A set's actions stay on one row (demo .cbt-fit): full words when they fit, the short words when they do not.
  useEffect(() => {
    const fit = () => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-bag-root] [data-bag-fit]')) {
        el.classList.remove('cbt-short');
        if (el.scrollWidth > el.clientWidth + 1) el.classList.add('cbt-short');
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [stamp]);

  useEffect(() => () => {
    toastRef.current?.timer?.cancel();
    toastRef.current?.el.remove();
  }, []);
  return null;
}
