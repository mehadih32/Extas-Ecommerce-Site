// S14 · PR 300 — one win-back campaign at /admin/messages/campaigns/[id] ("new" for a new draft): a draft's form (who it
// names, the channel and the shop's template with its preview; then when), how many it reaches now step by step (the
// rule's people, with a number, with a yes for offers, had a win-back lately) and the estimated cost; once it went its
// results: queued, sent, delivered, failed, waiting, left out by reason, the cost, and the orders the receivers placed
// within the result days (their value only once delivered). Pause, resume and cancel (`messages.campaigns.send`, cancel
// asked first). Seeing needs `messages.journey.read`.
// PR 277: the same page for a campaign to a group (a blast; "new?kind=blast" for a new one): its segment instead of the
// rule, no win-back gap step, its own switch.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CampaignForm } from '@/components/admin/customers/CampaignForm';
import { CustomerAct } from '@/components/admin/customers/CustomerAct';
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
import '../../email/email.css';
import '../campaigns.css';

export const dynamic = 'force-dynamic';

const BASE = '/admin/messages/campaigns';
const KEY = 'messagesCampaigns';

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(withMessages(await adminView()));
  return { title: `${t(view.dict, 'cus.wb.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Params = Promise<{ id: string }>;
type Search = Promise<{ kind?: string | string[] }>;

export default async function CampaignPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const deps = adminDeps();
  const [plain, { id }, sp, access] = await Promise.all([adminView(deps), params, searchParams, pageAccess('messages.journey.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(withMessages(plain));
  const d = view.dict;
  const here = `${BASE}/${encodeURIComponent(id)}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="messages-campaign" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="messages.journey.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const isNew = id === 'new';
  const newKind: cu.CampaignKind = sp.kind === cu.BLAST_KIND ? cu.BLAST_KIND : cu.WINBACK_KIND;
  const [e, currency] = await Promise.all([cu.campaignEditor(customersDeps(access.deps), who, isNew ? null : id, newKind), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>]);
  if (!e || (!isNew && !e.campaign))
    return (
      <div className="a2-z">
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const c = e.campaign;
  const n = (x: number) => formatNumber(x, view.locale);
  const money = (minor: number) => formatMoney(minor, moneyOf(currency, view.locale));
  const when = (x: Date | null) => (x ? dateTime(x.toISOString(), view.locale, view.timeZone) : '');
  const cdict: Dict = { cus: d.cus as Dict, msg: d.msg as Dict };
  const api = `/api/admin/messages/campaigns/items/${c?.id ?? ''}/state`;
  const x = (k: string, v?: Record<string, string>) => t(d, `cus.wb.${k}`, v);
  const back = (
    <Link className="a2-b" href={BASE}>
      {x('title')}
    </Link>
  );
  const a = e.audience;
  const r = e.results;
  const kpi = (label: string, value: string, testId?: string) => (
    <div className="mail-kpi" data-testid={testId}>
      <span className="a2-xs a2-mute">{label}</span>
      <b>{value}</b>
    </div>
  );
  const reason = (code: string) => {
    const w = t(d, `msg.reason.${code}`);
    return w === `msg.reason.${code}` ? code : w;
  };
  const tplName = c?.templateId ? (e.templates.find((tp) => tp.id === c.templateId)?.name ?? '') : '';
  const rule = c?.rule ?? { lapsedDays: e.settings.defaultLapsedDays, maxLapsedDays: null, minDelivered: 1 };
  const isBlast = e.kind === cu.BLAST_KIND;

  return (
    <div className="a2-z" data-testid="messages-campaign" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={back}
        title={c ? c.name : x(isBlast ? 'newBlastTitle' : 'newTitle')}
        sub={c ? `${x(`kind.${c.kind}`)} · ${t(d, `cus.mail.status.${c.status}`)} · ${t(d, `msg.channel.${c.channel}`)}${c.scheduledAt && c.status === 'SCHEDULED' ? ` · ${x('at', { when: when(c.scheduledAt) })}` : ''}` : x(isBlast ? 'newBlastSub' : 'newSub')}
        right={
          c && e.canSend ? (
            <span className="a2-gap8">
              {c.status === 'SCHEDULED' || c.status === 'SENDING' ? <CustomerAct dict={cdict} url={api} body={{ action: 'pause' }} label={x('pause')} tone="ghost" testId="wb-pause" /> : null}
              {c.status === 'PAUSED' && e.on ? <CustomerAct dict={cdict} url={api} body={{ action: 'resume' }} label={x('resume')} tone="pri" testId="wb-resume" /> : null}
              {c.status === 'SCHEDULED' || c.status === 'SENDING' || c.status === 'PAUSED' ? (
                <CustomerAct dict={cdict} url={api} body={{ action: 'cancel' }} label={x('cancel')} ask={{ title: x('cancelAsk'), effects: [x('cancelEff1'), x('cancelEff2')], confirm: x('cancelYes') }} tone="bad" testId="wb-cancel" />
              ) : null}
            </span>
          ) : null
        }
      />
      <SectionTabs view={view} current={KEY} />
      {!e.on && (!c || c.status === 'DRAFT') ? (
        <section className="a2-card a2-mt12" data-testid="wb-off">
          <h2 className="a2-h3">{x(`offKind.${e.kind}`)}</h2>
          <p className="a2-sm a2-mute a2-mt6">{x(e.canWrite ? 'offBody' : 'offAsk')}</p>
        </section>
      ) : null}
      {a || e.audienceProblem ? (
        <section className="a2-card a2-mt12" data-testid="wb-reach">
          <h2 className="a2-h3">{x('reach')}</h2>
          {a ? (
            <ul className="wb-steps a2-sm a2-mt6">
              <li>
                <span>{x(isBlast ? (c?.segmentId ? 'step.peopleBlast' : 'step.peopleAll') : 'step.people')}</span>
                <b>{n(a.people)}</b>
              </li>
              <li>
                <span>{x('step.withPhone')}</span>
                <b>{n(a.withPhone)}</b>
              </li>
              <li>
                <span>{x('step.reachable')}</span>
                <b>{n(a.reachable)}</b>
              </li>
              {isBlast ? null : (
                <li>
                  <span>{x('step.recent', { days: n(e.settings.gapDays) })}</span>
                  <b>{a.recent > 0 ? `−${n(a.recent)}` : n(0)}</b>
                </li>
              )}
              <li data-testid="wb-willget">
                <span className="a2-b">{x('step.willGet')}</span>
                <b>{n(a.willGet)}</b>
              </li>
              <li>
                <span>{x('step.cost')}</span>
                <b>{a.estimatedCostMinor === null ? x('noCost') : money(a.estimatedCostMinor)}</b>
              </li>
            </ul>
          ) : null}
          {a && a.estimatedCostMinor === null ? <p className="a2-xs a2-mute a2-mt6">{x('noCostWhy')}</p> : null}
          {a ? null : <p className="a2-sm a2-mt6">{x('reachProblem')}</p>}
          <p className="a2-xs a2-mute a2-mt6">{x('offerNote')}</p>
        </section>
      ) : null}
      {e.on && (!c || c.status === 'DRAFT') ? (
        <CampaignForm
          key={c ? c.version : `new-${e.kind}`}
          dict={cdict}
          kind={e.kind}
          allowEveryone={e.blast.allowEveryone}
          id={c?.id ?? null}
          version={c?.version ?? null}
          name={c?.name ?? ''}
          channel={c?.channel ?? 'SMS'}
          templateId={c?.templateId ?? null}
          segmentId={c?.segmentId ?? null}
          rule={rule}
          templates={e.templates}
          segments={e.segments}
          segmentsOn={e.segmentsOn}
          willGet={a?.willGet ?? null}
          cost={a && a.estimatedCostMinor !== null ? money(a.estimatedCostMinor) : null}
          canWrite={e.canWrite}
          canSend={e.canSend}
        />
      ) : null}
      {c && c.status !== 'DRAFT' ? (
        <section className="a2-card a2-mt12" data-testid="wb-words">
          <p className="a2-xs a2-mute">{x('draftOnly')}</p>
          <p className="a2-sm a2-mt6">
            {[c.rule ? x('ruleLine', { days: n(c.rule.lapsedDays), max: c.rule.maxLapsedDays === null ? x('f.noLimit') : n(c.rule.maxLapsedDays), min: n(c.rule.minDelivered) }) : '', c.segmentName ?? x(isBlast ? 'f.everyoneBlast' : 'f.everyone'), tplName].filter(Boolean).join(' · ')}
          </p>
        </section>
      ) : null}
      {r ? (
        <section className="a2-card a2-mt12" data-testid="wb-results">
          <h2 className="a2-h3">{x('results')}</h2>
          <div className="mail-kpis a2-mt12">
            {kpi(x('queued'), n(r.queued))}
            {kpi(x('sent'), n(r.sent), 'wb-sent')}
            {kpi(x('delivered'), n(r.delivered))}
            {kpi(x('failed'), n(r.failed))}
            {kpi(x('waiting'), n(r.waiting))}
            {kpi(x('cost'), money(r.costMinor))}
            {kpi(x('orders', { days: n(e.settings.resultDays) }), n(r.orders))}
            {kpi(x('ordersDelivered'), n(r.ordersDelivered))}
            {kpi(x('value'), money(r.deliveredValueMinor))}
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
