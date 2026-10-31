// S08 · PR 192 — Support › Rider issues at /admin/support/rider-issues (BACKEND-ARCHITECTURE §5 SUP-02; CN-018 (7); demo
// 97x SUP-02). A customer says the rider took more than the parcel asked: staff log it with the order number, what he
// paid, his words and photo proof (`support.riderIssues.write`); what the parcel asked is the door record's, never typed.
// A person approves it (opens the courier claim for the exact extra) or rejects it with a note
// (`support.riderIssues.decide`). While the owner allows it, an approved complaint can ask the refund of the extra — a
// refund REQUEST that still waits for his approval on Money (`payments.refunds.request`; PR 172). Off as shipped: "More
// options" holds the switch (`support.settings`). `?status=LOGGED|APPROVED|REJECTED|all`. Seeing needs `support.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as pay from '@extas/payments';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { RiderIssueForm, RiderSettingsForm, StepButton } from '@/components/admin/courier-report/Parts';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCourierReport } from '@/lib/admin-courier-report';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { orderHref } from '@/lib/admin-orders/model';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { paymentsDeps } from '@/lib/payments-api';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'supportRiderIssues';
const HERE = '/admin/support/rider-issues';
const VIEWS = ['LOGGED', 'APPROVED', 'REJECTED', 'all'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const view = withCourierReport(await adminView());
  return { title: `${t(view.dict, 'courierReport.rider.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function RiderIssuesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('support.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withCourierReport(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="support.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `courierReport.rider.${k}`, v);
  const status = (VIEWS as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof VIEWS)[number]) : 'LOGGED';
  const who: pay.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const at = { storeId: MOTHER_STORE_ID };
  const [list, rules, currency] = await Promise.all([
    pay.listRiderIssues(await paymentsDeps(access.deps), who, status === 'all' ? {} : { status }),
    access.deps.resolver.value('support.riderIssues', at),
    access.deps.resolver.value('store.currency', at),
  ]);
  const perms = access.guard.permissions;
  const can = { write: perms?.has('support.riderIssues.write') ?? false, decide: perms?.has('support.riderIssues.decide') ?? false, refund: perms?.has('payments.refunds.request') ?? false, settings: perms?.has('support.settings') ?? false };
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' });
  const total = list.counts.LOGGED + list.counts.APPROVED + list.counts.REJECTED;
  const count = (v: (typeof VIEWS)[number]) => (v === 'all' ? total : list.counts[v]);
  const pill = (s: string) => (s === 'APPROVED' ? 'ok' : s === 'REJECTED' ? 'line' : 'warn');

  return (
    <div className="a2-z" data-testid="rider-issues" data-on={rules.enabled ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      {!rules.enabled ? <div className="a2-note a2-mt12">{c('off')}</div> : null}
      {rules.enabled && can.write ? (
        <section className="a2-card a2-mt12" aria-label={c('log')}>
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {c('log')}
          </h2>
          <RiderIssueForm dict={d as Dict} maxPhotos={rules.maxPhotos} />
        </section>
      ) : null}

      <nav className="a2-views a2-mt12" aria-label={c('title')}>
        {VIEWS.map((v) => (
          <Link key={v} className={`a2-view cr-tap${v === status ? ' on' : ''}`} href={`${HERE}?status=${v}`} aria-current={v === status ? 'page' : undefined}>
            {c(`views.${v}`)}
            <span className="a2-cnt">{n(count(v))}</span>
          </Link>
        ))}
      </nav>
      <section className="a2-card" data-testid="rider-list">
        {list.rows.length ? (
          <ul className="cr-rows" style={{ marginTop: 0 }}>
            {list.rows.map((r) => (
              <li key={r.id} data-testid="rider-row" data-status={r.status}>
                <div>
                  <div className="a2-gap8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <Link className="cr-link" href={orderHref(r.orderId)}>
                      {r.orderNumber ?? '—'}
                    </Link>
                    <span className={`a2-pill ${pill(r.status)}`}>{c(`state.${r.status}`)}</span>
                    <span className="a2-xs a2-mute">
                      {r.courier}
                      {r.consignmentId ? ` · ${r.consignmentId}` : ''} · {when.format(r.createdAt)}
                    </span>
                  </div>
                  <div className="a2-sm a2-mt6">
                    <b>{c('paidDue', { charged: m(r.chargedMinor), due: m(r.dueMinor), extra: m(r.extraMinor) })}</b>
                  </div>
                  <div className="a2-sm a2-mt6">{r.words}</div>
                  {r.proofMediaIds.length ? (
                    <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
                      {r.proofMediaIds.map((id, i) => (
                        <a key={id} className="cr-link" href={`/api/admin/support/rider-issues/proof/${id}`} target="_blank" rel="noopener noreferrer">
                          {c('proof', { n: i + 1 })}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {r.decisionNote ? <div className="a2-xs a2-mute a2-mt6">{c('decided', { note: r.decisionNote })}</div> : null}
                  {r.claimId ? <div className="a2-xs a2-mt6">{c('claimOpen', { extra: m(r.extraMinor) })}</div> : null}
                  {r.refundId ? <div className="a2-xs a2-mt6">{c('refundAsked')}</div> : null}
                </div>
                <div className="cr-acts">
                  {r.status === 'LOGGED' && can.decide && rules.enabled ? (
                    <>
                      <StepButton dict={d as Dict} url={`${'/api/admin/support/rider-issues'}/${r.id}/decide`} body={{ decision: 'approve', confirm: true }} label={c('approve')} field={{ name: 'note', label: c('approveNote') }} tone="pri" testId="rider-approve" />
                      <StepButton dict={d as Dict} url={`${'/api/admin/support/rider-issues'}/${r.id}/decide`} body={{ decision: 'reject' }} label={c('reject')} field={{ name: 'note', label: c('rejectNote') }} testId="rider-reject" />
                    </>
                  ) : null}
                  {r.status === 'APPROVED' && !r.refundId && can.refund && rules.enabled && rules.refundAsk ? (
                    <StepButton dict={d as Dict} url={`${'/api/admin/support/rider-issues'}/${r.id}/refund`} body={{ method: 'original' }} label={c('refund', { extra: m(r.extraMinor) })} confirmText={c('refundAsk', { extra: m(r.extraMinor) })} testId="rider-refund" />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{c('empty')}</p>
        )}
      </section>

      {can.settings ? (
        <details className="a2-mt12 a2-more-opts" data-testid="rider-more">
          <summary>{c('settings')}</summary>
          <div className="a2-card a2-mt12">
            <RiderSettingsForm dict={d as Dict} before={{ ...rules }} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
