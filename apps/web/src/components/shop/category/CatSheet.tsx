'use client';
// PR 46 — the phone's Filter button and its sheet (demo 21-category.js cat_modalHTML, 02-core.js openModal): the same
// filter groups as the desktop rail, with "Clear all" and "Show N products" held at the bottom of the sheet. Every tick
// redraws the page under the sheet (the count on the button follows at once) and the sheet stays open until the
// shopper is done. Esc, the close button and a tap outside close it; focus goes back to the Filter button; the page
// under it does not scroll while it is open.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';

interface Props {
  label: string;
  title: string;
  closeLabel: string;
  /** The active filters' count on the button (0 = no badge). */
  count: string | null;
  clear: { label: string; href: string; disabled: boolean };
  show: string;
  children: ReactNode;
}

export function CatSheet({ label, title, closeLabel, count, clear, show, children }: Props) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => btn.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      if (e.key === 'Tab' && sheet.current) {
        const f = Array.from(sheet.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(
          (x) => x.getClientRects().length > 0,
        );
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="btn btn-ghost cat-fbtn"
        data-testid="cat-filter-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setHost(btn.current?.closest<HTMLElement>('.shop') ?? document.body);
          setOpen(true);
        }}
      >
        <Icon name="settings" size={19} />
        <span className="cat-tl">{label}</span>
        {count ? <span className="cat-count">{count}</span> : null}
      </button>
      {open && host
        ? createPortal(
            <div
              className="modal-back"
              onClick={(e) => {
                if (e.target === e.currentTarget) close();
              }}
            >
              <div ref={sheet} className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-cat-sheet="">
                <div className="modal-hd">
                  <div className="h3" style={{ fontSize: 17 }}>
                    {title}
                  </div>
                  <button type="button" className="iconbtn" aria-label={closeLabel} onClick={close}>
                    <Icon name="close" size={18} />
                  </button>
                </div>
                <div className="modal-bd">
                  {children}
                  <div className="cat-mfoot">
                    <button type="button" className="btn btn-ghost" data-href={clear.href} data-fk="m-clear" disabled={clear.disabled}>
                      {clear.label}
                    </button>
                    <button type="button" className="btn btn-primary" data-testid="cat-show" onClick={close}>
                      {show}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            host,
          )
        : null}
    </>
  );
}
