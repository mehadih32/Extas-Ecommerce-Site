'use client';
// PR 55 / 57 — the product page's popups (demo 02-core.js openModal): the size chart and "All N colours". A real dialog:
// Esc, the close button and a tap outside close it, Tab stays inside, the page under it does not scroll, and focus
// goes back to the button that opened it.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';

interface Props {
  title: string;
  closeLabel: string;
  onClose: () => void;
  /** The button that opened it: focus goes back to it. */
  opener: RefObject<HTMLElement | null>;
  /** Wider on a computer (the size chart). */
  wide?: boolean;
  className?: string;
  testId?: string;
  children: ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function PdpModal({ title, closeLabel, onClose, opener, wide, className, testId, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  // drawn inside the shop wrapper so it wears the theme (only ever opened in the browser)
  const host = typeof document === 'undefined' ? null : (document.querySelector<HTMLElement>('#app.shop') ?? document.body);

  useEffect(() => {
    const back = opener.current;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    box.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !box.current) return;
      const f = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.getClientRects().length > 0);
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      requestAnimationFrame(() => back?.focus({ preventScroll: true }));
    };
  }, [onClose, opener]);

  if (!host) return null;
  return createPortal(
    <div
      className="modal-back"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={box} className={`modal${wide ? ' wide' : ''}${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid={testId}>
        <div className="modal-hd">
          <div className="h3" style={{ fontSize: 17 }}>
            {title}
          </div>
          <button type="button" className="iconbtn" aria-label={closeLabel} onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-bd">{children}</div>
      </div>
    </div>,
    host,
  );
}
