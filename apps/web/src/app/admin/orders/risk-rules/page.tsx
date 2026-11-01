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
import { advanceSettings, blocklist, refusers, riskLevels } from '@extas/orders';
import { BLOCK_PROPOSAL_CANCEL_CODES } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { AdvanceRequestCard } from '@/components/admin/orders/AdvanceRequestCard';
import { BlocklistCard } from '@/components/admin/orders/BlocklistCard';
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
import { phoneRiskCards } from '@/lib/admin-orders/phone-risk-api';
import { transitCard, transitReportFor } from '@/lib/admin-orders/transit-api';
import { courierFraudSources } from '@/lib/shop/courier-fraud';
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
  const [data, adv, bl, rf, bd, bp, gc, cancelReasons, td, tdReport, pr] = await Promise.all([
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
  ]);
  const d = view.dict;
  // PR 522: one parcel for one person's orders (the setting `risk.bundling`, off as shipped)
  const bw = (k: string) => t(d, `orders.rr.bd.${k}`);
  const bdTexts: FieldsCardTexts = {
    h: bw('h'),
    d: bw('d'),
    save: bw('save'),
    saving: bw('saving'),
    saved: bw('saved'),
    discard: bw('discard'),
    unsaved: bw('unsaved'),
    readOnly: bw('readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, bw(`err.${c}`)])),
  };
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
  const noCourierCheck = courierFraudSources().length === 0;
  const count = (x: number) => String(x);
  return (
    <div className="a2-z" data-testid="risk-rules">
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
        {noCourierCheck ? (
          <p className="a2-xs a2-mute a2-mt6" data-testid="risk-phone-none">
            {rw('none')}
          </p>
        ) : null}
      </div>
      <div className="a2-mt12">
        <FieldsCard url="/api/admin/risk/phone-risk" screen={pr.pattern} fields={ptFields} texts={ptTexts} canEdit={canEdit} testId="risk-pattern" />
      </div>
      <p className="a2-xs a2-mute a2-mt12">{t(d, 'orders.rr.later')}</p>
    </div>
  );
}
