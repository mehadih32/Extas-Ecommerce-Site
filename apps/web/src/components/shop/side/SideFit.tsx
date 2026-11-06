'use client';
// S02 · PR 596 — the side canvas's fitter: after the page has loaded, on a computer with a mouse only, it measures the
// gutters beside the content column (.container) and places each zone (lib/shop/side-fit.ts: its standard size, scaled
// down to the room, hidden below half). Fixed zones sit at their place under the header and scroll with the page; sticky
// and floating ones stay in view, a floating one drifting gently (none with Reduce motion); a zone that would touch the
// footer fades out (so does one scrolled above the window's top). Nothing runs on a phone or a tablet, and nothing while the tab is hidden (it only reacts to events).
import { useEffect } from 'react';
import { fitZone, floatOffset } from '@/lib/shop/side-fit';

export function SideFit({ gap, float, minWidth }: { gap: number; float: number; minWidth: number }) {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    const zones = [...document.querySelectorAll<HTMLElement>('.sc-zone')];
    let frame = 0;
    const place = () => {
      frame = 0;
      const view = document.documentElement.clientWidth;
      const box = document.querySelector('main .container, .container')?.getBoundingClientRect();
      const head = document.querySelector('header')?.getBoundingClientRect();
      const foot = document.querySelector('footer')?.getBoundingClientRect();
      const headBottom = head ? head.bottom + window.scrollY : 0;
      for (const el of zones) {
        const z = { side: el.dataset.side === 'right' ? ('right' as const) : ('left' as const), width: Number(el.dataset.w), height: Number(el.dataset.h) };
        const f = fine.matches && box ? fitZone(z, view, box.width, gap, minWidth) : null;
        if (!f || !f.show) {
          el.removeAttribute('data-fit');
          continue;
        }
        const mode = el.dataset.mode;
        const top = Number(el.dataset.top);
        const drift = mode === 'float' && !still.matches ? floatOffset(window.scrollY, float) : 0;
        // every zone is position: fixed (no containing block to depend on); a "fixed" zone follows the page as it scrolls
        const y = mode === 'fixed' ? headBottom + top - window.scrollY : Math.max(top, head ? head.bottom : 0) + drift;
        el.style.left = `${f.x}px`;
        el.style.top = `${y}px`;
        el.style.width = `${f.width}px`;
        el.style.height = `${f.height}px`;
        const overFoot = !!foot && y + f.height > foot.top;
        el.toggleAttribute('data-off', overFoot);
        el.setAttribute('data-fit', '');
      }
    };
    const ask = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };
    let gone = false;
    const start = () => {
      if (gone) return;
      place();
      window.addEventListener('resize', ask);
      window.addEventListener('scroll', ask, { passive: true });
      fine.addEventListener('change', ask);
    };
    // after the page's own content: on load, then when the browser is idle
    const idle = () => {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start);
      else setTimeout(start, 200); // hardcode-ok: a fallback pause for browsers without an idle callback
    };
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
    return () => {
      gone = true;
      window.removeEventListener('resize', ask);
      window.removeEventListener('scroll', ask);
      fine.removeEventListener('change', ask);
      window.removeEventListener('load', idle);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [gap, float, minWidth]);
  return null;
}
