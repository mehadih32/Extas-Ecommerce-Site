// S14 · PR 284 — Customers → To review (CUS-05, docs/BACKEND-ARCHITECTURE.md §5.5; demo V12.4 #/admin/customers/review):
// "Same person?" — the pairs the owner's merge rules find (`customers.merge`: the same e-mail, a WhatsApp number that is
// the other's phone, the same name with the same address, the same identity in orders), each side by side with Merge
// and "Not the same person"; "Decisions made" — every merge, split and dismissal with who and why, and Split / Take back
// with a reason. `?a=&b=` shows two profiles side by side for a person's own merge (a customer's "Merge with…").
// Seeing needs `customers.read` (numbers masked without `customers.phone`); deciding needs `customers.merge`, which
// the API checks again. Nothing is deleted and no money moves.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CustomerAct } from '@/components/admin/customers/CustomerAct';
import { PairCard } from '@/components/admin/customers/PairCard';
import { formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t, type Dict } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/customers/review';
const VIEWS = ['suggest', 'done'] as const;
type ReviewView = (typeof VIEWS)[number];

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(await adminView());
  return { title: `${t(view.dict, 'cus.review.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="a2-state a2-mt12" data-testid="review-empty">
      <div className="a2-sti">
        <ShellIcon name="users" size={26} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export default async function CustomersReviewPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('customers.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(plain);
  const d = view.dict;
  const tab: ReviewView = (VIEWS as readonly string[]).includes(one(sp.view)) ? (one(sp.view) as ReviewView) : 'suggest';
  const [ha, hb] = [one(sp.a), one(sp.b)];
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="customersReview" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="customers.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const cd = customersDeps(access.deps);
  const canMerge = access.guard.permissions?.has('customers.merge') ?? false;
  const [suggest, decisions, hand, rules, currency] = await Promise.all([
    cu.mergeSuggestions(cd, who),
    cu.mergeDecisions(cd, who),
    ha && hb ? cu.mergePreview(cd, who, ha, hb) : Promise.resolve(null),
    cd.settings.value('customers.merge', { storeId: MOTHER_STORE_ID }),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
  ]);
  const money = moneyOf(currency, view.locale);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium' });
  const stamp = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium', timeStyle: 'short' });
  const n = (x: number) => formatNumber(x, view.locale);
  const cdict: Dict = { cus: d.cus as Dict };
  const counts: Record<ReviewView, number> = { suggest: suggest.total, done: decisions.length };
  const nameOf = (x: { name: string | null }) => x.name ?? t(d, 'cus.side.noName');
  const moreLeft = suggest.total - suggest.pairs.length > 0;

  return (
    <div className="a2-z" data-testid="customers-review">
      <PageHead view={view} place={locateKey('customersReview')} title={t(d, 'cus.review.title')} sub={t(d, 'cus.review.sub')} />
      <SectionTabs view={view} current="customersReview" />
      {!canMerge ? <p className="a2-xs a2-mute a2-mt12">{t(d, 'cus.review.readOnly')}</p> : null}
      {ha && hb ? (
        hand ? (
          <PairCard view={view} pair={hand} canMerge={canMerge} noteRequired={rules.noteRequired} money={money} when={when} title={t(d, 'cus.review.hand')} />
        ) : (
          <section className="a2-card a2-mt12" data-testid="review-hand-none">
            <p className="a2-sm a2-mute">{t(d, 'cus.review.handNone')}</p>
          </section>
        )
      ) : null}
      <nav className="a2-views a2-mt12" aria-label={t(d, 'cus.review.viewsAria')} data-testid="review-views">
        {VIEWS.map((v) => (
          <Link key={v} className={`a2-view${v === tab ? ' on' : ''}`} href={v === 'suggest' ? HERE : `${HERE}?view=${v}`} aria-current={v === tab ? 'page' : undefined} scroll={false} data-view={v}>
            {t(d, `cus.review.view.${v}`)}
            <span className="a2-cnt">{n(counts[v])}</span>
          </Link>
        ))}
      </nav>
      {tab === 'suggest' ? (
        !suggest.enabled ? (
          <section className="a2-card a2-mt12" data-testid="review-off">
            <p className="a2-sm a2-mute">{t(d, 'cus.review.off')}</p>
          </section>
        ) : !suggest.signals.length ? (
          <section className="a2-card a2-mt12" data-testid="review-off">
            <p className="a2-sm a2-mute">{t(d, 'cus.review.noRules')}</p>
          </section>
        ) : suggest.pairs.length ? (
          <div data-testid="review-pairs">
            {suggest.pairs.map((p) => (
              <PairCard key={p.key} view={view} pair={p} canMerge={canMerge} noteRequired={rules.noteRequired} money={money} when={when} />
            ))}
            {moreLeft ? <p className="a2-xs a2-mute a2-mt12">{t(d, 'cus.review.more', { shown: n(suggest.pairs.length), total: n(suggest.total) })}</p> : null}
          </div>
        ) : (
          <Empty title={t(d, 'cus.review.empty')} body={t(d, 'cus.review.emptyBody')} />
        )
      ) : decisions.length ? (
        <div className="a2-stack a2-mt12" data-testid="review-decisions">
          {decisions.map((r) => (
            <section key={r.id} className="a2-card tight" data-testid="decision-row" data-decision={r.decision}>
              <div className="a2-between">
                <div>
                  <div className="a2-gap8">
                    <span className={`a2-pill ${r.decision === 'MERGED' ? 'ok' : 'line'}`}>{t(d, `cus.decision.${r.decision}`)}</span>
                    {r.signals.map((s) => (
                      <span key={s} className="a2-pill line">
                        {t(d, `cus.signal.${s}`)}
                      </span>
                    ))}
                  </div>
                  <div className="a2-sm a2-mt6">
                    <b>{r.decision === 'MERGED' ? t(d, 'cus.decision.into', { merged: nameOf(r.merged), survivor: nameOf(r.survivor) }) : t(d, 'cus.decision.pair', { a: nameOf(r.survivor), b: nameOf(r.merged) })}</b>
                  </div>
                  <div className="a2-xs a2-mute a2-mt6">
                    {stamp.format(r.at)} · {t(d, 'cus.decision.by', { by: r.by ?? t(d, 'cus.decision.system') })}
                    {r.note ? ` · ${r.note}` : ''}
                  </div>
                  {r.undone ? <div className="a2-xs a2-mt6">{t(d, 'cus.decision.undone', { at: stamp.format(r.undone.at), by: r.undone.by ?? t(d, 'cus.decision.system'), note: r.undone.note ?? '' })}</div> : null}
                </div>
                {canMerge && !r.undone ? (
                  <div className="a2-cmds">
                    <CustomerAct
                      dict={cdict}
                      url={`/api/admin/customers/merges/${r.id}/undo`}
                      label={t(d, r.decision === 'MERGED' ? 'cus.decision.split' : 'cus.decision.undo')}
                      busyLabel={t(d, 'cus.decision.undoBusy')}
                      note={{ field: 'note', label: t(d, 'cus.decision.undoNote'), min: 3 }}
                      tone="ghost"
                      testId="decision-undo"
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty title={t(d, 'cus.review.emptyDone')} body={t(d, 'cus.review.emptyDoneBody')} />
      )}
    </div>
  );
}
