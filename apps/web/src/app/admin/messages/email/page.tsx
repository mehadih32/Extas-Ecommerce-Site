// S14 · PR 290 — Messages › E-mail at /admin/messages/email (e-mail marketing; Blueprint C6.1 item 2; the demo's MSG-02
// builder for the e-mail channel): the store's e-mail sends, newest first, each with its state, its segment and how many
// were queued, sent and failed; the owner's templates; "New e-mail send" and "New template"; the settings and the
// archived templates under "More options". Off as shipped (`customers.email`): the page then says so. Seeing needs
// `messages.journey.read`; templates, drafts and the settings need `messages.email.write`, scheduling `messages.email.send`
// (the API checks again). Every e-mail is an offer: only with the customer's yes for offer e-mails, with the
// unsubscribe line. Nothing is deleted.
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
import { dateTime } from '@/components/admin/stock/text';
import { t, type Dict } from '@/lib/i18n';
import '../automations/automations.css';
import './email.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/messages/email';
const KEY = 'messagesEmail';
const FIELDS: readonly CrmField[] = [
  { name: 'enabled', kind: 'bool' },
  { name: 'perCustomerPerWeek', kind: 'int' },
  { name: 'batchSize', kind: 'int' },
  { name: 'trackOpens', kind: 'bool' },
  { name: 'trackClicks', kind: 'bool' },
  { name: 'resultDays', kind: 'int' },
  { name: 'maxTemplates', kind: 'int' },
  { name: 'unsubscribeLine', kind: 'lang', max: 160 },
];

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(withMessages(await adminView()));
  return { title: `${t(view.dict, 'cus.mail.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function EmailPage() {
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
  const s = await cu.emailScreen(customersDeps(access.deps), who);
  const n = (x: number) => formatNumber(x, view.locale);
  const when = (x: Date | null) => (x ? dateTime(x.toISOString(), view.locale, view.timeZone) : '');
  const cdict: Dict = { cus: d.cus as Dict };
  const line = (r: cu.EmailSendRow) =>
    [
      r.segmentName ?? t(d, 'cus.mail.everyone'),
      r.status === 'DRAFT' ? '' : t(d, 'cus.mail.sentLine', { queued: n(r.queued), sent: n(r.sent), failed: n(r.failed) }),
      r.finishedAt ? t(d, 'cus.mail.finishedAt', { when: when(r.finishedAt) }) : r.startedAt ? t(d, 'cus.mail.startedAt', { when: when(r.startedAt) }) : r.scheduledAt ? t(d, 'cus.mail.at', { when: when(r.scheduledAt) }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  const tone = (st: cu.EmailSendStatus) => (st === 'SENT' ? 'ok' : st === 'SENDING' || st === 'SCHEDULED' ? 'info' : st === 'PAUSED' ? 'warn' : 'line');

  return (
    <div className="a2-z" data-testid="messages-email">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={t(d, 'cus.mail.title')}
        sub={t(d, 'cus.mail.sub')}
        right={
          s.enabled && s.canWrite ? (
            <span className="a2-gap8">
              <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="mail-new-send">
                {t(d, 'cus.mail.newSend')}
              </Link>
              <Link className="a2-btn" href={`${HERE}/templates/new`} data-testid="mail-new-template">
                {t(d, 'cus.mail.newTemplate')}
              </Link>
            </span>
          ) : null
        }
      />
      <SectionTabs view={view} current={KEY} />
      {!s.enabled ? (
        <section className="a2-card a2-mt12" data-testid="mail-off">
          <h2 className="a2-h3">{t(d, 'cus.mail.offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{t(d, s.canWrite ? 'cus.mail.offBody' : 'cus.mail.offAsk')}</p>
        </section>
      ) : (
        <div className="a2-row a2-r2 a2-mt12">
          <section className="a2-card auto-list" data-testid="mail-sends">
            <h2 className="a2-h3">{t(d, 'cus.mail.sends')}</h2>
            <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.mail.offerNote')}</p>
            <div className="a2-mt6">
              {s.sends.length ? (
                s.sends.map((r) => (
                  <Link key={r.id} className="a2-prow" href={`${HERE}/${r.id}`} data-testid="mail-send-row">
                    <div className="a2-prt">
                      <b>{r.name}</b>
                      <span>{line(r)}</span>
                    </div>
                    <span className="a2-prs">
                      <span className={`a2-pill ${tone(r.status)}`}>{t(d, `cus.mail.status.${r.status}`)}</span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="a2-sm a2-mute">{t(d, 'cus.mail.noSends')}</p>
              )}
            </div>
          </section>
          <section className="a2-card auto-list" data-testid="mail-templates">
            <h2 className="a2-h3">{t(d, 'cus.mail.templates')}</h2>
            <div className="a2-mt6">
              {s.templates.length ? (
                s.templates.map((r) => (
                  <Link key={r.id} className="a2-prow" href={`${HERE}/templates/${r.id}`} data-testid="mail-template-row">
                    <div className="a2-prt">
                      <b>{r.name}</b>
                      <span>
                        {t(d, `cus.mail.lang.${r.locale}`)} · {r.subject}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="a2-sm a2-mute">{t(d, 'cus.mail.noTemplates')}</p>
              )}
            </div>
          </section>
        </div>
      )}
      <details className="a2-mt12 a2-more-opts" data-testid="mail-more">
        <summary className="a2-sm a2-b">{t(d, 'cus.mail.more', { n: n(s.archivedTemplates.length) })}</summary>
        <div className="a2-row a2-r2 a2-mt12">
          <CrmSettingCard dict={cdict} settingKey="customers.email" card="email" fields={FIELDS} value={s.settings as unknown as Record<string, unknown>} canWrite={s.canWrite} url="/api/admin/messages/email/settings" />
          <section className="a2-card auto-list" data-testid="mail-archived">
            <h2 className="a2-h3">{t(d, 'cus.mail.archivedTemplates')}</h2>
            <div className="a2-mt6">
              {s.archivedTemplates.length ? (
                s.archivedTemplates.map((r) => (
                  <div key={r.id} className="a2-prow">
                    <div className="a2-prt">
                      <b>{r.name}</b>
                      <span>{r.subject}</span>
                    </div>
                    {s.canWrite && s.enabled ? <CustomerAct dict={cdict} url={`/api/admin/messages/email/templates/${r.id}/archive`} body={{ archived: false }} label={t(d, 'cus.mail.restore')} tone="ghost" testId="mail-restore" /> : null}
                  </div>
                ))
              ) : (
                <p className="a2-sm a2-mute">{t(d, 'cus.mail.noArchived')}</p>
              )}
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
