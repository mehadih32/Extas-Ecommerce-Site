'use client';
// PR 49 — the product page's two layout passes (demo 30-product.js pdp_fitRows / pdp_budget, R14 "auto-adjust" and 33
// "the first-screen budget"), run after every change of choice, on a real resize and once the fonts have settled:
// - every line marked [data-fitrow] stays one line: its parts with shorter wordings (.pdp-fx, data-l) step down one
//   level at a time (full label → short label → icon) until it fits; the measurement line hides its last fields and
//   the payment line its last pieces, the first one always stays;
// - on a phone the photo is the slack of the first screen: its height (--pdp-img) is set so the buy column ends just
//   above the buy bar, between the photo's floor and ceiling.
import { useEffect, useRef } from 'react';
import { usePdp } from './PdpRoot';

/** The first-screen budget (demo PDP_FIT): px of air above the bar, the photo's floor and ceiling. Layout constants. */
const FIT = { clear: 4.75, minPx: 150, minVh: 0.2, maxVh: 0.52, maxPx: 500, deepVh: 0.345, anchors: ['.pdp-fmssec', '.pdp-fitline'] };
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

function fitPass(page: HTMLElement, bar: HTMLElement, vh: number): boolean {
  const shot = page.querySelector<HTMLElement>('.pdp-main .pimg');
  if (!shot) return true;
  const sy = window.scrollY || 0;
  const max = Math.min(FIT.maxVh * vh, FIT.maxPx);
  const deep = FIT.deepVh * vh;
  const min = Math.max(90, Math.min(FIT.minPx, FIT.minVh * vh));
  const h0 = shot.getBoundingClientRect().height;
  let want: number | null = null;
  let who = '';
  for (let i = 0; i < FIT.anchors.length; i++) {
    const a = page.querySelector<HTMLElement>(FIT.anchors[i]!);
    if (!a) continue;
    const clear = FIT.anchors[i] === '.pdp-fitline' ? parseFloat(getComputedStyle(a).marginTop) || FIT.clear : FIT.clear;
    const target = vh - bar.offsetHeight - clear;
    const h = h0 + (target - (a.getBoundingClientRect().bottom + sy));
    if (i === FIT.anchors.length - 1) {
      want = Math.max(min, Math.min(max, h));
      who = FIT.anchors[i]!;
      if (want >= max - 0.5 && h > max + 1) who = '';
      break;
    }
    if (h >= deep && h <= max) {
      want = h;
      who = FIT.anchors[i]!;
      break;
    }
  }
  if (want === null) return true;
  page.setAttribute('data-fit-anchor', who);
  page.style.setProperty('--pdp-img', `${want.toFixed(2)}px`);
  return Math.abs(want - h0) < 0.4;
}

function budget(vh: number): void {
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
  for (let i = 0; i < 4 && !fitPass(page, bar, vh); i++);
  // last resort for a tall product on a short screen: the column's own gaps give up a few pixels
  const fit = page.querySelector<HTMLElement>('.pdp-fitline');
  if (fit && page.getAttribute('data-fit-anchor') === '.pdp-fitline') {
    const clear = parseFloat(getComputedStyle(fit).marginTop) || FIT.clear;
    if (fit.getBoundingClientRect().bottom + (window.scrollY || 0) > vh - bar.offsetHeight - clear + 0.6) {
      page.classList.add('pdp-tight');
      for (let i = 0; i < 4 && !fitPass(page, bar, vh); i++);
    }
  }
}

export function PdpEffects() {
  const { choice, err, unit } = usePdp();
  const first = useRef(true);

  useEffect(() => {
    // R15 · 7.2: the phone's own toolbars sliding in and out are not a resize worth re-planning the screen for
    let vp = { w: window.innerWidth, h: window.innerHeight };
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(t);
      t = setTimeout(() => budget(vp.h), 60);
    };
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === vp.w && Math.abs(h - vp.h) < 160) return;
      vp = { w, h };
      soon();
    };
    // the first pass runs in the next frame, not inside hydration's own task (PR 49 · Lighthouse TBT)
    const raf = requestAnimationFrame(() => budget(vp.h));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', soon);
    document.fonts?.ready.then(() => budget(vp.h)).catch(() => undefined);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', soon);
    };
  }, []);

  useEffect(() => {
    // the mount pass is the one above; this one re-plans after each change of choice
    if (first.current) {
      first.current = false;
      return;
    }
    budget(window.innerHeight);
  }, [choice, err, unit]);

  return null;
}
