// PR 626 (CN-036), PR 659 (CN-048) — the Lumen sidebar's groups (LUMEN-SPEC §2, admin prototype v5 `A.NAV`): Daily (Home,
// Orders, Couriers, Products, Customers, Inbox, Rules), Grow (Marketing, Website), Business (Finance, Reports), System
// (AI Center, Settings, Help). Messages is folded into Marketing (no entry). Every other section of sections.ts appears
// exactly once (a section added later and not listed here goes under System, so nothing is ever dropped); the person sees only the sections they may open, and the AI Center only while it is shown
// (stages.ts). No React, no database.
import type { AdminSectionId } from '@extas/settings';
import { sectionVisible, SHELL_SECTIONS, type ShellSection, type ShellViewer } from './sections';

export const LUMEN_GROUPS = ['daily', 'grow', 'business', 'system'] as const;
export type LumenGroup = (typeof LUMEN_GROUPS)[number];

const ORDER: Record<LumenGroup, readonly AdminSectionId[]> = {
  daily: ['dashboard', 'orders', 'delivery', 'products', 'customers', 'support', 'rules'],
  grow: ['marketing', 'website'],
  business: ['money', 'reports'],
  system: ['ai', 'settings', 'help'],
};

/** The sidebar's groups for this person, in order; empty groups are left out. */
export function lumenNav(viewer: ShellViewer, opts: { aiShown: boolean }): { group: LumenGroup; sections: ShellSection[] }[] {
  const listed = new Set<string>(Object.values(ORDER).flat());
  const shows = (s: ShellSection) => sectionVisible(s, viewer) && (s.id !== 'ai' || opts.aiShown);
  const byId = (id: string) => SHELL_SECTIONS.find((s) => s.id === id);
  return LUMEN_GROUPS.map((group) => {
    const ids: string[] = [...ORDER[group], ...(group === 'system' ? SHELL_SECTIONS.filter((s) => !listed.has(s.id) && !s.folded).map((s) => s.id) : [])];
    return { group, sections: ids.map(byId).filter((s): s is ShellSection => !!s && shows(s)) };
  }).filter((g) => g.sections.length > 0);
}
