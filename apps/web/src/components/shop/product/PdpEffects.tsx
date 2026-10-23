'use client';
// PR 49 — the product page's two layout passes (demo 30-product.js pdp_fitRows / pdp_budget, R14 "auto-adjust" and 33
// "the first-screen budget"), run after every change of choice, on a real resize and once the fonts have settled:
// - every line marked [data-fitrow] stays one line: its parts with shorter wordings (.pdp-fx, data-l) step down one
//   level at a time (full label → short label → icon) until it fits; the measurement line hides its last fields and
//   the payment line its last pieces, the first one always stays;
// - on a phone the photo is the slack of the first screen: its height (--pdp-img) is set so the buy column ends just
//   above the buy bar, between the photo's floor and ceiling (PR 53: the numbers are the `pdp.fit` setting, the
//   arithmetic is lib/shop/pdp-fit.ts).
import { useEffect, useRef } from 'react';
import type { PdpFitSettings } from '@extas/settings';
import { anchorClears, FIT_ANCHORS, FIT_CENTRED, planPhoto, type AnchorProbe } from '@/lib/shop/pdp-fit';
import { usePdp } from './PdpRoot';

const DESKTOP = 1024;

function rowOver(row: HTMLElement): boolean {
  for (const t of Array.from(row.querySelectorAll<HTMLElement>('.pdp-fitt'))) if (t.offsetWidth && t.scrollWidth > t.clientWidth + 0.5) return true;
  const cs = getComputedStyle(row);
  const kids = Array.from(row.children).filter((k) => (k as HTMLElement).offsetWidth) as HTMLElement[];
  if (kids.length) {
    const rr = row.getBoundingClientRect();
    const edge = rr.right - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.borderRightWidth) || 0);
    if (Math.max(...kids.map((k) => k.getBoundingClientRect().right)) > edge + 0.5) return true;
  }
  if (/flex/.test(cs.display) && !/column/.test(cs.flexDirection) && kids.length > 1) {
    const mids = kids.map((k) => {
      const r = k.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    if (Math.max(...mids) - Math.min(...mids) > 12) return true;
  }
  return false;
}

function fitRows(page: HTMLElement): void {
  page.querySelectorAll<HTMLElement>('[data-fitrow]').forEach((row) => {
    const own = row.classList.contains('pdp-fx') ? [row] : [];
    const fx = [...own, ...Array.from(row.querySelectorAll<HTMLElement>('.pdp-fx')).filter((e) => e.closest('[data-fitrow]') === row)];
    fx.forEach((e) => e.setAttribute('data-l', '0'));
    fx.sort((a, b) => (Number(a.dataset.fxOrd) || 1) - (Number(b.dataset.fxOrd) || 1));
    let k = 0;
    for (let guard = 12; k < fx.length && guard > 0 && rowOver(row); guard--) {
      const e = fx[k]!;
      const l = Number(e.dataset.l) || 0;
      if (l < (Number(e.dataset.fxMax) || 1)) e.setAttribute('data-l', String(l + 1));
      else k++;
    }
    row.setAttribute('data-fit', rowOver(row) ? 'over' : 'ok');
  });
  page.querySelectorAll<HTMLElement>('.pdp-fitx').forEach((x) => {
    const fi = Array.from(x.querySelectorAll<HTMLElement>('.pdp-fi'));
    const dots = Array.from(x.querySelectorAll<HTMLElement>('.pdp-fdot'));
    [...fi, ...dots].forEach((e) => (e.hidden = false));
    for (let k = fi.length - 1; k > 0 && x.scrollWidth > x.clientWidth + 0.5; k--) {
      fi[k]!.hidden = true;
      if (dots[k - 1]) dots[k - 1]!.hidden = true;
    }
  });
  page.querySelectorAll<HTMLElement>('.pdp-payfit').forEach((t) => {
    const pm = Array.from(t.querySelectorAll<HTMLElement>('.pdp-pm'));
    pm.forEach((e) => (e.hidden = false));
    for (let k = pm.length - 1; k > 0 && t.scrollWidth > t.clientWidth + 0.5; k--) pm[k]!.hidden = true;
  });
}

function fitPass(page: HTMLElement, bar: HTMLElement, vh: number, fit: PdpFitSettings): boolean {
  const shot = page.querySelector<HTMLElement>('.pdp-main .pimg');
  if (!shot) {
    page.setAttribute('data-fit-anchor', '');
    return true;
  }
  const sy = window.scrollY || 0;
  const h0 = shot.getBoundingClientRect().height;
  const probes: AnchorProbe[] = [];
  for (const sel of FIT_ANCHORS) {
    const a = page.querySelector<HTMLElement>(sel);
    if (a) probes.push({ sel, bottom: a.getBoundingClientRect().bottom + sy, clear: airUnder(a, sel, fit) });
  }
  const plan = planPhoto(fit, vh, bar.offsetHeight, h0, probes);
  if (!plan) {
    // nothing to bring above the bar (no sizes, no measurement line): the photo keeps its height, the pass is marked done
    page.setAttribute('data-fit-anchor', '');
    return true;
  }
  page.setAttribute('data-fit-anchor', plan.who);
  page.style.setProperty('--pdp-img', `${plan.want.toFixed(2)}px`);
  return Math.abs(plan.want - h0) < 0.4;
}

/** The air an anchor wants under it: the measurement line's own top margin (centred in its room), else the setting. */
function airUnder(a: HTMLElement, sel: string, fit: PdpFitSettings): number {
  return sel === FIT_CENTRED ? parseFloat(getComputedStyle(a).marginTop) || fit.clearPx : fit.clearPx;
}

function budget(vh: number, fit: PdpFitSettings): void {
  const page = document.querySelector<HTMLElement>('.pdp-page');
  if (!page) return;
  fitRows(page);
  const bar = document.querySelector<HTMLElement>('.pdp-mbar');
  if (window.innerWidth >= DESKTOP || !bar || !bar.offsetHeight) {
    page.style.removeProperty('--pdp-img');
    page.classList.remove('pdp-tight');
    return;
  }
  page.classList.remove('pdp-tight');
  for (let i = 0; i < 4 && !fitPass(page, bar, vh, fit); i++);
  // last resort for a tall product on a short screen: the column's own gaps give up a few pixels
  const line = page.querySelector<HTMLElement>(FIT_CENTRED);
  if (fit.tight && line && page.getAttribute('data-fit-anchor') === FIT_CENTRED) {
    const bottom = line.getBoundingClientRect().bottom + (window.scrollY || 0);
    if (!anchorClears(bottom, airUnder(line, FIT_CENTRED, fit), vh, bar.offsetHeight)) {
      page.classList.add('pdp-tight');
      for (let i = 0; i < 4 && !fitPass(page, bar, vh, fit); i++);
    }
  }
}

export function PdpEffects() {
  const { choice, err, unit, set } = usePdp();
  const fit = set.fit;
  const first = useRef(true);

  useEffect(() => {
    // R15 · 7.2: the phone's own toolbars sliding in and out are not a resize worth re-planning the screen for
    let vp = { w: window.innerWidth, h: window.innerHeight };
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(t);
      t = setTimeout(() => budget(vp.h, fit), 60);
    };
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === vp.w && Math.abs(h - vp.h) < 160) return;
      vp = { w, h };
      soon();
    };
    // the first pass runs in the next frame, not inside hydration's own task (PR 49 · Lighthouse TBT)
    const raf = requestAnimationFrame(() => budget(vp.h, fit));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', soon);
    // PR 88: once the fonts have settled the pass runs again, in a frame of its own. Fonts already in at mount (the usual
    // case: they are preloaded) need no second pass: `fonts.ready` then resolved at once and re-ran the whole pass as a
    // microtask inside hydration's own task (~30 ms of a slow phone's main thread, the product page's TBT).
    let late = 0;
    let stopped = false;
    if (document.fonts && document.fonts.status !== 'loaded')
      document.fonts.ready
        .then(() => {
          if (!stopped) late = requestAnimationFrame(() => budget(vp.h, fit));
        })
        .catch(() => undefined);
    return () => {
      stopped = true;
      clearTimeout(t);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(late);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', soon);
    };
  }, [fit]);

  useEffect(() => {
    // the mount pass is the one above; this one re-plans after each change of choice
    if (first.current) {
      first.current = false;
      return;
    }
    budget(window.innerHeight, fit);
  }, [choice, err, unit, fit]);

  return null;
}
