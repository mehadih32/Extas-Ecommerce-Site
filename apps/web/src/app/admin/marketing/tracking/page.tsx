// S13 · PR 257 (Blueprint C6.2) — Marketing › Tracking at /admin/marketing/tracking: server-side event tracking. Each
// platform's connection (a practice copy until its key is in, Keys & connections), what was recorded and sent per
// event and platform for the last 7 or 30 days, the waiting ones with "Send waiting now", "Send test event", the newest
// events and the settings card (`ads.tracking`, off as it ships). Seeing needs `ads.tracking.read`; changing and
// sending need `ads.tracking.manage`. Guide: docs/admin-guide/pages/marketing/tracking.md.
// PR 257 follow-up (go-live gate customer 360°): the "Where an order came from" card (`ads.attribution`, on as it ships).
// PR 258: the order's own steps (confirmed, delivered) in the counts, the table and the test event, and the
// delivered-sales card (`ads.deliveredPurchase`, off as it ships): what a purchase means to the platforms.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ATTRIBUTION_TOUCHES, ORDER_TRACKING_SOURCES, PURCHASE_MEANS, tickedPlatforms } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { TrackingActions, type TrackingActionTexts } from '@/components/admin/settings/TrackingActions';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { TRACKING_DAYS, trackingOverview } from '@/lib/tracking/admin';
import { ALL_TRACKING_EVENTS, ORDER_TRACKING_EVENTS, TRACKING_EVENTS, TRACKING_PLATFORMS, type DeliveryState } from '@/lib/tracking/model';
import bn from '../../../../../messages/admin-tracking.bn.json';
import en from '../../../../../messages/admin-tracking.en.json';
import '../../settings-cards.css';
import './tracking.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/tracking';
const API = '/api/admin/marketing/tracking';
const KEYS_PAGE = '/admin/integrations';
const KEY = 'adsTracking';
const STATES: readonly DeliveryState[] = ['sent', 'mock', 'failed', 'waiting'];

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'trk.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ days?: string }> };

export default async function TrackingPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('ads.tracking.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="ads.tracking.read" />
      </div>
    );
  const asked = Number(sp.days);
  const days = (TRACKING_DAYS as readonly number[]).includes(asked) ? asked : TRACKING_DAYS[0];
  const [o, currency] = await Promise.all([trackingOverview({ db: access.deps.db, resolver: access.deps.resolver }, days), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const canManage = access.guard.permissions?.has('ads.tracking.manage') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `trk.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone }).format(new Date(iso));
  const money = (minor: number | null, cur: string | null) => (minor == null ? s('cellNone') : formatMoney(minor, moneyOf(cur ?? currency, view.locale)));
  const v = o.card.value;
  const dp = o.delivered.value;
  const errs = Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)]));
  const platformNames = Object.fromEntries(TRACKING_PLATFORMS.map((p) => [p, s(`platform.${p}`)]));
  const actTexts = (label: string): TrackingActionTexts => ({ label, working: s('working'), outcome: s('outcome'), outcomeErr: s('outcomeErr'), outcomeNone: s('outcomeNone'), steps: s('stepsRead'), platforms: platformNames, err: errs });

  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: s('card.save'),
    saving: s('card.saving'),
    saved: s('card.saved'),
    discard: s('card.discard'),
    unsaved: s('card.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: s('card.pairHelp'),
    err: errs,
  };
  const fields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: s('card.on'), help: s('card.onHelp') },
    { kind: 'checks', path: 'events', label: s('card.events'), options: TRACKING_EVENTS.map((e) => ({ value: e, label: s(`event.${e}`) })) },
    { kind: 'checks', path: 'platforms', label: s('card.platforms'), options: TRACKING_PLATFORMS.map((p) => ({ value: p, label: s(`platform.${p}`) })) },
    { kind: 'switch', path: 'matchCustomers', label: s('card.match'), help: s('card.matchHelp') },
    { kind: 'number', path: 'maxAttempts', label: s('card.attempts'), help: s('card.attemptsHelp'), min: 1, max: 20 },
  ];
  // PR 257 follow-up: where an order came from (the campaign tags and ad click ids of the visit)
  const attrTexts: FieldsCardTexts = { ...texts, h: s('attr.h'), d: s('attr.d') };
  const attrFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: s('attr.on'), help: s('attr.onHelp') },
    { kind: 'number', path: 'keepDays', label: s('attr.days'), help: s('attr.daysHelp'), min: 1, max: 90 },
    { kind: 'select', path: 'touch', label: s('attr.touch'), help: s('attr.touchHelp'), options: ATTRIBUTION_TOUCHES.map((x) => ({ value: x, label: s(`attr.touch_${x}`) })) },
  ];
  // PR 258: the delivered-sales card
  const dpTexts: FieldsCardTexts = { ...texts, h: s('dp.h'), d: s('dp.d') };
  const dpFields: FieldsCardField[] = [
    { kind: 'switch', path: 'on', label: s('dp.on'), help: s('dp.onHelp') },
    { kind: 'checks', path: 'events', label: s('dp.events'), options: ORDER_TRACKING_EVENTS.map((e) => ({ value: e, label: s(`event.${e}`) })) },
    { kind: 'select', path: 'purchaseMeans', label: s('dp.means'), help: s('dp.meansHelp'), options: PURCHASE_MEANS.map((m) => ({ value: m, label: s(`dp.mean.${m}`) })) },
    { kind: 'checks', path: 'sources', label: s('dp.sources'), options: ORDER_TRACKING_SOURCES.map((k) => ({ value: k, label: s(`dp.source.${k}`) })) },
    { kind: 'number', path: 'lookbackHours', label: s('dp.lookback'), help: s('dp.lookbackHelp'), min: 1, max: 168 },
    { kind: 'number', path: 'everyMinutes', label: s('dp.every'), help: s('dp.everyHelp'), min: 1, max: 60 },
  ];

  return (
    <div className="a2-z" data-testid="tracking-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      {!v.on ? (
        <div className="a2-note" role="note" data-testid="tracking-off">
          <span>{s('off')}</span>
        </div>
      ) : !tickedPlatforms(v).length ? (
        <div className="a2-note" role="note">
          <span>{s('noPlatform')}</span>
        </div>
      ) : null}
      {dp.on && !v.on ? (
        <div className="a2-note" role="note" data-testid="tracking-dp-off">
          <span>{s('dpTrackingOff')}</span>
        </div>
      ) : null}
      {dp.on && dp.purchaseMeans === 'delivered' ? (
        <div className="a2-note" role="note" data-testid="tracking-dp-means">
          <span>{s('dpMeansDelivered')}</span>
        </div>
      ) : null}

      <section className="a2-sc a2-mt12" aria-labelledby="trk-pl-h">
        <h2 className="a2-h3" id="trk-pl-h">
          {s('platformsH')}
        </h2>
        <ul className="trk-pl a2-mt12" data-testid="tracking-platforms">
          {o.platforms.map((p) => (
            <li key={p.platform} className="a2-card" data-platform={p.platform} data-mode={p.mode}>
              <div className="trk-pn">{s(`platform.${p.platform}`)}</div>
              <div className="trk-pills">
                <span className={`a2-pill ${p.ticked ? 'ok' : 'line'}`}>{s(p.ticked ? 'ticked' : 'notTicked')}</span>
                <span className={`a2-pill ${p.connected ? 'g' : 'warn'}`}>{s(`mode.${p.mode}`)}</span>
              </div>
              <div className="a2-sm a2-mute">{p.lastTest ? s('lastTest', { when: when(p.lastTest.at), result: s(p.lastTest.ok ? 'testOk' : 'testBad') }) : s('noTest')}</div>
              <Link className="a2-sm trk-keys" href={KEYS_PAGE}>
                {s('keysLink')}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <nav className="a2-views a2-mt12" aria-label={s('tableH')}>
        {TRACKING_DAYS.map((n) => (
          <Link key={n} className={`a2-view${days === n ? ' on' : ''}`} href={n === TRACKING_DAYS[0] ? HERE : `${HERE}?days=${n}`} aria-current={days === n ? 'page' : undefined}>
            {s('days', { n: num(n) })}
          </Link>
        ))}
      </nav>

      <div className="a2-kpis a2-mt12">
        {ALL_TRACKING_EVENTS.map((e) => (
          <div key={e} className="a2-card a2-kpi" data-testid={`tracking-kpi-${e}`}>
            <div className="a2-kl">{s(`kpi.${e}`)}</div>
            <div className="a2-kv">{num(o.recorded[e] ?? 0)}</div>
            <div className="a2-kf">
              <span className="a2-kn">{s('kpi.foot')}</span>
            </div>
          </div>
        ))}
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="trk-tb-h">
        <h2 className="a2-h3" id="trk-tb-h">
          {s('tableH')}
        </h2>
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl" data-testid="tracking-table">
            <thead>
              <tr>
                <th>{s('col.event')}</th>
                {TRACKING_PLATFORMS.map((p) => (
                  <th key={p}>{s(`platform.${p}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_TRACKING_EVENTS.map((e) => (
                <tr key={e}>
                  <td>{s(`event.${e}`)}</td>
                  {TRACKING_PLATFORMS.map((p) => {
                    const c = o.table[e]?.[p];
                    const shown = c ? STATES.filter((st) => c[st] > 0) : [];
                    return (
                      <td key={p} className="a2-sm">
                        {shown.length ? (
                          <span className="trk-cell">
                            {shown.map((st) => (
                              <span key={st} className={`trk-st ${st}`}>
                                {num(c![st])} {s(`state.${st}`)}
                              </span>
                            ))}
                          </span>
                        ) : (
                          s('cellNone')
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canManage ? (
        <div className="trk-two a2-mt12">
          <section className="a2-sc" aria-labelledby="trk-test-h">
            <h2 className="a2-h3" id="trk-test-h">
              {s('testH')}
            </h2>
            <p className="a2-sm a2-mute">{s('testLine')}</p>
            <TrackingActions url={API} action="test" events={ALL_TRACKING_EVENTS.map((e) => ({ value: e, label: s(`event.${e}`) }))} eventLabel={s('testEvent')} testId="tracking-test" texts={actTexts(s('sendTest'))} />
          </section>
          <section className="a2-sc" aria-labelledby="trk-wait-h">
            <h2 className="a2-h3" id="trk-wait-h">
              {s('waitingH')}
            </h2>
            <p className="a2-sm a2-mute" data-testid="tracking-waiting">
              {s('waitingLine', { n: num(o.waiting) })}
            </p>
            <TrackingActions url={API} action="send" testId="tracking-send" texts={actTexts(s('sendNow'))} />
          </section>
        </div>
      ) : (
        <p className="a2-sm a2-mute a2-mt12">{s('noManage')}</p>
      )}

      <section className="a2-sc a2-mt12" aria-labelledby="trk-recent-h">
        <h2 className="a2-h3" id="trk-recent-h">
          {s('recentH')}
        </h2>
        {o.recent.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="tracking-recent">
              <thead>
                <tr>
                  <th>{s('col.when')}</th>
                  <th>{s('col.event')}</th>
                  <th>{s('col.page')}</th>
                  <th>{s('col.value')}</th>
                  <th>{s('col.platforms')}</th>
                </tr>
              </thead>
              <tbody>
                {o.recent.map((r) => (
                  <tr key={r.id} data-event={r.name} data-test={r.test ? 'yes' : 'no'}>
                    <td className="a2-sm trk-nowrap">{when(r.at)}</td>
                    <td>
                      {(ALL_TRACKING_EVENTS as readonly string[]).includes(r.name) ? s(`event.${r.name}`) : r.name}
                      {r.test ? <span className="a2-pill info trk-test">{s('test')}</span> : null}
                    </td>
                    <td className="a2-sm trk-path">{r.path ?? s('cellNone')}</td>
                    <td className="a2-sm trk-nowrap">{money(r.valueMinor, r.currency)}</td>
                    <td className="a2-sm">
                      <span className="trk-cell">
                        {TRACKING_PLATFORMS.filter((p) => r.deliveries[p]).map((p) => {
                          const dl = r.deliveries[p]!;
                          return (
                            <span key={p} className={`trk-st ${dl.state}`} title={dl.error ?? undefined}>
                              {s(`platform.${p}`)}: {s(`state.${dl.state}`)}
                            </span>
                          );
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="tracking-none">
            {s('none')}
          </p>
        )}
      </section>

      <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={fields} texts={texts} canEdit={canManage} testId="tracking-settings" />
      <FieldsCard url={API} screen={{ key: o.attribution.key, value: o.attribution.value, version: o.attribution.version }} fields={attrFields} texts={attrTexts} canEdit={canManage} testId="tracking-attribution" />
      <FieldsCard url={API} screen={{ key: o.delivered.key, value: o.delivered.value, version: o.delivered.version }} fields={dpFields} texts={dpTexts} canEdit={canManage} testId="tracking-delivered" />
    </div>
  );
}
