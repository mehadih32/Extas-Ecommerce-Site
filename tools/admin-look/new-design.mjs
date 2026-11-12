#!/usr/bin/env node
// PR 12 (CN-025) — adds a design to an admin page in one command (docs/admin-guide/HOW-TO-ADD-A-DESIGN.md):
//
//   pnpm admin:design <page> <KEY> [--en "English name"] [--bn "বাংলা নাম"]
//
// It writes the design's render module (apps/web/src/components/admin/look/<page>/<KEY>.tsx, a working start: the
// page's shared header and its first figures, drawn from the page's one loader) and its one line in the look registry
// (components/admin/look/registry.ts, at the `// admin:design <page>` marker). Nothing else changes: Settings → Admin
// look, the "…" menu and PUT /api/admin/look read the registry, so the new design can be previewed (`?design=KEY`),
// picked by a person and made the team default at once. A key the page already has, an unknown page, or a page whose
// route does not draw through the registry yet is refused, and nothing is written.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOOK_DIR = 'apps/web/src/components/admin/look';
export const REGISTRY = `${LOOK_DIR}/registry.ts`;

const PAGE = /^[a-z][a-z0-9-]{1,39}$/;
const KEY = /^[A-Z]$/;

/** The pages whose route draws its designs through the registry, and the start a new design gets. */
export const STARTS = {
  orders: (ident, key, name) => `// PR 656 (CN-025) — Orders design ${key}, "${name.en}". Made with \`pnpm admin:design orders ${key}\`
// (docs/admin-guide/HOW-TO-ADD-A-DESIGN.md). Load the same \`OrderListData\` design A reads (\`loadOrderList\`,
// \`@/lib/admin-orders/list\`) — never a second figure or a guess — and draw it with the shared pieces
// (OrderFilters, OrderTable, ViewChips, EmptyList, Kpis — all exported from OrderListPage.tsx).
import { EmptyList, Kpis, ordersDict, readDeps } from '@/components/admin/orders/OrderListPage';
import { OrderTable } from '@/components/admin/orders/OrderTable';
import { PageHead, SectionTabs } from '@/components/admin/shell/ShellParts';
import { loadOrderList } from '@/lib/admin-orders/list';
import { listHref, type ListPageId } from '@/lib/admin-orders/model';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { LookMenu } from '../LookMenu';
import { LookThumb } from '../thumbs';
import type { LookDesign } from '../types';
import type { OrdersDesignProps } from './common';

async function Orders${key}(p: OrdersDesignProps) {
  const { view, a, query, now, menu } = p;
  const d = view.dict;
  const page: ListPageId = 'all';
  const data = await loadOrderList(readDeps(a.deps), a.who, view, page, query);
  return (
    <div className="a2-z" data-testid="orders-list" data-design="${key}" data-lm-ready="">
      <PageHead view={view} place={locateKey('orders')} title={t(d, 'orders.page.all')} sub={t(d, 'orders.list.sub')} right={<LookMenu {...menu} />} />
      <SectionTabs view={view} current="orders" />
      <Kpis view={view} a={a} counts={data.counts} now={now} />
      {data.rows.length ? <OrderTable dict={ordersDict(view)} rows={data.rows} bulk={null} /> : <EmptyList view={view} filtered={false} clear={listHref(page, { view: query.view })} all={query.view === 'all'} />}
    </div>
  );
}

export const ${ident}: LookDesign<OrdersDesignProps, 'list'> = {
  key: '${key}',
  name: { en: ${JSON.stringify(name.en)}, bn: ${JSON.stringify(name.bn)} },
  desc: { en: ${JSON.stringify(name.en)}, bn: ${JSON.stringify(name.bn)} },
  parts: ['list'],
  Render: Orders${key},
  Thumb: () => <LookThumb page="orders" id="${key}" />,
};
`,
  dashboard: (ident, key, name) => `// PR 12 (CN-025) — Dashboard design ${key}, "${name.en}". Made with \`pnpm admin:design dashboard ${key}\`
// (docs/admin-guide/HOW-TO-ADD-A-DESIGN.md). Draw the page from \`p.data\`: the loader reads only the parts listed below
// (lib/admin-look/dashboard-data.ts DASH_PARTS), and only those the person may see. Words come from the admin
// dictionary (\`p.f.t\`), numbers and money from \`p.f\`, pieces from kit.tsx: nothing is typed in here.
import type { DashPart } from '@/lib/admin-look/dashboard-data';
import { Card } from '../kit';
import { LookThumb } from '../thumbs';
import type { LookDesign } from '../types';
import { DashHead, type DashProps } from './common';

function Dashboard${key}(p: DashProps) {
  const { f, data } = p;
  const m = data.money;
  return (
    <div className="a2-z a3-dash" data-testid="dash" data-design="${key}">
      <DashHead p={p} />
      {m ? (
        <div className="a3-dg2">
          <Card title={f.t('dsh.sales')} sub={f.t('dsh.salesNote')} testId="dash-kpi-sales">
            <b className="a3-hv a3-num">{f.money(m.cur.sales.itemsMinor)}</b>
          </Card>
          <Card title={f.t('dsh.ordered')} sub={f.t('dsh.orderedNote', { n: f.n(m.cur.ordered.orders) })} testId="dash-kpi-ordered">
            <b className="a3-hv a3-num">{f.money(m.cur.ordered.valueMinor)}</b>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

export const ${ident}: LookDesign<DashProps, DashPart> = {
  key: '${key}',
  name: { en: ${JSON.stringify(name.en)}, bn: ${JSON.stringify(name.bn)} },
  desc: { en: ${JSON.stringify(name.en)}, bn: ${JSON.stringify(name.bn)} },
  parts: ['money', 'queues'],
  Render: Dashboard${key},
  Thumb: () => <LookThumb page="dashboard" id="${key}" />,
};
`,
  products: (ident, key, name) => `// PR 657 (CN-025) — Products design ${key}, "${name.en}". Made with \`pnpm admin:design products ${key}\`
// (docs/admin-guide/HOW-TO-ADD-A-DESIGN.md). Draw the page from the one loader (\`loadProductList\`, \`@/lib/admin-
// products\`) and reuse \`ProductsHeader\`/\`ProductListBody\` (components/admin/products/ProductListPage.tsx) for the
// tiles, search, chips, table and bulk bar — add your own chrome around them; CN-044: read-only, never a write.
import { ProductsHeader, ProductListBody } from '@/components/admin/products/ProductListPage';
import { loadProductList } from '@/lib/admin-products';
import { LookThumb } from '../thumbs';
import type { LookDesign } from '../types';
import type { ProductsDesignProps } from './common';

async function Products${key}(p: ProductsDesignProps) {
  const { view, c, query, menu } = p;
  const data = await loadProductList(c, view.locale, query);
  const canWrite = c.can('catalogue.write');
  const canPublish = c.can('catalogue.publish');
  return (
    <div className="a2-z" data-testid="products-list" data-design="${key}" data-lm-ready="">
      <ProductsHeader view={view} canWrite={canWrite} menu={menu} />
      <ProductListBody view={view} query={query} data={data} canWrite={canWrite} canPublish={canPublish} />
    </div>
  );
}

export const ${ident}: LookDesign<ProductsDesignProps, 'list'> = {
  key: '${key}',
  name: { en: ${JSON.stringify(name.en)}, bn: ${JSON.stringify(name.bn)} },
  desc: { en: ${JSON.stringify(name.en)}, bn: ${JSON.stringify(name.bn)} },
  parts: ['list'],
  Render: Products${key},
  Thumb: () => <LookThumb page="products" id="${key}" />,
};
`,
};

const camel = (page) => page.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/**
 * What adding the design changes, without touching the disk: the registry's new text and the module to create.
 * `has(path)` answers whether a file exists already.
 */
export function planDesign({ registry, page, key, en, bn, has = () => false }) {
  if (!PAGE.test(page ?? '')) throw new Error(`"${page}" is not a page id (small letters, digits and -)`);
  if (!KEY.test(key ?? '')) throw new Error(`"${key}" is not a design key (one capital letter, A–Z)`);
  const marker = `// admin:design ${page}`;
  const lines = registry.split('\n');
  const at = lines.findIndex((l) => l.trim() === marker);
  if (at < 0) throw new Error(`the look registry has no page "${page}" (no "${marker}" line in ${REGISTRY})`);
  const start = STARTS[page];
  if (!start) throw new Error(`the ${page} page does not draw its designs through the registry yet; its redesign follow-up adds that first`);
  // The page's block: from its `id: '<page>'` line to the marker.
  const from = lines.slice(0, at).map((l, i) => [l, i]).filter(([l]) => l.includes(`id: '${page}'`)).pop();
  const block = lines.slice(from ? from[1] : 0, at).join('\n');
  const ident = `${camel(page)}${key}`;
  if (new RegExp(`\\b${ident}\\b`).test(registry) || new RegExp(`key: '${key}'`).test(block)) throw new Error(`the ${page} page already has a design ${key}`);
  const file = `${LOOK_DIR}/${page}/${key}.tsx`;
  if (has(file)) throw new Error(`${file} exists already`);

  const indent = lines[at].match(/^\s*/)[0];
  const out = [...lines.slice(0, at), `${indent}${ident},`, ...lines.slice(at)];
  // The import goes after the registry's last import from './<page>/…', else after its last import.
  const imp = `import { ${ident} } from './${page}/${key}';`;
  const imports = out.map((l, i) => [l, i]).filter(([l]) => l.startsWith('import '));
  const same = imports.filter(([l]) => l.includes(`from './${page}/`)).pop();
  const after = same ?? imports.pop();
  out.splice(after ? after[1] + 1 : 0, 0, imp);
  const name = { en: en || `Design ${key}`, bn: bn || `ডিজাইন ${key}` };
  return { registry: out.join('\n'), file: { path: file, text: start(ident, key, name) }, ident };
}

function arg(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function main(argv = process.argv.slice(2), root = ROOT, log = console.log) {
  const [page, key] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
  const registryPath = join(root, REGISTRY);
  const plan = planDesign({ registry: readFileSync(registryPath, 'utf8'), page, key, en: arg(argv, '--en'), bn: arg(argv, '--bn'), has: (p) => existsSync(join(root, p)) });
  mkdirSync(dirname(join(root, plan.file.path)), { recursive: true });
  writeFileSync(join(root, plan.file.path), plan.file.text);
  writeFileSync(registryPath, plan.registry);
  log(`Added ${page} design ${key}: ${plan.file.path} and its line in ${REGISTRY}. Preview it at ?design=${key}.`);
  return plan;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (e) {
    console.error(`admin:design: ${e.message}`);
    process.exit(1);
  }
}
