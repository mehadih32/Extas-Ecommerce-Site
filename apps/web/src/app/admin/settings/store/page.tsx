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
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
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
    d: id === 'legal' ? s('legal.d') : id === 'tax' || id === 'targets' ? s(`c.${id}.d`) : '',
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'PLACEHOLDER', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  });
  const helpOf = (id: string): string | undefined => {
    const k = `stp.c.help.${id}`;
    const h = t(d, k);
    return h === k ? undefined : h;
  };
  const fieldsOf = (id: StoreCardId): FieldsCardField[] =>
    STORE_CARDS[id].map((b: StoreBox): FieldsCardField => {
      const label = s(`c.${id}.${b.id}`);
      const help = helpOf(b.id);
      if (b.kind === 'pair') return { kind: 'pair', path: b.id, label: { en: s(`c.${id}.${b.id}_en`), bn: s(`c.${id}.${b.id}_bn`) }, help, max: boxMaxLength(b) };
      if (b.kind === 'select') return { kind: 'select', path: b.id, label, help, options: (b.options ?? []).map((o) => ({ value: o, label: s(`c.opt.${b.id}.${o}`) })) };
      if (b.kind === 'switch') return { kind: 'switch', path: b.id, label, help };
      if (b.kind === 'number') return { kind: 'number', path: b.id, label, help, min: b.min ?? 0, max: b.max ?? 1_000_000_000 };
      if (b.kind === 'date') return { kind: 'date', path: b.id, label, help };
      if (b.kind === 'time') return { kind: 'time', path: b.id, label, help };
      if (b.kind === 'colour') return { kind: 'colour', path: b.id, label, help };
      return { kind: 'text', path: b.id, label, help, max: boxMaxLength(b) };
    });
  const card = (id: StoreCardId, extra: { top?: ReactNode; cls?: string } = {}) => (
    <FieldsCard key={id} url={API} screen={{ key: id, value: v.cards[id].value, version: v.cards[id].version }} fields={fieldsOf(id)} texts={cardTexts(id)} canEdit={canEdit} testId={`store-${id}`} {...extra} />
  );

  // the trade licence's last day: a reminder when it is under 60 days away (or gone)
  const expiry = String(v.cards.legal.value.tlExpiry ?? '');
  const left = expiry ? Math.round((new Date(`${expiry}T00:00:00Z`).getTime() - Date.now()) / 864e5) : null;
  const dayText = expiry ? new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${expiry}T00:00:00Z`)) : '';

  // the logo slots: what is set, and where it is replaced (the upload lives in Website › Brand & menus)
  const slotKeys = ['brand.logo', 'brand.logoPhone', 'brand.favicon', 'brand.ogImage'] as const;
  const slotName = { 'brand.logo': 'logo', 'brand.logoPhone': 'logoPhone', 'brand.favicon': 'favicon', 'brand.ogImage': 'ogImage' } as const;
  const slots = await Promise.all(slotKeys.map(async (k) => [k, !!(await access.deps.resolver.value(k, { storeId: MOTHER_STORE_ID }))] as const));
  const brandHref = locateKey('websiteBrand')?.page?.href ?? '/admin/website/brand-menus';
  const logos = (
    <div className="st-logos" data-testid="store-logos">
      {slots.map(([k, on]) => (
        <div className="st-slot" key={k}>
          <b>{s(`c.logos.${slotName[k]}`)}</b>
          <span className={`st-slotst${on ? ' on' : ''}`}>{on ? s('c.logos.isSet') : s('c.logos.notSet')}</span>
          <Link className="a2-btn" href={brandHref}>
            {s('c.logos.replace')}
          </Link>
        </div>
      ))}
      <p className="a2-scd st-logonote">{s('c.logos.note')}</p>
    </div>
  );

  return (
    <div className="a2-z lm-st" data-lm-ready="" data-testid="store-page">
      <PageHead view={view} place={locateKey(KEY)} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current={KEY} />

      {left !== null && left < 60 ? (
        <div className="a2-note a2-mt12" role="status" data-testid="store-licence" data-days={left}>
          <ShellIcon name="alert" size={15} />
          <span>{left >= 0 ? s('licence', { n: left, day: dayText }) : s('licenceGone', { day: dayText })}</span>
        </div>
      ) : null}
      {v.missing.length ? (
        <div className="a2-note a2-mt12" role="status" data-testid="store-missing" data-missing={v.missing.length}>
          <ShellIcon name="alert" size={15} />
          <span>{s('missing', { list: v.missing.map((f) => s(`names.${f}`)).join(', ') })}</span>
        </div>
      ) : null}

      <div className="st-grid">
        {card('legal', { cls: 'st-span2' })}
        {card('addresses')}
        {card('contact')}
        {card('brand', { top: logos })}
        {card('social')}
        {card('print')}
        {card('numbers')}
        {card('tax')}
        {card('targets')}
      </div>
    </div>
  );
}
