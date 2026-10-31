// Go-live gate F-041 / F-054 (follow-up of PR 172, 171) — Money › Refunds & wallet at /admin/money/refunds: the money owed
// to customers on top, the refunds by where they stand (to approve, to pay out, paid out, rejected, all) with each one's
// order, why, how it goes back, who asked and decided, and its next step (approve or reject with `payments.refunds.
// approve`; mark paid or failed with `payments.refunds.execute`; four eyes when the owner has it on); the late orders
// that may get the apology credit (`payments.apology`); and, under More options, the owner's three money rules
// (`settings.write`). Seeing it needs `payments.view`. Nothing here pays anyone: a person sends money back by bKash or
// the bank, then records its reference (CLAUDE.md rule 6). Words: messages/admin-refunds.*.json (`moneyRefunds.*`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ApologyGive, RefundActions, type Words } from '@/components/admin/money/RefundActions';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { REFUND_VIEWS, refundsView, type MoneyCardKey } from '@/lib/money-refunds';
import { paymentsDeps } from '@/lib/payments-api';
import bn from '../../../../../messages/admin-refunds.bn.json';
import en from '../../../../../messages/admin-refunds.en.json';
import '../../settings-cards.css';
import '../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyRefunds';
const HERE = '/admin/money/refunds';
const API = '/api/admin/money/refunds';
const STATE_PILL: Record<string, string> = { REQUESTED: 'warn', APPROVED: 'info', FAILED: 'bad', COMPLETED: 'ok', REJECTED: 'line' };
const SOURCES = ['RTO', 'RIDER_OVERCHARGE', 'OUR_MISTAKE', 'OTHER'] as const;

type Search = Promise<Record<string, string | string[] | undefined>>;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, moneyRefunds: (view.lang === 'bn' ? bn : en).moneyRefunds as unknown as Dict } };
}

/** A nested words object as flat `a.b` keys, for a client component (no function crosses from the server). */
function flat(d: unknown, prefix = ''): Words {
  if (!d || typeof d !== 'object') return {};
  const out: Words = {};
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (typeof v === 'string') out[`${prefix}${k}`] = v;
    else Object.assign(out, flat(v, `${prefix}${k}.`));
  }
  return out;
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyRefunds.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function RefundsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [sp, plain, access] = await Promise.all([searchParams, adminView(deps), pageAccess('payments.view', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="payments.view" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyRefunds.${k}`, vars);
  const asked = typeof sp.view === 'string' ? sp.view : undefined;
  const [v, currency] = await Promise.all([
    refundsView({ db: access.deps.db, resolver: access.deps.resolver, payments: await paymentsDeps(access.deps) }, { actor: access.guard.actor, ctx: access.guard.ctx }, { view: asked }),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
  ]);
  const money = moneyOf(currency, view.locale);
  const amount = (minor: number) => formatMoney(minor, money);
  const at = (x: Date | string | null) => (x ? dateTime(new Date(x).toISOString(), view.locale, view.timeZone) : '');
  const w = flat((view.lang === 'bn' ? bn : en).moneyRefunds.w);
  const someone = c('row.someone');

  const cardTexts = (k: MoneyCardKey): FieldsCardTexts => ({
    h: c(`card.${k}.h`),
    d: c(`card.${k}.d`),
    save: c('card.save'),
    saving: c('card.saving'),
    saved: c('card.saved'),
    discard: c('card.discard'),
    unsaved: c('card.unsaved'),
    readOnly: c('card.readOnly'),
    pairHelp: c('card.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((x) => [x, c(`card.err.${x}`)])),
  });
  const fields: Record<MoneyCardKey, FieldsCardField[]> = {
    refunds: [
      { kind: 'switch', path: 'toWallet', label: c('card.refunds.toWallet'), help: c('card.refunds.toWalletHelp') },
      { kind: 'switch', path: 'afterDelivery', label: c('card.refunds.afterDelivery'), help: c('card.refunds.afterDeliveryHelp') },
      { kind: 'checks', path: 'afterDeliverySources', label: c('card.refunds.sources'), options: SOURCES.map((s) => ({ value: s, label: c(`source.${s}`) })) },
      { kind: 'select', path: 'rtoDeliveryCharge', label: c('card.refunds.rto'), options: ['REFUND', 'KEEP'].map((x) => ({ value: x, label: c(`card.refunds.rto${x}`) })) },
      { kind: 'select', path: 'rtoAdvance', label: c('card.refunds.rtoAdvance'), options: ['KEEP', 'ASK'].map((x) => ({ value: x, label: c(`card.refunds.rtoAdvance${x}`) })) },
      { kind: 'switch', path: 'fourEyes', label: c('card.refunds.fourEyes'), help: c('card.refunds.fourEyesHelp') },
    ],
    walletManual: [
      { kind: 'switch', path: 'enabled', label: c('card.walletManual.enabled'), help: c('card.walletManual.enabledHelp') },
      { kind: 'number', path: 'max', label: `${c('card.walletManual.max')} (${currency})`, help: c('card.walletManual.maxHelp'), min: 0, max: 10_000_000 }, // hardcode-ok: the form's upper bound, the setting's own schema decides
    ],
    apology: [
      { kind: 'switch', path: 'enabled', label: c('card.apology.enabled') },
      { kind: 'select', path: 'mode', label: c('card.apology.mode'), options: ['PER_ORDER', 'RULE'].map((x) => ({ value: x, label: c(`card.apology.mode${x}`) })) },
      { kind: 'select', path: 'kind', label: c('card.apology.kind'), options: ['AMOUNT', 'PERCENT'].map((x) => ({ value: x, label: c(`card.apology.kind${x}`) })) },
      { kind: 'number', path: 'amount', label: `${c('card.apology.amount')} (${currency})`, help: c('card.apology.amountHelp'), min: 0, max: 10_000_000 }, // hardcode-ok: the form's upper bound
      { kind: 'number', path: 'percent', label: c('card.apology.percent'), min: 0, max: 100 }, // hardcode-ok: a percentage
      { kind: 'number', path: 'cap', label: `${c('card.apology.cap')} (${currency})`, help: c('card.apology.capHelp'), min: 0, max: 10_000_000 }, // hardcode-ok: the form's upper bound
      { kind: 'number', path: 'lateAfterHours', label: c('card.apology.lateAfterHours'), help: c('card.apology.lateHelp'), min: 0, max: 1440 }, // hardcode-ok: the setting's own limit (60 days)
    ],
  };

  return (
    <div className="a2-z" data-testid="refunds-page" data-view={v.view}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis a2-mt12" data-testid="rf-kpis">
        <div className="a2-card a2-kpi" data-testid="rf-kpi-owed" data-minor={v.owed.totalMinor}>
          <div className="a2-kl">{c('kpi.owed')}</div>
          <b className="a2-kv">{amount(v.owed.totalMinor)}</b>
          <div className="a2-kf">
            <span className="a2-kn">{c('kpi.owedNote', { n: v.owed.count })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="rf-kpi-approve" data-n={v.counts.approve}>
          <div className="a2-kl">{c('kpi.approve')}</div>
          <b className="a2-kv">{v.counts.approve}</b>
        </div>
        <div className="a2-card a2-kpi" data-testid="rf-kpi-payout" data-n={v.counts.payout}>
          <div className="a2-kl">{c('kpi.payout')}</div>
          <b className="a2-kv">{v.counts.payout}</b>
          {v.owed.failedMinor ? (
            <div className="a2-kf">
              <span className="a2-kn bk-warn">{c('kpi.failed', { amount: amount(v.owed.failedMinor) })}</span>
            </div>
          ) : null}
        </div>
        <div className="a2-card a2-kpi" data-testid="rf-kpi-done" data-n={v.counts.done}>
          <div className="a2-kl">{c('kpi.done')}</div>
          <b className="a2-kv">{v.counts.done}</b>
        </div>
      </div>

      <nav className="a2-views rf-views a2-mt12" aria-label={c('views')} data-testid="rf-views">
        {REFUND_VIEWS.map((x) => (
          <Link key={x} className={`a2-view${x === v.view ? ' on' : ''}`} href={x === 'approve' ? HERE : `${HERE}?view=${x}`} aria-current={x === v.view ? 'page' : undefined} scroll={false} data-view={x}>
            {c(`view.${x}`)}
            {x !== 'all' && v.counts[x] ? ` · ${v.counts[x]}` : ''}
          </Link>
        ))}
      </nav>

      <section className="a2-card a2-mt12" aria-labelledby="rf-list-h" data-testid="rf-list">
        <h2 className="a2-h3" id="rf-list-h">
          {c('list.title')} · {c(`view.${v.view}`)}
        </h2>
        {v.rows.length ? (
          <ul className="rf-rows">
            {v.rows.map((r) => {
              const who = (id: string | null, name: string | null) => (id ? (name ?? someone) : null);
              const askedBy = who(r.requestedById, r.askedBy);
              return (
                <li key={r.id} className="rf-row" data-testid="rf-row" data-refund={r.id} data-state={r.status} data-source={r.source ?? ''}>
                  <div className="rf-top">
                    <b className="rf-amt">{amount(r.amountMinor)}</b>
                    <span className={`a2-pill ${STATE_PILL[r.status] ?? 'line'}`}>{c(`state.${r.status}`)}</span>
                  </div>
                  <div className="a2-xs rf-facts">
                    <Link href={`/admin/orders/${r.orderId}`}>{c('row.order', { number: r.number ?? '' })}</Link>
                    <span>{c(`source.${r.source ?? 'OTHER'}`)}</span>
                    <span>{c(`method.${r.method === 'wallet' ? 'wallet' : 'original'}`)}</span>
                    {r.customerId ? <Link href={`/admin/customers/${r.customerId}`}>{c('row.customer')}</Link> : null}
                  </div>
                  <div className="a2-xs a2-mute">{askedBy ? c('row.asked', { at: at(r.createdAt), who: askedBy }) : c('row.askedShop', { at: at(r.createdAt) })}</div>
                  {r.note ? <div className="a2-xs a2-mute">{c('row.note', { note: r.note })}</div> : null}
                  {r.decidedAt && r.status !== 'REQUESTED' ? (
                    <div className="a2-xs a2-mute">{c(r.status === 'REJECTED' ? 'row.rejected' : 'row.approved', { at: at(r.decidedAt), who: r.decidedBy ?? someone })}</div>
                  ) : null}
                  {r.decisionNote ? <div className="a2-xs a2-mute">{c('row.decision', { note: r.decisionNote })}</div> : null}
                  {r.status === 'COMPLETED' ? <div className="a2-xs a2-mute">{c('row.paid', { at: at(r.completedAt), who: r.paidBy ?? someone })}</div> : null}
                  {r.payoutReference ? <div className="a2-xs">{c('row.reference', { ref: r.payoutReference })}</div> : null}
                  {r.status === 'FAILED' && r.failureNote ? <div className="a2-xs bk-warn">{c('row.failed', { note: r.failureNote })}</div> : null}
                  <RefundActions
                    w={w}
                    id={r.id}
                    status={r.status}
                    method={r.method}
                    amount={amount(r.amountMinor)}
                    canApprove={v.can.approve}
                    canExecute={v.can.execute}
                    walletChoice={v.rules.toWallet && !!r.customerId && r.method !== 'wallet'}
                    ownRequest={v.rules.fourEyes && !!r.requestedById && r.requestedById === v.me}
                    testId={`rf-act-${r.id}`}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="a2-sm a2-mute" data-testid="rf-none">
            {c(`none.${v.view}`)}
          </p>
        )}
        {v.rows.length >= 100 ? <p className="a2-xs a2-mute a2-mt12">{c('list.more', { n: v.rows.length })}</p> : null /* hardcode-ok: the page size of refundsView */}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="rf-apology-h" data-testid="rf-apology" data-on={v.apology.enabled ? 'yes' : 'no'}>
        <h2 className="a2-h3" id="rf-apology-h">
          {c('apology.title')}
        </h2>
        <p className="a2-cs">{c('apology.sub')}</p>
        {!v.apology.enabled ? (
          <p className="a2-sm a2-mute a2-mt6">{c('apology.off')}</p>
        ) : v.apology.rows.length ? (
          <ul className="rf-rows">
            {v.apology.rows.map((x) => (
              <li key={x.orderId} className="rf-row" data-testid="rf-late" data-order={x.orderId}>
                <div className="rf-top">
                  <Link href={`/admin/orders/${x.orderId}`}>{c('row.order', { number: x.number })}</Link>
                  <span className="a2-pill warn">{c('apology.late', { h: x.lateHours })}</span>
                </div>
                <div className="a2-xs a2-mute rf-facts">
                  <Link href={`/admin/customers/${x.customerId}`}>{x.customerName ?? c('apology.noName')}</Link>
                  <span>{c('apology.delivered', { at: at(x.deliveredAt) })}</span>
                  {v.apology.mode === 'RULE' ? <span>{x.ruleMinor !== null ? c('apology.rule', { amount: amount(x.ruleMinor) }) : c('apology.ruleUnset')}</span> : null}
                </div>
                {v.can.apology ? <ApologyGive w={w} orderId={x.orderId} mode={v.apology.mode} ruleAmount={x.ruleMinor !== null ? amount(x.ruleMinor) : null} digits={money.digits} currency={currency} testId={`rf-apology-${x.orderId}`} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{c('apology.none')}</p>
        )}
      </section>

      <details className="ct-more a2-mt12" data-testid="rf-more">
        <summary>{c('more')}</summary>
        {(['refunds', 'walletManual', 'apology'] as const).map((k) => (
          <FieldsCard key={k} url={API} screen={{ key: v.cards[k].key, value: v.cards[k].value, version: v.cards[k].version }} fields={fields[k]} texts={cardTexts(k)} canEdit={v.can.settings} testId={`rf-card-${k}`} />
        ))}
      </details>
    </div>
  );
}
