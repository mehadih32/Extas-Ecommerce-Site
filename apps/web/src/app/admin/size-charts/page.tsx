// PR 27, 28 — size charts (demo #/admin/size-charts): one chart per product type and fit, a default per category,
// a copy for a style that fits differently. Needs `catalogue.read` to see and `catalogue.write` to change; the API
// checks both again on every call.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminFrame, AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead } from '@/components/admin/shell/ShellParts';
import { locateKey } from '@/lib/admin-shell/sections';
import { SizeCharts, type SizeChartCategory, type SizeChartGarmentType } from '@/components/admin/SizeCharts';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { adminDeps } from '@/lib/admin-auth';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../messages/admin-sizecharts.bn.json';
import en from '../../../../messages/admin-sizecharts.en.json';

export const dynamic = 'force-dynamic';

const HERE = '/admin/size-charts';
const KEY = 'sizeCharts';

/** The admin dictionary with this screen's own messages under `sizeCharts.*`. */
function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: { ...view.dict, sizeCharts: (view.lang === 'bn' ? bn : en) as Dict },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: t(view.dict, 'sizeCharts.metaTitle'),
    robots: { index: false, follow: false },
  };
}

function flatten(nodes: cat.CategoryNode[], lang: 'bn' | 'en', sep: string): SizeChartCategory[] {
  return nodes.flatMap((n) => [
    {
      id: n.id,
      name: (lang === 'bn' ? n.pathBn : n.pathEn).join(sep),
      garmentTypeId: n.effectiveGarmentType?.id ?? null,
    },
    ...flatten(n.children, lang, sep),
  ]);
}

export default async function SizeChartsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('catalogue.read', deps)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const d = {
    db: access.deps.db,
    settings: access.deps.resolver,
    now: access.deps.now,
  };
  const who: cat.Who = {
    actor: access.guard.actor,
    storeId: MOTHER_STORE_ID,
    ctx: access.guard.ctx,
  };
  const lang = view.lang;
  const [charts, options, tree, types, sizes] = await Promise.all([
    cat.listSizeCharts(d, who, { includeArchived: true }),
    cat.sizeChartOptions(d, who),
    cat.categoryTree(d, who),
    cat.listGarmentTypes(d, who),
    cat.listSizes(d, who),
  ]);
  const open = charts.find((c) => !c.archived) ?? charts[0];
  const first = open ? await cat.getSizeChart(d, who, open.id) : null;
  const sep = t(view.dict, 'sizeCharts.sep');
  const garmentTypes: SizeChartGarmentType[] = types.map((g) => ({
    id: g.id,
    name: lang === 'bn' ? g.nameBn : g.nameEn,
    fields: g.measurementFields.map((f) => ({
      key: f.key,
      label: lang === 'bn' ? f.labelBn : f.labelEn,
    })),
  }));
  const dict = view.dict;
  // PR 788 (prototype v5 parity): the figures and the "no default chart" note above the charts
  const cats = flatten(tree, lang, sep);
  const live = charts.filter((c) => !c.archived);
  const withDefault = new Set(live.flatMap((c) => c.defaultFor.map((x) => x.id)));
  const missing = cats.filter((c) => !withDefault.has(c.id));
  const num = new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' });
  const figs: [string, string][] = [
    [t(dict, 'sizeCharts.k.saved'), num.format(live.length)],
    [t(dict, 'sizeCharts.k.defaults'), `${num.format(cats.length - missing.length)}/${num.format(cats.length)}`],
    [t(dict, 'sizeCharts.k.used'), num.format(live.reduce((n, c) => n + c.usedBy, 0))],
    // PR 831 (prototype v5): the 4th figure, exchanges for a wrong size in the last 30 days
    [t(dict, 'sizeCharts.k.exchanges'), num.format(await cat.wrongSizeExchanges30(d, who))],
  ];
  return (
    <AdminFrame view={view} current={KEY} ready crumb={false}>
      <PageHead view={view} place={locateKey(KEY)} title={t(dict, 'sizeCharts.title')} sub={t(dict, 'sizeCharts.intro')} />
      <div className="a2-kpis a2-mt12" data-testid="sizecharts-kpis">
        {figs.map(([label, value]) => (
          <div key={label} className="a2-card a2-kpi">
            <div className="a2-kl">{label}</div>
            <div className="a2-kv">{value}</div>
          </div>
        ))}
      </div>
      <div className={`a2-note a2-mt12${missing.length ? '' : ' ok'}`} role="note" data-testid="sizecharts-note">
        {missing.length ? t(dict, missing.length > 1 ? 'sizeCharts.k.missingMany' : 'sizeCharts.k.missingOne', { names: missing.slice(0, 4).map((c) => c.name).join(', ') }) : t(dict, 'sizeCharts.k.allSet')}
      </div>
      <SizeCharts
        dict={dict}
        lang={lang}
        charts={charts}
        detail={first}
        options={options}
        categories={flatten(tree, lang, sep)}
        garmentTypes={garmentTypes}
        sizes={[...sizes].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)).map((s) => ({ key: s.key, label: s.label }))}
        canWrite={access.guard.permissions?.has('catalogue.write') ?? false}
      />
    </AdminFrame>
  );
}
