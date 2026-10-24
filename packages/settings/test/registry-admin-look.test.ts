// PR 12 (CN-025, CN-026 (b)) — Settings → Admin look (v51): every key at version 51, never owner data, never sent to
// the shop; the team follows each page's standard design and each person may pick their own; the guide opens in a
// side panel on a computer and as a sheet on a phone; "Later" puts a list aside for 3 hours.
import { describe, expect, it } from 'vitest';
import { registry, registryVersion } from '../src/index';
import { messages } from '../src/messages';
import { adminDashboardDesignsSchema, adminGuideOpensSchema, adminLookSchema, adminLookSettings, adminTodoSchema } from '../src/registry-admin-look';

describe('admin look settings (v51)', () => {
  it('every key is in the registry at version 51, private, never owner data, with labels in both languages', () => {
    expect(registryVersion(registry)).toBeGreaterThanOrEqual(51);
    for (const [key, spec] of Object.entries(adminLookSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(51);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.isPublic, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        const [, ...path] = spec.labelKey.split('.');
        let node: unknown = messages[lang].admin;
        for (const p of path) node = (node as Record<string, unknown>)?.[p];
        expect(typeof node, `${lang} ${spec.labelKey}`).toBe('string');
      }
    }
  });

  it('the team follows the standard designs; a page id and a design key are checked', () => {
    expect(adminLookSettings['admin.look'].default).toEqual({ pages: {}, perPerson: true });
    expect(adminLookSchema.safeParse({ pages: { dashboard: 'C', orders: 'A' }, perPerson: false }).success).toBe(true);
    expect(adminLookSchema.safeParse({ pages: { dashboard: 'c' }, perPerson: true }).success).toBe(false);
    expect(adminLookSchema.safeParse({ pages: { dashboard: 'AB' }, perPerson: true }).success).toBe(false);
    expect(adminLookSchema.safeParse({ pages: { 'Dash Board': 'A' }, perPerson: true }).success).toBe(false);
    expect(adminLookSchema.safeParse({ pages: {}, perPerson: true, extra: 1 }).success).toBe(false);
  });

  it('CN-026 (b): the guide opens in a side panel by default; a pop-up or its own page on a computer; a sheet on a phone', () => {
    expect(adminLookSettings['admin.guideOpens'].default).toEqual({ desktop: 'panel', phone: 'sheet', perPerson: true });
    for (const desktop of ['panel', 'popup', 'page']) expect(adminGuideOpensSchema.safeParse({ desktop, phone: 'sheet', perPerson: true }).success).toBe(true);
    expect(adminGuideOpensSchema.safeParse({ desktop: 'modal', phone: 'sheet', perPerson: true }).success).toBe(false);
    expect(adminGuideOpensSchema.safeParse({ desktop: 'panel', phone: 'panel', perPerson: true }).success).toBe(false);
  });

  it('the To do drawer and the Dashboard designs keep their numbers in range', () => {
    expect(adminLookSettings['admin.todo'].default).toEqual({ laterHours: 3, mine: {} });
    expect(adminTodoSchema.safeParse({ laterHours: 0, mine: {} }).success).toBe(false);
    expect(adminTodoSchema.safeParse({ laterHours: 3, mine: { 'order-desk': ['ordersConfirm'] } }).success).toBe(true);
    expect(adminTodoSchema.safeParse({ laterHours: 3, mine: { 'Order Desk': ['ordersConfirm'] } }).success).toBe(false);
    const d = adminLookSettings['admin.dashboardDesigns'].default;
    expect(adminDashboardDesignsSchema.safeParse({ ...d, chartMinDays: 1 }).success).toBe(false);
    expect(adminDashboardDesignsSchema.safeParse({ ...d, targetHours: 0 }).success).toBe(true);
    expect(adminDashboardDesignsSchema.safeParse({ ...d, extra: 1 }).success).toBe(false);
  });
});
