// S14 · PR 290 — one e-mail send at /admin/messages/email/[id] ("new" for a new draft): a draft's form (who, words,
// language; then when, with how many it reaches and who is left out and why), and once it went its delivery log in
// numbers: queued, sent, failed, waiting, left out by reason, opened and clicked (while tracking is on), unsubscribed,
// and the orders the receivers placed within the result days (their value only once delivered). Pause, resume and
// cancel (`messages.email.send`, each asked first where it matters). Seeing needs `messages.journey.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CustomerAct } from '@/components/admin/customers/CustomerAct';
import { EmailSendForm } from '@/components/admin/customers/EmailSendForm';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { withMessages } from '@/lib/admin-messages/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { dateTime } from '@/components/admin/stock/text';
import { t, type Dict } from '@/lib/i18n';
import '../../automations/automations.css';
import '../email.css';

export const dynamic = 'force-dynamic';

const BASE = '/admin/messages/email';
const KEY = 'messagesEmail';

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(withMessages(await adminView()));
  return { title: `${t(view.dict, 'cus.mail.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Params = Promise<{ id: string }>;

export default async function EmailSendPage({ params }: { params: Params }) {
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
  const [e, currency, aiOn] = await Promise.all([cu.emailSendEditor(customersDeps(access.deps), who, isNew ? null : id), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>, cu.aiWriterOn(customersDeps(access.deps), MOTHER_STORE_ID)]);
  if (!e || (!isNew && !e.send))
    return (
      <div className="a2-z">
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const s = e.send;
  const n = (x: number) => formatNumber(x, view.locale);
  const when = (x: Date | null) => (x ? dateTime(x.toISOString(), view.locale, view.timeZone) : '');
  const cdict: Dict = { cus: d.cus as Dict };
  const api = `/api/admin/messages/email/sends/${s?.id ?? ''}/state`;
  const x = (k: string, v?: Record<string, string>) => t(d, `cus.mail.s.${k}`, v);
  const back = (
    <Link className="a2-b" href={BASE}>
      {t(d, 'cus.mail.title')}
    </Link>
  );
  const r = e.results;
  const kpi = (label: string, value: string, testId?: string) => (
    <div className="mail-kpi" data-testid={testId}>
      <span className="a2-xs a2-mute">{label}</span>
      <b>{value}</b>
    </div>
  );
  const tracked = (on: boolean, v: number) => (on ? n(v) : x('trackOff'));
  const reason = (code: string) => {
    const w = t(d, `msg.reason.${code}`);
    return w === `msg.reason.${code}` ? code : w;
  };

  return (
    <div className="a2-z" data-testid="messages-email-send">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={back}
        title={s ? s.name : x('newTitle')}
        sub={s ? `${t(d, `cus.mail.status.${s.status}`)} · ${s.segmentName ?? t(d, 'cus.mail.everyone')}${s.scheduledAt ? ` · ${t(d, 'cus.mail.at', { when: when(s.scheduledAt) })}` : ''}` : x('sub')}
        right={
          s && e.canSend ? (
            <span className="a2-gap8">
              {s.status === 'SCHEDULED' || s.status === 'SENDING' ? <CustomerAct dict={cdict} url={api} body={{ action: 'pause' }} label={x('pause')} tone="ghost" testId="mail-pause" /> : null}
              {s.status === 'PAUSED' && e.settings.enabled ? <CustomerAct dict={cdict} url={api} body={{ action: 'resume' }} label={x('resume')} tone="pri" testId="mail-resume" /> : null}
              {s.status === 'SCHEDULED' || s.status === 'SENDING' || s.status === 'PAUSED' ? (
                <CustomerAct dict={cdict} url={api} body={{ action: 'cancel' }} label={x('cancel')} ask={{ title: x('cancelAsk'), effects: [x('cancelEff1'), x('cancelEff2')], confirm: x('cancelYes') }} tone="bad" testId="mail-cancel" />
              ) : null}
            </span>
          ) : null
        }
      />
      <SectionTabs view={view} current={KEY} />
      {!e.settings.enabled && (!s || s.status === 'DRAFT') ? (
        <section className="a2-card a2-mt12" data-testid="mail-off">
          <h2 className="a2-h3">{t(d, 'cus.mail.offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{t(d, e.canWrite ? 'cus.mail.offBody' : 'cus.mail.offAsk')}</p>
        </section>
      ) : null}
      {e.audience || e.audienceProblem ? (
        <section className="a2-card a2-mt12" data-testid="mail-reach">
          <h2 className="a2-h3">{x('reach')}</h2>
          <p className="a2-sm a2-mt6">
            {e.audience ? x('reachLine', { reachable: n(e.audience.reachable), noEmail: n(e.audience.people - e.audience.withEmail), noYes: n(e.audience.withEmail - e.audience.reachable) }) : x('reachProblem')}
          </p>
          <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.mail.offerNote')}</p>
        </section>
      ) : null}
      {e.settings.enabled && (!s || s.status === 'DRAFT') ? (
        <EmailSendForm
          key={s ? s.version : 'new'}
          dict={cdict}
          id={s?.id ?? null}
          version={s?.version ?? null}
          name={s?.name ?? ''}
          segmentId={s?.segmentId ?? null}
          templateId={s?.templateId ?? null}
          locale={s?.locale ?? (view.lang === 'en' ? 'en' : 'bn')}
          subject={s?.subject ?? ''}
          body={s?.body ?? ''}
          templates={e.templates}
          segments={e.segments}
          segmentsOn={e.segmentsOn}
          reachable={e.audience?.reachable ?? null}
          canWrite={e.canWrite}
          canSend={e.canSend}
          aiOn={aiOn}
        />
      ) : null}
      {s && s.status !== 'DRAFT' ? (
        <section className="a2-card a2-mt12" data-testid="mail-words">
          <p className="a2-xs a2-mute">{x('draftOnly')}</p>
          <div className="mail-preview a2-sm a2-mt6">
            <b>{s.subject}</b>
            {'\n\n'}
            {s.body}
          </div>
        </section>
      ) : null}
      {r ? (
        <section className="a2-card a2-mt12" data-testid="mail-results">
          <h2 className="a2-h3">{x('results')}</h2>
          <div className="mail-kpis a2-mt12">
            {kpi(x('queued'), n(r.queued))}
            {kpi(x('sent'), n(r.sent), 'mail-sent')}
            {kpi(x('failed'), n(r.failed))}
            {kpi(x('waiting'), n(r.waiting))}
            {kpi(x('opened'), tracked(e.settings.trackOpens || r.opened > 0, r.opened))}
            {kpi(x('clicked'), tracked(e.settings.trackClicks || r.clicked > 0, r.clicked))}
            {kpi(x('unsubscribed'), n(r.unsubscribed))}
            {kpi(x('orders', { days: n(e.settings.resultDays) }), n(r.orders))}
            {kpi(x('delivered'), n(r.delivered))}
            {kpi(x('value'), formatMoney(r.deliveredValueMinor, moneyOf(currency, view.locale)))}
          </div>
          <p className="a2-xs a2-mute a2-mt6">{x('resultNote')}</p>
          <h3 className="a2-sm a2-b a2-mt12">{x('skipped')}</h3>
          {r.skipped.length ? (
            <ul className="a2-sm a2-mt6">
              {r.skipped.map((k) => (
                <li key={k.reason}>
                  {reason(k.reason)}: {n(k.count)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{x('noSkipped')}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
