'use client';
// PR 12 — SH-02, the command palette (demo a2PalOpen): Ctrl/⌘ K, "/" or a tap on search. What is typed goes to
// GET /api/admin/search (pages, settings, products, orders, customers, actions, help — only what the person may open);
// ↑ ↓ move, Enter opens, Esc closes. "> " actions, "# " order numbers, "? " help; Bengali words and digits work.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SearchGroup, SearchItem } from '@/lib/admin-shell/search';
import { t, type Dict } from '@/lib/i18n';
import type { GuideRequest } from './events';
import { ShellIcon } from './ShellIcon';

const WAIT_MS = 120;

export function Palette({ dict, onClose, onGuide }: { dict: Dict; onClose(): void; onGuide(g: GuideRequest): void }) {
  const tt = (k: string) => t(dict, `shell.palette.${k}`);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<SearchGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { credentials: 'same-origin', signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { groups?: SearchGroup[] }) => {
          setGroups(j.groups ?? []);
          setFailed(false);
          setSel(0);
        })
        .catch((e: unknown) => {
          if ((e as { name?: string }).name !== 'AbortError') setFailed(true);
        });
    }, WAIT_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q]);

  const items: SearchItem[] = (groups ?? []).flatMap((g) => g.items);
  const open = (it: SearchItem | undefined) => {
    if (!it) return;
    onClose();
    if (it.guide) onGuide(it.guide);
    else if (it.href) router.push(it.href);
  };

  useEffect(() => {
    box.current?.querySelector('.a2-pi.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      onClose();
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      open(items[sel]);
    }
  };

  let n = -1;
  return (
    <div className="adm2 a2-ov a2-z" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={onKey} data-testid="a2-palette">
      <div className="a2-pal" role="dialog" aria-modal="true" aria-label={tt('aria')}>
        <div className="a2-palin">
          <ShellIcon name="search" size={19} />
          <input
            ref={input}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tt('placeholder')}
            autoComplete="off"
            spellCheck={false}
            aria-label={tt('aria')}
            aria-controls="a2palb"
            aria-autocomplete="list"
            aria-activedescendant={items.length ? `a2pi-${sel}` : undefined}
            data-testid="a2-palette-input"
          />
          <kbd>{tt('esc')}</kbd>
        </div>
        <div className="a2-palb" id="a2palb" role="listbox" ref={box} aria-label={tt('aria')}>
          {failed ? (
            <div className="a2-palx" role="alert">
              {tt('error')}
            </div>
          ) : groups && !items.length ? (
            <div className="a2-palx">{tt('none')}</div>
          ) : (
            (groups ?? []).map((g) => (
              <div key={g.id} role="group" aria-label={g.label}>
                <div className="a2-pg" aria-hidden="true">
                  {g.label}
                </div>
                {g.items.map((it) => {
                  n += 1;
                  const i = n;
                  return (
                    <button key={`${g.id}-${i}`} id={`a2pi-${i}`} type="button" role="option" aria-selected={i === sel} className={`a2-pi${i === sel ? ' sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => open(it)} data-testid="a2-palette-item">
                      <ShellIcon name={it.icon} size={17} />
                      <div>
                        <b>{it.label}</b>
                        {it.sub ? <span>{it.sub}</span> : null}
                      </div>
                      <span className="a2-ent">
                        <ShellIcon name="enter" size={15} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="a2-palf">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {tt('move')}
          </span>
          <span>
            <kbd>↵</kbd> {tt('open')}
          </span>
          <span className="a2-hide-ph">{tt('hint')}</span>
        </div>
      </div>
    </div>
  );
}
