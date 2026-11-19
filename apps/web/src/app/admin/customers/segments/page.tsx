// S14 · PR 287 — Customers › Segments at /admin/customers/segments (CUS-03, docs/BACKEND-ARCHITECTURE.md §5.5; demo V12.4
// #/admin/customers/segments): the store's saved segments with how many people match each right now, the built-in
// segments (the Customers list's own views, each opening that view), the archived ones under "More options" with
// Restore, and the page's settings card. Off as shipped (`customers.segments`): the page then says so and counts
// nothing. Seeing needs `customers.read`; New, archive, restore and the settings need `customers.segments.write`, which
// the API checks again. A segment never sends anything by itself; nothing is deleted.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CustomerAct } from '@/components/admin/customers/CustomerAct';
import { SegmentSettings } from '@/components/admin/customers/SegmentSettings';
import { formatNumber } from '@/components/admin/products/model';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { customersHref } from '@/lib/admin-customers/model';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t, type Dict } from '@/lib/i18n';
import './segments.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/customers/segments';

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(await adminView());
  return { title: `${t(view.dict, 'cus.seg.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function SegmentsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('customers.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="customersSegments" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="customers.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const s = await cu.segmentsScreen(customersDeps(access.deps), who);
  const canWrite = s.viewer.segments;
  const n = (x: number | null) => (x === null ? '—' : formatNumber(x, view.locale));
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium' });
  const cdict: Dict = { cus: d.cus as Dict };
  // PR 801: the prototype's five ready-made groups first (VIP, At risk, Repeat, New, Refuser); the other built-in views stay in a list below
  const READY = ['vip', 'atrisk', 'returning', 'new', 'refused'] as const;
  const readyMade = READY.flatMap((id) => s.builtIn.filter((b) => b.id === id));
  const otherViews = s.builtIn.filter((b) => !(READY as readonly string[]).includes(b.id));
  const sub = (r: cu.SegmentRow) => [r.readable ? t(d, 'cus.seg.conds', { n: formatNumber(r.conditions, view.locale) }) : t(d, 'cus.seg.unreadable'), t(d, 'cus.seg.changed', { at: when.format(r.updatedAt) })].join(' · ');

  // PR 1123 (prototype v5): the ready-made groups are list views that work whether or not saved groups are on
  const readyCards = (
    <>
            {readyMade.map((b) => (
        <section key={b.id} className="a2-card seg-card" data-testid="seg-builtin-row">
          <div className="a2-between">
            <b>{t(d, `cus.list.view.${b.id}`)}</b>
            <span className="a2-pill line">{t(d, 'cus.seg.readyMade')}</span>
          </div>
          <div>
            <span className="seg-big">{n(b.count)}</span> <span className="a2-sm a2-mute">{t(d, 'cus.seg.customersWord')}</span>
          </div>
          <p className="a2-xs a2-mute">{t(d, 'cus.seg.live')}</p>
          <div className="a2-gap8 seg-acts">
            <Link className="a2-btn sm pri" href="/admin/messages/campaigns" data-testid="seg-camp">
              {t(d, 'cus.seg.campaignBtn')}
            </Link>
            <Link className="a2-btn sm" href={customersHref({}, { view: b.id })}>
              {t(d, 'cus.seg.export')}
            </Link>
          </div>
        </section>
      ))}
    </>
  );
  return (
    <div className="a2-z" data-testid="customers-segments" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey('customersSegments')}
        title={t(d, 'cus.seg.title')}
        sub={t(d, 'cus.seg.sub')}
        right={
          canWrite ? (
            // PR 1123 (prototype v5): "Create group" is always in the head; while groups are off it opens the switch under More options
            <Link className="a2-btn pri" href={s.enabled ? `${HERE}/new` : '#seg-more'} data-testid="seg-new">
              <ShellIcon name="plus" size={15} />
              {t(d, 'cus.seg.new')}
            </Link>
          ) : null
        }
      />
      <SectionTabs view={view} current="customersSegments" />
      {!s.enabled ? (
        <>
        <section className="a2-card a2-mt12" data-testid="seg-off">
          <h2 className="a2-h3">{t(d, 'cus.seg.offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{t(d, canWrite ? 'cus.seg.offBody' : 'cus.seg.offAsk')}</p>
        </section>
        <div className="a2-row a2-r3 a2-mt12 seg-cards" data-testid="seg-ready-off">
          {readyCards}
        </div>
        </>
      ) : (
        <>
          {/* PR 801: the prototype's group cards — ready-made first, then the owner's own; each with its count, a Send campaign link, Export and Remove */}
          <div className="a2-row a2-r3 a2-mt12 seg-cards" data-testid="seg-own">
            {readyCards}
            {s.segments.map((r) => (
              <section key={r.id} className="a2-card seg-card" data-testid="seg-row">
                <div className="a2-between">
                  <Link className="a2-b" href={`${HERE}/${r.id}`}>
                    {r.name}
                  </Link>
                  <span className="a2-pill info">{t(d, 'cus.seg.yours')}</span>
                </div>
                <div>
                  <span className="seg-big">{n(r.count)}</span> <span className="a2-sm a2-mute">{t(d, 'cus.seg.customersWord')}</span>
                </div>
                <p className="a2-xs a2-mute">{sub(r)}</p>
                <div className="a2-gap8 seg-acts">
                  <Link className="a2-btn sm pri" href="/admin/messages/campaigns" data-testid="seg-camp">
                    {t(d, 'cus.seg.campaignBtn')}
                  </Link>
                  <Link className="a2-btn sm" href={customersHref({ segment: r.id })}>
                    {t(d, 'cus.seg.export')}
                  </Link>
                  {canWrite ? (
                    <CustomerAct
                      dict={cdict}
                      url={`/api/admin/customers/segments/${r.id}/archive`}
                      body={{ archived: true }}
                      label={t(d, 'cus.seg.remove')}
                      tone="ghost"
                      testId="seg-archive-card"
                      ask={{ title: t(d, 'cus.seg.archiveAsk'), effects: [t(d, 'cus.seg.archiveEff1'), t(d, 'cus.seg.archiveEff2')], confirm: t(d, 'cus.seg.archiveYes') }}
                    />
                  ) : null}
                </div>
              </section>
            ))}
          </div>
          {!s.segments.length ? <p className="a2-sm a2-mute a2-mt12">{t(d, canWrite ? 'cus.seg.noneYet' : 'cus.seg.noneYetRead')}</p> : null}
          <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.seg.ofMost', { n: n(s.segments.length), max: n(s.settings.maxSegments) })}</p>
          {otherViews.length ? (
            <section className="a2-card seg-list a2-mt12" data-testid="seg-builtin">
              <h2 className="a2-h3">{t(d, 'cus.seg.builtIn')}</h2>
              <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.seg.builtInSub')}</p>
              <div className="a2-mt6">
                {otherViews.map((b) => (
                  <Link key={b.id} className="a2-prow" href={customersHref({}, { view: b.id })}>
                    <div className="a2-prt">
                      <b>{t(d, `cus.list.view.${b.id}`)}</b>
                      <span>{t(d, 'cus.seg.live')}</span>
                    </div>
                    <span className="a2-prs">{n(b.count)}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
      <details id="seg-more" className="a2-mt12 a2-more-opts" open={!s.enabled && canWrite} data-testid="seg-more">
        <summary className="a2-sm a2-b">{t(d, 'cus.seg.more', { n: formatNumber(s.archived.length, view.locale) })}</summary>
        <div className="a2-row a2-r2 a2-mt12">
          <section className="a2-card">
            <h2 className="a2-h3">{t(d, 'cus.seg.settings')}</h2>
            <div className="a2-mt12">
              <SegmentSettings dict={cdict} value={{ enabled: s.enabled, ...s.settings }} canWrite={canWrite} />
            </div>
          </section>
          <section className="a2-card seg-list" data-testid="seg-archived">
            <h2 className="a2-h3">{t(d, 'cus.seg.archived')}</h2>
            <div className="a2-mt6">
              {s.archived.length ? (
                s.archived.map((r) => (
                  <div key={r.id} className="a2-prow">
                    <div className="a2-prt">
                      <b>{r.name}</b>
                      <span>{r.archivedAt ? t(d, 'cus.seg.archivedAt', { at: when.format(r.archivedAt) }) : ''}</span>
                    </div>
                    {canWrite && s.enabled ? <CustomerAct dict={cdict} url={`/api/admin/customers/segments/${r.id}/archive`} body={{ archived: false }} label={t(d, 'cus.seg.restore')} tone="ghost" testId="seg-restore" /> : null}
                  </div>
                ))
              ) : (
                <p className="a2-sm a2-mute">{t(d, 'cus.seg.noArchived')}</p>
              )}
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
