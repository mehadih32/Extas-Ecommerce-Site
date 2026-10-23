// PR 500, PR 12 (CN-022) — the frame of an existing admin page inside the new admin shell. The shell itself (sidebar,
// top bar, phone bar, search, notifications, guide) is drawn once by app/admin/layout.tsx; a page's frame adds only
// "Section › Tab" with the section's guide button above the page's own heading. SystemTabs are now the section's tabs
// (components/admin/shell/ShellParts.tsx); AdminNotice is the shell's "no access" or "no database" state.
import type { ReactNode } from 'react';
import type { AdminView } from '@/lib/admin-page';
import { shellSession } from '@/lib/admin-shell/session';
import { t } from '@/lib/i18n';
import type { LangLabels } from './LangSwitch';
import { PageCrumb, SectionTabs, ShellState } from './shell/ShellParts';

export function langLabels(view: AdminView): LangLabels {
  const d = view.dict;
  return { group: t(d, 'frame.lang'), en: t(d, 'lang.en'), enShort: t(d, 'lang.enShort'), bn: t(d, 'lang.bn'), bnShort: t(d, 'lang.bnShort') };
}

export function Brand({ view, logo }: { view: AdminView; logo: 'side' | 'top' }) {
  return (
    <span className={logo === 'side' ? 'ad-side-brand' : 'ad-top-brand'}>
      {view.storeName ? (
        <span className="ad-logo" translate="no">
          {view.storeName}
        </span>
      ) : null}
      <span className="ad-tag">{t(view.dict, 'frame.admin')}</span>
    </span>
  );
}

export function AdminFrame({ view, current, children }: { view: AdminView; current: string; children: ReactNode }) {
  return (
    <div className="ad" lang={view.lang}>
      <PageCrumb view={view} current={current} />
      {children}
    </div>
  );
}

/** The section's tabs (and the open tab's pages) at the top of a page; `group` is kept for the pages that pass it. */
export function SystemTabs({ view, current }: { view: AdminView; current: string; group?: string }) {
  return <SectionTabs view={view} current={current} />;
}

/** A page that cannot be shown: no access (the shell's denied state names the key) or no database. */
export async function AdminNotice({ view, current, text }: { view: AdminView; current: string; text: string }) {
  const kind = text === t(view.dict, 'page.noAccess') ? 'denied' : 'unavailable';
  const state = <ShellState view={view} kind={kind} />;
  if ((await shellSession()).kind !== 'ok') {
    return (
      <div className="adm2" lang={view.lang}>
        <main className="a2-ct a2-z" id="main">
          {state}
        </main>
      </div>
    );
  }
  return (
    <AdminFrame view={view} current={current}>
      <div className="a2-z">{state}</div>
    </AdminFrame>
  );
}
