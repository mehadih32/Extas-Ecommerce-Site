// S18 · PR 383 — SET-01 Settings › Store details at /admin/settings/store (docs/BACKEND-ARCHITECTURE.md §5.13;
// Blueprint F2 q27): the shop's legal numbers (registered name, trade licence, DBID, VAT BIN), owner data typed in here;
// which are still missing before go-live. The shop prints each only when it is set; a filler value is refused on save and
// dropped where the shop reads it. Seeing needs `settings.read`; saving `settings.write` (the API checks again).
// PR 789 (prototype v5, m-settings.js `renderStore`): the page is the prototype's nine cards in its order and words —
// Business & legal, Addresses, Contact, Logo set & brand colours, Social links, Invoice & sticker, Numbers money & language,
// Tax & VAT, Targets — each saved whole (cards.ts says which setting each box edits).
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { profitReport } from '@extas/inventory';
import { daysPeriod, kpi, ymdIn } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { StoreSaveAll, StoreStickerPreview, StoreWebAddress } from '@/components/admin/store/StoreParts';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { monthOf } from '@/lib/admin-look/dashboard-data';
import Link from 'next/link';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { boxMaxLength, storeView } from '@/lib/admin-store/service';
import { STORE_CARDS, type StoreBox, type StoreCardId } from '@/lib/admin-store/cards';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-store.bn.json';
import en from '../../../../../messages/admin-store.en.json';
import '../settings.css';
import '../../settings-cards.css';
import './where.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/store';
const API = '/api/admin/store';
const KEY = 'store';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'stp.metaTitle'), robots: { index: false, follow: false } };
}

export default async function StorePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('settings.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-lm-ready="" data-testid="store-page">
        <ShellState view={view} kind="denied" permission="settings.read" />
      </div>
    );
  const v = await storeView({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `stp.${k}`, vars);
  const cardTexts = (id: StoreCardId): FieldsCardTexts => ({
    h: s(`c.${id}.h`),
    d: id === 'tax' ? s(`c.${id}.d`) : '',
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'PLACEHOLDER', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  });
  // only the lines the prototype draws sit under a box; the other notes are listed under More options at the foot
  const PROTO_HELP = new Set(['dbid', 'complaintOfficer', 'dpo', 'showVat', 'holidayOn', 'warehousePin']);
  const helpOf = (id: string): string | undefined => {
    if (id === 'orderPrefix') return t(d, 'stp.c.help.orderPrefix', { n: v.nextOrder });
    if (!PROTO_HELP.has(id)) return undefined;
    const k = `stp.c.help.${id}`;
    const h = t(d, k);
    return h === k ? undefined : h;
  };
  const noteIds = ['registeredName', 'facebook', 'bin'];
  const noteOf = (id: string) => t(d, `stp.c.help.${id}`);
  const fieldsOf = (id: StoreCardId): FieldsCardField[] =>
    STORE_CARDS[id].map((b: StoreBox): FieldsCardField => {
      const label = s(`c.${id}.${b.id}`);
      const help = helpOf(b.id);
      const when = b.whenOn ? { when: { path: b.whenOn, truthy: true as const } } : {};
      const f = ((): FieldsCardField => {
        if (b.kind === 'pin') return { kind: 'pin', path: b.id, label, labelOn: s(`c.${id}.${b.id}On`), help };
        if (b.kind === 'pair') return { kind: 'pair', path: b.id, label: { en: s(`c.${id}.${b.id}_en`), bn: s(`c.${id}.${b.id}_bn`) }, help, max: boxMaxLength(b) };
        if (b.kind === 'select') return { kind: 'select', path: b.id, label, help, options: (b.options ?? []).map((o) => ({ value: o, label: s(`c.opt.${b.id}.${o}`) })) };
        if (b.kind === 'switch') return { kind: 'switch', path: b.id, label, help };
        if (b.kind === 'number') return { kind: 'number', path: b.id, label, help, min: b.min ?? 0, max: b.max ?? 1_000_000_000 };
        if (b.kind === 'date') return { kind: 'date', path: b.id, label, help };
        if (b.kind === 'time') return { kind: 'time', path: b.id, label, help };
        if (b.kind === 'colour') return { kind: 'colour', path: b.id, label, help };
        return { kind: 'text', path: b.id, label, help, max: boxMaxLength(b), ...(id === 'addresses' ? { rows: 2 } : {}) };
      })();
      return { ...f, ...when } as FieldsCardField;
    });
  const card = (id: StoreCardId, extra: { top?: ReactNode; cls?: string; extra?: ReactNode } = {}) => (
    <FieldsCard key={id} url={API} screen={{ key: id, value: v.cards[id].value, version: v.cards[id].version }} fields={fieldsOf(id)} texts={cardTexts(id)} canEdit={canEdit} testId={`store-${id}`} bare {...extra} />
  );

  // the trade licence's last day: a reminder when it is under 60 days away (or gone)
  const expiry = String(v.cards.legal.value.tlExpiry ?? '');
  const left = expiry ? Math.round((new Date(`${expiry}T00:00:00Z`).getTime() - new Date().getTime()) / 864e5) : null;
  const dayText = expiry ? new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${expiry}T00:00:00Z`)) : '';

  // the logo slots, in the prototype's order and words; each is replaced where the upload lives (Website › Brand & menus)
  const slotKeys = ['brand.logoPhone', 'brand.logo', 'brand.ogImage', 'brand.favicon'] as const;
  const slotName = { 'brand.logo': 'logo', 'brand.logoPhone': 'logoPhone', 'brand.favicon': 'favicon', 'brand.ogImage': 'ogImage' } as const;
  const brandHref = locateKey('websiteBrand')?.page?.href ?? '/admin/website/brand-menus';
  const logos = (
    <div className="st-logos" data-testid="store-logos">
      {slotKeys.map((k) => (
        <div className="st-slot" key={k}>
          <b>{s(`c.logos.${slotName[k]}`)}</b>
          <Link className="a2-btn" href={brandHref}>
            {s('c.logos.replace')}
          </Link>
        </div>
      ))}
    </div>
  );

  // the web address, the sticker preview and the month so far (Sales so far / Profit so far) the prototype draws
  const sw = (k: string) => t(d, `stp.c.web.${k}`);
  const webTexts = { label: s('c.social.webAddress'), hint: s('c.help.webAddress'), none: sw('none'), change: sw('change'), newLabel: sw('newLabel'), pin: sw('pin'), cancel: sw('cancel'), ok: sw('ok'), saving: sw('saving'), saved: sw('saved'), err: Object.fromEntries(['INVALID_INPUT', 'PIN_REQUIRED', 'WRONG_PIN', 'PIN_NOT_SET', 'PIN_LOCKED', 'FORBIDDEN', 'network', 'other'].map((c) => [c, t(d, `stp.c.web.err.${c}`)])) };
  const stickerTexts = { button: s('c.print.preview'), title: s('c.print.previewTitle'), close: s('c.print.close'), to: s('c.print.to'), sample: s('c.print.sample'), cod: s('c.print.cod') };
  const print = v.cards.print.value as Record<string, string>;
  const currency = String((await access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })) ?? '');
  const money = moneyOf(currency, view.locale);
  const tz = String((await access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID })) ?? 'UTC');
  const targets = v.cards.targets.value as Record<string, number>;
  let month: { salesMinor: number; netMinor: number | null } | null = null;
  try {
    const to = ymdIn(new Date(), tz);
    const from = monthOf(to).from;
    const k = await kpi(access.deps.db, MOTHER_STORE_ID, daysPeriod(from, to, tz));
    let netMinor: number | null = null;
    try {
      netMinor = (await profitReport({ db: access.deps.db, settings: access.deps.resolver as unknown as Parameters<typeof profitReport>[0]['settings'] }, MOTHER_STORE_ID, from, to)).netProfitMinor;
    } catch {
      netMinor = null;
    }
    month = { salesMinor: k.sales.itemsMinor, netMinor };
  } catch {
    month = null;
  }
  const unit = 10 ** money.digits;
  const pct = (minor: number, goal: number) => (goal > 0 ? Math.min(100, Math.max(0, (minor / unit / goal) * 100)) : 0);
  const prog = (label: string, minor: number, goal: number) => (
    <div key={label}>
      <div>
        {label}: <b>{formatMoney(minor, money)}</b> · {pct(minor, goal).toFixed(1)}%
      </div>
      <div className="st-bar" role="progressbar" aria-valuenow={Math.round(pct(minor, goal))} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <i style={{ width: `${pct(minor, goal)}%` }} />
      </div>
    </div>
  );
  const progress = month ? (
    <div className="st-prog" data-testid="store-progress">
      {prog(s('c.targets.salesSoFar'), month.salesMinor, targets.targetSales ?? 0)}
      {month.netMinor !== null ? prog(s('c.targets.profitSoFar'), month.netMinor, targets.targetProfit ?? 0) : null}
      <span className="a2-xs a2-mute">{s('c.targets.d')}</span>
    </div>
  ) : null;

  return (
    <div className="a2-z lm-st" data-lm-ready="" data-testid="store-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} right={<StoreSaveAll canEdit={canEdit} texts={{ save: s('saveAll'), saving: s('saving'), saved: s('savedAll'), nothing: s('nothingToSave'), failed: s('failedAll') }} />} />
      <SectionTabs view={view} current={KEY} />

      {left !== null && left < 60 ? (
        <div className="a2-note a2-mt12" role="status" data-testid="store-licence" data-days={left}>
          <ShellIcon name="alert" size={15} />
          <span>{left >= 0 ? s('licence', { n: left, day: dayText }) : s('licenceGone', { day: dayText })}</span>
        </div>
      ) : null}
      <div className="st-grid">
        {card('legal', { cls: 'st-span2' })}
        {card('addresses')}
        {card('contact')}
        {card('brand', { top: logos })}
        {card('social', { extra: <StoreWebAddress url={API} current={v.webAddress} canEdit={canEdit} texts={webTexts} /> })}
        {card('print', { extra: <StoreStickerPreview head={print.stHead ?? ''} foot={print.stFoot ?? ''} next={v.nextOrder} texts={stickerTexts} /> })}
        {card('numbers')}
        {card('tax')}
        {card('targets', { extra: <div className="a2-fld full">{progress}</div> })}
      </div>

      <details className="st-more a2-sc" data-testid="store-more">
        <summary>{s('more.h')}</summary>
        <p className="a2-scd">{s('more.d')}</p>
        <ul className="st-notes">
          <li>{s('legal.d')}</li>
          {noteIds.map((id) => (
            <li key={id}>{noteOf(id)}</li>
          ))}
          {v.missing.length ? (
            <li data-testid="store-missing" data-missing={v.missing.length}>
              {s('missing', { list: v.missing.map((f) => s(`names.${f}`)).join(', ') })}
            </li>
          ) : null}
        </ul>
      </details>
    </div>
  );
}
