// S02 · PR 600 — the phone checks of "Apply to phone too?", run in the owner's own browser on a preview of the page
// (the draft drawn at one phone size in a hidden frame of the same site). The same rules as the device gate
// (docs/qa/device-matrix.js pageChecks, tools/device-gate.mjs TAP-TOO-SMALL), kept small:
// - sideways: how far the page is wider than the phone;
// - cut: texts cut off (hidden overflow, content wider than its box; 1–2 px boxes are screen-reader text);
// - taps: tap targets in the changed sections under the owner's sizes (inline text links need only the height);
// - buy: the first visible buy button on the first screen (a product page; elsewhere "none").
// The real-phone check (device farm) and the AI reviewer are not here. The verdict is lib/website/page-edit-model judgePhone.
import type { PhoneMeasure } from '@/lib/website/page-edit-phone';

/** The shop's buy button (components/shop/product/PdpBuy). */
const BUY = '.btn-addbag';
const TAPS = 'a[href],button,input,select,textarea,[role=button]';
// hardcode-ok: how many findings one check lists (a readable report, not a rule)
const LIST = 4;
// hardcode-ok: how often a settling page is measured again (technical timing; the owner's wait is `waitMs`)
const SETTLE_MS = 400;
const SETTLE_TRIES = 8;

const label = (e: Element) => (e.getAttribute('data-testid') || (typeof e.className === 'string' ? e.className.split(' ').slice(0, 2).join('.') : '') || e.tagName).slice(0, 40);

export function measurePage(win: Window, opts: { sections: readonly string[]; tapMinPx: number; inlineLinkMinPx: number }): Omit<PhoneMeasure, 'name' | 'w' | 'h' | 'loaded'> {
  const doc = win.document;
  const vis = (e: Element) => {
    const s = win.getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const sideways = Math.max(0, doc.documentElement.scrollWidth - win.innerWidth);
  const all = [...doc.body.querySelectorAll('*')];
  const cut: string[] = [];
  for (const e of all) {
    if (cut.length >= LIST) break;
    if (!e.childNodes.length || !vis(e)) continue;
    const box = e.getBoundingClientRect();
    if (box.width <= 2 || box.height <= 2) continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 1)) continue;
    const s = win.getComputedStyle(e);
    if (!/(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis') continue;
    if (e.scrollWidth > e.clientWidth + 1) cut.push(`${label(e)}: "${(e.textContent ?? '').trim().slice(0, 18)}"`);
  }
  const small: string[] = [];
  const scope = opts.sections.flatMap((id) => [...doc.querySelectorAll(`[data-pe="${CSS.escape(id)}"]`)]);
  for (const root of scope) {
    for (const e of root.querySelectorAll(TAPS)) {
      if (small.length >= LIST || !vis(e)) continue;
      const r = e.getBoundingClientRect();
      const inline = e.tagName === 'A' && /^inline(-block)?$/.test(win.getComputedStyle(e).display) && [...(e.parentElement?.childNodes ?? [])].some((n) => n !== e && n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
      const needW = inline ? 0 : opts.tapMinPx;
      const needH = inline ? opts.inlineLinkMinPx : opts.tapMinPx;
      const labels = (e as HTMLInputElement).labels ? [...((e as HTMLInputElement).labels ?? [])] : [];
      if (labels.some((l) => vis(l) && l.getBoundingClientRect().width >= opts.tapMinPx && l.getBoundingClientRect().height >= opts.tapMinPx)) continue;
      if (r.width + 0.5 < needW || r.height + 0.5 < needH) small.push(`${label(e)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  const buyEl = [...doc.querySelectorAll(BUY)].find(vis);
  const buy: PhoneMeasure['buy'] = !buyEl ? 'none' : buyEl.getBoundingClientRect().top < win.innerHeight ? 'above' : 'below';
  return { sideways, cut, small, buy };
}

/** Loads the page in a hidden frame of one phone size and measures it (`loaded` false after `waitMs`). */
export function measureAt(url: string, size: { name: string; w: number; h: number }, opts: { sections: readonly string[]; tapMinPx: number; inlineLinkMinPx: number; waitMs: number }): Promise<PhoneMeasure> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.className = 'pge-probe';
    frame.style.width = `${size.w}px`;
    frame.style.height = `${size.h}px`;
    let done = false;
    const finish = (m: Omit<PhoneMeasure, 'name' | 'w' | 'h'>) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      frame.remove();
      resolve({ name: size.name, w: size.w, h: size.h, ...m });
    };
    const timer = window.setTimeout(() => finish({ loaded: false, sideways: 0, cut: [], small: [], buy: 'none' }), opts.waitMs);
    frame.addEventListener('load', () => {
      const win = frame.contentWindow;
      if (!win) return finish({ loaded: false, sideways: 0, cut: [], small: [], buy: 'none' });
      // The page's own scripts settle after load (labels step down to fit, sliders measure): measure two frames after
      // load, and again a little later while something still looks wrong, until it fits or the wait runs out.
      let tries = 0;
      const look = () => {
        try {
          const m = measurePage(win, opts);
          const clean = m.sideways <= 1 && !m.cut.length && !m.small.length;
          if (clean || ++tries >= SETTLE_TRIES) return finish({ loaded: true, ...m });
          window.setTimeout(() => win.requestAnimationFrame(look), SETTLE_MS);
        } catch {
          finish({ loaded: false, sideways: 0, cut: [], small: [], buy: 'none' });
        }
      };
      win.requestAnimationFrame(() => win.requestAnimationFrame(look));
    });
    frame.src = url;
    document.body.appendChild(frame);
  });
}
