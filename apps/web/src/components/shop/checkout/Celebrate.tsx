'use client';
// PR 87 — the celebration overlay on order placement (Blueprint D1.5 / §41.18): balloons rising or light streaking up,
// with the owner's words in the middle, drawn on one canvas over the thank-you page. It never blocks anything: the
// canvas takes no taps (they reach the page), any tap or key skips it at once, it starts only once the page is idle
// (never before the first thing the customer can tap), lasts at most 2.5 seconds and then removes itself. It does not
// run on a slow connection, data saving or a low-end phone, or twice for one occasion; for reduced motion it shows only
// the still words. The rules are lib/shop/celebrate.ts; the page sends this part only while it is switched on.
import { useEffect, useState } from 'react';
import { celebrationMode, type CelebrationPlan, type DeviceFacts } from '@/lib/shop/celebrate';

type Nav = Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };

const FADE_MS = 380; // hardcode-ok: the fade at the end of the overlay (motion design, not a business number)
const MAX_DPR = 2; // hardcode-ok: canvas pixel density cap, for speed
const SKIP_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const;

function seenOf(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function markSeen(key: string) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // a private window: it may show once more, never an error
  }
}

function facts(key: string): DeviceFacts {
  const n = navigator as Nav;
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: n.connection?.saveData === true,
    effectiveType: n.connection?.effectiveType ?? null,
    memoryGb: typeof n.deviceMemory === 'number' ? n.deviceMemory : null,
    cores: typeof n.hardwareConcurrency === 'number' ? n.hardwareConcurrency : null,
    seen: seenOf(key),
  };
}

/** The theme's own colours, read from the shop's variables, so every theme celebrates in its colours. */
function palette(): { parts: string[]; ink: string; halo: string } {
  const st = getComputedStyle(document.getElementById('app') ?? document.documentElement);
  const v = (name: string) => st.getPropertyValue(name).trim();
  const parts = ['--brand', '--gold', '--sale', '--brand-tint', '--hero'].map(v).filter(Boolean);
  return { parts: parts.length ? parts : [v('--ink') || 'currentColor'], ink: v('--ink'), halo: v('--bg') };
}

interface Part {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  phase: number;
  colour: string;
}

function draw(canvas: HTMLCanvasElement, plan: CelebrationPlan, done: () => void): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    done();
    return () => {};
  }
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.scale(dpr, dpr);
  const { parts: colours, ink, halo } = palette();
  const balloons = plan.style === 'balloons';
  const count = Math.round((balloons ? 14 : 26) * Math.min(1.6, Math.max(0.8, w / 600))); // hardcode-ok: particle density
  const secs = plan.durationMs / 1000;
  const parts: Part[] = Array.from({ length: count }, (_, i) => {
    const r = balloons ? 14 + Math.random() * 12 : 1.5 + Math.random() * 1.5; // hardcode-ok: particle sizes
    const startY = h + r * 3 + Math.random() * h * 0.5;
    return {
      x: ((i + Math.random()) / count) * w,
      y: startY,
      r,
      // fast enough to cross the screen within the time it has
      vy: (startY + r * 4) / secs / (balloons ? 1.15 : 0.6 + Math.random() * 0.3),
      sway: balloons ? 8 + Math.random() * 14 : 0,
      phase: Math.random() * Math.PI * 2,
      colour: colours[i % colours.length]!,
    };
  });
  const fontFamily = getComputedStyle(document.body).fontFamily;
  const size = Math.round(Math.min(48, Math.max(26, w / 12))); // hardcode-ok: headline size between 26 and 48 px
  let raf = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = now - t0;
    if (t >= plan.durationMs) {
      done();
      return;
    }
    const left = plan.durationMs - t;
    ctx.globalAlpha = left < FADE_MS ? left / FADE_MS : 1;
    ctx.clearRect(0, 0, w, h);
    const s = t / 1000;
    for (const p of parts) {
      const y = p.y - p.vy * s;
      const x = p.x + Math.sin(p.phase + s * 2.2) * p.sway;
      if (balloons) {
        ctx.strokeStyle = p.colour;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + p.r * 1.2);
        ctx.quadraticCurveTo(x - 6, y + p.r * 2.2, x, y + p.r * 3.4);
        ctx.stroke();
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.ellipse(x, y, p.r * 0.86, p.r * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath();
        ctx.ellipse(x - p.r * 0.3, y - p.r * 0.4, p.r * 0.18, p.r * 0.3, -0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const len = 60 + p.r * 30;
        const g = ctx.createLinearGradient(x, y, x, y + len);
        g.addColorStop(0, p.colour);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = p.r;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
        ctx.stroke();
      }
    }
    if (plan.text) {
      // the words gather in the first third, then hold
      const k = Math.min(1, t / (plan.durationMs / 3));
      ctx.save();
      ctx.globalAlpha *= k;
      ctx.font = `800 ${size}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 8;
      ctx.strokeStyle = halo || 'rgba(255,255,255,.9)';
      const ty = h * 0.42 + (1 - k) * 18;
      ctx.strokeText(plan.text, w / 2, ty, w - 32);
      ctx.fillStyle = ink || colours[0]!;
      ctx.fillText(plan.text, w / 2, ty, w - 32);
      ctx.restore();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export function Celebrate({ plan }: { plan: CelebrationPlan }) {
  const [mode, setMode] = useState<'wait' | 'play' | 'still' | 'off'>('wait');
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  // start only once the page is idle, so it never delays the first thing the customer can tap
  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      const m = celebrationMode(plan, facts(plan.seenKey));
      if (m === 'skip') {
        setMode('off');
        return;
      }
      if (!plan.preview) markSeen(plan.seenKey);
      setMode(m);
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(start, { timeout: 1500 }); // hardcode-ok: the latest it may wait for an idle moment
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }
    const id = window.setTimeout(start, 300); // hardcode-ok: a browser without idle callbacks waits a moment
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [plan]);

  // any tap, key or wheel skips it at once; it also ends by itself
  useEffect(() => {
    if (mode !== 'play' && mode !== 'still') return;
    const stop = () => setMode('off');
    for (const e of SKIP_EVENTS) window.addEventListener(e, stop, { passive: true, capture: true });
    document.addEventListener('visibilitychange', stop);
    const timer = mode === 'still' ? window.setTimeout(stop, plan.durationMs) : 0;
    return () => {
      for (const e of SKIP_EVENTS) window.removeEventListener(e, stop, { capture: true });
      document.removeEventListener('visibilitychange', stop);
      if (timer) window.clearTimeout(timer);
    };
  }, [mode, plan.durationMs]);

  useEffect(() => {
    if (mode !== 'play' || !canvas) return;
    return draw(canvas, plan, () => setMode('off'));
  }, [mode, canvas, plan]);

  if (mode === 'play') return <canvas ref={setCanvas} className="ty-cel" aria-hidden="true" data-testid="ty-celebrate" />;
  if (mode === 'still')
    return (
      <div className="ty-cel ty-cel-still" aria-hidden="true" data-testid="ty-celebrate">
        <span>{plan.text}</span>
      </div>
    );
  return null;
}
