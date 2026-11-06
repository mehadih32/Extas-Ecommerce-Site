// PR 626 (CN-036) — the Lumen sidebar's groups: Daily, Grow, Business, System in the spec's order; every section exactly
// once for the owner; a person sees only what they may open; the AI Center only while it is shown (S15 closed: hidden);
// the bell's unread rule.
import { describe, expect, it } from 'vitest';
import { noteUnread } from '@/components/admin/shell/NotificationsPanel';
import { lumenNav } from './lumen-nav';
import { SHELL_SECTIONS } from './sections';
import { hiddenAdminParts } from '../stages/closed';
import { aiCenterShown } from './stages';

const owner = { perms: new Set<string>(), owner: true };

describe('Lumen sidebar (PR 626)', () => {
  it('groups the sections as the spec does, every section exactly once', () => {
    const nav = lumenNav(owner, { aiShown: true });
    expect(nav.map((g) => g.group)).toEqual(['daily', 'grow', 'business', 'system']);
    expect(nav.map((g) => g.sections.map((s) => s.id))).toEqual([
      ['dashboard', 'orders', 'delivery', 'products', 'customers'],
      ['marketing', 'messages', 'website', 'support'],
      ['money', 'reports'],
      ['ai', 'settings', 'help'],
    ]);
    const ids = nav.flatMap((g) => g.sections.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(SHELL_SECTIONS.map((s) => s.id).sort());
  });

  it('hides the AI Center while it is not shown; S15 closed (PR 652 switch off, as shipped), whatever ai.enabled says', () => {
    expect(lumenNav(owner, { aiShown: false }).flatMap((g) => g.sections.map((s) => s.id))).not.toContain('ai');
    const shipped = hiddenAdminParts(null);
    expect(aiCenterShown(shipped, true)).toBe(false);
    expect(aiCenterShown(shipped, false)).toBe(false);
    const open = hiddenAdminParts({ S15: true });
    expect(aiCenterShown(open, true)).toBe(true);
    expect(aiCenterShown(open, false)).toBe(false);
  });

  it('shows a person only the sections they may open, and leaves empty groups out', () => {
    const desk = { perms: new Set(['orders.read']), owner: false };
    const nav = lumenNav(desk, { aiShown: true });
    expect(nav.flatMap((g) => g.sections.map((s) => s.id))).toContain('orders');
    expect(nav.flatMap((g) => g.sections.map((s) => s.id))).not.toContain('money');
    expect(nav.every((g) => g.sections.length > 0)).toBe(true);
  });

  it('a note is unread until "Mark all read" passes its time', () => {
    const n = { id: 'a', title: 'x', at: '2026-11-06T09:00:00.000Z' };
    expect(noteUnread(n, null)).toBe(true);
    expect(noteUnread(n, '2026-11-06T08:00:00.000Z')).toBe(true);
    expect(noteUnread(n, '2026-11-06T09:00:00.000Z')).toBe(false);
    expect(noteUnread({ id: 'b', title: 'y' }, '2026-11-06T08:00:00.000Z')).toBe(false);
  });
});
