'use client';
// PR 762 — the section's tab bar (and the open tab's pages as chips) drawn ONCE by the shell, at the top of <main>, above
// the page. Until now each page drew its own bar under its own heading (SectionTabs, ~245 places), so the bar's height
// above it followed the heading above it (one, two or three lines of text under the title, a crumb row, an old page's own
// header): it jumped between pages of one section (docs/reports/2026-11-15-tabbar-position.md). Here its place does not
// depend on the page at all. The words come from the shell's own dictionary (`shell.tab.*`, `shell.tabs.*`, `nav.*`).
import Link from 'next/link';
import { locate, visiblePages, visibleTabs, type ShellViewer } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { MoreTabs, TabsRow } from './ShellButtons';

export function ShellTabBar({ dict, pathname, from, viewer }: { dict: Dict; pathname: string; from: string | null; viewer: ShellViewer }) {
  const place = locate(pathname, from);
  if (!place?.tab) return null;
  const { section, tab } = place;
  const tabs = visibleTabs(section, viewer);
  const main = tabs.filter((x) => !x.more);
  const more = tabs.filter((x) => x.more);
  const label = (id: string) => t(dict, `shell.tab.${section.id}.${id}`);
  const pages = visiblePages(tab, viewer);
  return (
    <div className="a2-z a2-bar" data-testid="a2-bar" data-section={section.id}>
      {tabs.length > 1 ? (
        <nav className="a2-tabs" aria-label={t(dict, 'shell.tabs.aria', { section: t(dict, `shell.sec.${section.id}`) })} data-testid="a2-tabs">
          <TabsRow key={`${section.id}-${tab.id}`}>
            {main.map((x) => {
              const on = x.id === tab.id;
              return (
                <Link key={x.id} className={`a2-tab${on ? ' on' : ''}`} href={visiblePages(x, viewer)[0]!.href} aria-current={on ? 'page' : undefined}>
                  {label(x.id)}
                </Link>
              );
            })}
          </TabsRow>
          {more.length ? <MoreTabs label={t(dict, 'shell.tabs.more')} links={more.map((x) => ({ href: visiblePages(x, viewer)[0]!.href, label: label(x.id), on: x.id === tab.id }))} /> : null}
        </nav>
      ) : null}
      {pages.length > 1 ? (
        <nav className="a2-seg a2-subtabs" aria-label={t(dict, 'shell.tabs.sub', { tab: label(tab.id) })} data-testid="a2-subtabs">
          {pages.map((p) => {
            const on = !!place.page && p.href === place.page.href;
            return (
              <Link key={p.href} className={on ? 'on' : undefined} href={p.href} aria-current={on ? 'page' : undefined}>
                {t(dict, `nav.${p.keys[0]}`)}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
