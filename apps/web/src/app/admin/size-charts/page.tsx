// PR 27, 28 — size charts (demo #/admin/size-charts): one chart per product type and fit, a default per category,
// a copy for a style that fits differently. Needs `catalogue.read` to see and `catalogue.write` to change; the API
// checks both again on every call.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminFrame, AdminNotice } from '@/components/admin/AdminFrame';
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
  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd">
        <h1 className="ad-h1">{t(dict, 'sizeCharts.title')}</h1>
        <p className="ad-intro sc-intro">{t(dict, 'sizeCharts.intro')}</p>
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
