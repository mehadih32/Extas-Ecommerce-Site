// S21 · PR 413 (REP-07) — Reports › Site health at /admin/reports/health: one status line each for customer problems,
// the server, speed, the site audit and the smoke test (lib/admin-health), each linking to its own page once built
// (the Server page now; Customer problems with PR 423). Seeing needs `health.read`; the limits card `settings.write`.
// No customer's name, phone or address is on this page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import type { HubLine } from '@/lib/admin-health/hub';
import { hubView } from '@/lib/admin-health/service';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-health.bn.json';
import en from '../../../../../messages/admin-health.en.json';
import '../../settings-cards.css';
import './health.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/health';
const API = '/api/admin/health';
const KEY = 'health';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'hlt.metaTitle'), robots: { index: false, follow: false } };
}

const PILL = { ok: 'ok', warn: 'warn', bad: 'bad', off: 'line' } as const;

export default async function HealthHubPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('health.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="health.read" />
      </div>
    );
  const v = await hubView({ db: access.deps.db, resolver: access.deps.resolver, now: access.deps.now }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `hlt.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone }).format(new Date(iso));
  const words = (vars: Record<string, string | number>) => Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, typeof x === 'number' ? num(x) : x]));
  const count = (st: HubLine['state']) => num(v.lines.filter((l) => l.state === st).length);

  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'number', path: 'monitorStaleMinutes', label: s('card.monitorStaleMinutes'), help: s('card.monitorStaleMinutesHelp'), min: 2, max: 120 },
    { kind: 'number', path: 'siteSlowMs', label: s('card.siteSlowMs'), help: s('card.siteSlowMsHelp'), min: 200, max: 20_000 },
    { kind: 'number', path: 'smokeStaleHours', label: s('card.smokeStaleHours'), help: s('card.smokeStaleHoursHelp'), min: 1, max: 168 },
  ];

  return (
    <div className="a2-z" data-testid="health-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="health-overall" data-state={v.overall}>
          <div className="a2-kl">{s('title')}</div>
          <div className="a2-kv a2-sm a2-kvw">{s(`overall.${v.overall}`)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s('overallFoot', { bad: count('bad'), warn: count('warn'), ok: count('ok') })}</span>
          </div>
        </div>
      </div>

      {!v.serverConnected ? (
        <div className="a2-note a2-mt12" role="note" data-testid="health-no-server">
          <span>{s('noServer')}</span>
        </div>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="health-lines-h">
        <h2 className="a2-h3 hl-sr" id="health-lines-h">
          {s('title')}
        </h2>
        <ul className="hl-lines" data-testid="health-lines">
          {v.lines.map((l) => (
            <li key={l.id} className="hl-line" data-line={l.id} data-state={l.state}>
              <span className={`a2-pill ${PILL[l.state]}`}>
                <i />
                {s(`state.${l.state}`)}
              </span>
              <div className="hl-body">
                <div className="hl-name">{s(`name.${l.id}`)}</div>
                <div className="hl-text">{s(`line.${l.id}.${l.reason}`, words(l.vars))}</div>
                {l.note ? <div className="hl-meta">{s(`note.${l.note.key}`, words(l.note.vars))}</div> : null}
                {l.at ? <div className="hl-meta">{s('at', { at: when(l.at) })}</div> : null}
              </div>
              {l.href ? (
                <Link className="a2-btn hl-open" href={l.href}>
                  {s('open')}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <FieldsCard url={API} screen={{ key: v.cards.hub.key, value: v.cards.hub.value, version: v.cards.hub.version }} fields={fields} texts={texts} canEdit={canEdit} testId="health-limits" />
    </div>
  );
}
