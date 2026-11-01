// S14 · PR 289 — one automation at /admin/messages/automations/<id> (`new` makes one): the builder (journey-rules.ts) with
// its trigger and steps, how many people are on it, finished it, left it, and the messages sent; the on/off switch and
// Archive (Restore is on the Automations page). While automations are off the page says so. Seeing needs
// `messages.journey.read`; saving, switching and archiving need `messages.automations.write`, which the API checks again.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CustomerAct } from '@/components/admin/customers/CustomerAct';
import { JourneyBuilder } from '@/components/admin/customers/JourneyBuilder';
import { formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { withMessages } from '@/lib/admin-messages/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t, type Dict } from '@/lib/i18n';
import '../automations.css';

export const dynamic = 'force-dynamic';

const BASE = '/admin/messages/automations';
const KEY = 'messagesAutomations';

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(withMessages(await adminView()));
  return { title: `${t(view.dict, 'cus.auto.b.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Params = Promise<{ id: string }>;

export default async function AutomationPage({ params }: { params: Params }) {
  const deps = adminDeps();
  const [plain, { id }, access] = await Promise.all([adminView(deps), params, pageAccess('messages.journey.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(withMessages(plain));
  const d = view.dict;
  const here = `${BASE}/${encodeURIComponent(id)}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="messages.journey.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const isNew = id === 'new';
  const [e, currency] = await Promise.all([cu.journeyEditor(customersDeps(access.deps), who, isNew ? null : id), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>]);
  if (!e || (!isNew && !e.journey))
    return (
      <div className="a2-z">
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const j = e.journey;
  const n = (x: number) => formatNumber(x, view.locale);
  const cdict: Dict = { cus: d.cus as Dict };
  const back = (
    <Link className="a2-b" href={BASE}>
      {t(d, 'cus.auto.title')}
    </Link>
  );
  return (
    <div className="a2-z" data-testid="messages-automation">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={back}
        title={j ? j.name : t(d, 'cus.auto.b.newTitle')}
        sub={t(d, 'cus.auto.b.sub')}
        right={
          j && !j.archivedAt && e.settings.enabled && e.canWrite ? (
            <span className="a2-gap8">
              <CustomerAct
                dict={cdict}
                url={`${BASE.replace('/admin/', '/api/admin/')}/${j.id}/switch`}
                body={{ enabled: !j.enabled }}
                label={t(d, j.enabled ? 'cus.auto.turnOff' : 'cus.auto.turnOn')}
                ask={j.enabled ? undefined : { title: t(d, 'cus.auto.onAsk'), effects: [t(d, 'cus.auto.onEff1'), t(d, 'cus.auto.onEff2')], confirm: t(d, 'cus.auto.onYes') }}
                tone={j.enabled ? 'ghost' : 'pri'}
                testId="auto-switch"
              />
              <CustomerAct
                dict={cdict}
                url={`${BASE.replace('/admin/', '/api/admin/')}/${j.id}/archive`}
                body={{ archived: true }}
                label={t(d, 'cus.auto.archive')}
                ask={{ title: t(d, 'cus.auto.archiveAsk'), effects: [t(d, 'cus.auto.archiveEff1'), t(d, 'cus.auto.archiveEff2')], confirm: t(d, 'cus.auto.archiveYes') }}
                tone="ghost"
                testId="auto-archive"
              />
            </span>
          ) : null
        }
      />
      <SectionTabs view={view} current={KEY} />
      {j ? (
        <section className="a2-card a2-mt12" data-testid="auto-counts">
          <p className="a2-sm">
            <span className={`a2-pill ${j.enabled ? 'ok' : 'line'}`}>{t(d, j.enabled ? 'cus.auto.on' : 'cus.auto.offWord')}</span> {t(d, 'cus.auto.peopleLine', { active: n(j.counts.active), done: n(j.counts.done), exited: n(j.counts.exited) })} · {t(d, 'cus.auto.sent', { n: n(j.counts.sent) })}
          </p>
        </section>
      ) : null}
      {!e.settings.enabled ? (
        <section className="a2-card a2-mt12" data-testid="auto-off">
          <h2 className="a2-h3">{t(d, 'cus.auto.offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{t(d, e.canWrite ? 'cus.auto.offBody' : 'cus.auto.offAsk')}</p>
        </section>
      ) : j?.archivedAt ? (
        <section className="a2-card a2-mt12" data-testid="auto-archived-note">
          <p className="a2-sm a2-mute">{t(d, 'cus.auto.b.archivedNote')}</p>
        </section>
      ) : j && (!j.trigger || !j.plan) ? (
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute">{t(d, 'cus.auto.unreadable')}</p>
        </section>
      ) : (
        <JourneyBuilder
          key={j ? j.version : 'new'}
          dict={{ cus: d.cus as Dict }}
          lang={view.lang}
          money={moneyOf(currency, view.locale)}
          id={j?.id ?? null}
          version={j?.version ?? null}
          name={j?.name ?? ''}
          trigger={j?.trigger ?? null}
          plan={j?.plan ?? null}
          templates={e.templates}
          options={e.options}
          maxSteps={e.settings.maxSteps}
          canWrite={e.canWrite}
        />
      )}
    </div>
  );
}
