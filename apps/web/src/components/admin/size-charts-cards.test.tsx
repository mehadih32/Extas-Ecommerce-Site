// PR 806 (prototype v5): Products › Size charts opens on one block per category with a card per chart — name, size
// fields, the Default / "Used by N" / fit badges, Edit · Copy · Set as default · Archive — and archived charts under
// "Archived" with "Bring back". A read-only viewer sees the cards without the buttons that change anything.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/admin-sizecharts.en.json';
import bn from '../../../messages/admin-sizecharts.bn.json';
import type { Dict } from '@/lib/i18n';
import { SizeCharts } from './SizeCharts';

const chart = (id: string, name: string, extra: object = {}) =>
  ({
    id,
    name,
    garmentType: { id: 'g-top', key: 'top', nameEn: 'Top', nameBn: 'টপ' },
    fitKey: 'regular',
    fit: { key: 'regular', en: 'Regular', bn: 'রেগুলার' },
    fields: [{ key: 'chest', labelEn: 'Chest', labelBn: 'বুক' }],
    rows: [],
    easeInch: 2,
    diagram: null,
    copiedFromId: null,
    finder: [],
    run: 'true',
    defaultFor: [],
    overrides: 0,
    usedBy: 3,
    archived: false,
    updatedAt: '2026-11-01T00:00:00Z',
    ...extra,
  }) as never;

const props = (canWrite: boolean) => ({
  dict: { sizeCharts: en as Dict } as Dict,
  lang: 'en' as const,
  charts: [
    chart('a', 'Polo – Regular', { defaultFor: [{ id: 'c-polo', slug: 'polo', nameEn: 'Polo', nameBn: null }] }),
    chart('b', 'Polo – Slim'),
    chart('x', 'Old polo chart', { archived: true }),
  ],
  detail: null,
  options: { fits: [{ key: 'regular', en: 'Regular', bn: 'রেগুলার' }], fallbackFit: 'regular', stepInch: 1 } as never,
  categories: [
    { id: 'c-polo', name: 'Polo', garmentTypeId: 'g-top' },
    { id: 'c-trouser', name: 'Trouser', garmentTypeId: 'g-bottom' },
    { id: 'c-misc', name: 'Misc', garmentTypeId: null },
  ],
  garmentTypes: [],
  sizes: [{ key: 'm', label: 'M' }],
  canWrite,
});

describe('Size charts — category cards (PR 806)', () => {
  it('draws one block per category that has a garment type, a card per chart and the empty note', () => {
    const html = renderToStaticMarkup(<SizeCharts {...props(true)} />);
    expect(html.match(/data-testid="sizechart-category"/g)).toHaveLength(2);
    expect(html.match(/data-testid="sizechart-card"/g)).toHaveLength(2);
    expect(html).toContain(en.noChartForCat);
    expect(html).toContain('Polo – Regular');
    expect(html).toContain(en.badgeDefault);
    expect(html).toContain(en.edit);
    expect(html).toContain(en.duplicate);
    expect(html).toContain(en.setDefault);
    expect(html).toContain(en.archiveCard);
    // the archived chart is under its own heading with Bring back
    expect(html).toContain('Old polo chart');
    expect(html).toContain(en.bringBack);
  });
  it('a viewer sees the cards and Edit, none of the buttons that change a chart', () => {
    const html = renderToStaticMarkup(<SizeCharts {...props(false)} />);
    expect(html).toContain(en.edit);
    expect(html).not.toContain(`>${en.duplicate}<`);
    expect(html).not.toContain(`>${en.archiveCard}<`);
    expect(html).not.toContain(`>${en.bringBack}<`);
  });
  it('every new word is in both languages', () => {
    for (const k of ['catCount', 'badgeDefault', 'edit', 'duplicate', 'archiveCard', 'noChartForCat', 'bringBack', 'leaveConfirm', 'allCharts'] as const) {
      expect((en as unknown as Record<string, string>)[k], k).toBeTruthy();
      expect((bn as unknown as Record<string, string>)[k], k).toBeTruthy();
    }
  });
});
