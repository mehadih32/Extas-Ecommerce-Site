'use client';
// PR 12 (CN-025) — the Dashboard's date choice (demo V12.4 a3RangeSeg): the setting's ranges as links (Today, 7 days,
// 30 days …) and "Custom", which opens two date fields (from, to; not after today, at most the setting's days) and shows
// that window. The address keeps the choice (?range= or ?from=&to=), so a reload or a shared link shows the same.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';

export interface RangeSegProps {
  options: { days: number; label: string; href: string; on: boolean }[];
  custom: { on: boolean; label: string; from: string; to: string; today: string; min: string; maxDays: number };
  design: string | null;
  labels: { aria: string; pick: string; from: string; to: string; show: string; cancel: string; bad: string };
}

const span = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

export function RangeSeg(p: RangeSegProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(p.custom.from);
  const [to, setTo] = useState(p.custom.to);
  const [bad, setBad] = useState(false);
  const router = useRouter();
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (box.current && !box.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const show = () => {
    if (!from || !to || to < from || to > p.custom.today || span(from, to) > p.custom.maxDays) {
      setBad(true);
      return;
    }
    const q = new URLSearchParams({ home: '1', from, to });
    if (p.design) q.set('design', p.design);
    setOpen(false);
    router.push(`/admin?${q.toString()}`, { scroll: false });
  };

  return (
    <div className="a3-rng" ref={box}>
      <div className="a3-seg" role="group" aria-label={p.labels.aria} data-testid="dash-range">
        {p.options.map((o) => (
          <Link key={o.days} className={o.on ? 'on' : ''} href={o.href} aria-current={o.on ? 'true' : undefined} scroll={false}>
            <span>{o.label}</span>
          </Link>
        ))}
        <button type="button" className={p.custom.on ? 'on' : ''} aria-pressed={p.custom.on} aria-expanded={open} onClick={() => setOpen(!open)} data-testid="dash-range-custom">
          <ShellIcon name="cal" size={15} />
          <span>{p.custom.label}</span>
        </button>
      </div>
      {open ? (
        <div className="a3-rpop a2-menu" role="dialog" aria-label={p.labels.pick}>
          <div className="a3-rpf">
            <label>
              <span>{p.labels.from}</span>
              <input type="date" className="a2-inp" value={from} min={p.custom.min} max={p.custom.today} onChange={(e) => (setFrom(e.target.value), setBad(false))} />
            </label>
            <label>
              <span>{p.labels.to}</span>
              <input type="date" className="a2-inp" value={to} min={p.custom.min} max={p.custom.today} onChange={(e) => (setTo(e.target.value), setBad(false))} />
            </label>
          </div>
          {bad ? (
            <p className="a3-rbad" role="alert">
              {p.labels.bad}
            </p>
          ) : null}
          <div className="a3-rpa">
            <button type="button" className="a3-btn sm gh" onClick={() => setOpen(false)}>
              {p.labels.cancel}
            </button>
            <button type="button" className="a3-btn sm pri" onClick={show}>
              {p.labels.show}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
