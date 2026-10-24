'use client';
// PR 12 — the new admin's drawer (demo a2Drawer): from the right on a computer, a bottom sheet on a phone. Esc, the
// close button or a tap on the dimmed page closes it; focus moves into it when it opens and stays inside it.
// PR 594 (CN-026): `full` makes the phone's sheet full-screen (the guide).
import { useEffect, useRef, type ReactNode } from 'react';
import { ShellIcon } from './ShellIcon';

export function Drawer({ title, sub, closeLabel, onClose, children, foot, testId, wide, full }: { title: string; sub?: string; closeLabel: string; onClose(): void; children: ReactNode; foot?: ReactNode; testId?: string; wide?: boolean; full?: boolean }) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    el?.querySelector<HTMLElement>('[data-a2-close]')?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onClose();
      } else if (ev.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="a2-z">
      <div className="a2-scrim" aria-hidden="true" onClick={onClose} />
      <aside ref={box} className={`a2-drw${wide ? ' wide' : ''}${full ? ' full' : ''}`} role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className="a2-drh">
          <div>
            <h2 className="a2-h3">{title}</h2>
            {sub ? <div className="a2-cs">{sub}</div> : null}
          </div>
          <button type="button" className="a2-icb" data-a2-close aria-label={closeLabel} onClick={onClose}>
            <ShellIcon name="x" size={18} />
          </button>
        </div>
        <div className="a2-drb">{children}</div>
        {foot ? <div className="a2-drf">{foot}</div> : null}
      </aside>
    </div>
  );
}
