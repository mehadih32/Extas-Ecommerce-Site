'use client';
// PR 779 — Settings as prototype v5 draws it (m-settings.js `frame()`): a searchable list on the left in two groups,
// Business and System (owner only), the open setting on the right. Below 960 px the list becomes a select and a search box.
// It replaces the section's tab bar for Settings only; every page and address stays as it was (lib/admin-shell/settings-list.ts).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { currentItem, itemMatches, settingsItems, type SettingsItem } from '@/lib/admin-shell/settings-list';
import type { ShellViewer } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { ShellIcon } from './ShellIcon';
import './settings-frame.css';

export function SettingsFrame({ dict, pathname, viewer, children }: { dict: Dict; pathname: string; viewer: ShellViewer; children: ReactNode }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const s = (k: string) => t(dict, `shell.setlist.${k}`);
  const items = useMemo(() => settingsItems(viewer), [viewer]);
  const now = currentItem(items, pathname);
  const text = (it: SettingsItem) => ({ name: s(`item.${it.id}.n`), kw: s(`item.${it.id}.k`) });
  const shown = items.filter((it) => itemMatches(text(it), q));
  const hit = (it: SettingsItem) => {
    const w = q.trim().toLowerCase();
    if (!w) return '';
    const name = text(it).name.toLowerCase();
    const found = text(it).kw.split(' ').find((k) => k.toLowerCase().includes(w));
    return found && !name.includes(w) ? `${s('has')}: ${found}` : '';
  };
  const group = (g: 'b' | 's' | 'm') => {
    const list = shown.filter((it) => it.group === g);
    if (!list.length) return null;
    return (
      <div key={g} className="sf-grp" data-testid={`sf-group-${g}`}>
        <div className="sf-gh">
          <span>{s(`groups.${g}`)}</span>
          {g === 's' ? <span className="sf-own">{s('owner')}</span> : null}
        </div>
        <nav className="sf-nav" aria-label={s(`groups.${g}`)}>
          {list.map((it) => {
            const on = now?.id === it.id;
            const h = hit(it);
            return (
              <Link key={it.id} href={it.href} className={`sf-it${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} data-testid={`sf-item-${it.id}`}>
                <ShellIcon name={it.icon} size={17} />
                <span>
                  {text(it).name}
                  {h ? <span className="sf-hit">{h}</span> : null}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  };
  const search = (id: string) => (
    <input id={id} className="a2-inp sf-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={s('search')} aria-label={s('searchLabel')} autoComplete="off" data-testid="sf-search" />
  );
  return (
    <div className="sf-wrap" data-testid="sf-frame">
      <aside className="sf-side" aria-label={s('list')}>
        {search('sf-q')}
        {group('b')}
        {group('s')}
        {group('m')}
        {shown.length === 0 ? <p className="sf-none a2-sub">{s('none')}</p> : null}
      </aside>
      <div className="sf-main">
        <div className="sf-pick">
          <select className="a2-sel" aria-label={s('pick')} value={now?.href ?? ''} onChange={(e) => e.target.value && router.push(e.target.value)} data-testid="sf-select">
            {now ? null : <option value="">{s('pick')}</option>}
            {(['b', 's', 'm'] as const).map((g) => (
              <optgroup key={g} label={s(`groups.${g}`)}>
                {items
                  .filter((it) => it.group === g && (shown.includes(it) || it.id === now?.id))
                  .map((it) => (
                    <option key={it.id} value={it.href}>
                      {text(it).name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        {now?.owner ? (
          <div className="a2-note sf-owner" role="note" data-testid="sf-owner-note">
            <ShellIcon name="lock" size={15} />
            <span>{s('ownerOnly')}</span>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
