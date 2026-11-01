'use client';
// S13 · PR 254 — the landing page's countdown (off as a page starts): days, hours, minutes and seconds to the end the
// owner set; once it has passed it hides itself. It never changes a price: the offer is the owner's own words.
import { useEffect, useState } from 'react';

export function LandingTimer({ endsAt, label, units, num }: { endsAt: string; label: string; units: { d: string; h: string; m: string; s: string }; num: string[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const s = now === null ? null : Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  if (s === 0) return null;
  const digits = (n: number) => String(n).replace(/[0-9]/g, (d) => num[Number(d)] ?? d);
  const parts: [number, string][] = s === null ? [] : [[Math.floor(s / 86400), units.d], [Math.floor((s % 86400) / 3600), units.h], [Math.floor((s % 3600) / 60), units.m], [s % 60, units.s]];
  return (
    <div className="lp-timer soft" role="timer" aria-live="off" data-testid="lp-timer">
      <span className="small bold">{label}</span>
      <span className="lp-clock">
        {parts.map(([n, u]) => (
          <span key={u}>
            <b>{digits(n)}</b>
            {u}
          </span>
        ))}
      </span>
    </div>
  );
}
