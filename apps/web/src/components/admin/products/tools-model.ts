// PR 33, 36, 39 — the catalogue tools' pure part (no React, no database), shared by the server pages and the browser
// components and tested on its own (tools-model.test.ts): where each failing check is fixed (the audit's one-click
// route), the import screen's refusals as text, and the back-in-stock list's small helpers.
import type { PublishCheckKey } from '@extas/catalogue';
import { t, type Dict } from '@/lib/i18n';
import { refusalText } from './model';

export const IMPORT_HOME = '/admin/products/import';
export const AUDIT_HOME = '/admin/products/audit';
export const INTEREST_HOME = '/admin/products/back-in-stock';
export const SIZE_CHARTS_HOME = '/admin/size-charts';

/**
 * Where a failing check is fixed: a section of the product's edit page (its heading's id, ProductForm.tsx), or the
 * size chart page (a chart is set per category there; a product's own chart too).
 */
export const CHECK_FIX: Record<PublishCheckKey, { page: 'product'; section: string } | { page: 'sizeCharts' }> = {
  category: { page: 'product', section: 'sec-basics' },
  variants: { page: 'product', section: 'sec-variants' },
  price: { page: 'product', section: 'sec-variants' },
  photos: { page: 'product', section: 'sec-photos' },
  sizeChart: { page: 'sizeCharts' },
  fabric: { page: 'product', section: 'sec-basics' },
  seo: { page: 'product', section: 'sec-naming' },
  description: { page: 'product', section: 'sec-basics' },
  stock: { page: 'product', section: 'sec-variants' },
};

/** The one-click route to fix a check of a product. */
export function fixHref(productId: string, key: PublishCheckKey): string {
  const f = CHECK_FIX[key];
  return f.page === 'sizeCharts' ? SIZE_CHARTS_HOME : `/admin/products/${productId}#${f.section}`;
}

/** The import screen's refusal as text: the page reader's reason when the page could not be read. */
export function importErrorText(dict: Dict, code: string | undefined, details: string[] = []): string {
  if (code === 'PAGE_UNREADABLE') {
    const reason = details[0] ?? '';
    const text = t(dict, `linkImport.reasons.${reason}`);
    return text === `linkImport.reasons.${reason}` ? t(dict, 'products.errors.PAGE_UNREADABLE') : text;
  }
  if (code === 'HOST_NOT_ALLOWED') return t(dict, 'products.errors.HOST_NOT_ALLOWED', { fields: details.filter((x) => x.startsWith('host:')).map((x) => x.slice(5)).join(', ') }).trim();
  return refusalText(dict, code, details);
}

/** The draft's "not in your lists" codes (`brand:…`, `colour:…`, `fabric:…`) as one short line. */
export function unmatchedText(dict: Dict, codes: string[]): string {
  const words = codes.map((c) => c.slice(c.indexOf(':') + 1)).filter(Boolean);
  return words.length ? t(dict, 'linkImport.unmatched', { list: words.join(t(dict, 'checks.sep')) }) : '';
}

/** How a request can be reached, as the list shows it. */
export const contactOf = (r: { phone: string | null; email: string | null }) => r.phone ?? r.email ?? '';

/** The back-in-stock list's address for a product and state. */
export function interestHref(o: { product?: string; state?: string; page?: number } = {}): string {
  const p = new URLSearchParams();
  if (o.product) p.set('product', o.product);
  if (o.state && o.state !== 'waiting') p.set('state', o.state);
  if (o.page && o.page > 1) p.set('page', String(o.page));
  const s = p.toString();
  return s ? `${INTEREST_HOME}?${s}` : INTEREST_HOME;
}

/** The audit's address for a filter. */
export function auditHref(o: { check?: string; status?: string; page?: number; recheckSince?: string } = {}): string {
  const p = new URLSearchParams();
  if (o.check) p.set('check', o.check);
  if (o.status && o.status !== 'all') p.set('status', o.status);
  if (o.page && o.page > 1) p.set('page', String(o.page));
  if (o.recheckSince) p.set('recheckSince', o.recheckSince);
  const s = p.toString();
  return s ? `${AUDIT_HOME}?${s}` : AUDIT_HOME;
}
