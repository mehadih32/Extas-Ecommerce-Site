'use client';
// PR 40 — the phone menu: the menu button in the header and the sheet it opens (demo 03-layout.js phoneMenuHTML and
// 02-core.js openModal). The quick row, the menu tree (every category joins on its own), the Help list, WhatsApp, the
// hotline, the opening hours and the language switch. Esc, the close button and a tap outside close it, and focus
// goes back to the menu button; the page under it does not scroll while it is open.
import type { ShopIcon } from '@extas/settings';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { MenuRow } from '@/lib/shop/shell-model';
import { Icon } from './Icon';

export interface MenuData {
  title: string;
  close: string;
  quick: Array<{ id: string; href: string; label: string; icon: ShopIcon }>;
  rows: MenuRow[];
  helpTitle: string;
  help: MenuRow[];
  wa: { href: string | null; label: string };
  hotline: { href: string; label: string } | null;
  hours: string | null;
}

function Row({ r }: { r: MenuRow }) {
  return (
    <a className="mn-row" href={r.href} data-testid={r.testid}>
      {r.icon || r.emptyIcon ? <span className="mn-ic">{r.icon ? <Icon name={r.icon} size={18} /> : <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" />}</span> : null}
      <span className="grow">{r.label}</span>
      <Icon name="right" size={16} />
    </a>
  );
}

export function MenuButton({ label, data, lang }: { label: string; data: MenuData; lang: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => btn.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      if (e.key === 'Tab' && sheet.current) {
        // keep the keyboard inside the sheet while it is open
        const f = Array.from(sheet.current.querySelectorAll<HTMLElement>('a[href],button,input,[tabindex]:not([tabindex="-1"])'));
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

  const openSheet = () => {
    setHost(btn.current?.closest<HTMLElement>('.shop') ?? document.body);
    setOpen(true);
  };

  const quickN = data.quick.length;
  return (
    <>
      <button ref={btn} className="iconbtn hide-d" data-act="open-menu" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={openSheet}>
        <Icon name="menu" size={22} />
      </button>
      {open && host
        ? createPortal(
            <div
              className="modal-back"
              onClick={(e) => {
                if (e.target === e.currentTarget) close();
              }}
            >
              <div ref={sheet} className="modal" role="dialog" aria-modal="true" aria-label={data.title} tabIndex={-1}>
                <div className="modal-hd">
                  <div className="h3" style={{ fontSize: 17 }}>
                    {data.title}
                  </div>
                  <button className="iconbtn" data-act="close-modal" aria-label={data.close} onClick={close}>
                    <Icon name="close" size={18} />
                  </button>
                </div>
                <div className="">
                  {quickN ? (
                    <div className="mn-quick" data-n={quickN !== 4 ? quickN : undefined}>
                      {data.quick.map((q) => (
                        <a key={q.id} className="mn-q" href={q.href}>
                          <Icon name={q.icon} size={18} />
                          <span>{q.label}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {data.rows.map((r) => (
                    <Row key={r.id} r={r} />
                  ))}
                  {data.help.length ? <div className="mn-h">{data.helpTitle}</div> : null}
                  {data.help.map((r) => (
                    <Row key={`h-${r.id}`} r={r} />
                  ))}
                  <div className="mn-foot">
                    {data.wa.href ? (
                      <a className="btn btn-primary btn-block" href={data.wa.href} target="_blank" rel="noopener">
                        <Icon name="chat" size={17} />
                        {data.wa.label}
                      </a>
                    ) : null}
                    {data.hotline ? (
                      <a className="btn btn-block mt8" href={data.hotline.href}>
                        <Icon name="phone" size={16} />
                        {data.hotline.label}
                      </a>
                    ) : null}
                    <div className="row between mt12" style={{ alignItems: 'center' }}>
                      <span className="xs muted">{data.hours}</span>
                      {lang}
                    </div>
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
