// S03 · PR 90 (with 571, 99, 104) — Combos & customer sets (demo #/admin/combos), in its own admin section: the auto
// colour-pair rules (?tab= auto, the default), "+ Make a combo" (?tab=new, &rule= to change one), the Archive, and the
// fixed combos with their price box and switches, the editor with its live preview, and what customers can combine
// (the set tiers from Smart Rules), and the combo report (?tab=report&days=). Reading needs `combos.read`; changing `combos.write`; switching on or off
// `combos.publish`; a set price `combos.prices` (the owner's decision). The API checks each again on every call.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cb from '@extas/combos';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { registry } from '@extas/settings';
import { ComboReportView } from '@/components/admin/combos/ComboReportView';
import { CombosScreen } from '@/components/admin/combos/CombosScreen';
import { combosTab, money } from '@/components/admin/combos/model';
import { SetTiers } from '@/components/admin/combos/SetTiers';
import { adminDeps } from '@/lib/admin-auth';
import { combosAccess, setPhotoUrls, storeCurrency } from '@/lib/admin-combos';
import { ADMIN_LOGIN, ADMIN_PAGES } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/combos';
const KEY = 'combos';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'combos.metaTitle'), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** The report's days box: the setting's own limits; a number outside them opens the default window. */
const DAYS = registry['combos.report.defaultDays'].schema as unknown as { minValue: number; maxValue: number; safeParse(v: unknown): { success: boolean } };
const daysOf = (v: string | undefined) => {
  const n = v === undefined ? Number.NaN : Number(v);
  return DAYS.safeParse(n).success ? n : undefined;
};

export default async function CombosPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp] = await Promise.all([adminView(deps), searchParams]);
  const tab = combosTab(one(sp.tab));
  const ruleId = tab === 'new' ? (one(sp.rule) ?? null) : null;
  const access = await pageAccess('combos.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const a = combosAccess(access);
  const [combos, options, currency, rules, templates, seasons, roundingStepMinor, setTiers] = await Promise.all([
    cb.listCombos(a.deps, a.who),
    cb.comboOptions(a.deps, a.who),
    storeCurrency(a),
    cb.listAutoRules(a.deps, a.who),
    cb.shopTemplates(a.deps, a.storeId),
    a.deps.settings.value('combos.seasons', { storeId: a.storeId }) as Promise<{ key: string; en: string; bn?: string | null }[]>,
    a.deps.settings.value('combos.price.roundingStepMinor', { storeId: a.storeId }) as Promise<number>,
    tab === 'fixed' ? cb.listSetTiers(a.deps, a.who) : Promise.resolve([]),
  ]);
  // CN-018 (4): the store's set-split setting (Fixed / Flexible), on the fixed tab only
  const split = tab === 'fixed' ? await cb.splitOptions(a.deps, a.who) : null;
  const report = tab === 'report' ? await cb.comboReport(a.deps, a.who, { days: daysOf(one(sp.days)) }) : null;
  const photos = await setPhotoUrls(a, combos);
  const editRule = ruleId ? (rules.find((r) => r.id === ruleId && !r.upsellOf) ?? null) : null;
  const upsellRule = editRule?.upsell ? (rules.find((r) => r.id === editRule.upsell!.id) ?? null) : null;

  return (
    <AdminFrame view={view} current={KEY}>
      <CombosScreen
        dict={view.dict}
        lang={view.lang}
        locale={view.locale}
        currency={currency}
        tab={tab}
        here={HERE}
        combos={combos}
        rules={rules}
        templates={templates}
        categories={options.categories}
        seasons={seasons}
        roundingStepMinor={roundingStepMinor}
        editRule={editRule}
        upsellRule={upsellRule}
        products={options.products}
        photos={photos}
        perms={a.perms}
        split={split}
        tiers={
          tab === 'fixed' ? (
            <SetTiers
              dict={view.dict}
              lang={view.lang}
              fmt={(m) => money(m, view.locale, currency)}
              num={(n) => n.toLocaleString(view.locale)}
              tiers={setTiers}
              rulesHref={ADMIN_PAGES.find((p) => p.key === 'rules')!.href}
            />
          ) : null
        }
        report={
          report ? (
            <ComboReportView
              dict={view.dict}
              lang={view.lang}
              fmt={(m) => money(m, view.locale, currency)}
              num={(n) => n.toLocaleString(view.locale)}
              report={report}
              minDays={DAYS.minValue}
              maxDays={DAYS.maxValue}
              here={HERE}
            />
          ) : null
        }
        tabs={
          <div className="cb-gtabs">
            <SystemTabs view={view} current={KEY} group="combos" />
          </div>
        }
      />
    </AdminFrame>
  );
}
