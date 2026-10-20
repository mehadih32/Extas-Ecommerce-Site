'use client';
// A sheet for the Smart Rules screens (bottom sheet on phone, dialog on desktop), like the size chart screen's: Escape
// or a tap outside closes it, Tab stays inside, the first field gets focus and the opener gets it back.
import { useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../Icon';

export function Sheet({ title, closeLabel, onClose, children, onSubmit, wide }: { title: string; closeLabel: string; onClose(): void; children: ReactNode; onSubmit?(e: FormEvent): void; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    // a sheet that is still loading has no field yet: the dialog itself takes focus so Escape and Tab still work
    (box.current?.querySelector<HTMLElement>('input, textarea, select, .ad-modal-bd button') ?? box.current)?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, textarea, a[href]')];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const body = onSubmit ? (
    <form className="ad-modal-bd" onSubmit={onSubmit} noValidate autoComplete="off">
      {children}
    </form>
  ) : (
    <div className="ad-modal-bd">{children}</div>
  );
  return (
    <div className="ad-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`ad-modal${wide ? ' rl-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="rl-sheet-h" ref={box} tabIndex={-1} onKeyDown={onKey}>
        <div className="ad-modal-hd">
          <h2 id="rl-sheet-h">{title}</h2>
          <button type="button" className="ad-iconbtn" aria-label={closeLabel} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
