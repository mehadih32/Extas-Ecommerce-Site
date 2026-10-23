// PR 12 — what the client shell is given by the server (app/admin/layout.tsx): the shell's own words in the person's
// language, the store's name, who is signed in, their keys (to draw only the sections they may open) and the badges
// counted for this request. The shell asks GET /api/admin/shell/badges again as the person moves between pages.
import type { AdminSectionId } from '@extas/settings';
import type { AdminLang } from '../admin-i18n';
import type { Dict } from '../i18n';
import type { ShellViewer } from './sections';

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
}

export const viewerOf = (m: Pick<ShellModel, 'viewer'>): ShellViewer => ({ perms: new Set(m.viewer.perms), owner: m.viewer.owner });

/** Two letters for the avatar: the first letters of the first two words of the name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = [...(parts[0] ?? '')][0] ?? '';
  const second = [...(parts[1] ?? '')][0] ?? '';
  return (first + second).toUpperCase();
}
