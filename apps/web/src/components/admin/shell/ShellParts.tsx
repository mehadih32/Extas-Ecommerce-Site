// PR 12 — the parts of the new admin a page draws on the server (demo a2Head, a2Tabs, a2State, a2Placeholder):
//   - PageCrumb: "Section › Tab" above an existing page's own heading, with the section's guide button;
//   - SectionTabs: draws nothing since PR 762 (the shell draws the section's tab bar once, ShellTabBar.tsx);
//   - PageHead: the header of the shell's own pages (crumb, title, line under it, guide, buttons on the right);
//   - ShellState: not found, could not load, no access, empty, no database — each with its way back;
//   - Placeholder: a section with nothing built yet says so, lists what will come and links to what is ready;
//   - ClosedState (PR 652 follow-up, 669): a section of a stage the owner closed, opened by its address, says
//     "closed by the owner for now" (to everyone, the owner too) instead of "no access", in the Lumen look.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { authLabel } from '@extas/auth';
import type { AdminView } from '@/lib/admin-page';
import { deniedMemo, shellSession } from '@/lib/admin-shell/session';
import { guideOf, locateKey, sectionHome, visiblePages, visibleTabs, type ShellPlace, type ShellSection, type ShellViewer } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { EmptyState } from '@/components/admin/lumen/EmptyState';
import { SearchButton } from './ShellButtons';
import { PageHead, PlaceGuide } from './ShellHead';
import { ShellIcon } from './ShellIcon';

const NOBODY: ShellViewer = { perms: new Set(), owner: false };

// PR 762: the page head lives in ShellHead.tsx (no server parts in it, so client screens draw it too)
export { PageHead, PlaceGuide };

export async function shellViewer(): Promise<ShellViewer> {
  const s = await shellSession();
  return s.kind === 'ok' ? { perms: s.perms, owner: s.owner, hidden: s.hidden } : NOBODY;
}

const secName = (view: AdminView, id: string) => t(view.dict, `shell.sec.${id}`);
const tabName = (view: AdminView, p: ShellPlace) => (p.tab ? t(view.dict, `shell.tab.${p.section.id}.${p.tab.id}`) : '');

export async function PageCrumb({ view, current }: { view: AdminView; current: string }) {
  const place = locateKey(current);
  if (!place) return null;
  const v = await shellViewer();
  const tab = tabName(view, place);
  return (
    <div className="a2-z a2-crow" data-testid="a2-crumb">
      <div className="a2-crumb">
        <Link href={sectionHome(place.section, v)}>{secName(view, place.section.id)}</Link>
        {tab && tab !== secName(view, place.section.id) ? (
          <>
            <ShellIcon name="cr" size={12} />
            <span>{tab}</span>
          </>
        ) : null}
      </div>
      <PlaceGuide view={view} place={place} />
    </div>
  );
}

/**
 * PR 762: draws nothing any more. The section's tab bar (and the open tab's pages as chips) is drawn once by the shell
 * (ShellTabBar.tsx, at the top of <main>), so it sits in the same place on every page of the section. Pages still call
 * this with their key (about 245 places); the key is only checked by the tests (nav-pages.test.ts) now.
 */
export function SectionTabs(_props: { view: AdminView; current: string }) {
  return null;
}

export type StateKind = 'notfound' | 'error' | 'denied' | 'empty' | 'unavailable';

/** The plain name of the key a page was refused for, in the admin's language (null when unknown). */
function deniedName(view: AdminView, permission: string | null | undefined): string | null {
  if (!permission) return null;
  try {
    const p = authLabel(`permissions.${permission}`);
    return view.lang === 'bn' ? p.bn : p.en;
  } catch {
    return null;
  }
}

export function ShellState({ view, kind, permission, errorId, retry }: { view: AdminView; kind: StateKind; permission?: string | null; errorId?: string | null; retry?: ReactNode }) {
  const tt = (k: string, vars?: Record<string, string>) => t(view.dict, `shell.state.${kind}.${k}`, vars);
  const back = (label: string, href = '/admin?home=1') => (
    <Link className="a2-btn" href={href}>
      {label}
    </Link>
  );
  if (kind === 'denied') {
    const name = deniedName(view, permission ?? deniedMemo().permission);
    return (
      <div className="a2-state deny" data-testid="a2-state" data-state="denied">
        <div className="a2-sti">
          <ShellIcon name="lock" size={26} />
        </div>
        <h3>{tt('title')}</h3>
        <p>{name ? tt('body', { perm: name }) : tt('bodyPlain')}</p>
        <div className="a2-gap8">{back(tt('back'), '/admin')}</div>
      </div>
    );
  }
  if (kind === 'notfound')
    return (
      <div className="a2-state err" data-testid="a2-state" data-state="notfound">
        <div className="a2-sti">
          <ShellIcon name="search" size={26} />
        </div>
        <h3>{tt('title')}</h3>
        <p>{tt('body')}</p>
        <div className="a2-gap8">
          <SearchButton label={tt('search')} />
          {back(tt('back'))}
        </div>
      </div>
    );
  if (kind === 'error')
    return (
      <div className="a2-state err" data-testid="a2-state" data-state="error" role="alert">
        <div className="a2-sti">
          <ShellIcon name="alert" size={26} />
        </div>
        <h3>{tt('title')}</h3>
        <p>{tt('body')}</p>
        {errorId ? (
          <span className="a2-errid">
            {tt('id')} · {errorId}
          </span>
        ) : null}
        <div className="a2-gap8">
          {retry}
          {back(tt('back'))}
        </div>
      </div>
    );
  if (kind === 'unavailable')
    return (
      <div className="a2-state err" data-testid="a2-state" data-state="unavailable">
        <div className="a2-sti">
          <ShellIcon name="info" size={26} />
        </div>
        <h3>{tt('title')}</h3>
        <p>{tt('body')}</p>
      </div>
    );
  return (
    <div className="a2-state" data-testid="a2-state" data-state="empty">
      <div className="a2-sti">
        <ShellIcon name="box" size={26} />
      </div>
      <h3>{tt('title')}</h3>
    </div>
  );
}

/** A section whose pages are not built yet: its purpose, what will come, and what of it is ready now. */
export function Placeholder({ view, section, viewer }: { view: AdminView; section: ShellSection; viewer: ShellViewer }) {
  const place: ShellPlace = { section, tab: null, page: null };
  const ready = visibleTabs(section, viewer);
  const name = secName(view, section.id);
  return (
    <div className="a2-z">
      <PageHead view={view} place={place} title={name} sub={t(view.dict, `shell.purpose.${section.id}`)} />
      <div className="a2-state" data-testid="a2-placeholder" data-section={section.id}>
        <div className="a2-sti">
          <ShellIcon name={section.icon} size={26} />
        </div>
        <h3>{t(view.dict, 'shell.state.placeholder.title', { section: name })}</h3>
        <p>{t(view.dict, 'shell.state.placeholder.body')}</p>
        {ready.length ? (
          <div className="a2-gap8 a2-center">
            <span className="a2-sm a2-b">{t(view.dict, 'shell.state.placeholder.ready')}</span>
            {ready.map((x) => (
              <Link key={x.id} className="a2-btn" href={visiblePages(x, viewer)[0]!.href}>
                {t(view.dict, `shell.tab.${section.id}.${x.id}`)}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="a2-sm a2-mute a2-plan">
          <b>{t(view.dict, 'shell.state.placeholder.planned')}</b> {t(view.dict, `shell.plan.${section.id}`)}
        </div>
      </div>
    </div>
  );
}

/**
 * PR 652 follow-up (669): a section of a closed stage opened by its address. Not "no access" (nobody lacks a key): the
 * owner has closed the stage until it is finished; what is built is kept and comes back with the stage's switch.
 */
export function ClosedState({ view, section, stage }: { view: AdminView; section: ShellSection; stage: string | null }) {
  const name = secName(view, section.id);
  return (
    <div className="a2-z" data-lm-ready="" data-testid="closed-stage" data-stage={stage ?? ''} data-section={section.id}>
      <EmptyState
        tone="calm"
        icon="lock"
        testId="a2-state"
        title={t(view.dict, 'shell.state.closed.title')}
        text={t(view.dict, stage ? 'shell.state.closed.body' : 'shell.state.closed.bodyPlain', { section: name, stage: stage ?? '' })}
        action={{ label: t(view.dict, 'shell.state.closed.back'), href: '/admin?home=1' }}
      />
    </div>
  );
}
