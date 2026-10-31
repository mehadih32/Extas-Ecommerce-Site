// S06 · PR 545 — Orders › To confirm › Calls to make at /admin/orders/confirm/calls: every call task the shop's steps
// left for a person (an unclear address, two sizes, a WhatsApp with no reply, a new customer …), the longest wait first,
// as chips by reason with their counts (`?reason=`), or the calls already made (`?status=closed`). Each row opens its
// order and phones the customer; "Record call" saves what the call found from the owner's outcomes (`orders.callOutcomes`)
// with a note, and the order's timeline gets the line. A call only records: confirming, holding or cancelling stays on
// the order's own page (CLAUDE.md rule 6). The page and recording need `orders.confirm` (the To confirm tab's key); the
// cards `risk.rules.write`.
// Words: messages/admin-calls.*.json (`cl.*`); model: lib/admin-orders/calls-view.ts.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CommandButton, CommandsProvider } from '@/components/admin/orders/OrderCommands';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { formatNumber } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { callsCards } from '@/lib/admin-orders/calls-api';
import { callLines, reasonLabel } from '@/lib/admin-orders/calls-view';
import { commandTexts } from '@/lib/admin-orders/detail';
import { ageText } from '@/lib/admin-orders/list';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-calls.bn.json';
import en from '../../../../../../messages/admin-calls.en.json';
import '../../../settings-cards.css';
import './calls.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/confirm/calls';
const KEY = 'ordersCalls';
const API = '/api/admin/risk/calls';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;
const REASON = /^[A-Z][A-Z0-9_]{1,59}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

const hrefOf = (q: { reason?: string | null; status?: string | null; cursor?: string | null }) => {
  const p = new URLSearchParams();
  if (q.reason) p.set('reason', q.reason);
  if (q.status && q.status !== 'open') p.set('status', q.status);
  if (q.cursor) p.set('cursor', q.cursor);
  const s = p.toString();
  return s ? `${HERE}?${s}` : HERE;
};

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'cl.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CallsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('orders.confirm', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="orders.confirm" />
      </div>
    );
  const reasonAsked = one(sp.reason);
  const reason = reasonAsked && REASON.test(reasonAsked) ? reasonAsked : null;
  const status = one(sp.status) === 'closed' ? 'closed' : 'open';
  const cursorAsked = one(sp.cursor);
  const cursor = cursorAsked && UUID.test(cursorAsked) ? cursorAsked : null;
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const rd = readDeps(access.deps);
  const now = (access.deps.now ?? (() => new Date()))();
  const [queue, counts, outcomes, cards] = await Promise.all([
    od.callQueue(rd, who, { status, ...(reason ? { reason } : {}), ...(cursor ? { cursor } : {}) }),
    od.callReasonCounts(rd, who),
    access.deps.resolver.value('orders.callOutcomes', { storeId: MOTHER_STORE_ID }),
    callsCards(access.deps, MOTHER_STORE_ID),
  ]);
  const canEdit = access.guard.permissions?.has('risk.rules.write') ?? false;
  const canRecord = access.guard.permissions?.has('orders.confirm') ?? false;
  const atFmt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const w = (k: string, vars?: Record<string, string | number>) => t(d, `cl.${k}`, vars);
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const lines = callLines(d, queue.rows, outcomes, { w, age: (at) => ageText(view, at, now), when: (at) => atFmt.format(at), lang }, canRecord);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const n = (x: number) => formatNumber(x, view.locale);
  const sub = status === 'closed' ? w('subClosed') : total ? w('sub', { n: n(total) }) : w('subNone');
  const reasons = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const texts = (h: string, desc: string): FieldsCardTexts => ({
    h,
    d: desc,
    save: w('save'),
    saving: w('saving'),
    saved: w('saved'),
    discard: w('discard'),
    unsaved: w('unsaved'),
    readOnly: w('cardReadOnly'),
    pairHelp: w('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, w(`err.${c}`)])),
  });
  const ncFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: w('nc.enabled') },
    { kind: 'switch', path: 'prepaid', label: w('nc.prepaid'), help: w('nc.prepaidHelp') },
  ];
  const ocFields: FieldsCardField[] = [
    ...outcomes.map((o): FieldsCardField => {
      const name = lang === 'bn' ? o.bn || o.en : o.en;
      return { kind: 'pair', path: o.key, label: { en: w('oc.en', { name }), bn: w('oc.bn', { name }) }, max: 60, rows: 1 };
    }),
    { kind: 'checks', path: 'done', label: w('oc.done'), options: outcomes.map((o) => ({ value: o.key, label: lang === 'bn' ? o.bn || o.en : o.en })) },
  ];

  return (
    <CommandsProvider texts={commandTexts(view)}>
      <SectionTabs view={view} current={KEY} />
      <div className="a2-z cl-page" data-testid="calls-page">
        <PageHead view={view} place={locateKey(KEY)} title={w('title')} sub={sub} />
        <nav className="a2-views" aria-label={w('statusAria')} data-testid="calls-status">
          {(['open', 'closed'] as const).map((s) => (
            <Link key={s} className={`a2-view${status === s ? ' on' : ''}`} href={hrefOf({ status: s, reason })} aria-current={status === s ? 'page' : undefined} scroll={false}>
              {w(s)}
              {s === 'open' ? <span className="a2-cnt">{n(total)}</span> : null}
            </Link>
          ))}
        </nav>
        {status === 'open' && reasons.length ? (
          <nav className="a2-views cl-reasons" aria-label={w('reasonAria')} data-testid="calls-reasons">
            <Link className={`a2-view${!reason ? ' on' : ''}`} href={hrefOf({ status })} aria-current={!reason ? 'page' : undefined} scroll={false}>
              {w('all')}
              <span className="a2-cnt">{n(total)}</span>
            </Link>
            {reasons.map(([r, c]) => (
              <Link key={r} className={`a2-view${reason === r ? ' on' : ''}`} href={hrefOf({ status, reason: r })} aria-current={reason === r ? 'page' : undefined} scroll={false} data-reason={r}>
                {reasonLabel(d, r)}
                <span className="a2-cnt">{n(c)}</span>
              </Link>
            ))}
          </nav>
        ) : null}
        {lines.length ? (
          <ul className="cl-list" data-testid="calls-list">
            {lines.map((l) => (
              <li key={l.taskId} className="a2-card cl-row" data-testid="call-row" data-reason={l.reason} data-task={l.taskId}>
                <div className="cl-top">
                  <span className="a2-pill warn">{l.reasonLabel}</span>
                  <span className={`a2-xs cl-state ${l.tone}`}>{l.state}</span>
                </div>
                <div className="cl-who">
                  {l.href ? (
                    <Link className="cl-num" href={l.href}>
                      {l.number}
                    </Link>
                  ) : null}
                  <span className="cl-name">{l.name}</span>
                  {l.phone ? (
                    <a className="a2-btn sm cl-tel" href={`tel:${l.phone}`}>
                      <ShellIcon name="phone" size={14} />
                      {l.phone}
                    </a>
                  ) : null}
                </div>
                {l.notes.length ? (
                  <ul className="cl-notes a2-sm a2-mute" aria-label={w('notes')}>
                    {l.notes.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="cl-acts">
                  {l.href ? (
                    <Link className="a2-btn sm" href={l.href}>
                      {w('openOrder')}
                    </Link>
                  ) : null}
                  {l.record ? <CommandButton spec={l.record} size="sm" /> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="a2-state" data-testid="calls-empty">
            <div className="a2-sti">
              <ShellIcon name="phone" size={26} />
            </div>
            <div className="a2-sm a2-mute">{w('empty')}</div>
          </div>
        )}
        {queue.next ? (
          <div className="a2-mt12">
            <Link className="a2-btn" href={hrefOf({ status, reason, cursor: queue.next })}>
              {w('more')}
            </Link>
          </div>
        ) : null}
        <div className="a2-mt16 cl-cards">
          <FieldsCard url={API} screen={cards.newCustomer} fields={ncFields} texts={texts(w('nc.h'), w('nc.d'))} canEdit={canEdit} testId="calls-new-customer" />
          <FieldsCard url={API} screen={cards.outcomes} fields={ocFields} texts={texts(w('oc.h'), w('oc.d'))} canEdit={canEdit} testId="calls-outcomes" />
        </div>
      </div>
    </CommandsProvider>
  );
}
