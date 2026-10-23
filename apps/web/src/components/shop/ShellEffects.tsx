'use client';
// PR 40 — the shell's measured fits (demo 03-layout.js layoutNow, R15): nothing is a fixed pixel guess, each is
// measured on the real words and re-checked on resize, scroll, a change of size and the web fonts arriving, at most
// once per frame (never a forever timer), and after the first paint, a part per task (lib/shop/later: the TBT budget).
//   · the phone header keeps the wordmark clear: the heart steps out first when the icons come within 10 px (3.4)
//   · the phone slogan gets the free room beside the wordmark: full → short → hidden, easing down to 8 px (owner 22:14)
//   · WhatsApp + Hotline in the footer stand side by side only when both fit at full size (1.4)
//   · the floating WhatsApp disc steps aside over the footer and rides 12 px above any bar pinned to the bottom (C3)
//   · the checkout header's WhatsApp shows once the page's own help button has scrolled away (3.2)
//   · the page's bottom room is the height of the bar pinned to the bottom, measured (L15: the wrapper's padding)
//   · the footer columns step their type down instead of cutting a word (L05)
//   · the hero pictures' pins keep the whole name and the price (PR 43, HERO_PIN_FIT)
import { useEffect } from 'react';
import { HERO_PIN_FIT, fitAll, type FitRule } from '@/lib/shop/fit';
import { series, type Cancel } from '@/lib/shop/later';

const FOOTER_FIT: FitRule[] = [{ sel: '.ftr-s3 .ftr-cols', min: 11, collapse: true }];
const DESK = '(min-width:1024px)';
const BARS = '.bnav, .mbar, .cb-mbar, .bs-mbar, .pdp-mbar, .bg-mbar, .lp-mbar, [data-bottom-bar]';

function shopRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.shop');
}

function hdrFit() {
  const w = document.querySelector('.hdr .hdr-wish');
  if (!w) return;
  if (window.matchMedia(DESK).matches) {
    w.classList.remove('fit-off');
    return;
  }
  const logo = document.querySelector('.hdr .logo.hide-d');
  const right = document.querySelector('.hdr .hdr-r');
  if (!logo || !right || !logo.getClientRects().length) return;
  w.classList.remove('fit-off');
  if (right.getBoundingClientRect().left - logo.getBoundingClientRect().right < 10) w.classList.add('fit-off');
}

function hdrSlogFit() {
  const sl = document.querySelector<HTMLElement>('.hdr .sb-slog-phone');
  if (!sl) return;
  const a = sl.parentElement;
  if (!a || !a.getClientRects().length) return;
  const inn = a.parentElement;
  const left = inn?.firstElementChild;
  const right = inn?.querySelector('.hdr-r');
  const ar = a.getBoundingClientRect();
  const cx = (ar.left + ar.right) / 2;
  const lE = left && left !== a ? left.getBoundingClientRect().right : ar.left;
  const rE = right ? right.getBoundingClientRect().left : ar.right;
  const room = Math.floor(2 * Math.min(cx - lE, rE - cx) - 12);
  sl.style.width = `${Math.max(0, room)}px`;
  sl.style.fontSize = '';
  sl.setAttribute('data-l', '0');
  const max = Number.parseFloat(getComputedStyle(sl).fontSize) || 9.5;
  const fits = () => {
    const k = sl.querySelector(sl.getAttribute('data-l') === '1' ? '.sb-ss' : '.sb-sf');
    return Boolean(k && k.scrollWidth <= room + 0.5);
  };
  for (let lvl = 0; lvl < 2; lvl++) {
    if (lvl === 1 && !sl.querySelector('.sb-ss')) break;
    sl.setAttribute('data-l', String(lvl));
    for (let f = max; f >= 8 - 0.001; f -= 0.25) {
      sl.style.fontSize = `${f.toFixed(2)}px`;
      if (fits()) return;
    }
    sl.style.fontSize = '';
  }
  sl.setAttribute('data-l', '2');
}

function ftrReachFit() {
  const r = document.querySelector<HTMLElement>('.ftr-s4 .ftr-reach');
  if (!r || !r.offsetWidth) return;
  const btns = r.querySelectorAll<HTMLElement>('.btn');
  if (btns.length < 2) return;
  const gap = Number.parseFloat(getComputedStyle(r).columnGap) || 8;
  const col = (r.clientWidth - gap) / 2;
  let need = 0;
  btns.forEach((b) => {
    const cs = getComputedStyle(b);
    let w = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight) + 2;
    const g = Number.parseFloat(cs.columnGap) || 0;
    Array.from(b.children).forEach((k, i) => {
      w += ((k as HTMLElement).scrollWidth || k.getBoundingClientRect().width) + (i ? g : 0);
    });
    need = Math.max(need, w);
  });
  r.classList.toggle('ftr-two', need <= col);
}

function visibleFixed(b: Element): boolean {
  if (!b.getClientRects().length) return false;
  const cs = getComputedStyle(b);
  return cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden';
}

function waFabFooter() {
  const el = document.getElementById('wa-fab');
  if (!el) return;
  const ftr = document.querySelector('.ftr');
  let hide = false;
  if (ftr) {
    const f = el.getBoundingClientRect();
    const l = ftr.getBoundingClientRect();
    hide = !(l.bottom < f.top - 12 || l.top > f.bottom + 12);
  }
  el.classList.toggle('wa-off', hide);
  const H = window.innerHeight;
  let top = H;
  document.querySelectorAll(BARS).forEach((b) => {
    if (!visibleFixed(b)) return;
    const r = b.getBoundingClientRect();
    if (r.bottom < H - 2 && r.bottom < H * 0.75) return;
    if (r.top < top) top = r.top;
  });
  const lift = Math.round(H - top + 12);
  if (lift > 12 && el.style.bottom !== `${lift}px`) el.style.bottom = `${lift}px`;
}

function ckhWaTick() {
  const a = document.querySelector('.ckh .hdr-wa-auto');
  if (!a) return;
  const hdr = document.querySelector('.ckh');
  const hb = hdr ? hdr.getBoundingClientRect().bottom : 60;
  const help = document.querySelector('main .co-help a, main a.co-wa, main .co-help');
  const show = !help || help.getBoundingClientRect().bottom < hb + 2;
  a.classList.toggle('on', show);
}

// Follow-up 23: the room goes straight onto the page wrapper's own padding, and only when it changes. ~~A --bar-pad
// variable and data-bar-pad on the shop root~~: a variable set on the root restyled every element of the page
// (~70 ms of a slow phone's main thread on a page with products), for one padding.
function bottomBarPad() {
  const wrap = document.querySelector<HTMLElement>('.shop .has-bnav');
  if (!wrap) return;
  let H = 0;
  if (!window.matchMedia(DESK).matches) {
    document.querySelectorAll<HTMLElement>(BARS).forEach((b) => {
      if (visibleFixed(b)) H = Math.max(H, b.offsetHeight);
    });
  }
  const want = H ? `calc(${H + 12}px + env(safe-area-inset-bottom, 0px))` : '';
  if (wrap.dataset.barPad === want) return;
  if (want) wrap.style.setProperty('padding-bottom', want, 'important');
  else wrap.style.removeProperty('padding-bottom');
  wrap.dataset.barPad = want;
}

function safe(f: () => void): () => void {
  return () => {
    try {
      f();
    } catch (e) {
      console.error(e);
    }
  };
}

export function ShellEffects() {
  useEffect(() => {
    // The Lighthouse budget (TBT ≤ 200 ms): the fits no longer run inside the hydration task, all at once. They run
    // after the first paint, each part in a task of its own (lib/shop/later): the header, the floating buttons, the
    // footer, the bottom room. ~~run(true) in the effect, every fit in one go~~ (A footer fit left until the footer
    // came near failed the device gate: it measures the whole page 400 ms after load.)
    const header = safe(() => {
      hdrFit();
      hdrSlogFit();
    });
    const floating = safe(() => {
      waFabFooter();
      ckhWaTick();
    });
    const bars = safe(bottomBarPad);
    const footer = safe(() => {
      ftrReachFit();
      const root = shopRoot();
      if (root) fitAll(root, FOOTER_FIT);
    });
    // the hero's pins are fitted by HeroSlider before it makes its copies; a refit (a new width, the fonts) does them here
    const pins = safe(() => {
      const root = shopRoot();
      if (root) fitAll(root, [HERO_PIN_FIT]);
    });
    let stop: Cancel = series([header, floating, footer, bars]);
    let raf = 0;
    let full = false;
    const tick = (all: boolean) => {
      if (all) full = true;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const f = full;
        full = false;
        floating();
        if (!f) return;
        stop();
        stop = series([header, pins, footer, bars]);
      });
    };
    const onScroll = () => tick(false);
    const onResize = () => tick(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    // the fits follow the page's width; a page growing taller as its pictures arrive needs no refit (PR 43: it gave
    // the home page long tasks while it loaded)
    let width = document.documentElement.clientWidth;
    const ro =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            const w = document.documentElement.clientWidth;
            if (w === width) return;
            width = w;
            tick(true);
          })
        : null;
    ro?.observe(document.documentElement);
    const fonts = document.fonts;
    const onFonts = () => tick(true);
    fonts?.addEventListener?.('loadingdone', onFonts);
    // fonts already in by now are measured by the first pass; only a later arrival calls for a refit
    if (fonts && fonts.status !== 'loaded') fonts.ready.then(onFonts).catch(() => undefined);
    return () => {
      stop();
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      ro?.disconnect();
      fonts?.removeEventListener?.('loadingdone', onFonts);
    };
  }, []);
  return null;
}
