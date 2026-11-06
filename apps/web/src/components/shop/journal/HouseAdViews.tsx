'use client';
// S12 · PR 592 follow-up (register "Click and sales report per ad and slot"; impressions) — counts how often each house
// ad place on the page is seen: once per page view, when at least half of it has been on the reader's screen for a
// moment (a popup or bar only once it opens). The places seen are sent together, a few at a time, with sendBeacon
// (no cookie, nothing about the reader: place ids only). Drawn only while `blog.houseAds.countViews` is on.
import { useEffect } from 'react';
import { beacon } from '@/lib/shop/beacon';

/** How long a place must stay half on screen to count as seen, and how long the page waits to send a batch. */
const SEEN_MS = 1000; // hardcode-ok: the moment a view takes, not a business number
const SEND_MS = 2000; // hardcode-ok
/** How much of a place must be on screen (the usual "viewable" share). */
const SEEN_SHARE = 0.5; // hardcode-ok: the share of a view, not a business number

export function HouseAdViews({ url }: { url: string }) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const counted = new Set<string>();
    const queue = new Set<string>();
    const timers = new Map<Element, number>();
    let sendTimer = 0;
    const send = () => {
      sendTimer = 0;
      if (!queue.size) return;
      const body = JSON.stringify({ p: [...queue] });
      queue.clear();
      try {
        if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) beacon(url, { method: 'POST', body, headers: { 'content-type': 'text/plain' } });
      } catch {
        // a view not counted never breaks the page
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.haPlace;
          if (!id || counted.has(id)) continue;
          if (e.isIntersecting) {
            if (!timers.has(e.target))
              timers.set(
                e.target,
                window.setTimeout(() => {
                  timers.delete(e.target);
                  counted.add(id);
                  queue.add(id);
                  io.unobserve(e.target);
                  if (!sendTimer) sendTimer = window.setTimeout(send, SEND_MS);
                }, SEEN_MS),
              );
          } else {
            window.clearTimeout(timers.get(e.target));
            timers.delete(e.target);
          }
        }
      },
      { threshold: SEEN_SHARE },
    );
    const watch = () =>
      document.querySelectorAll('[data-ha-place]').forEach((el) => {
        const id = (el as HTMLElement).dataset.haPlace;
        if (id && !counted.has(id)) io.observe(el);
      });
    watch();
    // a popup or a slim bar appears later: watch what is added to the page
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    const leave = () => send();
    window.addEventListener('pagehide', leave);
    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener('pagehide', leave);
      timers.forEach((t) => window.clearTimeout(t));
      send();
    };
  }, [url]);
  return null;
}
