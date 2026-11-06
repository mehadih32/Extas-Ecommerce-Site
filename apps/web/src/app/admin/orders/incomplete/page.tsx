// S13 · PR 274 (register "Incomplete-order capture"; SIM-F-026; Blueprint C6.3) — Orders › Incomplete at
// /admin/orders/incomplete: the customers who typed their number at checkout and left without ordering (hottest first,
// with the bag, its worth, how long ago and which visit brought them; WhatsApp and Call), handed to a teammate or marked
// handled; prepaid orders whose payment failed or got no answer; how many bags were left with no number; and the card
// that switches the keeping on (off as it ships). PR 275: the follow-up card (the reminder with the bag's link, then
// at most one offer; off as it ships) and, on each row, what went to him. Seeing needs `orders.read`; acting `orders.confirm`; the card
// `settings.write`. lib/admin-orders/incomplete.ts. Guide: docs/admin-guide/pages/orders/incomplete.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { IncompleteActions } from '@/components/admin/orders/IncompleteActions';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { FOLLOW_UP_CHANNEL_ORDERS, incompleteOverview } from '@/lib/admin-orders/incomplete';
import { callLink, HANDLED_NOTE_MAX, INCOMPLETE_VIEWS, viewOf, whatsAppLink } from '@/lib/admin-orders/incomplete-model';
import { ageText, phoneText } from '@/lib/admin-orders/list';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-incomplete.bn.json';
import en from '../../../../../messages/admin-incomplete.en.json';
import '../../settings-cards.css';
import './incomplete.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/incomplete';
const API = '/api/admin/orders/incomplete';
const KEY = 'ordersIncomplete';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'inc.metaTitle'), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function IncompletePage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('orders.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  const current = viewOf(sp.view);
  const here = current === 'open' ? HERE : `${HERE}?view=${current}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="orders.read" />
      </div>
    );
  const me = access.guard.actor.staffUserId ?? null;
  const o = await incompleteOverview({ db: access.deps.db, resolver: access.deps.resolver }, me, current);
  const now = (access.deps.now ?? (() => new Date()))();
  const canAct = access.guard.permissions?.has('orders.confirm') ?? false;
  const canSet = access.guard.permissions?.has('settings.write') ?? false;
  const canCustomer = access.guard.permissions?.has('customers.read') ?? false;
  const currency = await access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID });
  const m = moneyOf(currency, view.locale);
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `inc.${k}`, vars);
  const c = (k: string) => g(`card.${k}`);
  const n = (x: number) => formatNumber(x, view.locale);
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const err = Object.fromEntries(['INVALID_INPUT', 'STALE', 'NOT_FOUND', 'HANDLED', 'OPEN', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: c('save'), saving: c('saving'), saved: c('saved'), discard: c('discard'), unsaved: c('unsaved'), readOnly: c('readOnly'), pairHelp: '', err };
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'capture', label: c('capture'), help: c('captureHelp') },
    { kind: 'number', path: 'keepDays', label: c('keepDays'), help: c('keepDaysHelp'), min: 1, max: 365 }, // hardcode-ok: the setting's own bounds
    { kind: 'number', path: 'leftAfterMinutes', label: c('leftAfterMinutes'), help: c('leftAfterMinutesHelp'), min: 5, max: 1_440 }, // hardcode-ok: the setting's own bounds
  ];
  const fu = (k: string, vars?: Record<string, string | number>) => g(`fu.${k}`, vars);
  const fuTexts: FieldsCardTexts = { ...cardTexts, h: fu('h'), d: fu('d') };
  const fuFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: fu('enabled'), help: fu('enabledHelp') },
    { kind: 'number', path: 'firstAfterMinutes', label: fu('firstAfterMinutes'), help: fu('firstAfterMinutesHelp'), min: 15, max: 2_880 }, // hardcode-ok: the setting's own bounds
    { kind: 'select', path: 'channels', label: fu('channels'), help: fu('channelsHelp'), options: FOLLOW_UP_CHANNEL_ORDERS.map((v) => ({ value: v, label: fu(`ch.${v}`) })) },
    { kind: 'select', path: 'minStep', label: fu('minStep'), help: fu('minStepHelp'), options: ['details', 'delivery', 'payment'].map((v) => ({ value: v, label: fu(`step.${v}`) })) },
    { kind: 'number', path: 'catchUpHours', label: fu('catchUpHours'), help: fu('catchUpHoursHelp'), min: 1, max: 168 }, // hardcode-ok: the setting's own bounds
    { kind: 'number', path: 'phoneGapDays', label: fu('phoneGapDays'), help: fu('phoneGapDaysHelp'), min: 1, max: 90 }, // hardcode-ok: the setting's own bounds
    { kind: 'switch', path: 'offer', label: fu('offer'), help: fu('offerHelp') },
    { kind: 'number', path: 'offerAfterHours', label: fu('offerAfterHours'), help: fu('offerAfterHoursHelp'), min: 1, max: 168 }, // hardcode-ok: the setting's own bounds
    { kind: 'text', path: 'offerCode', label: fu('offerCode'), help: fu('offerCodeHelp'), max: 40 }, // hardcode-ok: the setting's own bound
  ];
  const actTexts = { assign: g('assign'), nobody: g('nobody'), assignSave: g('assignSave'), assigned: g('assigned2'), markHandled: g('markHandled'), noteLabel: g('noteLabel'), notePlaceholder: g('notePlaceholder'), save: g('save'), cancel: g('cancel'), reopen: g('reopen'), done: g('done'), err };
  const name = (en_: string, bn_: string | null) => (view.lang === 'bn' ? bn_ || en_ : en_);

  return (
    <div className="a2-z" data-testid="inc-page">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note inc-mt8" role="note">
        <span>{g('note')}</span>
      </div>
      {!o.capture ? (
        <div className="a2-note inc-mt8" role="status" data-testid="inc-off">
          <span>{g('off')}</span>
        </div>
      ) : null}
      <p>
        <Link className="a2-sm inc-link" href="/admin/orders">
          {g('allLink')}
        </Link>
      </p>

      <nav className="a2-views inc-mt8" aria-label={g('viewsAria')} data-testid="inc-views">
        {INCOMPLETE_VIEWS.map((v) => (
          <Link key={v} className={`a2-view${v === current ? ' on' : ''}`} href={v === 'open' ? HERE : `${HERE}?view=${v}`} aria-current={v === current ? 'page' : undefined} scroll={false} data-view={v}>
            {g(`view.${v}`)}
            <span className="a2-cnt">{n(o.counts[v])}</span>
          </Link>
        ))}
      </nav>

      <section className="a2-sc" aria-label={g(`view.${current}`)} data-testid="inc-list">
        {o.rows.length ? (
          <ul className="inc-rows">
            {o.rows.map((r) => (
              <li key={r.id} className="inc-r" data-testid="inc-row" data-stage={r.stage}>
                <p className="inc-top">
                  <span className={`a2-pill ${r.stage === 'payment' ? 'warn' : r.stage === 'address' ? 'info' : 'line'}`}>{g(`stage.${r.stage}`)}</span>
                  <span className="a2-sm a2-mute">{g('left', { age: ageText(view, new Date(r.lastAt), now) })}</span>
                </p>
                <p className="a2-sm inc-who">
                  <b>{r.name ?? g('noName')}</b> · <span dir="ltr">{phoneText(r.phone)}</span>
                </p>
                {r.addressText ? <p className="a2-sm a2-mute inc-wrap">{r.addressText}</p> : null}
                <p className="a2-sm inc-wrap">
                  <span className="a2-mute">{g('bag')}: </span>
                  {r.lines.length
                    ? r.lines.map((l) => g('line', { qty: n(l.quantity), name: [name(l.nameEn, l.nameBn), l.size, l.colourEn ? name(l.colourEn, l.colourBn) : null].filter(Boolean).join(' · ') })).join(', ') + (r.more ? ` ${g('more', { n: n(r.more) })}` : '')
                    : g('bagEmpty')}
                  {r.lines.length ? ` · ${g('worth', { value: formatMoney(r.valueMinor, m) })}` : ''}
                </p>
                {r.channel ? (
                  <p className="a2-sm a2-mute inc-wrap" data-testid="inc-channel">
                    {g('channel')}: {[r.channel.platform, r.channel.source, r.channel.campaign, r.channel.landing ? g('landing') : null].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
                {r.assignedTo && !r.handled ? <p className="a2-sm">{g('assigned', { name: r.assignedTo.name })}</p> : null}
                {r.followUps.last ? (
                  <p className="a2-sm a2-mute inc-wrap" data-testid="inc-followups">
                    {fu(r.followUps.last.offer ? 'rowOffer' : 'row', { sent: n(r.followUps.sent), max: n(o.followUp.ceiling), when: ageText(view, new Date(r.followUps.last.at), now), channel: fu(`chName.${r.followUps.last.channel}`) })}
                  </p>
                ) : null}
                {r.handled ? (
                  <p className="a2-sm inc-wrap" data-testid="inc-handled-line">
                    <span className="a2-pill g">{r.handled.by ? g('handledBy', { when: when(r.handled.at), name: r.handled.by }) : g('handledOn', { when: when(r.handled.at) })}</span>
                    {r.handled.note ? ` ${r.handled.note}` : ''}
                  </p>
                ) : null}
                <div className="inc-row">
                  <a className="a2-btn" href={whatsAppLink(r.phone)} target="_blank" rel="noopener noreferrer" data-testid="inc-wa">
                    {g('whatsapp')}
                  </a>
                  <a className="a2-btn" href={callLink(r.phone)} data-testid="inc-call">
                    {g('call')}
                  </a>
                  {r.customerId && canCustomer ? (
                    <Link className="a2-btn" href={`/admin/customers/${r.customerId}`}>
                      {g('customer')}
                    </Link>
                  ) : null}
                </div>
                {canAct ? <IncompleteActions url={API} id={r.id} handled={!!r.handled} assignedToId={r.assignedTo?.id ?? null} staff={o.staff} noteMax={HANDLED_NOTE_MAX} texts={actTexts} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute" data-testid="inc-empty">
            {g(`empty.${current}`)}
          </p>
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="inc-unpaid-h" data-testid="inc-unpaid">
        <h2 className="a2-h3" id="inc-unpaid-h">
          {g('unpaid.h')}
        </h2>
        <p className="a2-sm a2-mute">{g('unpaid.d')}</p>
        {o.unpaid.length ? (
          <ul className="inc-rows">
            {o.unpaid.map((u) => (
              <li key={u.orderId} className="inc-r" data-testid="inc-unpaid-row" data-state={u.state}>
                <p className="inc-top">
                  <span className={`a2-pill ${u.state === 'failed' ? 'bad' : 'warn'}`}>{g(`unpaid.${u.state}`)}</span>
                  <span className="a2-sm a2-mute">{ageText(view, new Date(u.at), now)}</span>
                </p>
                <p className="a2-sm inc-who">
                  <b>{g('unpaid.order', { number: u.number })}</b> · {u.name ?? g('noName')}
                  {u.phone ? (
                    <>
                      {' · '}
                      <span dir="ltr">{phoneText(u.phone)}</span>
                    </>
                  ) : null}{' '}
                  · {formatMoney(u.totalMinor, moneyOf(u.currency, view.locale))}
                </p>
                <div className="inc-row">
                  <Link className="a2-btn" href={`/admin/orders/${u.orderId}`}>
                    {g('unpaid.open')}
                  </Link>
                  {u.phone ? (
                    <>
                      <a className="a2-btn" href={whatsAppLink(u.phone)} target="_blank" rel="noopener noreferrer">
                        {g('whatsapp')}
                      </a>
                      <a className="a2-btn" href={callLink(u.phone)}>
                        {g('call')}
                      </a>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{g('unpaid.empty')}</p>
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="inc-nophone-h" data-testid="inc-nophone">
        <h2 className="a2-h3" id="inc-nophone-h">
          {g('noPhone.h')}
        </h2>
        <p className="a2-sm">{o.noPhone.bags ? g('noPhone.text', { n: n(o.noPhone.bags), value: formatMoney(o.noPhone.valueMinor, m) }) : g('noPhone.none')}</p>
      </section>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canSet} testId="inc-card" />
      </div>
      <div className="a2-mt12" data-testid="inc-followup">
        <p className="a2-sm a2-mute inc-wrap" data-testid="inc-followup-stats">
          {fu('stats', { sent: n(o.followUp.sent), recovered: n(o.followUp.recovered) })}
        </p>
        <FieldsCard url={API} screen={{ key: o.followUp.card.key, value: o.followUp.card.value, version: o.followUp.card.version }} fields={fuFields} texts={fuTexts} canEdit={canSet} testId="inc-fu-card" />
      </div>
    </div>
  );
}
