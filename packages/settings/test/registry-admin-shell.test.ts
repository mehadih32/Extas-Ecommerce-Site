// PR 12, 495 — the admin shell's settings (v33): every key at version 33, never owner data, never sent to the shop;
// role start pages empty (everyone starts on the Dashboard), badges cached briefly, the Dashboard's three date choices.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { ADMIN_SECTIONS, adminDashboardSchema, adminShellSchema, adminShellSettings, adminStartPagesSchema } from '../src/registry-admin-shell';

describe('admin shell settings (v33)', () => {
  it('every key is in the registry at version 33, private, never owner data', () => {
    for (const [key, spec] of Object.entries(adminShellSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      // PR 12 follow-up 209 moved admin.shell to v263 (recent pages, key jumps); the others stay at 33.
      expect(spec.version, key).toBe(key === 'admin.shell' ? 263 : 33);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.isPublic, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
    }
  });

  it('PR 495: start pages are empty by default and take only real roles and the real sections', () => {
    expect(adminShellSettings['admin.startPages'].default).toEqual({});
    expect(ADMIN_SECTIONS).toHaveLength(15);
    expect(adminStartPagesSchema.safeParse({ 'order-desk': 'orders', packer: 'products' }).success).toBe(true);
    expect(adminStartPagesSchema.safeParse({ 'order-desk': 'nowhere' }).success).toBe(false);
    expect(adminStartPagesSchema.safeParse({ 'Order Desk': 'orders' }).success).toBe(false);
  });

  it('PR 12 follow-up 209: recent pages and key jumps are off as they ship, and a value saved before reads as off', () => {
    const s = adminShellSettings['admin.shell'];
    expect(s.default.recentPages).toBe(0);
    expect(s.default.keyJumps).toBe(false);
    expect(s.since).toBe(33);
    expect(adminShellSchema.parse({ badgeCacheSeconds: 30, searchPerGroup: 5, searchMinChars: 2 })).toEqual({ badgeCacheSeconds: 30, searchPerGroup: 5, searchMinChars: 2, recentPages: 0, keyJumps: false });
    expect(adminShellSchema.safeParse({ ...s.default, recentPages: 11 }).success).toBe(false);
    expect(adminShellSchema.safeParse({ ...s.default, recentPages: 10, keyJumps: true }).success).toBe(true);
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
