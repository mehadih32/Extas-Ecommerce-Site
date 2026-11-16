// PR 1011 (final round, lane D11; admin prototype v5 m-settings.js `renderMsgs`) — Settings › Customer messages at /admin/settings/messages, built to the
// prototype: the five order steps (Order confirmed, Pay delivery charge first, Handed to courier, Delivered + review request, Order cancelled), each with
// the words the customer gets, an SMS switch, a WhatsApp switch and Edit, and the "about N SMS a month" line. Everything the shop already had (the whole
// order journey, every template, channels and limits, consent, cost ceilings, the log, automations) is under "More options" on this same page; nothing
// was removed. Seeing needs `messages.journey.read` (the words also `messages.templates.read`); switches and words check `messages.journey.write` and
// `messages.templates.write` again in their APIs. Nothing here sends: a message goes only when an order reaches its step.
// Guide: docs/admin-guide/pages/settings/messages.md. lib/admin-customer-messages/*, components/admin/settings/CustomerMessages.tsx.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as ms from '@extas/messages';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { CustomerMessages, type StepData } from '@/components/admin/settings/CustomerMessages';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { MESSAGE_STEPS, smsPerMonth, switchesOf, type StepLike } from '@/lib/admin-customer-messages/pure';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { messagesDeps } from '@/lib/messages-api';
import bn from '../../../../../messages/admin-customer-messages.bn.json';
import en from '../../../../../messages/admin-customer-messages.en.json';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/messages';
const KEY = 'settingsMessages';
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

function flat(d: Dict, at = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [[`${at}${k}`, v]] : Object.entries(flat(v, `${at}${k}.`)))));
}

/** `<b>…</b>` in a words line as bold, nothing else as markup. */
function bold(s: string) {
  return s.split(/(<b>.*?<\/b>)/g).map((p, i) => (p.startsWith('<b>') ? <b key={i}>{p.slice(3, -4)}</b> : <span key={i}>{p}</span>));
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'cm.metaTitle'), robots: { index: false, follow: false } };
}

export default async function CustomerMessagesPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('messages.journey.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="cm-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="messages.journey.read" />
      </div>
    );
  const perms = access.guard.permissions;
  const has = (p: string) => perms?.has(p as never) ?? false;
  const who: ms.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const md = await messagesDeps(access.deps);
  const journey = await ms.journeyScreen(md, who);
  const tpl = has('messages.templates.read') ? await ms.templatesScreen(md, who) : null;
  const x = flat((d.cm ?? {}) as Dict);
  const jr = journey.config.journey as unknown as Record<string, StepLike>;

  const steps: StepData[] = MESSAGE_STEPS.map((s) => {
    const cfg = jr[s.step]!;
    const group = tpl?.groups.find((g) => g.key === cfg.template);
    return {
      id: s.id,
      step: s.step,
      cfg: cfg as StepData['cfg'],
      rows: (group?.rows ?? []).map((r) => ({ id: r.id, channel: r.channel, locale: r.locale, body: r.body, subject: r.subject, version: r.version })),
    };
  });

  // About how many SMS a month: the orders of the last 30 days times the steps whose SMS switch is on, at the shop's own price per part
  const since = daysAgo(30);
  const [orders30, rates, currency] = await Promise.all([
    access.deps.db.order.count({ where: { storeId: MOTHER_STORE_ID, placedAt: { gte: since }, archivedAt: null } }),
    access.deps.resolver.value('messages.sms.rates', { storeId: MOTHER_STORE_ID }) as Promise<{ maskedMinor: number | null; nonMaskedMinor: number | null } | null>,
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
  ]);
  const smsSteps = steps.filter((s) => switchesOf(jr[s.step]!).sms).length;
  const n = smsPerMonth(orders30, smsSteps);
  const per = rates?.nonMaskedMinor ?? rates?.maskedMinor ?? null;
  const usage =
    per === null
      ? x.usageNoCost!.replace('{n}', String(n))
      : x.usage!.replace('{n}', String(n)).replace('{cost}', x.usageCost!.replace('{amount}', formatMoney(n * per, moneyOf(currency, view.locale))));

  const m = (k: string) => x[`more.${k}`] ?? k;
  const more = [
    { id: 'journey', href: '/admin/messages/journey' },
    { id: 'templates', href: '/admin/messages/templates' },
    { id: 'channels', href: '/admin/messages/channels' },
    { id: 'consent', href: '/admin/messages/consent' },
    { id: 'ceilings', href: '/admin/messages/cost-ceilings' },
    { id: 'log', href: '/admin/messages/log' },
    { id: 'automations', href: '/admin/messages/automations' },
  ];
  return (
    <div className="a2-z" data-testid="cm-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={x.title!} sub={x.sub!} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note info cm-usage" data-testid="cm-usage">
        <span>{bold(usage)}</span>
      </div>
      <CustomerMessages
        steps={steps}
        journey={journey.config.journey as unknown as Record<string, unknown>}
        version={journey.version}
        x={x}
        sample={tpl?.sample ?? ({} as never)}
        tokens={tpl?.tokens ?? []}
        hasHost={tpl?.hasHost ?? true}
        canSwitch={journey.perms.write}
        canEdit={!!tpl && tpl.perms.write}
        lang={view.lang === 'bn' ? 'bn' : 'en'}
      />
      <div className="a2-note cm-note" data-testid="cm-both-note">
        <span>{x.bothNote}</span>
      </div>
      <details className="a2-card a2-mt12 cm-more" data-testid="cm-more">
        <summary className="a2-h3">{m('h')}</summary>
        <p className="a2-sm a2-mute a2-mt6">{m('sub')}</p>
        <ul className="cm-more-list">
          {more.map((o) => (
            <li key={o.id}>
              <Link className="a2-lnk" href={o.href} data-testid={`cm-more-${o.id}`}>
                {m(o.id)} →
              </Link>
              <div className="a2-xs a2-mute">{m(`${o.id}D`)}</div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
