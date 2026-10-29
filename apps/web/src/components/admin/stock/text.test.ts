// S09 · PR 202–207 — the stock pages without a database: both languages carry the same keys and none overlaps another
// admin file, every state, kind and code the pages show has its words, and the small text helpers.
import { describe, expect, it } from 'vitest';
import { ERP_DEPENDENT_PATHS, MISMATCH_KINDS, SYNC_KINDS, healthLevel, type HealthLevel } from '@extas/inventory';
import { ERP_DOCUMENT_TYPES } from '@extas/adapters';
import { ERP_MODES } from '@extas/settings';
import adminBn from '../../../../messages/admin.bn.json';
import adminEn from '../../../../messages/admin.en.json';
import productsBn from '../../../../messages/admin-products.bn.json';
import toolsBn from '../../../../messages/admin-tools.bn.json';
import bn from '../../../../messages/admin-stock.bn.json';
import en from '../../../../messages/admin-stock.en.json';
import { adminDicts } from '@/lib/admin-i18n';
import { ADMIN_PAGES } from '@/lib/admin-nav';
import { t, type Dict } from '@/lib/i18n';
import { ago, errorCodeOf, keyOf, linesToShow, mismatchLine, stockRefusal } from './text';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

describe('stock pages messages', () => {
  it('both languages have the same keys, none empty; English has no Bengali', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
    for (const k of keys(bn as Dict)) {
      expect(t(bn as Dict, k), k).not.toBe('');
      expect(/[ঀ-৿]/.test(t(en as Dict, k)), k).toBe(false);
    }
  });

  it('no key is also in another admin file (the merge would hide one)', () => {
    const taken = new Set([adminBn, productsBn, toolsBn].flatMap((o) => keys(o as Dict)));
    expect(keys(bn as Dict).filter((k) => taken.has(k))).toEqual([]);
  });

  it('every state, kind, mode and page has its words in both languages', () => {
    const levels: HealthLevel[] = ['ok', 'practice', 'late', 'failing', 'down', 'off'];
    for (const d of [adminDicts.bn, adminDicts.en]) {
      const has = (k: string) => expect(t(d, k), k).not.toBe(k);
      for (const l of levels) for (const p of ['title', 'text']) has(`stock.level.${l}.${p}`);
      for (const m of ERP_MODES) has(`stock.erp.modes.${m}`);
      for (const s of Object.keys(ERP_DEPENDENT_PATHS['stock.pull'])) has(`stock.erp.states.${s}`);
      for (const k of SYNC_KINDS) has(`stock.runs.kind.${keyOf(k)}`);
      for (const s of ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']) has(`stock.runs.status.${s}`);
      for (const s of ['PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED_NO_ERP', 'RETIRED', 'HELD']) has(`stock.docs.status.${s}`);
      for (const s of ['pending', 'failed', 'dead', 'skipped', 'sent']) has(`stock.docs.counts.${s}`);
      // PR 608: the v6 ERP events that need a look (failed, or repeated with another body).
      for (const k of ['events', 'eventsText']) has(`stock.erp.${k}`);
      for (const k of ERP_DOCUMENT_TYPES) has(`stock.docs.type.${keyOf(k)}`);
      for (const k of MISMATCH_KINDS) has(`stock.reconcile.kind.${k}`);
      for (const s of ['COUNTING', 'REVIEW', 'COMPLETED', 'CANCELLED']) {
        has(`stock.counts.status.${s}`);
        has(`stock.count.head.${s}`);
        has(`stock.count.sub.${s}`);
      }
      for (const r of ['ERP_ON_PRACTICE', 'ERP_NONE']) {
        has(`stock.resync.skipped.${r}`);
        has(`stock.reconcile.skipped.${r}`);
      }
      for (const p of ADMIN_PAGES) has(`nav.${p.key}`);
      has('frame.groups.inventory');
    }
    expect(t(adminEn as Dict, 'nav.stock')).not.toBe('nav.stock');
  });

  it('every ERP error code has plain words', () => {
    for (const c of ['AUTH', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'INVALID_REQUEST', 'SERVER', 'TIMEOUT', 'NETWORK', 'BAD_RESPONSE', 'NOT_CONFIGURED', 'COMPANY_MISMATCH']) {
      expect(t(adminDicts.bn, `stock.erpCodes.${c}`)).not.toContain('stock.');
    }
  });
});

describe('stock text helpers', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  it('minutes ago up to two hours, then the date; never yet without one', () => {
    const d = adminDicts.en;
    expect(ago(d, null, now, 'en', 'Asia/Dhaka')).toBe(t(d, 'stock.time.never'));
    expect(ago(d, '2026-10-20T09:59:40Z', now, 'en', 'Asia/Dhaka')).toBe(t(d, 'stock.time.justNow'));
    expect(ago(d, '2026-10-20T09:15:00Z', now, 'en', 'Asia/Dhaka')).toBe(t(d, 'stock.time.minutesAgo', { n: 45 }));
    expect(ago(d, '2026-10-19T09:15:00Z', now, 'en', 'Asia/Dhaka')).not.toContain('min');
  });

  it('a refusal reads its own words first, then the admin ones, then the server error', () => {
    const d = adminDicts.bn;
    expect(stockRefusal(d, 'AUDIT_OPEN')).toBe(t(d, 'stock.errors.AUDIT_OPEN'));
    expect(stockRefusal(d, 'UNAUTHENTICATED')).toBe(t(d, 'errors.UNAUTHENTICATED'));
    expect(stockRefusal(d, 'SOMETHING_NEW')).toBe(t(d, 'errors.server-error'));
  });

  it('reads the code at the start of an error line', () => {
    expect(errorCodeOf('TIMEOUT 0: no answer (3 tries)')).toBe('TIMEOUT');
    expect(errorCodeOf('something else')).toBeNull();
    expect(errorCodeOf(null)).toBeNull();
  });

  it("a finished ERP check's summary reads in words; anything else is left alone", () => {
    const d = adminDicts.en;
    expect(mismatchLine(d, 'ON_HAND_DIFFERS ×2 · MISSING_IN_ERP ×1', MISMATCH_KINDS, 'en')).toBe(
      `${t(d, 'stock.reconcile.kind.ON_HAND_DIFFERS', { n: '2' })}${t(d, 'stock.sep')}${t(d, 'stock.reconcile.kind.MISSING_IN_ERP', { n: '1' })}`,
    );
    expect(mismatchLine(d, 'TIMEOUT 0: no answer', MISMATCH_KINDS, 'en')).toBeNull();
    expect(mismatchLine(d, 'SOMETHING_ELSE ×2', MISMATCH_KINDS, 'en')).toBeNull();
    expect(mismatchLine(d, null, MISMATCH_KINDS, 'en')).toBeNull();
  });

  it('a count shows its lines as scanned, then the differing ones first or only', () => {
    const lines = [{ id: 'a', variance: 0 }, { id: 'b', variance: -1 }, { id: 'c', variance: 0 }, { id: 'd', variance: 2 }];
    expect(linesToShow(lines, false, true).map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(linesToShow(lines, true, true).map((l) => l.id)).toEqual(['b', 'd']);
    expect(linesToShow(lines, true, false).map((l) => l.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('the verdict the page shows follows the panel', () => {
    expect(healthLevel({ link: 'mock', lastPullFailed: false, late: false, dead: 0, failed: 0 })).toBe('practice');
  });
});
