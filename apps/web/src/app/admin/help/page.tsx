// PR 6 (follow-up 84), PR 12 — Help & manual (/admin/help): every section the person may open, with its Bengali guide
// (docs/admin-guide/, CN-014; the same guide opens from each page's "এই সেকশনে কী করা যায়" button), whether its new pages
// are ready or still planned, and a link into it. The guides are read from the server's deployed copy of the docs
// (GET /api/admin/help/<slug>). Reading needs `help.read`.
// S18 · PR 387: each row also opens the section's chapter in the Site manual (/admin/help/manual).
// S02 · PR 599: "Ask for a new feature" (Help & Build › Feature requests) for whoever may see the build's pages.
// PR 648 (CN-036): in the Lumen look (data-lm-ready, light and dark): every section is its own card in a grid (icon, name,
// what it is for, Ready / Planned, then its three doors: the guide, the manual chapter, the section), lumen-help.css.
import { OpenMapButton } from '@/components/admin/map/OpenMapButton';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, PlaceGuide, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey, SHELL_SECTIONS, sectionHome, sectionVisible, visibleTabs, type ShellPlace, type ShellViewer } from '@/lib/admin-shell/sections';
import { shellSession } from '@/lib/admin-shell/session';
import { t } from '@/lib/i18n';
import { buildStatus } from '@/lib/status';
import '../settings/system/sysinfo.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/help';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'help.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ q?: string; s?: string }> };

export default async function HelpPage(props: Props) {
  const deps = adminDeps();
  const [view, access, sp] = await Promise.all([adminView(deps), pageAccess('help.read', deps), props.searchParams]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="help" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-lm-ready="" data-testid="help">
        <ShellState view={view} kind="denied" permission="help.read" />
      </div>
    );
  const s = await shellSession();
  const viewer: ShellViewer = s.kind === 'ok' ? { perms: s.perms, owner: s.owner, hidden: s.hidden } : { perms: new Set(), owner: false };
  const d = view.dict;
  const here = locateKey('help');
  const sections = SHELL_SECTIONS.filter((x) => x.id !== 'help' && sectionVisible(x, viewer));
  const h = (k: string, vars?: Record<string, string | number>) => t(d, `help.${k}`, vars);
  // hardcode-ok: the longest search text read from the address (a technical bound)
  const q = (sp.q ?? '').trim().slice(0, 100);
  const chip = sections.some((x) => x.id === sp.s) ? (sp.s as string) : 'all';
  const shown = sections.filter((x) => {
    if (chip !== 'all' && x.id !== chip) return false;
    if (!q) return true;
    return `${t(d, `shell.sec.${x.id}`)} ${t(d, `shell.purpose.${x.id}`)}`.toLowerCase().includes(q.toLowerCase());
  });
  const chipHref = (id: string) => `${HERE}?${new URLSearchParams({ ...(q ? { q } : {}), ...(id === 'all' ? {} : { s: id }) }).toString()}`.replace(/\?$/, '');
  const stages = buildStatus.stages.filter((x) => !x.parked);

  return (
    <div className="a2-z lm-hb" data-lm-ready="" data-testid="help">
      <PageHead
        view={view}
        place={here}
        title={t(d, 'help.title')}
        sub={h('subProto')}
        right={
          <>
            <OpenMapButton testId="help-map">
              <ShellIcon name="grid" size={14} />
              {h('map')}
            </OpenMapButton>
            {/* PR 1163: "Download PDF" as prototype v5 — the whole manual as a print page (Save as PDF); the .md file is under More options */}
            <Link className="a2-btn" href="/admin/help/manual?print=1" target="_blank" data-testid="help-pdf">
              <ShellIcon name="dl" size={14} />
              {h('pdf')}
            </Link>
          </>
        }
      />
      <SectionTabs view={view} current="help" />

      <form className="a2-card a2-mt12" role="search" action={HERE} method="get" data-testid="help-search">
        <input className="a2-inp" type="search" name="q" defaultValue={q} maxLength={100 /* hardcode-ok: search text bound */} placeholder={h('searchPh')} aria-label={h('searchPh')} data-testid="help-q" />
        <div className="s28-row a2-mt12" role="group" aria-label={h('chips')}>
          {[['all', h('all')] as const, ...sections.map((x) => [x.id, t(d, `shell.sec.${x.id}`)] as const)].map(([id, name]) => (
            <Link key={id} className={`a2-btn sm${chip === id ? ' pri' : ''}`} href={chipHref(id)} aria-current={chip === id ? 'true' : undefined} data-testid="help-chip">
              {name}
            </Link>
          ))}
        </div>
        <div className="a2-xs a2-mute a2-mt12">{h('count', { n: shown.length, all: sections.length })}</div>
      </form>

      <section className="a2-card a2-mt12" data-testid="help-list">
        {shown.length === 0 ? (
          <p className="a2-sm a2-mute">{h('nothing')}</p>
        ) : (
          shown.map((sec, i) => {
            const place: ShellPlace = { section: sec, tab: null, page: null };
            return (
              <details key={sec.id} open={Boolean(q) && i < 3} data-testid="help-item" data-section={sec.id}>
                <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShellIcon name={sec.icon} size={16} />
                  <b>{t(d, `shell.sec.${sec.id}`)}</b>
                </summary>
                <div className="a2-mt6">
                  <p className="a2-sm">{t(d, `shell.purpose.${sec.id}`)}</p>
                  <div className="s28-row a2-mt12">
                    <PlaceGuide view={view} place={place} overview />
                    <Link className="a2-btn" href={`/admin/help/manual?c=${sec.id}`}>
                      {h('read')}
                    </Link>
                    <Link className="a2-btn pri" href={sectionHome(sec, viewer)}>
                      {h('openPage')} →
                    </Link>
                  </div>
                </div>
              </details>
            );
          })
        )}
      </section>

      <section className="a2-card a2-mt12" data-testid="help-files">
        <h2 className="a2-h3">{h('files')}</h2>
        {/* PR 1163: the prototype's file cards (Blueprint, PR register, all files), each with Read — for those who may open Help & Build */}
        {viewer.owner || viewer.perms.has('build.read') ? (
          <div className="a2-man-files a2-mt12" data-testid="help-file-cards">
            {(
              [
                ['Blueprint', '/admin/build/files/read?path=BLUEPRINT.md'],
                ['Register', '/admin/build/files/read?path=MASTER-REGISTER.md'],
                ['All', '/admin/build/files'],
              ] as const
            ).map(([k, href]) => (
              <div key={k} className="a2-card tight a2-man-file">
                <b>{h(`file${k}`)}</b>
                <span className="a2-xs a2-mute">{h(`file${k}D`)}</span>
                <Link className="a2-btn sm" href={href}>
                  {h('fileRead')}
                </Link>
              </div>
            ))}
          </div>
        ) : null}
        <p className="a2-xs a2-mute a2-mt12">{h('stagesH')}</p>
        <div className="bd-rows a2-mt12">
          {stages.map((x) => (
            <div key={x.id} data-testid="help-stage" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 36 }}>
              <span style={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}>
                <b>{x.id}</b> <span className="a2-sm">{x.name}</span>
              </span>
              <span className="sy-bar" style={{ flex: '0 0 80px' }} role="img" aria-label={`${x.done}/${x.total}`}>
                <i style={{ width: `${x.total ? Math.round((x.done / x.total) * 100) : 0}%` }} />
              </span>
              <span className="a2-sm" style={{ flex: '0 0 56px', textAlign: 'end' }}>
                {x.done}/{x.total}
              </span>
            </div>
          ))}
        </div>
        <div className="a2-note a2-mt12">
          <ShellIcon name="alert" size={15} />
          <span>{h('hint')}</span>
        </div>
      </section>

      {/* D10: what the page had before (the ask-for-a-feature card and every section's card with its three doors) stays, under More options. */}
      <details className="a2-card a2-mt12" data-testid="help-more">
        <summary className="a2-h3" style={{ cursor: 'pointer', minHeight: 44 }}>
          {h('more')}
        </summary>
        <div className="a2-cs">{h('moreSub')}</div>
        <a className="a2-btn a2-mt12" href="/api/admin/help/manual-md" download data-testid="help-md">
          <ShellIcon name="dl" size={14} />
          {h('mdDownload')}
        </a>
      {viewer.owner || viewer.perms.has('build.read') ? (
        <section className="a2-card a2-helpask" data-testid="help-ask">
          <span className="a2-sm">{t(d, 'help.askLine')}</span>
          <Link className="a2-btn" href="/admin/build/requests" data-testid="help-ask-go">
            {t(d, 'help.ask')}
          </Link>
        </section>
      ) : null}
      <section className="lm-hb-grid" aria-label={t(d, 'help.title')}>
        {sections.map((sec) => {
          const place: ShellPlace = { section: sec, tab: null, page: null };
          const tabs = visibleTabs(sec, viewer);
          const ready = sec.id === 'dashboard' || tabs.length > 0;
          return (
            <div key={sec.id} className="a2-card a2-helprow lm-hb-sec" id={sec.guide} data-testid="help-row" data-section={sec.id}>
              <span className="lm-hb-top">
                <span className="a2-tki info">
                  <ShellIcon name={sec.icon} size={18} />
                </span>
                <span className="a2-ht">
                  <b>{t(d, `shell.sec.${sec.id}`)}</b>
                  <i>{t(d, `shell.purpose.${sec.id}`)}</i>
                </span>
                <span className={`a2-pill ${ready ? 'ok' : 'line'}`}>{ready ? t(d, 'help.built') : t(d, 'help.planned')}</span>
              </span>
              <span className="lm-hb-act">
                <PlaceGuide view={view} place={place} overview />
                {/* S18 · PR 387: the section's chapter in the Site manual. */}
                <Link className="a2-btn" href={`/admin/help/manual?c=${sec.id}`} data-testid="help-read">
                  {t(d, 'help.read')}
                </Link>
                <Link className="a2-btn pri" href={sectionHome(sec, viewer)}>
                  {t(d, 'help.open')}
                </Link>
              </span>
            </div>
          );
        })}
      </section>
      </details>
    </div>
  );
}
