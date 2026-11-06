// S14 · PR 300 — Messages › Campaigns at /admin/messages/campaigns (the CN-019 control centre's campaign tab; demo MSG-02;
// ADMIN-ARCHITECTURE §4.6): the store's win-back campaigns, newest first, each with its state, its channel, its rule and
// how many were queued, sent and failed and what it cost; "New win-back campaign"; the settings under "More options".
// PR 277: a second type, the campaign to a group (a blast to a saved segment; its own switch `customers.blast` on its
// own card), "New campaign to a group", and "E-mail campaign" opens Messages › E-mail (PR 290).
// Off as shipped (`customers.winback`, `customers.blast`): while both are off the page says so. Seeing needs `messages.journey.read`; drafts and the
// settings need `messages.campaigns.write`, scheduling `messages.campaigns.send` (the API checks again). Every message is
// an offer: only with the customer's yes for offers on that channel. A campaign never makes an offer or a discount.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CrmSettingCard, type CrmField } from '@/components/admin/customers/CrmSettingCard';
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
import '../automations/automations.css';
import '../email/email.css';
import './campaigns.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/messages/campaigns';
const KEY = 'messagesCampaigns';
const FIELDS: readonly CrmField[] = [
  { name: 'enabled', kind: 'bool' },
  { name: 'perCustomerPerWeek', kind: 'int' },
  { name: 'gapDays', kind: 'int' },
  { name: 'batchSize', kind: 'int' },
  { name: 'resultDays', kind: 'int' },
  { name: 'defaultLapsedDays', kind: 'int' },
  { name: 'stopLine', kind: 'lang', max: 120 },
];
const BLAST_FIELDS: readonly CrmField[] = [
  { name: 'enabled', kind: 'bool' },
  { name: 'allowEveryone', kind: 'bool' },
];

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(withMessages(await adminView()));
  return { title: `${t(view.dict, 'cus.wb.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CampaignsPage() {
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
  const [s, currency] = await Promise.all([cu.campaignsScreen(customersDeps(access.deps), who), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>]);
  const n = (x: number) => formatNumber(x, view.locale);
  const when = (x: Date | null) => (x ? dateTime(x.toISOString(), view.locale, view.timeZone) : '');
  const cdict: Dict = { cus: d.cus as Dict };
  const x = (k: string, v?: Record<string, string>) => t(d, `cus.wb.${k}`, v);
  const line = (r: cu.CampaignRow) =>
    [
      x(`kind.${r.kind}`),
      t(d, `msg.channel.${r.channel}`),
      r.rule ? x('ruleShort', { days: n(r.rule.lapsedDays) }) : '',
      r.segmentName ?? (r.kind === cu.BLAST_KIND ? x('everyoneLine') : ''),
      r.status === 'DRAFT' ? '' : x('sentLine', { queued: n(r.queued), sent: n(r.sent), failed: n(r.failed), cost: formatMoney(r.costMinor, moneyOf(currency, view.locale)) }),
      r.finishedAt ? x('finishedAt', { when: when(r.finishedAt) }) : r.startedAt ? x('startedAt', { when: when(r.startedAt) }) : r.scheduledAt && r.status === 'SCHEDULED' ? x('at', { when: when(r.scheduledAt) }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  const tone = (st: cu.CampaignStatus) => (st === 'SENT' ? 'ok' : st === 'SENDING' || st === 'SCHEDULED' ? 'info' : st === 'PAUSED' ? 'warn' : 'line');

  return (
    <div className="a2-z" data-testid="messages-campaigns">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={x('title')}
        sub={x('sub')}
        right={
          <span className="a2-gap8">
            {s.winbackOn && s.canWrite ? (
              <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="wb-new">
                {x('new')}
              </Link>
            ) : null}
            {s.blastOn && s.canWrite ? (
              <Link className="a2-btn pri" href={`${HERE}/new?kind=blast`} data-testid="wb-new-blast">
                {x('newBlast')}
              </Link>
            ) : null}
            <Link className="a2-btn" href="/admin/messages/email" data-testid="wb-email">
              {x('emailLink')}
            </Link>
          </span>
        }
      />
      <SectionTabs view={view} current={KEY} />
      {!s.enabled ? (
        <section className="a2-card a2-mt12" data-testid="wb-off">
          <h2 className="a2-h3">{x('offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{x(s.canWrite ? 'offBody' : 'offAsk')}</p>
        </section>
      ) : (
        <section className="a2-card auto-list a2-mt12" data-testid="wb-list">
          <h2 className="a2-h3">{x('list')}</h2>
          <p className="a2-xs a2-mute a2-mt6">{x('offerNote')}</p>
          <div className="a2-mt6">
            {s.campaigns.length ? (
              s.campaigns.map((r) => (
                <Link key={r.id} className="a2-prow" href={`${HERE}/${r.id}`} data-testid="wb-row">
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
              <p className="a2-sm a2-mute">{x('none')}</p>
            )}
          </div>
        </section>
      )}
      <details className="a2-mt12 a2-more-opts" data-testid="wb-more">
        <summary className="a2-sm a2-b">{x('more')}</summary>
        <div className="a2-row a2-r2 a2-mt12">
          <CrmSettingCard dict={cdict} settingKey="customers.winback" card="winback" fields={FIELDS} value={s.settings as unknown as Record<string, unknown>} canWrite={s.canWrite} url="/api/admin/messages/campaigns/settings" />
          <CrmSettingCard dict={cdict} settingKey="customers.blast" card="blast" fields={BLAST_FIELDS} value={s.blast as unknown as Record<string, unknown>} canWrite={s.canWrite} url="/api/admin/messages/campaigns/settings/blast" />
        </div>
      </details>
    </div>
  );
}
