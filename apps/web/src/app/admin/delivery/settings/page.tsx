// S08 · PR 193 — Delivery › Delivery settings (demo 97t-adm2-delivery.js /admin/delivery/settings; docs/ADMIN-ARCHITECTURE.md:
// settings inside their section): first the holiday mode card (Blueprint B1.14) — the switch, the break's first and
// last day, how many days before the notice shows, and the words of the notice and of the checkout's "ships from …".
// Seeing needs `delivery.read`; saving `delivery.charges` (the API checks again). Off as shipped. The demo's other
// cards (stuck hours, book after packing, the suggestion rule, the exact-amount line, trial at delivery) join with
// their PRs. Guide: docs/admin-guide/pages/delivery/settings.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withEta } from '@/lib/admin-eta';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { deliverySettingCards } from '@/lib/delivery-settings-api';
import { t } from '@/lib/i18n';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/delivery/settings';
const API = '/api/admin/delivery/settings';
const KEY = 'deliverySettings';

export async function generateMetadata(): Promise<Metadata> {
  const view = withEta(await adminView());
  return { title: t(view.dict, 'eta.holiday.metaTitle'), robots: { index: false, follow: false } };
}

export default async function DeliverySettingsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withEta(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  const cards = await deliverySettingCards({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('delivery.charges') ?? false;
  const h = (k: string) => t(d, `eta.holiday.${k}`);
  const texts: FieldsCardTexts = {
    h: h('h'),
    d: h('d'),
    save: h('save'),
    saving: h('saving'),
    saved: h('saved'),
    discard: h('discard'),
    unsaved: h('unsaved'),
    readOnly: h('readOnly'),
    pairHelp: h('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, h(`err.${c}`)])),
  };
  const lang = { en: t(d, 'eta.eid.langEn'), bn: t(d, 'eta.eid.langBn') };
  const pair = (k: string) => ({ en: `${h(k)} · ${lang.en}`, bn: `${h(k)} · ${lang.bn}` });
  const holiday: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: h('enabled'), help: h('enabledHelp') },
    { kind: 'date', path: 'from', label: h('from') },
    { kind: 'date', path: 'to', label: h('to') },
    { kind: 'number', path: 'showDaysBefore', label: h('showDaysBefore'), help: h('showDaysBeforeHelp'), min: 0, max: 30 },
    { kind: 'pair', path: 'notice', label: pair('notice'), max: 200 },
    { kind: 'pair', path: 'promise', label: pair('promise'), max: 200 },
  ];
  const c = cards['delivery.holiday'];
  return (
    <div className="a2-z" data-testid="delivery-settings">
      <PageHead view={view} place={locateKey(KEY)} title={h('title')} sub={h('sub')} />
      <SectionTabs view={view} current={KEY} />
      <FieldsCard url={API} screen={{ key: c.key, value: c.value, version: c.version }} fields={holiday} texts={texts} canEdit={canEdit} testId="delivery-holiday" />
    </div>
  );
}
