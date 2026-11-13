// S28 · PR 689 — the report file links.
import { describe, expect, it } from 'vitest';
import { fileUrl } from './report-file-links';

describe('PR 689 · report file links', () => {
  it('a preset goes as the period, your own dates as from and to', () => {
    expect(fileUrl('figures', 'xlsx', { preset: 'last6m' }, 'en')).toBe('/api/admin/reports/packs/figures?format=xlsx&period=last6m');
    expect(fileUrl('bank', 'pdf', { from: '2026-11-01', to: '2026-11-10' }, 'en')).toBe('/api/admin/reports/packs/bank?format=pdf&from=2026-11-01&to=2026-11-10');
  });
  it('a pack with no period keeps its own; Bengali adds the language; only a PDF can be asked as a download', () => {
    expect(fileUrl('bank', 'pdf', null, 'bn', { download: true })).toBe('/api/admin/reports/packs/bank?format=pdf&lang=bn&download=1');
    expect(fileUrl('bank', 'xlsx', null, 'en', { download: true })).toBe('/api/admin/reports/packs/bank?format=xlsx');
  });
});
