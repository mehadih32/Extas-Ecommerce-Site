'use client';
// PR 12 (CN-025) — the hover tip of the V12.4 charts (demo 97z-adm2-rd1-core.js: the mousemove handler, a3TipAt): over
// a chart it follows the pointer with the day's figures (already written by the server, kit.tsx `data-a3c`), moves the
// guide line and the dot; over a heat-map cell it names the cell. Built with text nodes only (no HTML from data). A
// scroll or a new page hides it. Mounted once by the shell; a touch shows the same tip for the touched point.
import { useEffect } from 'react';
import type { TipData } from './kit';

const cache = new WeakMap<Element, TipData | null>();

function dataOf(el: Element): TipData | null {
  if (cache.has(el)) return cache.get(el)!;
  let d: TipData | null = null;
  try {
    d = JSON.parse(el.getAttribute('data-a3c') ?? 'null') as TipData | null;
  } catch {
    d = null;
  }
  cache.set(el, d);
  return d;
}

function tipEl(): HTMLDivElement {
  let t = document.getElementById('a3-tip') as HTMLDivElement | null;
  if (!t) {
    t = document.createElement('div');
    t.id = 'a3-tip';
    t.className = 'a3-tip';
    t.setAttribute('aria-hidden', 'true');
    document.body.appendChild(t);
  }
  return t;
}

function place(t: HTMLDivElement, x: number, y: number) {
  t.style.display = 'block';
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  let l = x + 14;
  let tp = y - h - 12;
  if (l + w > window.innerWidth - 8) l = x - w - 14;
  if (tp < 8) tp = y + 16;
  t.style.left = `${Math.max(8, l)}px`;
  t.style.top = `${tp}px`;
}

function fill(t: HTMLDivElement, title: string, rows: { c?: string; n: string; v?: string }[], foot?: string) {
  t.replaceChildren();
  const b = document.createElement('b');
  b.textContent = title;
  t.appendChild(b);
  for (const r of rows) {
    const s = document.createElement('span');
    if (r.c) {
      const i = document.createElement('i');
      i.style.background = r.c;
      s.appendChild(i);
    }
    s.appendChild(document.createTextNode(r.n));
    if (r.v !== undefined) {
      const em = document.createElement('em');
      em.textContent = r.v;
      s.appendChild(em);
    }
    t.appendChild(s);
  }
  if (foot) {
    const sm = document.createElement('small');
    sm.textContent = foot;
    t.appendChild(sm);
  }
}

function hideAll() {
  const t = document.getElementById('a3-tip');
  if (t) t.style.display = 'none';
  document.querySelectorAll<HTMLElement>('.a3-cg,.a3-cd').forEach((e) => (e.style.display = 'none'));
}

function at(target: EventTarget | null, x: number, y: number): boolean {
  const el = target instanceof Element ? target : null;
  const plot = el?.closest('[data-a3c]');
  if (plot) {
    const c = dataOf(plot);
    if (!c || !c.l.length) return false;
    const r = plot.getBoundingClientRect();
    const n = c.l.length;
    const raw = c.b ? Math.floor(((x - r.left) / r.width) * n) : Math.round(((x - r.left) / r.width) * (n - 1));
    const i = Math.max(0, Math.min(n - 1, raw));
    const g = plot.querySelector<HTMLElement>('.a3-cg');
    if (g) {
      g.style.display = 'block';
      g.style.left = `${c.b ? ((i + 0.5) / n) * 100 : n > 1 ? (i / (n - 1)) * 100 : 50}%`;
    }
    const dot = plot.querySelector<HTMLElement>('.a3-cd');
    if (dot && c.d && c.d.length) {
      dot.style.display = 'block';
      dot.style.left = `${n > 1 ? (i / (n - 1)) * 100 : 50}%`;
      dot.style.top = `${c.d[i] ?? 0}%`;
    }
    const t = tipEl();
    fill(
      t,
      c.l[i] ?? '',
      c.s.map((s) => ({ c: s.c, n: s.n, v: s.v[i] ?? '' })),
      c.f?.[i],
    );
    place(t, x, y);
    return true;
  }
  const cell = el?.closest('[data-tip-t]');
  if (cell && cell.closest('.adm2')) {
    const t = tipEl();
    fill(t, cell.getAttribute('data-tip-t') ?? '', [{ n: cell.getAttribute('data-tip-s') ?? '' }]);
    place(t, x, y);
    return true;
  }
  return false;
}

export function ChartTips() {
  useEffect(() => {
    let shown = false;
    const onMove = (ev: PointerEvent) => {
      const hit = at(ev.target, ev.clientX, ev.clientY);
      if (!hit && shown) hideAll();
      shown = hit;
    };
    const off = () => {
      if (shown) hideAll();
      shown = false;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerdown', onMove);
    window.addEventListener('scroll', off, true);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onMove);
      window.removeEventListener('scroll', off, true);
      hideAll();
    };
  }, []);
  return null;
}
