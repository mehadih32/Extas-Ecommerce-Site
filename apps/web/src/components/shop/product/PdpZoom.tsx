'use client';
// PR 54 — the full-screen photo viewer (demo 31-zoom.js, R15 · 13.1): the whole uncropped picture, from the zoom file
// when there is one. On a phone: pinch or double-tap to zoom (up to `pdp.gallery.zoomMax`), drag to look around,
// swipe sideways for the next photo when not zoomed, swipe down, ✕ or Esc to close. On a computer with a mouse: each
// click zooms one step more where the pointer is (`pdp.gallery.zoomSteps`), the last step goes back to the whole
// picture, drag or the wheel moves it, ‹ › and the thumbnails change photo, + − 0 and the arrow keys work too. Every
// gesture that pauses the strip lets go of it again (rule 7: the pan ends on touchend, mouseup and on closing).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { clampPan, clampZoom } from '@/lib/shop/pdp-gallery';
import type { PdpShot } from '@/lib/shop/product-model';
import { usePdp } from './PdpRoot';
import { ShotPicture } from './ShotPicture';

interface Props {
  shots: PdpShot[];
  start: number;
  garment: string | null;
  hex: string;
  lang: 'en' | 'bn';
  altOf: (s: PdpShot) => string;
  onClose: (at: number) => void;
}

/** A swipe down that closes, and the longest tap that still counts as one (gesture sizes, not business numbers). */
const SWIPE_DOWN = 90;
const TAP_MS = 300;
const HINT_MS = 2200;

export function PdpZoom({ shots, start, garment, hex, lang, altOf, onClose }: Props) {
  const { m, set, w, num } = usePdp();
  const steps = set.gallery.zoomSteps;
  const desk = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches;
  const max = desk ? steps[steps.length - 1]! : set.gallery.zoomMax;
  const root = useRef<HTMLDivElement>(null);
  const trk = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(start);
  const [hint, setHint] = useState(true);
  const z = useRef({ s: 1, x: 0, y: 0 });
  const idxRef = useRef(start);

  const pan = useCallback(() => (trk.current?.children[idxRef.current]?.querySelector('.zm-pan') as HTMLElement | null | undefined) ?? null, []);
  const apply = useCallback(
    (anim: boolean) => {
      const e = pan();
      if (!e) return;
      const box = { w: e.clientWidth, h: e.clientHeight };
      const p = clampPan(z.current.x, z.current.y, z.current.s, box);
      z.current.x = p.x;
      z.current.y = p.y;
      e.style.transition = anim ? 'transform .2s ease' : 'none';
      e.style.transform = `translate(${p.x}px,${p.y}px) scale(${z.current.s})`;
      trk.current?.classList.toggle('zoomed', z.current.s > 1.01);
    },
    [pan],
  );
  const reset = useCallback(() => {
    z.current = { s: 1, x: 0, y: 0 };
    apply(true);
  }, [apply]);
  const zoomTo = useCallback(
    (s1: number, px?: number, py?: number) => {
      const e = pan();
      if (!e) return;
      const r = e.parentElement!.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const s = clampZoom(s1, max);
      const { s: s0, x, y } = z.current;
      const ax = px ?? cx;
      const ay = py ?? cy;
      z.current = s <= 1.001 ? { s: 1, x: 0, y: 0 } : { s, x: ax - cx - (s * (ax - cx - x)) / s0, y: ay - cy - (s * (ay - cy - y)) / s0 };
      apply(true);
    },
    [apply, max, pan],
  );
  const goTo = useCallback(
    (k: number) => {
      const t = trk.current;
      if (!t) return;
      const to = Math.max(0, Math.min(shots.length - 1, k));
      z.current = { s: 1, x: 0, y: 0 };
      t.querySelectorAll<HTMLElement>('.zm-pan').forEach((e) => (e.style.transform = ''));
      t.classList.remove('zoomed');
      t.scrollTo({ left: to * t.clientWidth, behavior: 'smooth' });
    },
    [shots.length],
  );
  const close = useCallback(() => onClose(idxRef.current), [onClose]);

  useEffect(() => {
    const t = trk.current;
    if (t) t.scrollLeft = start * t.clientWidth;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.focus({ preventScroll: true });
    const hide = setTimeout(() => setHint(false), HINT_MS);
    return () => {
      clearTimeout(hide);
      document.body.style.overflow = prev;
    };
  }, [start]);

  // keys: Esc closes; on a computer + − 0 zoom, arrows move the zoomed picture or change photo
  useEffect(() => {
    const next = () => steps.find((v) => v > z.current.s + 0.01) ?? null;
    const prevStep = () => [...steps].reverse().find((v) => v < z.current.s - 0.01) ?? 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close();
      if (e.key === '+' || e.key === '=') return void (next() && zoomTo(next()!));
      if (e.key === '-' || e.key === '_') return zoomTo(prevStep());
      if (e.key === '0') return reset();
      const d = ({ ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] } as Record<string, [number, number]>)[e.key];
      if (!d) return;
      if (z.current.s > 1.01) {
        e.preventDefault();
        z.current.x += d[0] * 80;
        z.current.y += d[1] * 80;
        apply(false);
      } else if (d[0]) goTo(idxRef.current - d[0]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [apply, close, goTo, reset, steps, zoomTo]);

  // touch: pinch, pan, double tap, swipe down
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let pinch: { d: number; s: number } | null = null;
    let down: { x: number; y: number; tx: number; ty: number; t: number } | null = null;
    let lastTap = 0;
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const ts = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (e.touches.length === 2) pinch = { d: dist(e.touches), s: z.current.s };
      else if (e.touches.length === 1) down = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY, tx: z.current.x, ty: z.current.y, t: Date.now() };
    };
    const tm = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        z.current.s = clampZoom((pinch.s * dist(e.touches)) / pinch.d, max);
        apply(false);
        return;
      }
      if (down && e.touches.length === 1 && z.current.s > 1.01) {
        e.preventDefault();
        z.current.x = down.tx + (e.touches[0]!.clientX - down.x);
        z.current.y = down.ty + (e.touches[0]!.clientY - down.y);
        apply(false);
      }
    };
    const te = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) {
        pinch = null;
        if (z.current.s < 1.05) reset();
        return;
      }
      if (!down) return;
      const t = e.changedTouches[0]!;
      const dx = t.clientX - down.x;
      const dy = t.clientY - down.y;
      const dt = Date.now() - down.t;
      down = null;
      if (z.current.s <= 1.01 && dy > SWIPE_DOWN && Math.abs(dx) < SWIPE_DOWN / 1.5 && dt < 2 * TAP_MS) return close();
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < TAP_MS) {
        const now = Date.now();
        if (now - lastTap < TAP_MS) {
          if (z.current.s > 1.01) reset();
          else zoomTo(steps[0] ?? max, t.clientX, t.clientY);
          lastTap = 0;
        } else lastTap = now;
      }
    };
    const cancel = () => {
      pinch = null;
      down = null;
    };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te);
    el.addEventListener('touchcancel', cancel);
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te);
      el.removeEventListener('touchcancel', cancel);
    };
  }, [apply, close, max, reset, steps, zoomTo]);

  // mouse (computer): click steps, drag, wheel
  useEffect(() => {
    const el = root.current;
    if (!el || !desk) return;
    let drag: { x: number; y: number; tx: number; ty: number } | null = null;
    let moved = false;
    const md = (e: MouseEvent) => {
      if (e.button !== 0 || !(e.target as HTMLElement).closest('.zm-slide')) return;
      moved = false;
      if (z.current.s > 1.01) {
        e.preventDefault();
        drag = { x: e.clientX, y: e.clientY, tx: z.current.x, ty: z.current.y };
        trk.current?.classList.add('dragging');
      }
    };
    const mm = (e: MouseEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      z.current.x = drag.tx + dx;
      z.current.y = drag.ty + dy;
      apply(false);
    };
    const mu = () => {
      drag = null;
      trk.current?.classList.remove('dragging');
    };
    const click = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.zm-slide') || t.closest('button')) return;
      if (moved) {
        moved = false;
        return;
      }
      if (e.detail >= 2) return;
      const n = steps.find((v) => v > z.current.s + 0.01);
      if (n) zoomTo(n, e.clientX, e.clientY);
      else reset();
    };
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.zm-thumbs')) return;
      e.preventDefault();
      if (e.ctrlKey) return zoomTo(z.current.s * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX, e.clientY);
      if (z.current.s <= 1.01) {
        const n = steps.find((v) => v > z.current.s + 0.01);
        if (e.deltaY < -2 && n) zoomTo(n, e.clientX, e.clientY);
        return;
      }
      z.current.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      z.current.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      apply(false);
    };
    el.addEventListener('mousedown', md);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    window.addEventListener('blur', mu);
    el.addEventListener('click', click);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('mousedown', md);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
      window.removeEventListener('blur', mu);
      el.removeEventListener('click', click);
      el.removeEventListener('wheel', wheel);
    };
  }, [apply, desk, reset, steps, zoomTo]);

  const host = typeof document === 'undefined' ? null : (document.querySelector<HTMLElement>('.shop') ?? document.body);
  if (!host) return null;
  return createPortal(
    <div ref={root} className={`zm${desk ? ' zm-dk' : ''}`} role="dialog" aria-modal="true" aria-label={w('zoom.title', { name: m.name })} tabIndex={-1} data-testid="zoom">
      <div className="zm-top">
        <span className="zm-n" aria-live="polite">
          {w('zoom.count', { n: num(i + 1), total: num(shots.length) })}
        </span>
        {desk ? (
          <span className="zm-tools">
            <button type="button" className="zm-tb" aria-label={w('zoom.out')} onClick={() => zoomTo([...steps].reverse().find((v) => v < z.current.s - 0.01) ?? 1)}>
              <Icon name="minus" size={20} />
            </button>
            <button type="button" className="zm-tb" aria-label={w('zoom.in')} onClick={() => zoomTo(steps.find((v) => v > z.current.s + 0.01) ?? max)}>
              <Icon name="plus" size={20} />
            </button>
            <button type="button" className="zm-tb zm-fit" onClick={reset}>
              {w('zoom.fit')}
            </button>
          </span>
        ) : null}
        <button type="button" className="zm-x" aria-label={w('zoom.close')} onClick={close}>
          <Icon name="close" size={22} />
        </button>
      </div>
      <div
        className="zm-trk"
        ref={trk}
        onScroll={(e) => {
          const t = e.currentTarget;
          const k = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
          if (k !== idxRef.current) {
            idxRef.current = k;
            setI(k);
          }
        }}
      >
        {shots.map((s) => (
          <div key={s.id} className="zm-slide" data-v={s.draw}>
            <div className="zm-pan">
              <ShotPicture shot={s} garment={garment} hex={hex} slot="zoom" sizes="100vw" alt={altOf(s)} lang={lang} ratio={null} className="zm-draw" />
            </div>
          </div>
        ))}
      </div>
      <div className={`zm-hint${hint ? '' : ' off'}`}>{w(desk ? 'zoom.hintDesk' : 'zoom.hint')}</div>
      {desk && shots.length > 1 ? (
        <>
          <button type="button" className="zm-nav l" aria-label={w('prev')} disabled={i <= 0} onClick={() => goTo(i - 1)}>
            <Icon name="back" size={22} />
          </button>
          <button type="button" className="zm-nav r" aria-label={w('next')} disabled={i >= shots.length - 1} onClick={() => goTo(i + 1)}>
            <Icon name="right" size={22} />
          </button>
          <div className="zm-thumbs" role="group" aria-label={w('photos')}>
            {shots.map((s, k) => (
              <button key={s.id} type="button" className={`zm-th${k === i ? ' on' : ''}`} aria-label={w(`view.${s.kind}`)} aria-pressed={k === i} onClick={() => goTo(k)}>
                <ShotPicture shot={s} garment={garment} hex={hex} slot="thumb" sizes="64px" alt="" lang={lang} ratio="ratio-11" />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>,
    host,
  );
}
