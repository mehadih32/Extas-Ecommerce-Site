// S02 · PR 599 (register "In-dashboard help and the handover user manual": "a truly new function is requested through
// the PR register ('request a feature') and built by the agent team, never by editing code by hand") — Help & Build ›
// Feature requests at /admin/build/requests, in the Lumen look (data-lm-ready, --lm-* tokens, the one toast): first what
// can already be done without code (switches, Smart Rules and automations, integrations, the manual), then "Ask for a
// new feature" and every request by where it stands (open: new or in the register; done: built, already possible or
// not built; all), each with its status, PR number and the build team's note. Asking and setting a status need
// `build.report`; seeing needs `build.read`. Nothing is deleted. lib/feature-requests.ts; components/admin/build/
// RequestsBoard.tsx. Guide: docs/admin-guide/pages/help/build-requests.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AskFeature, RequestStatusForm } from '@/components/admin/build/RequestsBoard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN, ADMIN_PAGES } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey, SHELL_SECTIONS } from '@/lib/admin-shell/sections';
import { listRequests, REQUEST_PAGE, REQUEST_VIEWS } from '@/lib/feature-requests';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-requests.bn.json';
import en from '../../../../../messages/admin-requests.en.json';
import './requests.css';

export const dynamic = 'force-dynamic';

const KEY = 'buildRequests';
const HERE = '/admin/build/requests';
const PILL: Record<string, string> = { NEW: 'st-new', REGISTERED: 'st-reg', BUILT: 'st-built', POSSIBLE: 'st-possible', DECLINED: 'st-declined' };

type Search = Promise<Record<string, string | string[] | undefined>>;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'fr.metaTitle'), robots: { index: false, follow: false } };
}

export default async function FeatureRequestsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [sp, plain, access] = await Promise.all([searchParams, adminView(deps), pageAccess('build.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="build.read" />
      </div>
    );
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `fr.${k}`, vars);
  const [v, mayAsk] = await Promise.all([
    listRequests(access.deps.db, MOTHER_STORE_ID, { view: typeof sp.view === 'string' ? sp.view : undefined }),
    can(access.deps.db, access.guard.actor, 'build.report', { storeId: MOTHER_STORE_ID }),
  ]);
  const at = (x: Date | string | null) => (x ? dateTime(new Date(x).toISOString(), view.locale, view.timeZone) : '');
  const secName = (id: string) => t(d, `shell.sec.${id}`);
  const sections = SHELL_SECTIONS.map((s) => ({ id: s.id, name: secName(s.id) }));
  const w = ((d.fr as Dict) ?? {}) as never;
  const href = (key: string) => locateKey(key)?.page?.href ?? ADMIN_PAGES.find((p) => p.key === key)?.href ?? null;
  const ways = [
    { k: 'switches', href: href('manual') },
    { k: 'rules', href: href('rules') },
    { k: 'keys', href: href('integrations') },
    { k: 'words', href: href('websiteWords') },
  ];
  const someone = g('row.someone');

  return (
    <div className="a2-z frx-page" data-testid="fr-page" data-view={v.view} data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />

      <section className="lm-card frx-card" aria-labelledby="fr-ways-h" data-testid="fr-ways">
        <h2 id="fr-ways-h">{g('ways.title')}</h2>
        <p className="lm-sub">{g('ways.sub')}</p>
        <ul className="frx-ways">
          {ways.map((x) => (
            <li key={x.k}>
              <b>{g(`ways.${x.k}.title`)}</b>
              <span className="lm-hint">{g(`ways.${x.k}.text`)}</span>
              {x.href ? (
                <Link className="frx-go" href={x.href}>
                  {g(`ways.${x.k}.go`)}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {mayAsk ? (
        <section className="lm-card frx-card" aria-labelledby="fr-ask-h">
          <h2 id="fr-ask-h">{g('ask.heading')}</h2>
          <p className="lm-sub">{g('ask.sub')}</p>
          <AskFeature sections={sections} page={typeof sp.from === 'string' && sp.from.startsWith('/admin') ? sp.from.slice(0, 300) : undefined} w={w} />
        </section>
      ) : (
        <p className="lm-sub">{g('readOnly')}</p>
      )}

      <nav className="frx-views" aria-label={g('views')} data-testid="fr-views">
        {REQUEST_VIEWS.map((x) => (
          <Link key={x} className={x === v.view ? 'on' : undefined} href={x === 'open' ? HERE : `${HERE}?view=${x}`} aria-current={x === v.view ? 'page' : undefined} scroll={false} data-view={x}>
            {g(`view.${x}`)}
            {v.counts[x] ? ` · ${v.counts[x]}` : ''}
          </Link>
        ))}
      </nav>

      <section className="lm-card frx-card" aria-labelledby="fr-list-h" data-testid="fr-list" data-n={v.rows.length}>
        <h2 id="fr-list-h">{g(`view.${v.view}`)}</h2>
        {v.rows.length ? (
          <ul className="frx-rows">
            {v.rows.map((r) => (
              <li key={r.id} className="frx-row" data-testid="fr-row" data-number={r.number} data-status={r.status}>
                <div className="frx-head">
                  <b>
                    {g('row.n', { n: r.number })} · {r.title}
                  </b>
                  <span className={`frx-tag ${PILL[r.status] ?? ''}`}>{g(`status.${r.status}`)}</span>
                </div>
                <p className="frx-need">{r.need}</p>
                <span className="lm-hint">
                  {g('row.by', { who: r.askedBy ?? someone, at: at(r.createdAt) })} · {g(`when.${r.when}`)}
                  {r.section ? ` · ${secName(r.section)}` : ''}
                </span>
                {r.prNumber ? (
                  <Link className="frx-go" href={`/admin/build/pr/${r.prNumber}`}>
                    {g('row.pr', { n: r.prNumber })}
                  </Link>
                ) : null}
                {r.statusAt && r.status !== 'NEW' ? (
                  <span className="lm-hint">
                    {g('row.status', { who: r.statusBy ?? someone, at: at(r.statusAt) })}
                    {r.statusNote ? ` · ${r.statusNote}` : ''}
                  </span>
                ) : null}
                {mayAsk ? <RequestStatusForm id={r.id} status={r.status} pr={r.prNumber} w={w} testId={`fr-st-${r.number}`} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="lm-hint" data-testid="fr-none">
            {g(`none.${v.view}`)}
          </p>
        )}
        {v.rows.length >= REQUEST_PAGE ? <p className="lm-hint">{g('more', { n: v.rows.length })}</p> : null}
      </section>
    </div>
  );
}
