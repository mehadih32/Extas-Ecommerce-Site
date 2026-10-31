// S06 · PR 543 — Reports › Decisions & learning at /admin/reports/learning (register PR 543, the decision learning loop:
// "every approve and decline by the owner and by each employee, with its reason, is taken as training … it learns which
// employee rejects what and why. Switchable off"). For the last `risk.learning.days` days (90 as shipped): the four
// figures, what the decisions suggest, the table per rule (each review or proposal once, by its last decision, and how
// the orders let go ended) and per person (every decision, their latest notes). Off as shipped: the page says so and the
// card turns it on. Seeing needs `risk.report`; the card `settings.write`. The page only reads and only suggests.
// Words: messages/admin-learning.*.json (`lrn.*`); model: lib/admin-reports/learning-view.ts.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { formatNumber } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { learningCard } from '@/lib/admin-reports/learning-api';
import { learnRuleLabel, learningScreen } from '@/lib/admin-reports/learning-view';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-learning.bn.json';
import en from '../../../../../messages/admin-learning.en.json';
import '../../settings-cards.css';
import '../fraud/fraud.css';
import './learning.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/learning';
const API = '/api/admin/risk/learning';
const KEY = 'reportsLearning';
const RULES = '/admin/orders/risk-rules';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'lrn.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function LearningReportPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('risk.report', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="risk.report" />
      </div>
    );
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const [report, card] = await Promise.all([od.learningReport(readDeps(access.deps), who), learningCard(access.deps, MOTHER_STORE_ID)]);
  const pct = new Intl.NumberFormat(view.locale, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' });
  const at = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const day = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' });
  const w = (k: string, vars?: Record<string, string | number>) => t(d, `lrn.${k}`, vars);
  const screen = learningScreen(report, {
    w,
    num: (n) => formatNumber(n, view.locale),
    pct: (x) => pct.format(x),
    when: (iso) => at.format(new Date(iso)),
    rule: (key) => learnRuleLabel(d, key),
  });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;

  const texts: FieldsCardTexts = {
    h: w('card.h'),
    d: w('card.d'),
    save: w('save'),
    saving: w('saving'),
    saved: w('saved'),
    discard: w('discard'),
    unsaved: w('unsaved'),
    readOnly: w('readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, w(`err.${c}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: w('card.enabled') },
    { kind: 'number', path: 'days', label: w('card.days'), help: w('card.daysHelp'), min: 7, max: 366 },
    { kind: 'number', path: 'minDecisions', label: w('card.minDecisions'), help: w('card.minDecisionsHelp'), min: 3, max: 1000 },
    { kind: 'number', path: 'suggestPercent', label: w('card.suggestPercent'), help: w('card.suggestPercentHelp'), min: 50, max: 100 },
    { kind: 'number', path: 'maxRows', label: w('card.maxRows'), help: w('card.maxRowsHelp'), min: 100, max: 20_000 },
  ];

  return (
    <div className="a2-z" data-testid="learning-page">
      <PageHead view={view} place={locateKey(KEY)} title={w('title')} sub={w('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="a2-cs fr-showing" data-testid="learning-showing">
        {w('showing', { from: day.format(new Date(report.from)), to: day.format(new Date(report.to)), days: formatNumber(report.days, view.locale) })}
      </p>
      {screen.notes.map((n) => (
        <div key={n} className="a2-note warn" role="note" data-testid="learning-note">
          <ShellIcon name="alert" size={15} />
          <span>{n}</span>
        </div>
      ))}

      <div className="a2-kpis a2-mt12" data-testid="learning-kpis">
        {screen.kpis.map((k) => (
          <div key={k.id} className="a2-card a2-kpi" data-kpi={k.id}>
            <div className="a2-kl">{k.label}</div>
            <div className="a2-kv">{k.value}</div>
            <div className="a2-kf">
              <span className="a2-kn">{k.foot}</span>
            </div>
          </div>
        ))}
      </div>

      <section className="a2-card" aria-labelledby="lrn-sug-h" data-testid="learning-suggestions">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="lrn-sug-h">
              {w('sug.h')}
            </h2>
            <div className="a2-cs">{screen.suggestNote}</div>
          </div>
        </div>
        {screen.suggestions.length ? (
          <ul className="lrn-sug">
            {screen.suggestions.map((s) => (
              <li key={s.key} className={s.tone === 'warn' ? 'a2-note warn' : 'a2-note'} data-rule={s.key}>
                <ShellIcon name={s.tone === 'warn' ? 'alert' : 'check'} size={15} />
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="a2-sm a2-mute">{w('sug.none')}</div>
        )}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="lrn-rules-h" data-testid="learning-rules">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="lrn-rules-h">
              {w('rules.h')}
            </h2>
            <div className="a2-cs">{w('rules.d')}</div>
          </div>
        </div>
        {screen.rules.length ? (
          <div className="fr-tw">
            <table className="a2-tbl fr-tbl">
              <thead>
                <tr>
                  {screen.ruleCols.map((c, i) => (
                    <th key={c} scope="col" className={i ? 'fr-n' : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {screen.rules.map((r) => (
                  <tr key={r.key} data-rule={r.key}>
                    <th scope="row">{r.label}</th>
                    {r.cells.map((c, i) => (
                      <td key={i} className="fr-n a2-num" data-l={screen.ruleCols[i + 1]}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="a2-sm a2-mute">{w('empty')}</div>
        )}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="lrn-people-h" data-testid="learning-people">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="lrn-people-h">
              {w('people.h')}
            </h2>
            <div className="a2-cs">{w('people.d')}</div>
          </div>
        </div>
        {screen.people.length ? (
          <div className="fr-tw">
            <table className="a2-tbl fr-tbl lrn-people">
              <thead>
                <tr>
                  {screen.peopleCols.map((c, i) => (
                    <th key={c} scope="col" className={i && i < 6 ? 'fr-n' : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {screen.people.map((p) => (
                  <tr key={p.key}>
                    <th scope="row">{p.name}</th>
                    {p.cells.map((c, i) => (
                      <td key={i} className="fr-n a2-num" data-l={screen.peopleCols[i + 1]}>
                        {c}
                      </td>
                    ))}
                    <td data-l={screen.peopleCols[6]}>{p.mostly}</td>
                    <td data-l={screen.peopleCols[7]}>
                      {p.notes.length
                        ? p.notes.map((n, i) => (
                            <div key={i} className="lrn-note">
                              <div>{n.text}</div>
                              <div className="a2-xs a2-mute">{n.sub}</div>
                            </div>
                          ))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="a2-sm a2-mute">{w('empty')}</div>
        )}
      </section>

      <div className="a2-note a2-mt12" role="note">
        <ShellIcon name="info" size={15} />
        <span>
          {w('note')}{' '}
          <Link href={RULES} className="lrn-link">
            {w('rulesLink')}
          </Link>
        </span>
      </div>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="learning-settings" />
      </div>
    </div>
  );
}
