// S21 · PR 417 (§5 REP-07c) — Reports › Site health › Speed at /admin/reports/health/speed: how fast the shop is, against
// the targets of Website › SEO (`seo.vitals.targets`): the latest monthly check (a phone over slow 4G from the server,
// and an admin page on a desktop), real visitors' 75th percentile, and month by month (`health.speed.months`). "Measure
// now" (`settings.write`) asks the server for a check now (lib/admin-health/speed.ts). Seeing needs `health.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { JourneysRun, type JourneysRunTexts } from '@/components/admin/settings/JourneysRun';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { MONTH_METRICS, speedView } from '@/lib/admin-health/speed';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { formatVital, targetOf, type VitalMetric } from '@/lib/seo/vitals';
import type { VitalCell } from '@/lib/seo/vitals-data';
import hbn from '../../../../../../messages/admin-health.bn.json';
import hen from '../../../../../../messages/admin-health.en.json';
import '../../../settings-cards.css';
import '../health.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/health/speed';
const API = '/api/admin/health/speed';
const KEY = 'healthSpeed';
/** Where the targets are changed (Website › SEO, the speed card). */
const TARGETS = '/admin/website/seo#a2s-seovt';
const REAL_METRICS = ['LCP', 'INP', 'CLS', 'TTFB', 'FCP'] as const satisfies readonly VitalMetric[];

function withScreen(view: AdminView): AdminView {
  const extra = (view.lang === 'bn' ? [hbn] : [hen]) as unknown as Dict[];
  return { ...view, dict: Object.assign({}, view.dict, ...extra) };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'spd.metaTitle'), robots: { index: false, follow: false } };
}

export default async function SpeedPage() {
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
  const v = await speedView({ db: access.deps.db, resolver: access.deps.resolver, now: access.deps.now }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `spd.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const fv = (m: VitalMetric, units: number) => formatVital(m, units, view.locale);
  const at = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const monthName = (ym: string) => new Intl.DateTimeFormat(view.locale, { month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ym}-01T00:00:00Z`));
  const tg = v.targets;
  /** A missed target as the page names it (labMisses: LCP, CLS, TTFB, weight, admin). */
  const missName = (k: string) => (k === 'weight' ? s('col.kb') : k === 'admin' ? s('col.load') : s(`m.${k}`));
  const cell = (m: VitalMetric, c: VitalCell, testId?: string) =>
    c.p75 == null ? (
      <span className="a2-mute" data-testid={testId}>
        {s('noMonth')}
      </span>
    ) : (
      <span className={c.ok === false ? 'sp-bad' : undefined} data-ok={c.ok == null ? undefined : String(c.ok)} data-testid={testId}>
        {`${c.over ? '> ' : ''}${fv(m, c.p75)}`}
      </span>
    );
  const kpiCell = (m: 'LCP' | 'INP') => v.real.overall[m].phone;
  const runTexts: JourneysRunTexts = {
    run: s('run'),
    running: s('running'),
    asked: s('asked'),
    waiting: s('waiting'),
    err: Object.fromEntries(['INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  };
  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: t(d, 'hlt.save'),
    saving: t(d, 'hlt.saving'),
    saved: t(d, 'hlt.saved'),
    discard: t(d, 'hlt.discard'),
    unsaved: t(d, 'hlt.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: t(d, 'hlt.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, t(d, `hlt.err.${c}`)])),
  };
  const fields: FieldsCardField[] = [{ kind: 'number', path: 'months', label: s('card.months'), min: 1, max: 36 }];

  return (
    <div className="a2-z" data-testid="speed-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="speed-kpi-lab" data-ok={v.lab ? String(v.lab.ok) : 'none'}>
          <div className="a2-kl">{s('kpi.lab')}</div>
          <div className={`a2-kv a2-kvw sp-kvt${v.lab && !v.lab.ok ? ' sp-bad' : ''}`}>{s(v.lab ? (v.lab.ok ? 'kpi.labOk' : 'kpi.labMiss') : 'kpi.labNone')}</div>
          <div className="a2-kf">
            <span className="a2-kn">{v.lab ? at(v.lab.at) : s('noMonth')}</span>
          </div>
        </div>
        {(['LCP', 'INP'] as const).map((m) => {
          const c = kpiCell(m);
          const target = targetOf(m, tg);
          return (
            <div key={m} className="a2-card a2-kpi" data-testid={`speed-kpi-${m.toLowerCase()}`} data-ok={c.ok == null ? 'none' : String(c.ok)}>
              <div className="a2-kl">{s(`kpi.${m.toLowerCase()}`)}</div>
              <div className={`a2-kv${c.ok === false ? ' sp-bad' : ''}${c.p75 == null ? ' a2-kvw sp-kvt' : ''}`}>{c.p75 == null ? s('kpi.none') : `${c.over ? '> ' : ''}${fv(m, c.p75)}`}</div>
              <div className="a2-kf">
                <span className="a2-kn">
                  {s('kpi.span', { days: num(v.real.days), n: num(c.count) })}
                  {target != null ? ` · ${s('kpi.target', { v: fv(m, target) })}` : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="sp-lab-h">
        <h2 className="a2-h3" id="sp-lab-h">
          {s('labH')}
        </h2>
        <p className="a2-sm a2-mute">{s('labD')}</p>
        {v.lab ? (
          <>
            <p className="a2-sm a2-mt12" data-testid="speed-lab-when">
              {s('labWhen', { when: at(v.lab.at), profile: v.lab.profile ?? '' })}
            </p>
            <div className="a2-tblw a2-mt12">
              <table className="a2-tbl sp-tbl" data-testid="speed-lab" data-ok={String(v.lab.ok)}>
                <thead>
                  <tr>
                    <th>{s('col.page')}</th>
                    <th>{s('col.lcp')}</th>
                    <th>{s('col.cls')}</th>
                    <th>{s('col.ttfb')}</th>
                    <th>{s('col.kb')}</th>
                    <th>{s('col.load')}</th>
                    <th>{s('col.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {v.lab.pages.map((p) => {
                    const miss = (k: string) => (p.misses.includes(k) ? 'sp-bad' : undefined);
                    return (
                      <tr key={`${p.kind}${p.path}`} data-kind={p.kind} data-ok={String(!p.misses.length)}>
                        <td className="a2-tdh">
                          <div>{s(`kind.${p.kind}`)}</div>
                          <div className="a2-sm a2-mute sp-path">{p.path}</div>
                        </td>
                        <td className={miss('LCP')} data-l={s('col.lcp')}>{p.lcpMs != null ? fv('LCP', p.lcpMs) : s('noMonth')}</td>
                        <td className={miss('CLS')} data-l={s('col.cls')}>{p.cls != null ? fv('CLS', Math.round(p.cls * 1000)) : s('noMonth')}</td>
                        <td className={miss('TTFB')} data-l={s('col.ttfb')}>{p.ttfbMs != null ? fv('TTFB', p.ttfbMs) : s('noMonth')}</td>
                        <td className={miss('weight')} data-l={s('col.kb')}>{p.kb != null ? s('kb', { n: num(Math.round(p.kb)) }) : s('noMonth')}</td>
                        <td className={miss('admin')} data-l={s('col.load')}>{p.loadMs != null ? fv('LCP', p.loadMs) : s('noMonth')}</td>
                        <td className="a2-tdw" data-l={s('col.result')}>
                          <span className={`a2-pill ${p.misses.length ? 'bad' : 'ok'}`}>{p.misses.length ? s('misses', { list: p.misses.map(missName).join(', ') }) : s('pass')}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="speed-lab-none">
            {s('labNone')}
          </p>
        )}
        <div className="a2-mt12">{canEdit ? <JourneysRun url={API} texts={runTexts} waiting={v.runAsked} testId="speed-run" /> : <p className="a2-sm a2-mute">{s('noPerm')}</p>}</div>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="sp-real-h">
        <h2 className="a2-h3" id="sp-real-h">
          {s('realH')}
        </h2>
        {v.real.total ? (
          <>
            <p className="a2-sm a2-mute">{s('realD', { days: num(v.real.days), n: num(v.real.total) })}</p>
            <div className="a2-tblw a2-mt12">
              <table className="a2-tbl sp-tbl" data-testid="speed-real">
                <thead>
                  <tr>
                    <th>{s('col.metric')}</th>
                    <th>{s('col.phone')}</th>
                    <th>{s('col.desktop')}</th>
                    <th>{s('col.target')}</th>
                  </tr>
                </thead>
                <tbody>
                  {REAL_METRICS.map((m) => {
                    const target = targetOf(m, tg);
                    return (
                      <tr key={m} data-metric={m}>
                        <td className="a2-tdh">
                          <b>{m}</b> <span className="a2-sm a2-mute">{s(`m.${m}`)}</span>
                        </td>
                        <td data-l={s('col.phone')}>{cell(m, v.real.overall[m].phone)}</td>
                        <td data-l={s('col.desktop')}>{cell(m, v.real.overall[m].desktop)}</td>
                        <td className="a2-sm a2-mute" data-l={s('col.target')}>{target != null ? fv(m, target) : s('noMonth')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="a2-sm a2-mute" data-testid="speed-real-none">
            {s('realNone', { days: num(v.real.days) })}
          </p>
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="sp-months-h">
        <h2 className="a2-h3" id="sp-months-h">
          {s('monthsH')}
        </h2>
        <p className="a2-sm a2-mute">{s('monthsD')}</p>
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl sp-tbl" data-testid="speed-months">
            <thead>
              <tr>
                <th>{s('col.month')}</th>
                {MONTH_METRICS.map((m) => (
                  <th key={m}>{s(`col.${m.toLowerCase()}`)}</th>
                ))}
                <th>{s('col.lab')}</th>
              </tr>
            </thead>
            <tbody>
              {v.months.map((r) => (
                <tr key={r.month} data-month={r.month}>
                  <td className="a2-tdh">
                    <div>{monthName(r.month)}</div>
                    {r.readings ? <div className="a2-sm a2-mute">{s('visits', { n: num(r.readings) })}</div> : null}
                  </td>
                  {MONTH_METRICS.map((m) => (
                    <td key={m} data-l={s(`col.${m.toLowerCase()}`)}>
                      {cell(m, r.real[m], `speed-month-${r.month}-${m}`)}
                    </td>
                  ))}
                  <td className="a2-tdw" data-l={s('col.lab')}>
                    {r.lab ? (
                      <>
                        <span className={`a2-pill ${r.lab.ok ? 'ok' : 'bad'}`} data-testid={`speed-month-${r.month}-lab`}>
                          {s(r.lab.ok ? 'labMonthOk' : 'labMonthMiss')}
                        </span>
                        {r.lab.categoryKb != null ? <div className={`a2-sm${r.lab.categoryKb > tg.categoryKb ? ' sp-bad' : ' a2-mute'}`}>{s('kb', { n: num(r.lab.categoryKb) })}</div> : null}
                      </>
                    ) : (
                      <span className="a2-sm a2-mute">{s('labMonthNone')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="sp-targets-h" data-testid="speed-targets">
        <h2 className="a2-h3" id="sp-targets-h">
          {s('targetsH')}
        </h2>
        <p className="a2-sm">
          {s('targetsD', {
            lcp: fv('LCP', tg.lcpMs),
            cls: fv('CLS', tg.clsThousandths),
            inp: fv('INP', tg.inpMs),
            ttfb: fv('TTFB', tg.ttfbMs),
            kb: s('kb', { n: num(tg.categoryKb) }),
            admin: fv('LCP', tg.adminMs),
          })}
        </p>
        <p className="a2-mt12">
          <Link className="a2-btn" href={TARGETS} data-testid="speed-targets-link">
            {s('targetsLink')}
          </Link>
        </p>
      </section>

      <FieldsCard url={API} screen={{ key: v.cards.speed.key, value: v.cards.speed.value, version: v.cards.speed.version }} fields={fields} texts={texts} canEdit={canEdit} testId="speed-months-card" />
    </div>
  );
}
