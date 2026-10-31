// S06 · PR 540 — Orders › Today's digest at /admin/orders/digest (register PR 540, the approval digest and the permission
// gate: "the AI reports and then waits — 50 orders today; 30 confirmed and moved on; 5 held for a call, for this reason;
// 10 have another order running, 8 of those are duplicates. Nothing is acted on until the owner says so"). For one shop
// day (`?day=YYYY-MM-DD`, today without it): the engine's report in one sentence, the figures, held and cancelled by
// reason, and what waits for a person's OK (proposed holds, reviews, one-parcel proposals, blocklist proposals), each
// row opening its order, where the decision is made. The gate's own card (`risk.approval`: the gate, the list size) sits
// at the bottom. Seeing needs `orders.read`; the card `risk.rules.write`. The page only reads.
// Words: messages/admin-digest.*.json (`dg.*`); model: lib/admin-orders/digest-view.ts.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { daysPeriod, ymdIn } from '@extas/metrics';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { formatNumber } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { approvalCard } from '@/lib/admin-orders/digest-api';
import { digestScreen } from '@/lib/admin-orders/digest-view';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-digest.bn.json';
import en from '../../../../../messages/admin-digest.en.json';
import '../../settings-cards.css';
import '../../reports/fraud/fraud.css';
import './digest.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/digest';
const API = '/api/admin/risk/digest';
const KEY = 'ordersDigest';
const RULES = '/admin/orders/risk-rules';
const YMD = /^\d{4}-\d{2}-\d{2}$/;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'dg.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function OrdersDigestPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('orders.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="orders.read" />
      </div>
    );
  const at = { storeId: MOTHER_STORE_ID };
  const tz = view.timeZone;
  const now = access.deps.now?.() ?? new Date();
  const today = ymdIn(now, tz);
  // the shop day asked for; a day after today (or no day) is today
  const asked = one(sp.day);
  const dayYmd = asked && YMD.test(asked) && asked <= today ? asked : today;
  const period = daysPeriod(dayYmd, dayYmd, tz);
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const [digest, card, holdReasons, cancelReasons] = await Promise.all([
    od.approvalDigest(readDeps(access.deps), who, period),
    approvalCard(access.deps, MOTHER_STORE_ID),
    access.deps.resolver.value('orders.hold.reasons', at),
    access.deps.resolver.value('orders.cancel.reasons', at),
  ]);
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const pct = new Intl.NumberFormat(view.locale, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' });
  const atFmt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz, numberingSystem: 'latn' });
  const dayFmt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' });
  const dayWords = dayFmt.format(new Date(`${dayYmd}T00:00:00Z`));
  const w = (k: string, vars?: Record<string, string | number>) => t(d, `dg.${k}`, vars);
  const screen = digestScreen(digest, {
    w,
    num: (n) => formatNumber(n, view.locale),
    pct: (x) => pct.format(x),
    when: (iso) => atFmt.format(new Date(iso)),
    day: dayWords,
    holdReason: (key) => holdReasons.find((r) => r.key === key)?.[lang] ?? key,
    cancelReason: (code) => cancelReasons.find((r) => r.code === code)?.[lang] ?? code,
  });
  const canEdit = access.guard.permissions?.has('risk.rules.write') ?? false;

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
    { kind: 'switch', path: 'gate', label: w('card.gate') },
    { kind: 'number', path: 'maxRows', label: w('card.maxRows'), help: w('card.maxRowsHelp'), min: 10, max: 500 },
  ];
  const counts = (id: 'held' | 'cancelled', rows: { name: string; count: string }[]) => (
    <section className="a2-card" aria-labelledby={`dg-${id}-h`} data-testid={`digest-${id}`}>
      <div className="a2-ch">
        <h2 className="a2-h3" id={`dg-${id}-h`}>
          {w(`${id}.h`)}
        </h2>
      </div>
      {rows.length ? (
        <div className="fr-tw">
          <table className="a2-tbl fr-tbl">
            <thead>
              <tr>
                <th scope="col">{w('col.reason')}</th>
                <th scope="col" className="fr-n">
                  {w('col.orders')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td className="fr-n a2-num" data-l={w('col.orders')}>
                    {r.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-sm a2-mute">{w('none')}</div>
      )}
    </section>
  );

  return (
    <div className="a2-z" data-testid="digest-page">
      <PageHead view={view} place={locateKey(KEY)} title={w('title')} sub={w('sub')} />
      <SectionTabs view={view} current={KEY} />

      <form className="a2-fbar fr-period" action={HERE} method="get" data-testid="digest-day">
        <label className="fr-day">
          <span>{w('day.label')}</span>
          <input className="a2-inp" type="date" name="day" defaultValue={dayYmd} max={today} required />
        </label>
        <button type="submit" className="a2-btn pri">
          {w('day.go')}
        </button>
      </form>
      <p className="a2-cs fr-showing" data-testid="digest-showing">
        {w('day.showing', { day: dayWords })}
      </p>

      <div className="a2-note dg-head" role="note" data-testid="digest-headline">
        <ShellIcon name="info" size={15} />
        <span>
          <strong>{w('head.h')}: </strong>
          {screen.headline}
        </span>
      </div>

      <div className="a2-kpis a2-mt12" data-testid="digest-kpis">
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

      <div className="dg-two">
        {counts('held', screen.held)}
        {counts('cancelled', screen.cancelled)}
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="dg-wait-h" data-testid="digest-waiting">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="dg-wait-h">
              {w('wait.h')}
            </h2>
            <div className="a2-cs">{w('wait.d')}</div>
          </div>
        </div>
        <div className="a2-note" role="note" data-testid="digest-gate" data-gate={digest.gate ? 'on' : 'off'}>
          <ShellIcon name="shield" size={15} />
          <span>{screen.gateNote}</span>
        </div>
        {screen.waits.map((l) => (
          <div key={l.id} className="dg-list" data-testid={`digest-${l.id}`}>
            <h3 className="dg-lh">
              {l.title} <span className="a2-pill">{l.count}</span>
            </h3>
            <div className="a2-cs">{l.desc}</div>
            {l.rows.length ? (
              <div className="fr-tw">
                <table className="a2-tbl fr-tbl dg-tbl">
                  <thead>
                    <tr>
                      {l.cols.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {l.rows.map((r) => (
                      <tr key={r.key}>
                        <th scope="row">
                          <Link href={r.href} className="dg-order">
                            {r.number}
                          </Link>
                        </th>
                        {r.cells.map((c, i) => (
                          <td key={i} data-l={l.cols[i + 1]}>
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
            {l.more ? <div className="a2-sm a2-mute">{l.more}</div> : null}
          </div>
        ))}
        <div className="a2-note a2-mt12" role="note" data-testid="digest-blocks">
          <ShellIcon name="flag" size={15} />
          <span>
            {screen.blocks}{' '}
            <Link href={RULES} className="dg-link">
              {w('blocks.link')}
            </Link>
          </span>
        </div>
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="digest-settings" />
      </div>
    </div>
  );
}
