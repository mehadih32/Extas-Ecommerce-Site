// S08 · PR 191 — refused parcels at /admin/orders/returns/refused (Blueprint C6 item 4; §6.5.0): on the left, the
// parcels refused at the door, newest first — the reason, the shop's own fault marked (never counted), the delivery charge
// paid at the door kept; on the right, the refused-parcel list a person decides (`?state=`, the proposals first): put a
// number on the list (ad audiences leave it out, PR 264), dismiss a proposal, or take a number off again with a note.
// The list is off until the owner switches it on (`orders.refused.list`). Nothing here blocks an order, turns Cash on
// Delivery off or moves money. Needs `returns.view`; deciding needs `returns.decide` (the order service checks both again).
// Words: messages/admin-returns.*.json (`returns.refused.*`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { actionTexts } from '@/components/admin/orders/ReturnsBoard';
import { ReturnsAction } from '@/components/admin/orders/ReturnsActions';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { RETURNS_HREF } from '@/lib/admin-returns/model';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-returns.bn.json';
import en from '../../../../../../messages/admin-returns.en.json';

export const dynamic = 'force-dynamic';

const KEY = 'ordersReturnsRefused';
const HERE = `${RETURNS_HREF}/refused`;
const REFUSED_KINDS = ['REFUSED_AT_DOOR', 'CHARGE_PAID_RETURN'] as const;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, returns: (view.lang === 'bn' ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'returns.refused.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

const stateTone = (s: string) => (s === 'LISTED' ? 'bad' : s === 'PROPOSED' ? 'warn' : '');

export default async function RefusedParcelsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('returns.view', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const want = one(sp.state);
  const state = od.REFUSED_LIST_STATES.find((s) => s === want) ?? 'PROPOSED';
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(want ? `${HERE}?state=${state}` : HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="returns.view" />
      </div>
    );
  const who: od.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const rd = readDeps(access.deps);
  const canDecide = (access.guard.permissions ?? new Set<string>()).has('returns.decide');
  const at = { storeId: MOTHER_STORE_ID };
  const [parcels, entries, all, cfg, reasons, currency] = await Promise.all([
    od.listReturns(rd, who, { kind: [...REFUSED_KINDS] }),
    od.listRefusedEntries(rd, who, { state: [state] }),
    od.listRefusedEntries(rd, who, {}),
    access.deps.resolver.value('orders.refused.list', at),
    access.deps.resolver.value('orders.refusal.reasons', at),
    access.deps.resolver.value('store.currency', at),
  ]);
  const d = view.dict;
  const r = (key: string, vars?: Record<string, string | number>) => t(d, `returns.refused.${key}`, vars);
  const money = moneyOf(currency, view.locale);
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const when = (iso: string) => dt.format(new Date(iso));
  const reasonLabel = (key: string | null) => (key ? (reasons.find((x) => x.key === key)?.[view.lang === 'bn' ? 'bn' : 'en'] ?? key) : r('noReason'));
  const counts = Object.fromEntries(od.REFUSED_LIST_STATES.map((s) => [s, all.filter((e) => e.state === s).length]));
  const texts = actionTexts(d);
  const decide = (e: od.RefusedEntryView, to: 'LISTED' | 'DISMISSED' | 'REMOVED', tone: string) => (
    <ReturnsAction
      key={to}
      label={r(`act.${to}`)}
      url={`/api/admin/returns/refused/${e.id}/decide`}
      body={{ state: to, version: e.version }}
      tone={tone}
      note={{ label: r(to === 'REMOVED' ? 'noteRemove' : 'noteOptional'), required: to === 'REMOVED' }}
      texts={texts}
      testId={`refused-${to.toLowerCase()}`}
    />
  );
  const next: Record<string, ['LISTED' | 'DISMISSED' | 'REMOVED', string][]> = {
    PROPOSED: [
      ['LISTED', 'pri'],
      ['DISMISSED', ''],
    ],
    LISTED: [['REMOVED', '']],
    DISMISSED: [['LISTED', '']],
    REMOVED: [['LISTED', '']],
  };

  return (
    <div className="a2-z" data-testid="returns-refused">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={r('title')}
        sub={r('sub')}
        crumb={
          <Link className="rt-crumb" href={RETURNS_HREF}>
            <ShellIcon name="cl" size={12} />
            {r('back')}
          </Link>
        }
      />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-row a2-r12 a2-start">
        <section className="a2-card" data-testid="refused-parcels">
          <h2 className="a2-h3">{r('parcels', { n: formatNumber(parcels.length, view.locale) })}</h2>
          {parcels.length ? (
            parcels.map((x) => (
              <div key={x.id} className="a2-qi a2-mt6" data-testid="refused-parcel" data-kind={x.kind}>
                <div>
                  <b>
                    <Link className="a2-lnk" href={`/admin/orders/${x.orderId}`}>
                      {x.orderNumber}
                    </Link>
                    {` · ${x.customerName ?? ''}`}
                  </b>
                  <span>{`${reasonLabel(x.reasonCode)} · ${when(x.createdAt)}${x.chargePaidMinor > 0 ? ` · ${r('chargePaid', { amount: formatMoney(x.chargePaidMinor, money) })}` : ''}`}</span>
                </div>
                {x.ourFault ? <span className="a2-pill ok">{r('ourFault')}</span> : null}
              </div>
            ))
          ) : (
            <div className="a2-sm a2-mute a2-mt6">{r('noParcels')}</div>
          )}
          <div className="a2-note">
            <ShellIcon name="info" size={15} />
            <span>{r('parcelsNote')}</span>
          </div>
        </section>
        <section className="a2-card" data-testid="refused-list" data-enabled={cfg.enabled ? 'on' : 'off'}>
          <div className="a2-ch">
            <div>
              <h2 className="a2-h3">{r('list')}</h2>
              <div className="a2-cs">{cfg.enabled ? r('listOn', { n: formatNumber(cfg.minRefusals, view.locale) }) : r('listOff')}</div>
            </div>
            <span className={`a2-pill ${cfg.enabled ? 'ok' : ''}`}>{r(cfg.enabled ? 'on' : 'off')}</span>
          </div>
          <nav className="a2-seg a2-mt12" aria-label={r('list')}>
            {od.REFUSED_LIST_STATES.map((s) => (
              <Link key={s} className={s === state ? 'on' : undefined} href={`${HERE}?state=${s}`} scroll={false} aria-current={s === state ? 'page' : undefined} data-testid={`refused-state-${s}`}>
                {`${r(`state.${s}`)} · ${formatNumber(counts[s] ?? 0, view.locale)}`}
              </Link>
            ))}
          </nav>
          {entries.length ? (
            entries.map((e) => (
              <div key={e.id} className="a2-card tight a2-mt12" data-testid="refused-entry" data-state={e.state}>
                <div className="a2-between rt-nowrap">
                  <b className="a2-mono">{e.phoneNice}</b>
                  <span className={`a2-pill ${stateTone(e.state)}`}>{r(`state.${e.state}`)}</span>
                </div>
                <div className="a2-xs a2-mt6">
                  {`${r('refusals', { n: formatNumber(e.refusals, view.locale) })} · ${reasonLabel(e.lastReasonCode)} · ${when(e.lastRefusedAt)}`}
                  {e.lastOrderId && e.lastOrderNumber ? (
                    <>
                      {' · '}
                      <Link className="a2-lnk" href={`/admin/orders/${e.lastOrderId}`}>
                        {e.lastOrderNumber}
                      </Link>
                    </>
                  ) : null}
                </div>
                {e.decisionNote ? <div className="a2-xs a2-mute a2-mt6">{e.decisionNote}</div> : null}
                {canDecide ? <div className="a2-cmds a2-mt12">{(next[e.state] ?? []).map(([to, tone]) => decide(e, to, tone))}</div> : null}
              </div>
            ))
          ) : (
            <div className="a2-sm a2-mute a2-mt12">{r(`empty.${state}`)}</div>
          )}
          <div className="a2-note">
            <ShellIcon name="info" size={15} />
            <span>{r('never')}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
