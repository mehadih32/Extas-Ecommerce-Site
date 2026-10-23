// PR 12, 495 — the admin shell's settings (v33): every key at version 33, never owner data, never sent to the shop;
// role start pages empty (everyone starts on the Dashboard), badges cached briefly, the Dashboard's three date choices.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { ADMIN_SECTIONS, adminDashboardSchema, adminShellSchema, adminShellSettings, adminStartPagesSchema } from '../src/registry-admin-shell';

describe('admin shell settings (v33)', () => {
  it('every key is in the registry at version 33, private, never owner data', () => {
    for (const [key, spec] of Object.entries(adminShellSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(33);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.isPublic, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
    }
  });

  it('PR 495: start pages are empty by default and take only real roles and the 14 sections', () => {
    expect(adminShellSettings['admin.startPages'].default).toEqual({});
    expect(ADMIN_SECTIONS).toHaveLength(14);
    expect(adminStartPagesSchema.safeParse({ 'order-desk': 'orders', packer: 'products' }).success).toBe(true);
    expect(adminStartPagesSchema.safeParse({ 'order-desk': 'nowhere' }).success).toBe(false);
    expect(adminStartPagesSchema.safeParse({ 'Order Desk': 'orders' }).success).toBe(false);
  });

  it('PR 12: badge cache, search limits and the Dashboard choices stay in their ranges', () => {
    const s = adminShellSettings['admin.shell'].default;
    expect(adminShellSchema.safeParse({ ...s, badgeCacheSeconds: 601 }).success).toBe(false);
    expect(adminShellSchema.safeParse({ ...s, extra: 1 }).success).toBe(false);
    const d = adminShellSettings['admin.dashboard'].default;
    expect(d.ranges[0]).toBe(1);
    expect(adminDashboardSchema.safeParse({ ...d, ranges: [7, 7] }).success).toBe(false);
    expect(adminDashboardSchema.safeParse({ ...d, afternoonHour: 18 }).success).toBe(false);
    expect(adminDashboardSchema.safeParse({ ...d, ranges: [] }).success).toBe(false);
    expect(adminDashboardSchema.safeParse({ ...d, sparkDays: 1 }).success).toBe(false);
  });
});
