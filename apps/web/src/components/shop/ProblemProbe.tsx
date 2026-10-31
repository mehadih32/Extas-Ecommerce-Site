'use client';
// S21 · PR 423 (CN-015) — the shop's privacy-safe problem recorder, on every shop page while `health.problems` is on
// (the shop layout draws it with the owner's numbers). It listens, quietly, for: a script error or a promise nobody
// caught, a call to the shop's own server that failed (5xx) or was slow, a page that loaded with an error or slowly, a
// picture that did not load, a form field refused again and again (the browser's own check or the page's
// `aria-invalid`), and rage clicks. Reports go out in one small beacon when the page is left or after a short pause
// (lib/problems/probe.ts). It never reads what anyone typed and sends no name, phone, address or payment detail; it
// draws nothing and never changes the page.
import { useEffect } from 'react';
import { judgeCall, nameOf, PageReports, RageClicks, send, StuckFields, type ProbeConfig, type ProbeItem } from '@/lib/problems/probe';

/** How long the probe waits after the last report before it sends (the page may still be in use). */
const SEND_AFTER_MS = 5_000; // hardcode-ok: a batching pause, not a business number

const G = globalThis as unknown as { __extasProbe?: boolean };

export function ProblemProbe({ cfg }: { cfg: ProbeConfig }) {
  useEffect(() => {
    if (G.__extasProbe) return;
    G.__extasProbe = true;
    const page = new PageReports(cfg.maxPerPage);
    const rage = new RageClicks(cfg.rageClicks);
    const stuck = new StuckFields(cfg.formErrorRepeats);
    let queue: ProbeItem[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastPath = window.location.pathname;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const items = queue;
      queue = [];
      send(items, cfg.storeId);
    };
    const add = (item: ProbeItem) => {
      const path = window.location.pathname;
      if (path !== lastPath) {
        flush(); // the reports of the page before go with their own address
        lastPath = path;
        stuck.reset();
      }
      if (!page.take(path, item)) return;
      queue.push(item);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SEND_AFTER_MS);
    };

    const onError = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLImageElement) {
        // the shop's own pictures by their path; another site's by its address (the server drops any query)
        const src = t.currentSrc || t.src;
        add({ k: 'broken_image', d: src.startsWith(`${window.location.origin}/`) ? src.slice(window.location.origin.length) : src });
        return;
      }
      if (!(e instanceof ErrorEvent)) return;
      // another site's script or a browser add-on says nothing useful (and is not the shop's)
      if (!e.message || e.message === 'Script error.' || (e.filename && !e.filename.startsWith(window.location.origin))) return;
      add({ k: 'script_error', d: e.message });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as unknown;
      const msg = r instanceof Error ? r.message : typeof r === 'string' ? r : '';
      if (msg) add({ k: 'script_error', d: msg });
    };
    const onInvalid = (e: Event) => {
      const el = e.target as HTMLInputElement | null;
      const field = el?.name || el?.id;
      if (field && stuck.refused(field)) add({ k: 'form_stuck', d: `field ${field.slice(0, 60)}` });
    };
    const marked = new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target as Element;
        if (el.getAttribute('aria-invalid') !== 'true') continue;
        const field = el.getAttribute('name') || el.id;
        if (field && stuck.refused(field)) add({ k: 'form_stuck', d: `field ${field.slice(0, 60)}` });
      }
    });
    const onClick = (e: MouseEvent) => {
      if (rage.click(e.timeStamp, e.clientX, e.clientY)) add({ k: 'rage_click', d: nameOf(e.target instanceof Element ? e.target : null) });
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    let calls: PerformanceObserver | null = null;
    try {
      calls = new PerformanceObserver((l) => {
        for (const e of l.getEntries() as PerformanceResourceTiming[]) {
          const item = judgeCall(e, window.location.origin, cfg.slowRequestMs);
          if (item) add(item);
        }
      });
      calls.observe({ type: 'resource', buffered: true });
    } catch {
      calls = null; // an old browser without it: the other checks still run
    }
    const onLoad = () => {
      const nav = performance.getEntriesByType?.('navigation')[0] as (PerformanceNavigationTiming & { responseStatus?: number }) | undefined;
      if (!nav) return;
      if ((nav.responseStatus ?? 0) >= 500) add({ k: 'page_failed', d: '' });
      const ms = Math.round(nav.loadEventEnd || nav.duration);
      if (ms > cfg.slowLoadMs) add({ k: 'slow_load', d: '', ms });
    };

    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    marked.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-invalid'] });
    if (document.readyState === 'complete') setTimeout(onLoad, 0);
    else window.addEventListener('load', () => setTimeout(onLoad, 0), { once: true });
    // The shop layout stays for the whole visit, so these stay too (no clean-up: a second copy is never started).
  }, [cfg]);
  return null;
}
