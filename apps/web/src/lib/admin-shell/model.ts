// PR 12 — what the client shell is given by the server (app/admin/layout.tsx): the shell's own words in the person's
// language, the store's name, who is signed in, their keys (to draw only the sections they may open) and the badges
// counted for this request. The shell asks GET /api/admin/shell/badges again as the person moves between pages.
import type { AdminSectionId } from '@extas/settings';
import type { AdminLang } from '../admin-i18n';
import type { Dict } from '../i18n';
import type { ShellIconName } from './icons';
import type { QueueRow } from './queues';
import type { ShellViewer } from './sections';
import { todoGroupOf, type TodoGroup } from './todo';

export interface ShellLangLabels {
  group: string;
  en: string;
  enShort: string;
  bn: string;
  bnShort: string;
}

export interface ShellModel {
  lang: AdminLang;
  /** `shell.*` of the admin dictionary (and the switch's labels). */
  dict: Dict;
  storeName: string | null;
  me: { name: string; initials: string; role: string };
  viewer: { perms: string[]; owner: boolean };
  badges: Partial<Record<AdminSectionId, number>>;
  /** How long a badge count is good for (`admin.shell.badgeCacheSeconds`). */
  badgeSeconds: number;
  langLabels: ShellLangLabels;
  /** PR 12 (CN-025): the waiting lists of the "To do" drawer (only what the person may open, work waiting). */
  todo: TodoItem[];
  /** The lists that are "Mine" (`admin.todo.mine`, else the start section's); null = no "Mine" tab. */
  todoMine: string[] | null;
  /** "Later" puts a list aside for this many hours (`admin.todo.laterHours`). */
  laterHours: number;
  /** The rail is drawn expanded (the person's own choice, a cookie). */
  railExpanded: boolean;
}

/** One waiting list in the "To do" drawer. */
export interface TodoItem {
  id: string;
  n: number;
  /** When the oldest item arrived (ISO), or null. */
  oldest: string | null;
  href: string;
  icon: ShellIconName;
  tone: 'bad' | 'warn' | 'info';
  group: TodoGroup;
  section: AdminSectionId;
}

/** The rail's expanded / collapsed choice (the person's own, kept a year). */
export const RAIL_COOKIE = 'extas_admin_rail';

/** The drawer's items from the visible queue rows. */
export function todoItems(rows: readonly QueueRow[]): TodoItem[] {
  return rows.map((r) => ({ id: r.id, n: r.n, oldest: r.oldest, href: r.def.href, icon: r.def.icon, tone: r.def.tone, group: todoGroupOf(r.def), section: r.def.section }));
}

/** "Mine": the role's own list from `admin.todo.mine`, else the lists of the role's start section; null = no tab. */
export function mineOf(roles: readonly { key: string }[], mine: Record<string, string[]>, startPages: Record<string, string>, rows: readonly QueueRow[]): string[] | null {
  for (const r of roles) if (mine[r.key]?.length) return [...mine[r.key]!];
  for (const r of roles) {
    const s = startPages[r.key];
    if (s && s !== 'dashboard') return rows.filter((x) => x.def.section === s).map((x) => x.id);
  }
  return null;
}

export const viewerOf = (m: Pick<ShellModel, 'viewer'>): ShellViewer => ({ perms: new Set(m.viewer.perms), owner: m.viewer.owner });

/** Two letters for the avatar: the first letters of the first two words of the name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = [...(parts[0] ?? '')][0] ?? '';
  const second = [...(parts[1] ?? '')][0] ?? '';
  return (first + second).toUpperCase();
}
