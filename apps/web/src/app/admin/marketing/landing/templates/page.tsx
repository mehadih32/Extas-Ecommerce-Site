// S13 · PR 255 (Blueprint MKT-05, demo 84-admin-landing.js "Choose a template") — Marketing › Landing pages › Templates
// at /admin/marketing/landing/templates: the four ready-made templates (which parts each switches on), the owner's own
// templates saved from the builder (archive / restore, nothing deleted; the archived ones under a fold), how many pages
// each started, "Use" (a new page from it) and the parts library: what each of the eight parts shows and where its
// content comes from. Seeing needs `marketing.landing.read`; Use, Archive and Restore need `marketing.landing.write`.
// Guide: docs/admin-guide/pages/marketing/landing-templates.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { LandingTemplateActions } from '@/components/admin/marketing/LandingTemplateActions';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { LANDING_SECTIONS, type LandingSection } from '@/lib/marketing/landing-model';
import { templateList } from '@/lib/marketing/landing-templates';
import bn from '../../../../../../messages/admin-landing.bn.json';
import en from '../../../../../../messages/admin-landing.en.json';
import '../../../settings-cards.css';
import '../landing.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/marketing/landing';
const HERE = `${LIST}/templates`;
const KEY = 'marketingLandingTemplates';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'lp.t.metaTitle'), robots: { index: false, follow: false } };
}

export default async function LandingTemplatesPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.landing.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.landing.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `lp.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const canWrite = access.guard.permissions?.has('marketing.landing.write') ?? false;
  const l = await templateList(access.deps.db);
  const live = l.own.filter((x) => !x.archived);
  const archived = l.own.filter((x) => x.archived);
  const words = { lp: (d as Record<string, Dict>).lp ?? {} } as Dict;
  const crumb = (
    <Link className="bd-crumb" href={LIST} data-testid="lpt-back">
      {s('b.back')}
    </Link>
  );
  const parts = (secs: LandingSection[]) => (
    <ol className="lp-chips" aria-label={s('t.partsLabel')}>
      {secs
        .filter((x) => x.on)
        .map((x) => (
          <li key={x.key} className="a2-pill">
            {s(`b.part.${x.key}`)}
          </li>
        ))}
    </ol>
  );
  const openWith = (key: string) =>
    canWrite ? (
      <Link className="a2-btn" href={`${LIST}/new?t=${encodeURIComponent(key)}`} data-testid={`lpt-use-${key}`}>
        {s('t.use')}
      </Link>
    ) : null;
  const own = (x: (typeof l.own)[number]) => (
    <div key={x.id} className="a2-card lp-tile" data-testid="lpt-own">
      <b>{x.name}</b>
      <span className="a2-xs a2-mute">{s('t.uses', { n: num(x.uses) })}</span>
      {parts(x.sections)}
      <div className="lp-acts">
        {x.archived ? null : openWith(x.key)}
        {canWrite ? <LandingTemplateActions words={words} id={x.id} version={x.version} archived={x.archived} /> : null}
      </div>
    </div>
  );

  return (
    <div className="a2-z" data-testid="landing-templates">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={s('t.title')} sub={s('t.sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="a2-card a2-sc a2-mt12" aria-labelledby="lpt-ready">
        <h2 className="a2-h3" id="lpt-ready">
          {s('t.ready')}
        </h2>
        <p className="a2-cs">{s('t.readySub')}</p>
        <div className="lp-tiles a2-mt12">
          {l.builtIn.map((x) => (
            <div key={x.key} className="a2-card lp-tile" data-testid="lpt-ready">
              <b>{s(`tpl.${x.key}.name`)}</b>
              <span className="a2-xs a2-mute">{s(`tpl.${x.key}.note`)}</span>
              <span className="a2-xs a2-mute">{s('t.uses', { n: num(x.uses) })}</span>
              {parts(x.sections)}
              <div className="lp-acts">{openWith(x.key)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="a2-card a2-sc a2-mt12" aria-labelledby="lpt-own">
        <h2 className="a2-h3" id="lpt-own">
          {s('t.yours')}
        </h2>
        <p className="a2-cs">{s('t.yoursSub')}</p>
        {live.length ? <div className="lp-tiles a2-mt12">{live.map(own)}</div> : <p className="a2-sm a2-mute a2-mt12" data-testid="lpt-none">{s('t.none')}</p>}
        {archived.length ? (
          <details className="a2-more-opts lp-more a2-mt12" data-testid="lpt-archived">
            <summary>{s('t.archived', { n: num(archived.length) })}</summary>
            <div className="lp-tiles a2-mt12">{archived.map(own)}</div>
          </details>
        ) : null}
      </section>

      <section className="a2-card a2-sc a2-mt12" aria-labelledby="lpt-lib" data-testid="lpt-library">
        <h2 className="a2-h3" id="lpt-lib">
          {s('t.library')}
        </h2>
        <p className="a2-cs">{s('t.librarySub')}</p>
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{s('t.col.part')}</th>
                <th>{s('t.col.shows')}</th>
                <th>{s('t.col.from')}</th>
              </tr>
            </thead>
            <tbody>
              {LANDING_SECTIONS.map((k, i) => (
                <tr key={k}>
                  <td>
                    <span className="lp-pn">{i + 1}</span> <b className="a2-sm">{s(`b.part.${k}`)}</b>
                  </td>
                  <td className="a2-sm">{s(`lib.${k}.shows`)}</td>
                  <td className="a2-sm a2-mute">{s(`lib.${k}.from`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
