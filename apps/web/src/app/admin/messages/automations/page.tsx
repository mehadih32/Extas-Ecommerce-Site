// S14 · PR 289 — Messages › Automations at /admin/messages/automations (MSG-02's ready-made journeys: the product-life
// reminder, the win-back, the welcome; docs/BACKEND-ARCHITECTURE.md §5.7; SIM-F-032): the store's customer journeys,
// each with what starts it, its steps, on or off, how many people are on it, finished it or left it, and the messages
// sent; "New journey"; the archived ones and the page's settings under "More options". Off as shipped
// (`customers.journeys`): the page then says so. Seeing needs `messages.journey.read`; New, the switches and the settings
// need `messages.automations.write`, which the API checks again. A journey's message is an offer: it goes only with the
// customer's yes for offers on that channel, outside the quiet hours, within the weekly cap. Nothing is deleted.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CrmSettingCard, type CrmField } from '@/components/admin/customers/CrmSettingCard';
import { CustomerAct } from '@/components/admin/customers/CustomerAct';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { withMessages } from '@/lib/admin-messages/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t, type Dict } from '@/lib/i18n';
import './automations.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/messages/automations';
const KEY = 'messagesAutomations';
const FIELDS: readonly CrmField[] = [
  { name: 'enabled', kind: 'bool' },
  { name: 'perCustomerPerWeek', kind: 'int' },
  { name: 'catchUpDays', kind: 'int' },
  { name: 'maxJourneys', kind: 'int' },
  { name: 'maxSteps', kind: 'int' },
  { name: 'batchSize', kind: 'int' },
  { name: 'stopLine', kind: 'lang', max: 120 },
];

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(withMessages(await adminView()));
  return { title: `${t(view.dict, 'cus.auto.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AutomationsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('messages.journey.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(withMessages(plain));
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="messages.journey.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const s = await cu.journeysScreen(customersDeps(access.deps), who);
  const n = (x: number) => formatNumber(x, view.locale);
  const cdict: Dict = { cus: d.cus as Dict };
  const what = (r: cu.AutomationRow) =>
    [r.trigger ? t(d, `cus.auto.when.${r.trigger.type}`, { n: n(r.trigger.days) }) : t(d, 'cus.auto.unreadable'), t(d, 'cus.auto.stepsLine', { steps: n(r.steps), sends: n(r.sends) }), t(d, 'cus.auto.peopleLine', { active: n(r.active), done: n(r.done), exited: n(r.exited) })].join(' · ');

  return (
    <div className="a2-z" data-testid="messages-automations">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={t(d, 'cus.auto.title')}
        sub={t(d, 'cus.auto.sub')}
        right={
          s.enabled && s.canWrite ? (
            <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="auto-new">
              {t(d, 'cus.auto.new')}
            </Link>
          ) : null
        }
      />
      <SectionTabs view={view} current={KEY} />
      {!s.enabled ? (
        <section className="a2-card a2-mt12" data-testid="auto-off">
          <h2 className="a2-h3">{t(d, 'cus.auto.offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{t(d, s.canWrite ? 'cus.auto.offBody' : 'cus.auto.offAsk')}</p>
        </section>
      ) : (
        <section className="a2-card a2-mt12 auto-list" data-testid="auto-list">
          <h2 className="a2-h3">{t(d, 'cus.auto.own')}</h2>
          <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.auto.offerNote')}</p>
          <div className="a2-mt6">
            {s.journeys.length ? (
              s.journeys.map((r) => (
                <Link key={r.id} className="a2-prow" href={`${HERE}/${r.id}`} data-testid="auto-row">
                  <div className="a2-prt">
                    <b>{r.name}</b>
                    <span>{what(r)}</span>
                  </div>
                  <span className="a2-prs">
                    <span className={`a2-pill ${r.enabled ? 'ok' : 'line'}`}>{t(d, r.enabled ? 'cus.auto.on' : 'cus.auto.offWord')}</span> {t(d, 'cus.auto.sent', { n: n(r.sent) })}
                  </span>
                </Link>
              ))
            ) : (
              <p className="a2-sm a2-mute">{t(d, s.canWrite ? 'cus.auto.noneYet' : 'cus.auto.noneYetRead')}</p>
            )}
          </div>
          <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.auto.ofMost', { n: n(s.journeys.length), max: n(s.settings.maxJourneys) })}</p>
        </section>
      )}
      <details className="a2-mt12 a2-more-opts" data-testid="auto-more">
        <summary className="a2-sm a2-b">{t(d, 'cus.auto.more', { n: n(s.archived.length) })}</summary>
        <div className="a2-row a2-r2 a2-mt12">
          <CrmSettingCard dict={cdict} settingKey="customers.journeys" card="automations" fields={FIELDS} value={s.settings as unknown as Record<string, unknown>} canWrite={s.canWrite} url="/api/admin/messages/automations/settings" />
          <section className="a2-card auto-list" data-testid="auto-archived">
            <h2 className="a2-h3">{t(d, 'cus.auto.archived')}</h2>
            <div className="a2-mt6">
              {s.archived.length ? (
                s.archived.map((r) => (
                  <div key={r.id} className="a2-prow">
                    <div className="a2-prt">
                      <b>{r.name}</b>
                      <span>{what(r)}</span>
                    </div>
                    {s.canWrite && s.enabled ? <CustomerAct dict={cdict} url={`/api/admin/messages/automations/${r.id}/archive`} body={{ archived: false }} label={t(d, 'cus.auto.restore')} tone="ghost" testId="auto-restore" /> : null}
                  </div>
                ))
              ) : (
                <p className="a2-sm a2-mute">{t(d, 'cus.auto.noArchived')}</p>
              )}
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
