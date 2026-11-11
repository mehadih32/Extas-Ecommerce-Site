// PR 654 (CN-044, ERP lane, task 2) — `tsx src/erp-sku-stock-compare-cli.ts --out <dir>`: a read-only SKU/stock
// comparison between the shop's catalogue and the live ERP's own SKU and stock data, run on the server from the
// release's migrate image (infra/deploy/erp-sku-stock-compare.sh, called on demand and nightly by
// .github/workflows/erp-sku-stock-compare.yml). It reads only DATABASE_URL (the settings and the vault's rows) and
// VAULT_MASTER_KEY — exactly the worker's own environment (main.ts) — and uses whichever ERP connection the owner has
// already set up per store on Keys & connections / Settings → ERP link. It never reads, types or logs a key itself;
// the vault's own access log records who opened it (the usual `createConnections` path), same as every other sync.
//
// Strictly read-only: every ERP call this makes is a GET (health, variants, stock — through @extas/inventory's
// `buildSkuStockReport`, itself built on PR 207's already-shipped `reconcileWithErp`). Nothing is ever pushed to the
// ERP, and nothing in the shop's own stock or price numbers is written; the only write anywhere in this run is
// `reconcileWithErp`'s own ErpSyncRun row — an audit summary of the check itself, exactly what the already-shipped
// hourly job (`inventory.erp.reconcile`) writes today. A store with no ERP, or still on the practice ERP, is skipped
// (never reported as a failure); a real connection that cannot be reached is reported as failed.
// Exit 0 always: there is nothing here for a release to gate on (unlike erp-acceptance's practice-ERP checks) — this
// is informational for the owner, never a reason to stop a deploy.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allAdapters, createConnections } from '@extas/adapters';
import { SYSTEM } from '@extas/auth';
import { disconnectPrisma, getPrisma } from '@extas/db/client';
import { buildSkuStockReport, skuStockComparePage, storesWithErp, type SkuStockReport } from '@extas/inventory';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { createVault } from '@extas/vault';

function writeReport(out: string, stores: { storeId: number; report: SkuStockReport }[], now: Date): void {
  mkdirSync(out, { recursive: true });
  const json = {
    at: now.toISOString(),
    stores: stores.map((s) => ({
      storeId: s.storeId,
      status: s.report.status,
      reason: s.report.reason,
      error: s.report.error,
      stock: s.report.stock && { matched: s.report.stock.matched, counts: s.report.stock.counts, complete: s.report.stock.complete },
      variants: s.report.variants && { matched: s.report.variants.matched, onlyInErp: s.report.variants.onlyInErp, onlyInShop: s.report.variants.onlyInShop, noShopPrice: s.report.variants.noShopPrice, complete: s.report.variants.complete },
    })),
  };
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(json, null, 2)}\n`);
  writeFileSync(join(out, 'README.md'), skuStockComparePage(stores, now));
}

async function main(argv: string[]): Promise<number> {
  const at = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const out = at('--out');
  if (!out) {
    console.error('usage: erp-sku-stock-compare-cli.ts --out <dir>');
    return 2;
  }
  if (!process.env.DATABASE_URL) {
    console.error('erp sku/stock compare: DATABASE_URL is not set');
    return 2;
  }
  const now = new Date();
  const db = getPrisma();
  try {
    const settings = new SettingsResolver(prismaBackend(db), registry);
    const key = process.env.VAULT_MASTER_KEY;
    const vault = key && key.length >= 32 ? createVault(db, key) : { get: async () => null };
    const [testS, cacheS] = await Promise.all([settings.value('system.integrationTestTimeoutSeconds'), settings.value('system.integrationKeyCacheSeconds')]);
    const connections = createConnections({ db, vault, adapters: allAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
    const deps = { db, settings, connections };
    const stores = await storesWithErp(deps);
    const results: { storeId: number; report: SkuStockReport }[] = [];
    for (const s of stores) {
      const report = await buildSkuStockReport(deps, { actor: SYSTEM, storeId: s.storeId, ctx: { source: 'job' } });
      results.push({ storeId: s.storeId, report });
    }
    writeReport(out, results, now);
    if (!results.length) console.log('erp sku/stock compare: no store has an ERP set up');
    for (const r of results) {
      const r2 = r.report;
      const tail = r2.status === 'succeeded' ? ` — stock matched ${r2.stock!.matched}, SKUs matched ${r2.variants!.matched}, onlyInErp ${r2.variants!.onlyInErp.length}, onlyInShop ${r2.variants!.onlyInShop.length}, noShopPrice ${r2.variants!.noShopPrice.length}` : r2.reason ? ` (${r2.reason})` : r2.error ? ` (${r2.error.code})` : '';
      console.log(`erp sku/stock compare: store ${r.storeId} ${r2.status}${tail}`);
    }
    return 0;
  } finally {
    await disconnectPrisma();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`erp sku/stock compare: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
