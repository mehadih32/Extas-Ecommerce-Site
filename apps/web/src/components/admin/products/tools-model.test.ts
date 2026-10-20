// PR 33, 36, 39 — the catalogue tools' pure part: their messages (both languages, every reader reason, AI note, stage
// and state), the audit's one-click fix route for every check, the import's refusals as text, and the list addresses.
import { describe, expect, it } from 'vitest';
import { AUDIT_STATUSES, INTEREST_STATES, PUBLISH_CHECK_KEYS } from '@extas/catalogue';
import bn from '../../../../messages/admin-tools.bn.json';
import en from '../../../../messages/admin-tools.en.json';
import adminBn from '../../../../messages/admin.bn.json';
import adminEn from '../../../../messages/admin.en.json';
import productsBn from '../../../../messages/admin-products.bn.json';
import productsEn from '../../../../messages/admin-products.en.json';
import { adminDicts } from '@/lib/admin-i18n';
import { t, type Dict } from '@/lib/i18n';
import { auditHref, CHECK_FIX, fixHref, importErrorText, interestHref, unmatchedText } from './tools-model';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

const READER_REASONS = ['BAD_URL', 'BLOCKED_ADDRESS', 'TOO_BIG', 'TIMEOUT', 'TOO_MANY_REDIRECTS', 'NOT_HTML', 'HTTP_ERROR', 'NETWORK', 'NO_PRODUCT'];

describe('catalogue tools messages', () => {
  it('both languages have the same keys, none empty, and English has no Bengali', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
    for (const k of keys(en as Dict)) {
      expect(t(en as Dict, k), k).not.toBe('');
      expect(/[ঀ-৿]/.test(t(en as Dict, k)), k).toBe(false);
    }
  });

  it('never repeats a key of the admin or product files (the merge would hide one)', () => {
    for (const [mine, others] of [
      [en, [adminEn, productsEn]],
      [bn, [adminBn, productsBn]],
    ] as const) {
      const taken = new Set(others.flatMap((o) => keys(o as Dict)));
      expect(keys(mine as Dict).filter((k) => taken.has(k))).toEqual([]);
    }
    expect(t(adminDicts.bn, 'audit.title')).toBe(t(bn as Dict, 'audit.title'));
    expect(t(adminDicts.en, 'products.errors.CONFLICT')).toBe(t(productsEn as Dict, 'products.errors.CONFLICT'));
  });

  it('every reader reason, AI note, stage, mode, audit status, request state and page has its text', () => {
    for (const d of [adminDicts.bn, adminDicts.en]) {
      for (const r of READER_REASONS) expect(t(d, `linkImport.reasons.${r}`)).not.toContain('linkImport.');
      for (const n of ['ai-off', 'ai-not-connected', 'ai-not-used', 'ai-failed']) expect(t(d, `linkImport.notes.${n}`)).not.toContain('linkImport.');
      for (const s of ['preview', 'drafted', 'failed']) expect(t(d, `linkImport.stage.${s}`)).not.toContain('linkImport.');
      for (const m of ['MOCK', 'LIVE', 'SANDBOX']) expect(t(d, `linkImport.mode.${m}`)).not.toContain('linkImport.');
      for (const s of AUDIT_STATUSES) expect(t(d, `audit.status.${s}`, { n: '1' })).not.toContain('audit.');
      for (const s of INTEREST_STATES) expect(t(d, `interest.states.${s}`)).not.toContain('interest.');
      for (const s of ['live', 'soldOut', 'unpublished', 'archived', 'none']) expect(t(d, `interest.state.${s}`)).not.toContain('interest.');
      for (const c of ['LINK_IMPORT_OFF', 'HOST_NOT_ALLOWED', 'PAGE_UNREADABLE', 'TOO_MANY_REQUESTS', 'INTEREST_OFF']) expect(t(d, `products.errors.${c}`)).not.toContain('products.');
      for (const p of ['productImport', 'productAudit', 'backInStock']) expect(t(d, `nav.${p}`)).not.toContain('nav.');
    }
  });
});

describe('the audit fix routes (PR 39)', () => {
  it('every check has a place to fix it: a section of the edit page or the size chart page', () => {
    expect(Object.keys(CHECK_FIX).sort()).toEqual([...PUBLISH_CHECK_KEYS].sort());
    const id = '0190f0f0-0000-7000-8000-000000000001';
    expect(fixHref(id, 'photos')).toBe(`/admin/products/${id}#sec-photos`);
    expect(fixHref(id, 'seo')).toBe(`/admin/products/${id}#sec-naming`);
    expect(fixHref(id, 'price')).toBe(`/admin/products/${id}#sec-variants`);
    expect(fixHref(id, 'sizeChart')).toBe('/admin/size-charts');
  });

  it('builds the filter addresses, leaving defaults out', () => {
    expect(auditHref()).toBe('/admin/products/audit');
    expect(auditHref({ check: 'photos', status: 'all', page: 1 })).toBe('/admin/products/audit?check=photos');
    expect(auditHref({ status: 'live', page: 2, recheckSince: '2026-10-20T08:00:00.000Z' })).toBe('/admin/products/audit?status=live&page=2&recheckSince=2026-10-20T08%3A00%3A00.000Z');
    expect(interestHref({ product: 'p', state: 'waiting' })).toBe('/admin/products/back-in-stock?product=p');
    expect(interestHref({ product: 'p', state: 'told', page: 3 })).toBe('/admin/products/back-in-stock?product=p&state=told&page=3');
  });
});

describe('the import refusals as text (PR 33)', () => {
  it('says why a page could not be read, which site is not allowed, and what was not matched', () => {
    const d = adminDicts.en;
    expect(importErrorText(d, 'PAGE_UNREADABLE', ['TIMEOUT'])).toBe(t(d, 'linkImport.reasons.TIMEOUT'));
    expect(importErrorText(d, 'PAGE_UNREADABLE', ['SOMETHING_NEW'])).toBe(t(d, 'products.errors.PAGE_UNREADABLE'));
    expect(importErrorText(d, 'HOST_NOT_ALLOWED', ['host:other.example.org'])).toContain('other.example.org');
    expect(importErrorText(d, 'LINK_IMPORT_OFF')).toBe(t(d, 'products.errors.LINK_IMPORT_OFF'));
    expect(importErrorText(d, 'FORBIDDEN')).toBe(t(d, 'errors.FORBIDDEN'));
    expect(unmatchedText(d, ['brand:Acme', 'colour:Teal'])).toContain('Acme');
    expect(unmatchedText(d, [])).toBe('');
  });
});
