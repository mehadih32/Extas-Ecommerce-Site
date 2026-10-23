// PR 12 — the admin shell's settings (v33): every key at version 33, never owner data, never sent to the shop;
// badges cached briefly, the greeting's hours in order.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { ADMIN_SECTIONS, adminDashboardSchema, adminShellSchema, adminShellSettings } from '../src/registry-admin-shell';

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

  it('PR 12: the 14 sections', () => {
    expect(ADMIN_SECTIONS).toHaveLength(14);
  });

  it('PR 12: badge cache, search limits and the greeting hours stay in their ranges', () => {
    const s = adminShellSettings['admin.shell'].default;
    expect(adminShellSchema.safeParse({ ...s, badgeCacheSeconds: 601 }).success).toBe(false);
    expect(adminShellSchema.safeParse({ ...s, extra: 1 }).success).toBe(false);
    const d = adminShellSettings['admin.dashboard'].default;
    expect(adminDashboardSchema.safeParse({ ...d, afternoonHour: 18 }).success).toBe(false);
  });
});
