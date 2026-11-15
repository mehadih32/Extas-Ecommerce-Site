// PR 718 (admin prototype v5 · docs/demo/admin-proto-v5/GAP-MAP.md "Policies: 5 new pages … history", placed under
// Website) — Website › Policies at /admin/website/policies (?page=): the shop's nine policy pages (Terms, Privacy,
// Delivery, Exchange & returns, Payment & COD, Cancellation & Refund, Wallet & coupons, Reviews, Cookies), each with its
// words in English and Bengali, a live preview, its state (live, live with a draft waiting, or draft), who changed it last
// and when, a link to the public page and the version history with restore. The five pages the shop already had share
// their words with Settings › Policies & texts (kept there as version 1); the four new ones are read by the shop from
// this page's history. The words are the owner's own: nothing is written for him. Seeing needs `website.read`, changing
// `settings.write` (the API checks again). lib/website-policies, components/admin/website/PoliciesTab.
// Guide: docs/admin-guide/pages/website/policies.md.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as del from '@extas/delivery';
import * as rl from '@extas/rules';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { deliveryDeps } from '@/lib/delivery-api';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PolicyHeadButtons } from '@/components/admin/website/PolicyHeadButtons';
import { PoliciesTab, type StarterSec } from '@/components/admin/website/PoliciesTab';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { paymentModeOf } from '@/lib/payments-gateway';
import { isPolicySlug, POLICY_SLUGS } from '@/lib/website-policies/model';
import { policyTabView } from '@/lib/website-policies/service';
import bn from '../../../../../messages/admin-website-policies.bn.json';
import en from '../../../../../messages/admin-website-policies.en.json';
import '../../settings-cards.css';
import './policies.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/policies';
const KEY = 'websitePolicies';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

/** The screen's nested words as one flat list of `a.b` keys (the editor reads them by name). */
function flat(o: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === 'string') acc[prefix + k] = v;
    else if (v && typeof v === 'object') Object.assign(acc, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    return acc;
  }, {});
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'pw.metaTitle'), robots: { index: false, follow: false } };
}

export default async function WebsitePoliciesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('website.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  const asked = typeof sp.page === 'string' && isPolicySlug(sp.page) ? sp.page : POLICY_SLUGS[0];
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(`${HERE}?page=${asked}`)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="pol-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="website.read" />
      </div>
    );
  const v = await policyTabView({ db: access.deps.db, resolver: access.deps.resolver, paymentMode: paymentModeOf }, { actor: access.guard.actor, ctx: access.guard.ctx });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;
  const { starter: _starter, ...pwWords } = (view.lang === 'bn' ? bn : en).pw as unknown as Record<string, unknown>;
  void _starter;
  const words = flat(pwWords);
  const starter = { en: (en.pw as unknown as { starter: Record<string, StarterSec[]> }).starter, bn: (bn.pw as unknown as { starter: Record<string, StarterSec[]> }).starter };
  const [licence, dbid, address] = await Promise.all(['legal.tradeLicence', 'legal.dbid', 'contact.address'].map(async (k) => {
    try {
      const v = await access.deps.resolver.value(k as never, { storeId: MOTHER_STORE_ID });
      return typeof v === 'string' && v.trim() ? v : null;
    } catch {
      return null;
    }
  }));
  const names = Object.fromEntries(POLICY_SLUGS.map((s) => [s, words[`names.${s}`]!]));
  // "At a glance": the numbers the shop's own Rules already hold, read live so a page never disagrees with checkout.
  const glance: Record<string, { label: string; value: string; sub?: string }[]> = {};
  try {
    const dwho: del.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
    const [bands, currency] = await Promise.all([del.listBands(deliveryDeps(access.deps), dwho), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
    const money = moneyOf(currency, view.locale);
    const nm = (b: (typeof bands)[number]) => (view.lang === 'bn' && b.nameBn ? b.nameBn : b.nameEn);
    const num = (x: number) => formatNumber(x, view.locale);
    const hours = (b: (typeof bands)[number]) => {
      const one = b.hoursMax ?? b.hoursMin;
      if (b.hoursMin != null && b.hoursMax != null && b.hoursMin !== b.hoursMax) return t(d, 'pw.glance.hours', { n: `${num(b.hoursMin)}–${num(b.hoursMax)}` });
      return one != null ? t(d, 'pw.glance.hours', { n: num(one) }) : undefined;
    };
    const live = bands.filter((b) => b.enabled);
    if (live.length) {
      glance['delivery'] = live.map((b) => ({ label: nm(b), value: formatMoney(b.chargeMinor, money), sub: hours(b) }));
      glance['payment'] = live.filter((b) => b.codLimitMinor !== null).map((b) => ({ label: t(d, 'pw.glance.codLimit', { name: nm(b) }), value: formatMoney(b.codLimitMinor!, money) }));
    }
  } catch {
    /* no rules to show: the page still works without the strip */
  }
  // …and the numbers of the shop's live Rules (Exchange hours, free-delivery limit, discounts …), by the page they belong to.
  try {
    const kindsOf: Record<string, string[]> = { delivery: ['delivery'], exchange: ['exchange'], payment: ['payment'], wallet: ['discount'], cancellation: ['policy'], reviews: ['policy'], cookies: ['policy'], terms: ['policy'], privacy: ['policy'] };
    const live = (await rl.activeRules(access.deps.db, MOTHER_STORE_ID)).filter((r) => rl.isLive(r, new Date()));
    const currency = (await access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })) as string;
    const ctx = { locale: view.locale, currency: typeof currency === 'string' ? currency : 'BDT', timeZone: view.timeZone };
    for (const slug of POLICY_SLUGS) {
      const cards: { label: string; value: string; sub?: string }[] = [];
      for (const r of live.filter((x) => (kindsOf[slug] ?? []).includes(x.kind))) {
        for (const p of r.params) {
          if (p.type === 'text' || p.type === 'datetime' || p.type === 'bool') continue;
          const val = rl.formatValue(p.type, p.value, ctx);
          if (val === null) continue;
          cards.push({ label: view.lang === 'bn' && p.labelBn ? p.labelBn : p.labelEn, value: p.type === 'hours' ? t(d, 'pw.glance.hours', { n: val }) : val });
        }
      }
      if (cards.length) glance[slug] = [...(glance[slug] ?? []), ...cards].slice(0, 8);
    }
  } catch {
    /* the strip stays as it was */
  }

  return (
    <div className="a2-z" data-testid="pol-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'pw.title')} sub={t(d, 'pw.sub')} right={<PolicyHeadButtons rulesLabel={t(d, 'pw.openRules')} publishLabel={t(d, 'pw.publishHead')} canEdit={canEdit} />} />
      <SectionTabs view={view} current={KEY} />
      <PoliciesTab glance={glance} rows={v.rows} w={words} names={names} initial={asked} canEdit={canEdit} locale={view.locale} timeZone={view.timeZone} shopLang={view.lang === 'bn' ? 'bn' : 'en'} starter={starter} legal={{ licence, dbid, address }} />
    </div>
  );
}
