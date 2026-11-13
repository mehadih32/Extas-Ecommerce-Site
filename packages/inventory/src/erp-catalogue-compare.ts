// PR 654 (CN-044, ERP lane, task 2) — a read-only SKU/stock comparison between the shop's catalogue and the live
// ERP's own SKU and stock data. It reuses PR 207's already-shipped, read-only `reconcileWithErp` for the stock side
// (on-hand/reserved differences, stock missing on either side) and adds a catalogue-level compare (a SKU the ERP has
// that the shop does not, one the shop has that the ERP no longer lists, and an active ERP SKU with no shop price
// yet) from the same GET-only `variants` page the catalogue import (PR 609) already reads.
//
// Strictly read-only: every ERP call here is a GET (health and variants/stock via `callErp`); nothing is ever pushed
// to the ERP and nothing in the shop's own stock or price numbers is written. reconcileWithErp's own ErpSyncRun row
// (an audit summary of the check itself, never a stock or price change) is the only write this makes — exactly what
// the already-shipped hourly job (`inventory.erp.reconcile`) writes today.
//
// Skipped on a store with no ERP, or still on the practice ERP (comparing against the mock would tell the owner
// nothing about the real ERP); a real connection that cannot be reached is reported as failed, never thrown.
import type { ErpVariantRow } from '@extas/adapters';
import { setting, type InventoryDeps, type Who } from './context';
import { resolveErp } from './guard';
import { reconcileWithErp, type ReconcileResult } from './movements';
import { callErp, retryPolicy } from './sync';

export interface VariantCompare {
  matched: number;
  /** ERP SKUs the shop's catalogue has no row for at all (any grade, any colour or size). */
  onlyInErp: string[];
  /** Shop SKUs the ERP no longer lists at all. */
  onlyInShop: string[];
  /** Active ERP SKUs with no shop price yet ("bought from ERP at" — never shown to customers, PR 609). */
  noShopPrice: string[];
  /** The page cap stopped the read before every ERP variant was seen: `onlyInShop` is not judged. */
  complete: boolean;
}

/** Pure: compares the ERP's full variant list with the shop's known SKUs (for the tests and the report). */
export function compareVariants(erp: ErpVariantRow[], shopSkus: Iterable<string>): Omit<VariantCompare, 'complete'> {
  const shop = new Set(shopSkus);
  const erpSkus = new Set(erp.map((v) => v.sku));
  const onlyInErp: string[] = [];
  const noShopPrice: string[] = [];
  for (const v of erp) {
    if (!shop.has(v.sku)) onlyInErp.push(v.sku);
    if (v.active && (v.shopPrice == null || v.shopPrice === '')) noShopPrice.push(v.sku);
  }
  const onlyInShop = [...shop].filter((s) => !erpSkus.has(s));
  return { matched: erp.length - onlyInErp.length, onlyInErp: onlyInErp.sort(), onlyInShop: onlyInShop.sort(), noShopPrice: noShopPrice.sort() };
}

export interface SkuStockReport {
  status: 'skipped' | 'succeeded' | 'failed';
  reason: 'ERP_NONE' | 'ERP_ON_PRACTICE' | null;
  error: { code: string; text: string } | null;
  stock: ReconcileResult | null;
  variants: VariantCompare | null;
}

/** The combined read-only report for one store: PR 207's stock reconcile plus a catalogue (SKU/price) compare. */
export async function buildSkuStockReport(deps: InventoryDeps, who: Who): Promise<SkuStockReport> {
  // Reuses the already-tested, already-shipped stock side as is (same skip/fail gating, same single ErpSyncRun audit
  // write). Only once it actually ran against a real connection is the catalogue side read too.
  const stock = await reconcileWithErp(deps, who);
  if (stock.status !== 'succeeded') return { status: stock.status, reason: stock.reason, error: stock.error, stock, variants: null };

  const link = await resolveErp(deps, who.storeId);
  if (!('api' in link))
    return { status: 'failed', reason: null, error: { code: 'ERP_UNAVAILABLE', text: 'the ERP connection was lost between the two reads' }, stock, variants: null };

  const policy = await retryPolicy(deps);
  const [pageSize, maxPages] = await Promise.all([setting(deps, null, 'erp.sync.pageSize'), setting(deps, null, 'erp.sync.maxPagesPerRun')]);
  const erp: ErpVariantRow[] = [];
  let cursor: string | null = null;
  let complete = true;
  for (let pages = 1; ; pages++) {
    const page = (await callErp(deps, policy, (o) => link.api.variants({ updatedSince: null, cursor, limit: pageSize }, o))).value;
    erp.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
    if (pages >= maxPages) {
      complete = false;
      break;
    }
  }
  const shopRows = await deps.db.productVariant.findMany({ where: { storeId: who.storeId, product: { isDemo: false } }, select: { sku: true } });
  const cmp = compareVariants(
    erp,
    shopRows.map((r) => r.sku),
  );
  return { status: 'succeeded', reason: null, error: null, stock, variants: { ...cmp, complete } };
}

/** One store's report as a few Bengali-first lines (for the dated docs/reports page); never a key or an address. */
export function skuStockStoreLines(storeId: number, r: SkuStockReport): string[] {
  if (r.status === 'skipped') {
    return [`স্টোর ${storeId}: ${r.reason === 'ERP_NONE' ? 'এই স্টোরে কোনো ERP যুক্ত নেই, তাই তুলনা হয়নি।' : 'এই স্টোর এখনো প্র্যাক্টিস ERP-তে আছে, তাই আসল ERP-এর সাথে তুলনা হয়নি।'}`];
  }
  if (r.status === 'failed') {
    return [`স্টোর ${storeId}: ERP-এর সাথে কথা বলা যায়নি (${r.error?.code ?? 'ERROR'}) — তুলনা করা যায়নি; আগের রিপোর্ট অপরিবর্তিত।`, `  - ${r.error?.text ?? ''}`];
  }
  const stock = r.stock!;
  const v = r.variants!;
  const stockDiff = Object.values(stock.counts).reduce((s, n) => s + n, 0);
  const lines = [
    `স্টোর ${storeId}: মিলেছে ${v.matched}টা SKU (স্টক মিলেছে ${stock.matched}টা)। পার্থক্য — স্টক ${stockDiff}টা, SKU ERP-এ আছে দোকানে নেই ${v.onlyInErp.length}টা, দোকানে আছে ERP-এ নেই ${v.onlyInShop.length}টা, দোকানের দাম নেই ${v.noShopPrice.length}টা।`,
  ];
  if (stockDiff)
    lines.push(
      `  - স্টক: ${Object.entries(stock.counts)
        .filter(([, n]) => n)
        .map(([k, n]) => `${k} ×${n}`)
        .join(' · ')}`,
    );
  if (v.onlyInErp.length) lines.push(`  - ERP-এ আছে, দোকানে নেই: ${v.onlyInErp.slice(0, 20).join(', ')}${v.onlyInErp.length > 20 ? ` (… আরও ${v.onlyInErp.length - 20}টা)` : ''}`);
  if (v.onlyInShop.length)
    lines.push(`  - দোকানে আছে, ERP-এ নেই: ${v.onlyInShop.slice(0, 20).join(', ')}${v.onlyInShop.length > 20 ? ` (… আরও ${v.onlyInShop.length - 20}টা)` : ''}`);
  if (v.noShopPrice.length)
    lines.push(`  - দোকানের ক্রয়মূল্য (shop price) এখনো নেই: ${v.noShopPrice.slice(0, 20).join(', ')}${v.noShopPrice.length > 20 ? ` (… আরও ${v.noShopPrice.length - 20}টা)` : ''}`);
  if (!stock.complete || !v.complete) lines.push('  - পেজ-লিমিটের কারণে পুরো তালিকা পড়া যায়নি; পরের রানে বাকিটা দেখা যাবে।');
  return lines;
}

/** The whole, multi-store report page (Markdown, a Bengali summary first); never a key or an address with one. */
export function skuStockComparePage(stores: { storeId: number; report: SkuStockReport }[], at: Date): string {
  const real = stores.filter((s) => s.report.status === 'succeeded');
  const anyDiff = real.some((s) => {
    const r = s.report;
    return Object.values(r.stock!.counts).some((n) => n) || r.variants!.onlyInErp.length || r.variants!.onlyInShop.length || r.variants!.noShopPrice.length;
  });
  const skipped = stores.filter((s) => s.report.status === 'skipped').length;
  const failed = stores.filter((s) => s.report.status === 'failed').length;
  const bn = !real.length
    ? skipped
      ? '**সারকথা:** কোনো স্টোরে আসল ERP যুক্ত নেই বা প্র্যাক্টিস ERP-তে আছে, তাই এখন তুলনা করার কিছু নেই।'
      : '**সারকথা:** ERP-এর সাথে কথা বলা যায়নি, তাই আজ তুলনা করা যায়নি। পরের রানে আবার চেষ্টা হবে।'
    : anyDiff
      ? '**সারকথা:** দোকানের SKU আর স্টক-এর সাথে আসল ERP-এর কিছু অমিল পাওয়া গেছে — নিচে তালিকা দেওয়া আছে। এটা শুধু তথ্যের জন্য; এতে কোনো স্টক বা দাম বদলায়নি।'
      : '**সারকথা:** দোকানের SKU আর স্টক আসল ERP-এর সাথে পুরো মিলে গেছে। কোনো অমিল নেই।';
  const lines: string[] = ['# ERP SKU ও স্টক তুলনা — শুধু পড়ার জন্য (read-only)', '', bn, ''];
  for (const s of stores) lines.push(...skuStockStoreLines(s.storeId, s.report));
  lines.push('');
  lines.push(`- ${at.toISOString()}: এই রিপোর্ট কোনো ERP বা দোকানের স্টক/দাম বদলায়নি (GET-only); এটা শুধু তুলনা।`);
  if (failed) lines.push(`- ${failed}টা স্টোরের ERP-এর সাথে কথা বলা যায়নি; আগের তথ্যই অপরিবর্তিত ধরে নেওয়া হোক।`);
  lines.push('');
  return lines.join('\n');
}
