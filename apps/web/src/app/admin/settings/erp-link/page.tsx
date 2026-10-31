// CN-029 · PR 619 — Settings → ERP link at /admin/settings/erp-link (`?storeId=N`, else the mother store): one store's own
// link to its ERP company (one store = one ERP company). The store's own keys (Keys & connections' card for that store:
// the API key, webhook secret and signing secret go to the vault under this store id only), what was last synced each
// way, the last daily summary the ERP accepted, what is waiting (orders, v5 orders kept at the switch, exchanges,
// summaries), the balance Retail owes by the shop's books and by the ERP's, the books match state, the switch-over to
// contract v6 (a dry run first, then the owner with his PIN and the switch date typed back; CN-033: the way, a fresh
// start as it ships or the ERP's list, chosen by the owner per store), the "ERP asks the shop" card
// (moved here from Keys & connections, Bhandari follow-up 524) and, for the owner, "Start a new link". Seeing needs
// `vault.read` in that store; the dry run and sending a held order `vault.write`; the switch and a new link the owner.
// Words: messages/admin-erp-link.*.json (`erpLink.*`); the forms are the Books pages' (`bk.*`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type * as inv from '@extas/inventory';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { BooksForm } from '@/components/admin/books/BooksForm';
import { ErpCalls } from '@/components/admin/ErpCalls';
import { Integrations } from '@/components/admin/Integrations';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { booksHref, storeOfSearch } from '@/lib/admin-books/page';
import { withBooks } from '@/lib/admin-books/i18n';
import { mergeDicts } from '@/lib/admin-i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { erpLinkView } from '@/lib/erp-link-admin';
import { t, type Dict } from '@/lib/i18n';
import { siteAddress } from '@/lib/seo/site';
import bn from '../../../../../messages/admin-erp-link.bn.json';
import en from '../../../../../messages/admin-erp-link.en.json';

export const dynamic = 'force-dynamic';

const KEY = 'erpLink';
const HERE = '/admin/settings/erp-link';
const SYNCED = ['orders', 'shipments', 'deliveries', 'returnLists', 'events', 'account', 'summaries', 'fixedCosts'] as const;
const KINDS = ['NOT_OUT', 'OUT', 'ADVANCE', 'UNPAID'] as const;

/** The admin dictionary with this page's words (`erpLink.*`), the Books forms' words and this page's refusals. */
function withScreen(view: AdminView): AdminView {
  const own = (view.lang === 'bn' ? bn : en) as unknown as { erpLink: Dict & { err: Dict } };
  const books = withBooks(view);
  return { ...books, dict: mergeDicts(books.dict, { erpLink: own.erpLink, bk: { err: own.erpLink.err } }) };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'erpLink.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ErpLinkPage({ searchParams }: { searchParams: Search }) {
  const storeId = storeOfSearch(await searchParams);
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('vault.read', deps, storeId)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(booksHref(storeId, HERE))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="vault.read" />
      </div>
    );
  const canWrite = access.guard.permissions?.has('vault.write') ?? false;
  // qa-gate N2: a store that does not exist (or is archived) has no ERP link page.
  if (!(await access.deps.db.store.findFirst({ where: { id: storeId, status: { not: 'ARCHIVED' } }, select: { id: true } }))) notFound();
  const who: inv.Who = { actor: access.guard.actor, storeId, ctx: access.guard.ctx };
  const [site, currency] = await Promise.all([siteAddress(storeId), access.deps.resolver.value('store.currency', { storeId })]);
  const v = await erpLinkView(access.deps, who, site.origin?.origin ?? null, canWrite);
  const s = v.state;
  const d = view.dict;
  const e = (key: string, vars?: Record<string, string | number>) => t(d, `erpLink.${key}`, vars);
  const bd = { bk: d.bk as Dict };
  const money = moneyOf(currency as string, view.locale);
  const m = (minor: number | null | undefined) => (minor == null ? '—' : formatMoney(minor, money));
  const n = (x: number) => formatNumber(x, view.locale);
  const dayFmt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' });
  const stamp = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const day = (ymd: string | null | undefined) => (ymd ? dayFmt.format(new Date(`${ymd}T00:00:00Z`)) : '—');
  const at = (x: Date | string | null | undefined) => (x ? stamp.format(new Date(x)) : e('synced.never'));
  const api = `/api/admin/erp-link?storeId=${storeId}`;

  const dry = s.switchOver.lastDryRun;
  const plan = (dry?.plan ?? null) as Partial<inv.SwitchPlan> | null;
  const dryFresh = v.dryRunFresh;
  const switched = s.model === 'v6' && Boolean(s.link?.switchedAt);
  const kindCount = (k: (typeof KINDS)[number]) => (plan?.orders ?? []).filter((o) => o.kind === k).length;
  // CN-033: the way the store switches now, and the way the last dry run saw (a report from before CN-033 is the ERP's list).
  const mode = s.switchOver.mode;
  const fresh = mode === 'fresh-start';
  const planFresh = plan?.mode === 'fresh-start';

  const picker =
    v.stores.length > 1 ? (
      <nav className="a2-seg a2-mt12" aria-label={e('storePick')} data-testid="erp-link-stores">
        {v.stores.map((x) => (
          <Link key={x.id} href={booksHref(x.id, HERE)} className={x.id === storeId ? 'on' : undefined} aria-current={x.id === storeId ? 'page' : undefined}>
            {x.name}
          </Link>
        ))}
      </nav>
    ) : null;

  return (
    <div className="a2-z" data-testid="erp-link-page" data-model={s.model} data-store={storeId}>
      <PageHead view={view} place={locateKey(KEY)} title={e('title')} sub={e('sub')} />
      <SectionTabs view={view} current={KEY} />
      {picker}

      <section className="a2-card a2-mt12" data-testid="erp-link-status">
        <div className="a2-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 className="a2-h4">{e('link.title')}</h2>
          <span className={`a2-pill ${s.model === 'v6' ? 'ok' : 'line'}`} data-testid="erp-link-model">
            {e(`model.${s.model}`)}
          </span>
        </div>
        {s.link ? (
          <ul className="a2-stack a2-mt6">
            <li className="a2-between a2-sm" style={{ gap: 8 }}>
              <span>{e('link.epoch', { n: n(s.link.epoch) })}</span>
              <span className="a2-mono" lang="en" translate="no">
                {s.link.erpCompanyId ?? '—'}
              </span>
            </li>
            <li className="a2-between a2-sm" style={{ gap: 8 }}>
              <span>{e('link.switchDate')}</span>
              <b>{s.link.switchDate ? day(s.link.switchDate) : e('link.notYet')}</b>
            </li>
            <li className="a2-between a2-sm" style={{ gap: 8 }}>
              <span>{e('link.switchedAt')}</span>
              <b>{s.link.switchedAt ? at(s.link.switchedAt) : e('link.notYet')}</b>
            </li>
            <li className="a2-between a2-sm" style={{ gap: 8 }}>
              <span>{e('link.opening')}</span>
              <b className="a2-num">{s.link.openingBalanceMinor == null ? e('link.notYet') : m(s.link.openingBalanceMinor)}</b>
            </li>
          </ul>
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{e('link.none')}</p>
        )}
      </section>

      <div className="a2-mt12" data-testid="erp-link-keys">
        <Integrations dict={d} initial={v.connections} canWrite={canWrite} vaultReady={v.vaultReady} locale={view.locale} timeZone={view.timeZone} storeId={storeId} title={e('keys.title')} sub={e('keys.sub')} look="a2" />
      </div>

      <div className="a2-row a2-r2 a2-start a2-mt12">
        <section className="a2-card" data-testid="erp-link-synced">
          <h2 className="a2-h4">{e('synced.title')}</h2>
          <ul className="a2-stack a2-mt6">
            {SYNCED.map((k) => (
              <li key={k} className="a2-between a2-sm" style={{ gap: 8 }} data-synced={k}>
                <span>{e(`synced.${k}`)}</span>
                <span className="a2-mute">{at(s.synced[k])}</span>
              </li>
            ))}
          </ul>
          <h3 className="a2-sm a2-mt12" style={{ fontWeight: 650 }}>
            {e('lastSummary.title')}
          </h3>
          <p className="a2-sm a2-mute a2-mt6" data-testid="erp-link-last-summary">
            {s.lastSummary ? e('lastSummary.line', { date: day(s.lastSummary.date), n: n(s.lastSummary.version), at: at(s.lastSummary.acceptedAt) }) : e('lastSummary.none')}
          </p>
        </section>
        <section className="a2-card" data-testid="erp-link-queues">
          <h2 className="a2-h4">{e('queues.title')}</h2>
          <ul className="a2-stack a2-mt6">
            {(['ordersWaiting', 'ordersHeld', 'ordersFailed', 'exchangesOpen', 'summariesWaiting'] as const).map((k) => (
              <li key={k} className="a2-between a2-sm" style={{ gap: 8 }}>
                <span>{e(`queues.${k}`)}</span>
                <b className={`a2-num${k === 'ordersFailed' && s.queues[k] ? ' a2-bad' : ''}`}>{n(s.queues[k])}</b>
              </li>
            ))}
          </ul>
          {s.queues.heldAtSwitch.length ? (
            <div className="a2-mt12" data-testid="erp-link-held">
              <h3 className="a2-sm" style={{ fontWeight: 650 }}>
                {e('queues.heldTitle')}
              </h3>
              <p className="a2-xs a2-mute a2-mt6">{e('queues.heldSub')}</p>
              <ul className="a2-stack a2-mt6">
                {s.queues.heldAtSwitch.map((h) => (
                  <li key={h.orderId} className="a2-between a2-sm" style={{ gap: 8, flexWrap: 'wrap' }} data-testid="erp-link-held-order">
                    <span className="a2-mono" lang="en" translate="no">
                      {h.externalOrderId ?? h.orderId.slice(0, 8)}
                    </span>
                    {canWrite && s.model === 'v6' ? (
                      <BooksForm dict={bd} url={api} body={{ action: 'sendHeld', orderId: h.orderId }} fields={[]} label={e('queues.send')} busyLabel={e('queues.sendBusy')} sendLabel={e('queues.sendYes')} warn={e('queues.sendWarn')} done={e('queues.sent')} tone="ghost" testId="erp-link-send-held" />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <div className="a2-row a2-r2 a2-start a2-mt12">
        <section className="a2-card" data-testid="erp-link-balance">
          <h2 className="a2-h4">{e('balance.title')}</h2>
          <div className="a2-kpis a2-mt6">
            <div className="a2-card a2-kpi">
              <div className="a2-kl">{e('balance.shop')}</div>
              <div className="a2-kv a2-num">{m(s.balance.shopMinor)}</div>
            </div>
            <div className="a2-card a2-kpi">
              <div className="a2-kl">{e('balance.erp')}</div>
              <div className={`a2-kv a2-num${s.balance.erpMinor != null && s.balance.shopMinor != null && s.balance.erpMinor !== s.balance.shopMinor ? ' a2-bad' : ''}`}>{m(s.balance.erpMinor)}</div>
            </div>
          </div>
          <p className="a2-xs a2-mute a2-mt6">{s.balance.checkedAt ? e('balance.checked', { at: at(s.balance.checkedAt) }) : e('balance.notChecked')}</p>
          {s.balance.onHold ? <span className="a2-pill gold a2-mt6">{e('balance.onHold')}</span> : null}
        </section>
        <section className="a2-card" data-testid="erp-link-books">
          <h2 className="a2-h4">{e('books.title')}</h2>
          <ul className="a2-stack a2-mt6">
            <li className="a2-between a2-sm" style={{ gap: 8 }}>
              <span>{e('books.lastClose')}</span>
              <b>{s.books.lastClose ? `${day(s.books.lastClose.date)} · ${t(d, `bk.result.${s.books.lastClose.result}`)}` : e('books.none')}</b>
            </li>
            <li className="a2-between a2-sm" style={{ gap: 8 }}>
              <span>{e('books.open')}</span>
              <span className={`a2-pill ${s.books.openDifferences ? 'bad' : 'ok'}`}>{n(s.books.openDifferences)}</span>
            </li>
          </ul>
          <Link className="a2-btn sm ghost a2-mt12" href={booksHref(storeId, '/admin/money/books/match')}>
            {e('books.openLink')}
          </Link>
        </section>
      </div>

      <section className="a2-card a2-mt12" data-testid="erp-link-switch" data-switched={switched ? 'yes' : 'no'}>
        <h2 className="a2-h4">{e('switch.title')}</h2>
        {switched ? (
          <p className="a2-sm a2-mt6">
            <span className="a2-pill ok">{e('switch.v6Done', { date: day(s.link?.switchDate) })}</span>
          </p>
        ) : (
          <>
            <p className="a2-sm a2-mute a2-mt6">{e(fresh ? 'switch.subFresh' : 'switch.sub')}</p>
            <div className="a2-mt12" data-testid="erp-link-mode" data-mode={mode}>
              <p className="a2-sm">
                {e('switch.mode.now')} <span className={`a2-pill ${fresh ? 'ok' : 'line'}`}>{e(`switch.mode.${mode}`)}</span>
              </p>
              <p className="a2-xs a2-mute a2-mt6">{e(`switch.mode.${mode}Hint`)}</p>
              {v.owner ? (
                <div className="a2-mt6">
                  <BooksForm
                    dict={bd}
                    url={api}
                    body={{ action: 'setMode' }}
                    fields={[{ name: 'mode', label: e('switch.mode.field'), kind: 'select', value: mode, options: (['fresh-start', 'erp-list'] as const).map((x) => ({ value: x, label: e(`switch.mode.${x}`) })) }]}
                    label={e('switch.mode.change')}
                    busyLabel={e('switch.mode.busy')}
                    sendLabel={e('switch.mode.send')}
                    warn={e('switch.mode.warn')}
                    done={e('switch.mode.done')}
                    tone="ghost"
                    testId="erp-link-mode-set"
                  />
                </div>
              ) : null}
            </div>
            <div className="a2-mt12" data-testid="erp-link-dry">
              <p className="a2-sm">{dry ? e('switch.lastDry', { at: at(dry.createdAt) }) : e('switch.noDry')}</p>
              {dry ? (
                dry.ok ? (
                  <p className="a2-sm a2-mt6">
                    <span className="a2-pill ok">{e('switch.clean')}</span>
                  </p>
                ) : (
                  <div className="a2-mt6">
                    <p className="a2-sm">{e('switch.blocked')}</p>
                    <ul className="a2-stack a2-mt6" data-testid="erp-link-blockers">
                      {dry.blockers.map((b) => (
                        <li key={b} className="a2-sm" data-blocker={b}>
                          <ShellIcon name="info" size={14} /> {t(d, `erpLink.blocker.${b}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              ) : null}
              {dry && dry.ok && !dryFresh ? <p className="a2-xs a2-note a2-mt6">{e('switch.stale', { h: n(s.switchOver.dryRunMaxHours) })}</p> : null}
              {plan ? (
                <ul className="a2-stack a2-mt12" data-testid="erp-link-report" data-mode={planFresh ? 'fresh-start' : 'erp-list'}>
                  <li className="a2-between a2-sm" style={{ gap: 8 }}>
                    <span>{e('switch.report.switchDate')}</span>
                    <b>{day(plan.switchDate)}</b>
                  </li>
                  <li className="a2-between a2-sm" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span>{e('switch.report.mode')}</span>
                    <b>{e(`switch.mode.${planFresh ? 'fresh-start' : 'erp-list'}`)}</b>
                  </li>
                  <li className="a2-between a2-sm" style={{ gap: 8 }}>
                    <span>{e('switch.report.opening')}</span>
                    <b className="a2-num">{m(plan.openingBalanceMinor)}</b>
                  </li>
                  {planFresh ? (
                    <li className="a2-xs a2-note" data-testid="erp-link-fresh-note">
                      {e('switch.report.freshNote')}
                    </li>
                  ) : (
                    <>
                      <li className="a2-between a2-sm" style={{ gap: 8 }}>
                        <span>{e('switch.report.transfer')}</span>
                        <b className="a2-num">{m(plan.transferMinor ?? 0)}</b>
                      </li>
                      <li className="a2-sm">
                        <span>{e('switch.report.orders')}</span>
                        <div className="a2-gap8 a2-mt6" style={{ flexWrap: 'wrap' }}>
                          {KINDS.map((k) => (
                            <span key={k} className="a2-pill line">
                              {e(`switch.kind.${k}`)} · {n(kindCount(k))}
                            </span>
                          ))}
                        </div>
                      </li>
                      <li className="a2-between a2-sm" style={{ gap: 8 }}>
                        <span>{e('switch.report.backfill')}</span>
                        <b>{n(Object.keys(plan.backfill?.goodsMinor ?? {}).length)}</b>
                      </li>
                    </>
                  )}
                  <li className="a2-between a2-sm" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span>{e('switch.report.queuedV5')}</span>
                    <b>{plan.queuedV5?.count ? `${n(plan.queuedV5.count)} · ${e(`switch.action.${plan.queuedV5.action}`)}` : e('switch.report.noneWord')}</b>
                  </li>
                  <li className="a2-between a2-sm" style={{ gap: 8 }}>
                    <span>{e('switch.report.legacy')}</span>
                    <b>{n(plan.legacyOn?.length ?? 0)}</b>
                  </li>
                </ul>
              ) : null}
              {canWrite ? (
                <div className="a2-mt12">
                  <BooksForm dict={bd} url={api} body={{ action: 'dryRun' }} fields={[]} label={e('switch.dryRun')} busyLabel={e('switch.dryRunBusy')} sendLabel={e('switch.dryRunSend')} warn={e(fresh ? 'switch.dryRunWarnFresh' : 'switch.dryRunWarn')} done={e('switch.dryRunDone')} tone="ghost" testId="erp-link-dryrun" />
                </div>
              ) : null}
            </div>
            {dry?.ok && dryFresh ? (
              <div className="a2-mt12" data-testid="erp-link-go">
                {v.owner ? (
                  <BooksForm
                    dict={bd}
                    url={api}
                    body={{ action: 'switch' }}
                    fields={[
                      { name: 'confirmDate', label: e(planFresh ? 'switch.confirmDateFresh' : 'switch.confirmDate'), kind: 'date', min: 10 },
                      { name: 'pin', label: e('switch.pin'), kind: 'pin', min: 4 },
                    ]}
                    label={e('switch.go')}
                    busyLabel={e('switch.goBusy')}
                    sendLabel={e('switch.goSend')}
                    warn={e('switch.goWarn')}
                    done={e('switch.goDone')}
                    tone="bad"
                    testId="erp-link-switch-go"
                  />
                ) : (
                  <p className="a2-xs a2-mute">{e('switch.ownerOnly')}</p>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>

      <div className="a2-mt12">
        <ErpCalls dict={d} initial={v.erpCalls} canWrite={canWrite} locale={view.locale} timeZone={view.timeZone} storeId={storeId} look="a2" />
      </div>

      {v.owner && s.link ? (
        <section className="a2-card a2-mt12" data-testid="erp-link-new">
          <h2 className="a2-h4">{e('newLink.title')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{e('newLink.sub')}</p>
          <div className="a2-mt12">
            <BooksForm
              dict={bd}
              url={api}
              body={{ action: 'newLink' }}
              fields={[
                { name: 'reason', label: e('newLink.reason'), kind: 'select', value: 'HANDOVER', options: (['HANDOVER', 'OPENING_WRONG'] as const).map((r) => ({ value: r, label: e(`newLink.reasons.${r}`) })) },
                { name: 'note', label: e('newLink.note'), kind: 'text', min: 3, maxLength: 500 },
                { name: 'pin', label: e('newLink.pin'), kind: 'pin', min: 4 },
              ]}
              label={e('newLink.btn')}
              busyLabel={e('newLink.busy')}
              sendLabel={e('newLink.send')}
              warn={e('newLink.warn')}
              done={e('newLink.done')}
              tone="ghost"
              testId="erp-link-newlink"
            />
          </div>
        </section>
      ) : null}

      {v.demoKey.canEdit || v.demoKey.saved ? (
        <section className="a2-card a2-mt12" data-testid="erp-link-demo" data-saved={v.demoKey.saved ? 'yes' : 'no'}>
          <h2 className="a2-h4">{e('demo.title')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{e('demo.sub')}</p>
          <p className="a2-sm a2-mt6" data-testid="erp-link-demo-state">
            {v.demoKey.saved && v.demoKey.savedAt ? e('demo.saved', { at: at(v.demoKey.savedAt) }) : e('demo.missing')}
          </p>
          {v.demoKey.canEdit ? (
            <div className="a2-row a2-gap8 a2-wrap a2-mt12">
              <BooksForm
                dict={bd}
                url={api}
                body={{ action: 'demoKey' }}
                fields={[{ name: 'key', label: e('demo.key'), kind: 'secret', min: 8, maxLength: 512 }]}
                label={v.demoKey.saved ? e('demo.replace') : e('demo.save')}
                busyLabel={e('demo.busy')}
                sendLabel={e('demo.send')}
                warn={e('demo.warn')}
                done={e('demo.done')}
                tone="ghost"
                testId="erp-link-demo-key"
              />
              {v.demoKey.saved ? (
                <BooksForm dict={bd} url={api} body={{ action: 'demoKeyRemove' }} fields={[]} label={e('demo.remove')} busyLabel={e('demo.busy')} sendLabel={e('demo.removeSend')} warn={e('demo.removeWarn')} done={e('demo.removed')} tone="ghost" testId="erp-link-demo-remove" />
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="ad-note a2-mt12">
        <ShellIcon name="shield" size={16} />
        <div>{e('note')}</div>
      </div>
    </div>
  );
}
