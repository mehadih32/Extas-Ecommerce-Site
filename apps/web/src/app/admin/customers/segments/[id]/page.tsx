// S14 · PR 287 — one segment's builder at /admin/customers/segments/<id> (CUS-03a; demo V12.4
// #/admin/customers/segments/:id): `new` makes one (`?from=<id>` starts as a copy of a saved one), a saved one opens
// with its conditions, the live count and its first people, "Open in Customers list", Copy, and Archive (Restore is on
// the Segments page). While segments are off the page says so. Seeing needs `customers.read`; saving and archiving need
// `customers.segments.write`, which the API checks again.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CustomerAct } from '@/components/admin/customers/CustomerAct';
import { SegmentBuilder } from '@/components/admin/customers/SegmentBuilder';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { draftRows } from '@/lib/admin-customers/segment-draft';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t, type Dict } from '@/lib/i18n';
import '../segments.css';

export const dynamic = 'force-dynamic';

const BASE = '/admin/customers/segments';

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(await adminView());
  return { title: `${t(view.dict, 'cus.seg.b.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function SegmentPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const deps = adminDeps();
  const [plain, { id }, sp, access] = await Promise.all([adminView(deps), params, searchParams, pageAccess('customers.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(plain);
  const d = view.dict;
  const here = `${BASE}/${encodeURIComponent(id)}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="customersSegments" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="customers.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const cd = customersDeps(access.deps);
  const isNew = id === 'new';
  const from = isNew ? one(sp.from) : '';
  const [page, source, settings, options, currency] = await Promise.all([
    isNew ? Promise.resolve(null) : cu.segmentPage(cd, who, id),
    from ? cu.segmentPage(cd, who, from) : Promise.resolve(null),
    cd.settings.value('customers.segments', { storeId: MOTHER_STORE_ID }),
    cu.segmentOptions(cd, who),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
  ]);
  if (!isNew && !page)
    return (
      <div className="a2-z">
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const money = moneyOf(currency, view.locale);
  const canWrite = access.guard.permissions?.has('customers.segments.write') ?? false;
  const seg = page?.segment ?? null;
  const cdict: Dict = { cus: d.cus as Dict, orders: d.orders as Dict };
  const title = seg ? seg.name : t(d, 'cus.seg.b.newTitle');
  const back = (
    <Link className="a2-b" href={BASE}>
      {t(d, 'cus.seg.title')}
    </Link>
  );
  return (
    <div className="a2-z" data-testid="customer-segment">
      <PageHead
        view={view}
        place={locateKey('customersSegments')}
        crumb={back}
        title={title}
        sub={t(d, 'cus.seg.b.sub')}
        right={
          seg && !seg.archivedAt && settings.enabled ? (
            <span className="a2-gap8">
              {canWrite ? (
                <Link className="a2-btn" href={`${BASE}/new?from=${seg.id}`} data-testid="seg-copy">
                  {t(d, 'cus.seg.copy')}
                </Link>
              ) : null}
              {canWrite ? (
                <CustomerAct
                  dict={cdict}
                  url={`/api/admin/customers/segments/${seg.id}/archive`}
                  body={{ archived: true }}
                  label={t(d, 'cus.seg.archive')}
                  ask={{ title: t(d, 'cus.seg.archiveAsk'), effects: [t(d, 'cus.seg.archiveEff1'), t(d, 'cus.seg.archiveEff2')], confirm: t(d, 'cus.seg.archiveYes') }}
                  tone="ghost"
                  testId="seg-archive"
                />
              ) : null}
            </span>
          ) : null
        }
      />
      <SectionTabs view={view} current="customersSegments" />
      {!settings.enabled ? (
        <section className="a2-card a2-mt12" data-testid="seg-off">
          <h2 className="a2-h3">{t(d, 'cus.seg.offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{t(d, canWrite ? 'cus.seg.offBody' : 'cus.seg.offAsk')}</p>
        </section>
      ) : seg?.archivedAt ? (
        <section className="a2-card a2-mt12" data-testid="seg-archived-note">
          <p className="a2-sm a2-mute">{t(d, 'cus.seg.b.archivedNote')}</p>
        </section>
      ) : seg && !seg.definition ? (
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute">{t(d, 'cus.seg.unreadable')}</p>
        </section>
      ) : (
        <SegmentBuilder
          key={seg ? seg.version : `new-${from}`}
          dict={cdict}
          lang={view.lang}
          locale={view.locale}
          money={money}
          id={seg?.id ?? null}
          version={seg?.version ?? null}
          name={seg ? seg.name : source ? t(d, 'cus.seg.copyName', { name: source.segment.name }) : ''}
          rows={draftRows(seg?.definition ?? source?.segment.definition ?? null, money)}
          options={options}
          canWrite={canWrite}
          maxConditions={settings.maxConditions}
        />
      )}
    </div>
  );
}
