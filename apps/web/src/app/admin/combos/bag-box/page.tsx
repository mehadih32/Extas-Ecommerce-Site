// S02 · PR 598 (register "Site builder", V2.1 tiered bag offers; demo 89u-bag-offers.js) — Products › Combos › Bag tier
// box at /admin/combos/bag-box, in the Lumen look (data-lm-ready, --lm-* tokens, the one toast): the bag's "Take 2 │
// Take 3 │ Take 4" box: its switch, days, how many tiers, the phone preview, which Build-your-own-set rules show and the
// owner's own words per tier, with a computer and phone preview (components/admin/combos/BagBoxEditor.tsx). The tiers
// and prices are the rules' own (Smart Rules, linked); this page never writes a price. Seeing needs `combos.read`;
// saving `combos.write` (the API checks again; audited combos.bagbox.save). lib/website/bag-box-admin.ts.
// Guide: docs/admin-guide/pages/products/bag-box.md. The rest of PR 598 stays paused.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cb from '@extas/combos';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { BagBoxEditor, type BoxRule } from '@/components/admin/combos/BagBoxEditor';
import { money } from '@/components/admin/combos/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { combosAccess, storeCurrency } from '@/lib/admin-combos';
import { ADMIN_LOGIN, ADMIN_PAGES } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { bagBoxView } from '@/lib/website/bag-box-admin';
import bn from '../../../../../messages/admin-bagbox.bn.json';
import en from '../../../../../messages/admin-bagbox.en.json';
import './bag-box.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/combos/bag-box';
const KEY = 'combosBagBox';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'bb.metaTitle'), robots: { index: false, follow: false } };
}

export default async function BagBoxPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('combos.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="combos.read" />
      </div>
    );
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `bb.${k}`, vars);
  const a = combosAccess(access);
  const [bv, tiers, currency] = await Promise.all([bagBoxView({ db: access.deps.db, resolver: access.deps.resolver }), cb.listSetTiers(a.deps, a.who), storeCurrency(a)]);
  const bnLang = view.lang === 'bn';
  const nm = (en: string, bnName: string | null) => (bnLang && bnName) || en;
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '');
  const rules: BoxRule[] = tiers.map((r) => ({
    key: r.key,
    name: nm(r.nameEn, r.nameBn),
    state: r.state,
    covers: [
      r.include.map((x) => (x.type === 'all' ? g('all') : nm(x.nameEn, x.nameBn) || g('missing'))).join(', '),
      r.exclude.length ? g('except', { names: r.exclude.map((x) => nm(x.nameEn, x.nameBn)).join(', ') }) : '',
      g('products', { n: r.products.toLocaleString(view.locale) }),
    ]
      .filter(Boolean)
      .join(' · '),
    days: r.startsAt || r.endsAt ? g('days', { from: day(r.startsAt) || '—', to: day(r.endsAt) || '—' }) : '',
    tiers: r.tiers.map((x) => ({ quantity: x.quantity, price: x.priceMinor === null ? null : money(x.priceMinor, view.locale, currency) })),
  }));
  const canEdit = access.guard.permissions?.has('combos.write') ?? false;
  return (
    <div className="a2-z bbx-page" data-testid="bb-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="lm-hint bbx-note" role="note">
        {g('note')}
      </p>
      {!canEdit ? <p className="lm-sub">{g('readOnly')}</p> : null}
      <BagBoxEditor key={bv.version} box={bv.box} version={bv.version} rules={rules} rulesHref={ADMIN_PAGES.find((p) => p.key === 'rules')!.href} canEdit={canEdit} lang={bnLang ? 'bn' : 'en'} w={((d.bb as Dict) ?? {}) as never} />
    </div>
  );
}
