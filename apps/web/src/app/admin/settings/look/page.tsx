// PR 12 (CN-025, CN-026 (b)) — Settings → Admin look (demo V12.4 #/admin/settings/look): for every admin page in the look
// registry (components/admin/look/registry.ts) its designs as cards — the picture, the name, one line about it, "In use"
// (what this person sees), "Team default" (`admin.look.pages`, else the page's standard design) — with "Use this design"
// (the person's own, while `admin.look.perPerson` is on), "Preview" (the page with ?design=, nothing saved) and "Make
// team default" (settings.write). Then where the guide opens on a computer (`admin.guideOpens`: a side panel, a pop-up
// window or its own page; a phone always uses a full-screen sheet), the team's choice and, while allowed, the person's
// own. Reading needs settings.read; every change is checked again by PUT /api/admin/look.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { GuideChoice, LookUse, type GuideOption } from '@/components/admin/look/LookPicker';
import { LOOK_PAGES } from '@/components/admin/look/registry';
import { previewHref, wordsIn } from '@/components/admin/look/types';
import { PageHead, SectionTabs } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { guideModeOf, pickDesign, teamDesign } from '@/lib/admin-look/pick';
import { lookState } from '@/lib/admin-look/prefs';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { shellSession } from '@/lib/admin-shell/session';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/look';
const KEY = 'adminLook';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'look.metaTitle'), robots: { index: false, follow: false } };
}

export default async function AdminLookPage() {
  const deps = adminDeps();
  const [view, access] = await Promise.all([adminView(deps), pageAccess('settings.read', deps, MOTHER_STORE_ID)]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const [look, session] = await Promise.all([lookState(), shellSession()]);
  const canTeam = session.kind === 'ok' && (session.owner || session.perms.has('settings.write'));
  const d = view.dict;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `look.${k}`, vars);
  const failed = tt('failed');

  const guideMine = look.guide.perPerson ? (look.prefs.guide ?? null) : null;
  const guideNow = guideModeOf(look.guide, look.prefs);
  const modes = ['panel', 'popup', 'page'] as const;
  const teamOptions: GuideOption[] = modes.map((m) => ({ value: m, label: tt(`guide.${m}`) }));
  const mineOptions: GuideOption[] = [{ value: null, label: tt('guide.followTeam') }, ...teamOptions];

  return (
    <div className="a2-z" data-testid="admin-look">
      <PageHead view={view} place={locateKey(KEY)} title={tt('title')} sub={tt('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a3-lookw">
        {LOOK_PAGES.map((pg) => {
          const keys = pg.designs.map((x) => x.key);
          const mine = look.prefs.look[pg.id] ?? null;
          const cur = pickDesign(keys, pg.standard, { mine, team: look.team, page: pg.id }).key;
          const team = teamDesign(keys, pg.standard, look.team, pg.id);
          const own = look.team.perPerson && !!mine && keys.includes(mine);
          return (
            <section key={pg.id} className="a3-lookg" aria-labelledby={`look-${pg.id}`} data-testid={`look-page-${pg.id}`}>
              <div className="a3-lookh">
                <ShellIcon name={pg.icon} size={18} />
                <h2 id={`look-${pg.id}`}>{t(d, `shell.sec.${pg.section}`)}</h2>
                <span>{keys.length < 2 ? tt('onlyOne') : own ? tt('ownChoice') : tt('followingTeam')}</span>
                {own ? <LookUse scope="me" page={pg.id} design={null} label={tt('useTeam')} failed={failed} className="a3-lnk sm" testId={`look-follow-${pg.id}`} /> : null}
              </div>
              <div className="a3-lookr">
                {pg.designs.map((x) => {
                  const on = x.key === cur;
                  return (
                    <article key={x.key} className={`a3-look${on ? ' on' : ''}`} data-testid="look-card" data-page={pg.id} data-design={x.key}>
                      <x.Thumb />
                      <div className="a3-lookb">
                        <div className="a3-lookt">
                          <span className="a3-dl">{x.key}</span>
                          <b>{wordsIn(view.lang, x.name)}</b>
                          {on ? <span className="a2-pill ok">{tt('inUse')}</span> : null}
                          {team === x.key ? <span className="a2-pill line">{tt('teamDefault')}</span> : null}
                        </div>
                        <p>{wordsIn(view.lang, x.desc)}</p>
                        <div className="a3-lookf">
                          {on ? (
                            <span className="a3-ok">
                              <ShellIcon name="check" size={15} />
                              {tt('using')}
                            </span>
                          ) : look.team.perPerson ? (
                            <LookUse scope="me" page={pg.id} design={x.key} label={tt('use')} failed={failed} className="a3-btn pri sm" testId={`look-use-${pg.id}-${x.key}`} />
                          ) : null}
                          {x.Render ? (
                            <Link className="a3-btn sm gh" href={previewHref(pg, x.key)} data-testid={`look-preview-${pg.id}-${x.key}`}>
                              <ShellIcon name="eye" size={15} />
                              <span>{tt('preview')}</span>
                            </Link>
                          ) : null}
                          {canTeam && team !== x.key ? <LookUse scope="team" page={pg.id} design={x.key} label={tt('makeTeam')} failed={failed} className="a3-lnk sm" testId={`look-team-${pg.id}-${x.key}`} /> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {keys.length < 2 ? <p className="a3-cap c">{tt('moreComing')}</p> : null}
            </section>
          );
        })}

        <section className="a3-lookg" aria-labelledby="look-guide" data-testid="look-guide">
          <div className="a3-lookh">
            <ShellIcon name="help" size={18} />
            <h2 id="look-guide">{tt('guide.title')}</h2>
            <span>{tt('guide.now', { mode: tt(`guide.${guideNow}`) })}</span>
          </div>
          <div className="a3-card a3-gcard">
            <p className="a3-p">{tt('guide.sub')}</p>
            <div className="a3-grow">
              <b>{tt('guide.team')}</b>
              {canTeam ? (
                <GuideChoice scope="team" current={look.guide.desktop} options={teamOptions} aria={tt('guide.team')} failed={failed} testId="look-guide-team" />
              ) : (
                <span className="a2-pill line">{tt(`guide.${look.guide.desktop}`)}</span>
              )}
            </div>
            {look.guide.perPerson ? (
              <div className="a3-grow">
                <b>{tt('guide.mine')}</b>
                <GuideChoice scope="me" current={guideMine} options={mineOptions} aria={tt('guide.mine')} failed={failed} testId="look-guide-me" />
              </div>
            ) : null}
            <p className="a3-cap">
              <ShellIcon name="phone" size={14} />
              {tt('guide.phone')}
            </p>
            <p className="a3-cap">{tt('guide.note')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
