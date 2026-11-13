// S06 · PR 161 — ORD-06 Risk rules at /admin/orders/risk-rules (docs/BACKEND-ARCHITECTURE.md §5.3, demo V12.3
// #/admin/orders/risk-rules; CN-018 (2) "the page lives at Orders → Risk rules"): its Levels card first — what follows
// when an order's score lands in a band (a watch mark, a hold, a call, the advance proposed); PR 542: under it the
// Advance request card (send the proposal by itself — off; the ways ticked first; the pay link's service); PR 162: under it
// the Blocklist card (list a number with a reason, `risk.block`; Undo with a reason, `risk.unblock`; the switch and what a
// match gets, mark or hold — never a cancel); PR 163: under it the Repeat refusers card (the owner's terms per number,
// `risk.refuser.terms`, only ever a proposal on a new order); PR 522: the One parcel card; PR 523: the Blocklist proposal
// card (the number of rejections that proposes a number; a person decides in the Blocklist card); PR 524: the Good
// customers card (a good customer is never held by the engine by itself; the stops show in Reports › Stopped by the
// engine); PR 556: the Parcel already on its way card (the checkout notice) and its report by campaign (`risk.report`);
// PR 557: that card's "another size: exchange on arrival" switch and the report's "of them, another size" column.
// PR 559: the Phone-entry check card (`checkout.phoneRisk`) and the "A pattern, not a slip" card (the `pattern` signal).
// The risk matrix, the rule switches (PR 544's API), the duplicate rules and
// protection & learning join with their PRs. Seeing needs `risk.rules.read`, saving `risk.rules.write`; the API checks
// each again. Everything ships off.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { advanceSettings, blocklist, courierScoreAccuracy, refusers, riskLevels } from '@extas/orders';
import { AUTO_CONFIRM_PRESETS, BLOCK_PROPOSAL_CANCEL_CODES } from '@extas/settings';
import { moneyOf } from '@/components/admin/products/model';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { AdvanceRequestCard } from '@/components/admin/orders/AdvanceRequestCard';
import { BlocklistCard } from '@/components/admin/orders/BlocklistCard';
import { CourierScoreSettings } from '@/components/admin/orders/CourierScoreSettings';
import { courierScoreCard } from '@/lib/admin-orders/courier-score-api';
import { AutoConfirmSettings } from '@/components/admin/orders/AutoConfirmSettings';
import { autoConfirmCard } from '@/lib/admin-orders/auto-confirm-api';
import { SCORE_METRICS } from '@/lib/admin-orders/courier-score-math';
import { RefusersCard } from '@/components/admin/orders/RefusersCard';
import { RiskLevels } from '@/components/admin/orders/RiskLevels';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { advanceCardScreen, advanceCardTexts } from '@/lib/admin-orders/advance-card';
import { blocklistCardScreen, blocklistCardTexts } from '@/lib/admin-orders/blocklist-card';
import { blockProposalCard } from '@/lib/admin-orders/block-proposal-api';
import { bundlingCard } from '@/lib/admin-orders/bundling-api';
import { goodCustomerCard } from '@/lib/admin-orders/good-customer-api';
import { prepaidConfirmCard } from '@/lib/admin-orders/prepaid-confirm-api';
import { phoneRiskCards } from '@/lib/admin-orders/phone-risk-api';
import { transitCard, transitReportFor } from '@/lib/admin-orders/transit-api';
import { connectedFraudChecks } from '@/lib/shop/courier-fraud';
import { TRANSIT_INCLUDE } from '@extas/settings';
import { refusersCardScreen, refusersCardTexts } from '@/lib/admin-orders/refusers-card';
import { levelsScreen, levelsTexts } from '@/lib/admin-orders/risk-levels';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../settings-cards.css';
import './blocklist.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/risk-rules';
const KEY = 'riskRules';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: `${t(view.dict, 'orders.page.riskRules')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function RiskRulesPage() {
  const deps = adminDeps();
  const [view, access] = await Promise.all([adminView(deps), pageAccess('risk.rules.read', deps, MOTHER_STORE_ID)]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="risk.rules.read" />
      </div>
    );
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const held = access.guard.permissions;
  const canEdit = held?.has('risk.rules.write') ?? false;
  const [data, adv, bl, rf, bd, bp, gc, cancelReasons, td, tdReport, pr, fraudChecks, pc, cs, csAcc, ac, currency] = await Promise.all([
    riskLevels(readDeps(access.deps), who),
    advanceSettings(readDeps(access.deps), who),
    blocklist(readDeps(access.deps), who),
    refusers(readDeps(access.deps), who),
    bundlingCard(access.deps, MOTHER_STORE_ID),
    blockProposalCard(access.deps, MOTHER_STORE_ID),
    goodCustomerCard(access.deps, MOTHER_STORE_ID),
    access.deps.resolver.value('orders.cancel.reasons', { storeId: MOTHER_STORE_ID }),
    transitCard(access.deps, MOTHER_STORE_ID),
    transitReportFor(access.deps, who),
    phoneRiskCards(access.deps, MOTHER_STORE_ID),
    // PR 567: the courier fraud checks switched on and passed in Keys & connections
    connectedFraudChecks(access.deps.db, MOTHER_STORE_ID),
    // follow-up 320: prepaid orders nothing flagged confirm by themselves once paid (off as shipped)
    prepaidConfirmCard(access.deps, MOTHER_STORE_ID),
    // S28 · PR 662: the courier score out of 10 (off as shipped) and its accuracy report
    courierScoreCard(access.deps, MOTHER_STORE_ID),
    courierScoreAccuracy(readDeps(access.deps), who),
    // S28 · PR 663: the auto-confirm rules table (off as shipped)
    autoConfirmCard(access.deps, MOTHER_STORE_ID),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }),
  ]);
  const d = view.dict;
  // PR 522: one parcel for one person's orders (the setting `risk.bundling`, off as shipped)
  const bw = (k: string) => t(d, `orders.rr.bd.${k}`);
  const bdTexts: FieldsCardTexts = { h: bw('h'), d: bw('d'), save: bw('save'), saving: bw('saving'), saved: bw('saved'), discard: bw('discard'), unsaved: bw('unsaved'), readOnly: bw('readOnly'), pairHelp: '', err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, bw(`err.${c}`)])) };
  const bdFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: bw('enabled') },
    { kind: 'number', path: 'windowHours', label: bw('windowHours'), help: bw('windowHoursHelp'), min: 1, max: 168 },
    { kind: 'select', path: 'action', label: bw('action'), help: bw('actionHelp'), options: ['propose', 'group'].map((a) => ({ value: a, label: bw(`act.${a}`) })) },
    { kind: 'number', path: 'maxOrders', label: bw('maxOrders'), help: bw('maxOrdersHelp'), min: 2, max: 20 },
  ];
  // PR 523: the proposal that fills the blocklist (the setting `risk.blockProposal`, off as shipped)
  const pw = (k: string) => t(d, `orders.rr.bp.${k}`);
  const bpTexts: FieldsCardTexts = { ...bdTexts, h: pw('h'), d: pw('d'), readOnly: pw('readOnly'), err: Object.fromEntries(Object.keys(bdTexts.err).map((c) => [c, pw(`err.${c}`)])) };
  const cancelName = new Map(cancelReasons.map((r) => [r.code as string, view.lang === 'bn' ? r.bn : r.en]));
  const bpFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: pw('enabled') },
    { kind: 'number', path: 'minRejections', label: pw('minRejections'), help: pw('minRejectionsHelp'), min: 1, max: 50 },
    { kind: 'checks', path: 'cancelCodes', label: pw('cancelCodes'), options: BLOCK_PROPOSAL_CANCEL_CODES.map((c) => ({ value: c, label: cancelName.get(c) ?? c })) },
  ];
  // PR 524: good customers are never held by the engine by itself (the setting `risk.goodCustomer`, off as shipped)
  const gw = (k: string) => t(d, `orders.rr.gc.${k}`);
  const gcTexts: FieldsCardTexts = { ...bdTexts, h: gw('h'), d: gw('d'), readOnly: gw('readOnly'), err: Object.fromEntries(Object.keys(bdTexts.err).map((c) => [c, gw(`err.${c}`)])) };
  const gcFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: gw('enabled') },
    { kind: 'number', path: 'minDelivered', label: gw('minDelivered'), help: gw('minDeliveredHelp'), min: 1, max: 100 },
    { kind: 'number', path: 'maxRefused', label: gw('maxRefused'), help: gw('maxRefusedHelp'), min: 0, max: 20 },
  ];
  // follow-up 320 (PR 541): a paid prepaid order nothing flagged confirms by itself (`orders.prepaid.selfConfirm`, off)
  const pcw = (k: string) => t(d, `orders.rr.pc.${k}`);
  const pcTexts: FieldsCardTexts = { ...bdTexts, h: pcw('h'), d: pcw('d'), readOnly: pcw('readOnly'), err: Object.fromEntries(Object.keys(bdTexts.err).map((c) => [c, gw(`err.${c}`)])) };
  const pcFields: FieldsCardField[] = [{ kind: 'switch', path: 'enabled', label: pcw('enabled') }];
  // PR 556: the in-transit duplicate notice at checkout (the setting `checkout.transitDuplicate`, off as shipped) and its
  // report by campaign (risk.report); PR 557: its "another size: exchange on arrival" switch and the report's size column
  const tw = (k: string, vars?: Record<string, string | number>) => t(d, `orders.rr.td.${k}`, vars);
  const tdTexts: FieldsCardTexts = { ...bdTexts, h: tw('h'), d: tw('d'), readOnly: tw('readOnly'), err: Object.fromEntries(Object.keys(bdTexts.err).map((c) => [c, tw(`err.${c}`)])) };
  const tdFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: tw('enabled') },
    { kind: 'select', path: 'include', label: tw('include'), help: tw('includeHelp'), options: TRANSIT_INCLUDE.map((x) => ({ value: x, label: tw(`inc.${x}`) })) },
    { kind: 'number', path: 'windowDays', label: tw('windowDays'), help: tw('windowDaysHelp'), min: 1, max: 120 },
    { kind: 'switch', path: 'byPhoneAlone', label: tw('byPhoneAlone'), help: tw('byPhoneAloneHelp') },
    { kind: 'switch', path: 'sizeExchange', label: tw('sizeExchange'), help: tw('sizeExchangeHelp') },
    { kind: 'number', path: 'reportDays', label: tw('reportDays'), help: tw('reportDaysHelp'), min: 1, max: 365 },
  ];
  // PR 559: the phone-entry check (the setting `checkout.phoneRisk`, off as shipped) and the pattern signal (off)
  const rw = (k: string, vars?: Record<string, string | number>) => t(d, `orders.rr.pr.${k}`, vars);
  const prTexts: FieldsCardTexts = { ...bdTexts, h: rw('h'), d: rw('d'), readOnly: rw('readOnly'), err: Object.fromEntries(Object.keys(bdTexts.err).map((c) => [c, rw(`err.${c}`)])) };
  const prFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: rw('enabled') },
    { kind: 'number', path: 'budgetMs', label: rw('budgetMs'), help: rw('budgetMsHelp'), min: 200, max: 10_000 },
    { kind: 'number', path: 'cacheHours', label: rw('cacheHours'), help: rw('cacheHoursHelp'), min: 1, max: 720 },
  ];
  const ptw = (k: string) => t(d, `orders.rr.pt.${k}`);
  const ptTexts: FieldsCardTexts = { ...bdTexts, h: ptw('h'), d: ptw('d'), readOnly: ptw('readOnly'), err: Object.fromEntries(Object.keys(bdTexts.err).map((c) => [c, ptw(`err.${c}`)])) };
  const ptFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: ptw('enabled') },
    { kind: 'number', path: 'weight', label: ptw('weight'), help: ptw('weightHelp'), min: 0, max: 100 },
    { kind: 'number', path: 'minParcels', label: ptw('minParcels'), help: ptw('minParcelsHelp'), min: 1, max: 100 },
    { kind: 'number', path: 'failPct', label: ptw('failPct'), help: ptw('failPctHelp'), min: 1, max: 100 },
    { kind: 'number', path: 'halfLifeDays', label: ptw('halfLifeDays'), help: ptw('halfLifeDaysHelp'), min: 1, max: 3_650 },
  ];
  // S28 · PR 662: the courier score card's words and the figures of its worked example
  const csw = (k: string, vars?: Record<string, string | number>) => t(d, `orders.rr.cs.${k}`, vars);
  const csKeys = ['h', 'd', 'enabled', 'upperScore', 'lowerScore', 'check', 'weight', 'p10', 'p5', 'lower', 'higher', 'exampleH', 'score', 'unknownNote', 'readOnly', 'unsaved', 'save', 'saving', 'saved', 'discard', 'band.auto', 'band.call', 'band.person'];
  const csText: Record<string, string> = Object.fromEntries([...csKeys.map((k) => [k, csw(k)]), ...SCORE_METRICS.map((k) => [`m.${k}`, t(d, `orders.cs.metric.${k}`)]), ...['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [`err.${c}`, csw(`err.${c}`)])]);
  const csSample = Object.fromEntries(SCORE_METRICS.map((k) => [k, Number(csw(`sample.${k}`))])) as Record<(typeof SCORE_METRICS)[number], number>;
  const csSrc = Object.fromEntries(SCORE_METRICS.map((k) => [k, fraudChecks.length ? csw('src.courier', { names: fraudChecks.map((p) => t(d, `connections.${p}.name`)).join(', ') }) : csw('src.own')])) as Record<(typeof SCORE_METRICS)[number], string>;
  const acw = (k: string) => t(d, `orders.ac.${k}`);
  const acKeys = ['h', 'd', 'enabled', 'presetH', 'presetHelp', 'summary', 'caseH', 'answerH', 'trustedMin', 'trustedMax', 'bigCod', 'bigCodHelp', 'never', 'readOnly', 'unsaved', 'save', 'saving', 'saved', 'discard', 'preset.low', 'preset.normal', 'preset.strict', 'preset.custom', 'act.auto', 'act.call', 'act.person'];
  const acText: Record<string, string> = Object.fromEntries([...acKeys.map((k) => [k, acw(k)]), ...Object.keys(AUTO_CONFIRM_PRESETS.normal).map((c) => [`case.${c}`, acw(`case.${c}`)]), ...['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [`err.${c}`, acw(`err.${c}`)])]);
  const csBand = (b: string) => (b === 'unknown' ? csw('acc.unknown') : csw(`band.${b}`));
  const checkNames = fraudChecks.map((p) => t(d, `connections.${p}.name`)).join(', ');
  const count = (x: number) => String(x);
  return (
    <div className="a2-z" data-testid="risk-rules" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'orders.page.riskRules')} sub={t(d, 'orders.rr.sub')} />
      <SectionTabs view={view} current={KEY} />
      <RiskLevels screen={levelsScreen(view, data)} texts={levelsTexts(view)} canEdit={canEdit} />
      <AdvanceRequestCard screen={advanceCardScreen(adv)} texts={advanceCardTexts(view, adv.providers)} canEdit={canEdit} />
      <BlocklistCard screen={blocklistCardScreen(view, bl)} texts={blocklistCardTexts(view)} canEdit={canEdit} canBlock={held?.has('risk.block') ?? false} canUnblock={held?.has('risk.unblock') ?? false} />
      <RefusersCard screen={refusersCardScreen(view, rf)} texts={refusersCardTexts(view)} canEdit={canEdit} canDecide={held?.has('risk.refuser.terms') ?? false} />
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/risk/bundling" screen={{ key: bd.key, value: bd.value, version: bd.version }} fields={bdFields} texts={bdTexts} canEdit={canEdit} testId="risk-bundling" />
      </div>
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/risk/block-proposal" screen={{ key: bp.key, value: bp.value, version: bp.version }} fields={bpFields} texts={bpTexts} canEdit={canEdit} testId="risk-block-proposal" />
      </div>
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/risk/good-customer" screen={{ key: gc.key, value: gc.value, version: gc.version }} fields={gcFields} texts={gcTexts} canEdit={canEdit} testId="risk-good-customer" />
      </div>
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/risk/prepaid-confirm" screen={{ key: pc.key, value: pc.value, version: pc.version }} fields={pcFields} texts={pcTexts} canEdit={canEdit} testId="risk-prepaid-confirm" />
      </div>
      <AutoConfirmSettings url="/api/admin/risk/auto-confirm" screen={{ key: ac.key, value: ac.value, version: ac.version }} canEdit={canEdit} presets={AUTO_CONFIRM_PRESETS} unit={10 ** moneyOf(currency, view.locale).digits} t={acText} />
      <CourierScoreSettings url="/api/admin/risk/courier-score" screen={{ key: cs.key, value: cs.value, version: cs.version }} canEdit={canEdit} sample={csSample} t={csText} sources={csSrc} />
      {cs.value.enabled ? (
        <div className="a2-card a2-mt12" data-testid="risk-courier-score-accuracy">
          <h3 className="a2-h4">{csw('acc.h', { days: csAcc.days })}</h3>
          <p className="a2-xs a2-mute">{csw('acc.d')}</p>
          {csAcc.rows.length ? (
            <div className="a2-tblw a2-mt6">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{csw('acc.col.band')}</th>
                    <th className="r">{csw('acc.col.orders')}</th>
                    <th className="r">{csw('acc.col.delivered')}</th>
                    <th className="r">{csw('acc.col.returned')}</th>
                    <th className="r">{csw('acc.col.cancelled')}</th>
                    <th className="r">{csw('acc.col.rate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {csAcc.rows.map((r) => (
                    <tr key={r.band} data-testid="risk-courier-score-acc-row">
                      <td className="a2-tdh">{csBand(r.band)}</td>
                      <td className="r">
                        <span className="a2-num">{count(r.orders)}</span>
                      </td>
                      <td className="r">
                        <span className="a2-num">{count(r.delivered)}</span>
                      </td>
                      <td className="r">
                        <span className="a2-num">{count(r.returned)}</span>
                      </td>
                      <td className="r">
                        <span className="a2-num">{count(r.cancelled)}</span>
                      </td>
                      <td className="r">
                        <span className="a2-num">{r.returnedPct === null ? '—' : `${r.returnedPct}%`}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{csw('acc.none')}</p>
          )}
          {csAcc.suggestion ? <p className="a2-sm a2-mt6">{csw('acc.sugg', { pct: csAcc.suggestion.values.pct })}</p> : null}
        </div>
      ) : null}
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/risk/transit" screen={{ key: td.key, value: td.value, version: td.version }} fields={tdFields} texts={tdTexts} canEdit={canEdit} testId="risk-transit" />
      </div>
      {tdReport ? (
        <div className="a2-card a2-mt12" data-testid="risk-transit-report">
          <h3 className="a2-h4">{tw('repH', { days: count(tdReport.days) })}</h3>
          <p className="a2-xs a2-mute">{tw('repD')}</p>
          {tdReport.rows.length ? (
            <div className="a2-tblw a2-mt6">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{tw('col.campaign')}</th>
                    <th className="r">{tw('col.shown')}</th>
                    <th className="r">{tw('col.removed')}</th>
                    <th className="r">{tw('col.kept')}</th>
                    <th className="r">{tw('col.size')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tdReport.rows.map((r) => (
                    <tr key={r.campaign ?? ''} data-testid="risk-transit-row">
                      <td className="a2-tdh">{r.campaign ?? tw('noCampaign')}</td>
                      <td className="r" data-l={tw('col.shown')}>
                        <span className="a2-num">{count(r.shown)}</span>
                      </td>
                      <td className="r" data-l={tw('col.removed')}>
                        <span className="a2-num">{count(r.removed)}</span>
                      </td>
                      <td className="r" data-l={tw('col.kept')}>
                        <span className="a2-num">{count(r.kept)}</span>
                      </td>
                      <td className="r" data-l={tw('col.size')}>
                        <span className="a2-num">{count(r.size)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{tw('none')}</p>
          )}
        </div>
      ) : null}
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/risk/phone-risk" screen={pr.phoneRisk} fields={prFields} texts={prTexts} canEdit={canEdit} testId="risk-phone" />
        {fraudChecks.length === 0 ? (
          <p className="a2-xs a2-mute a2-mt6" data-testid="risk-phone-none">
            {rw('none')}
          </p>
        ) : (
          <p className="a2-xs a2-mute a2-mt6" data-testid="risk-phone-connected">
            {rw('connected', { names: checkNames })}
          </p>
        )}
      </div>
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/risk/phone-risk" screen={pr.pattern} fields={ptFields} texts={ptTexts} canEdit={canEdit} testId="risk-pattern" />
      </div>
      <p className="a2-xs a2-mute a2-mt12">{t(d, 'orders.rr.later')}</p>
    </div>
  );
}
