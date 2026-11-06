// PR 500 — every admin page: the demo's admin type (Instrument Sans for text, Archivo for headings, Hind Siliguri for
// Bengali from the root layout) and the admin styles. The fonts are self-hosted (src/fonts), so building never depends
// on a font download.
// PR 12 (CN-018, CN-022) — the new admin shell around every signed-in admin page (14 sections, demo V12.3 #/admin):
// drawn here once per request with the person's sections, keys and waiting-work badges; the sign-in page and a request
// without a session get the page alone (the page sends them to sign in).
// PR 594 (CN-026 (a)): the admin's own UI type (fonts/admin-ui.css: one Bengali and one English face, swap), with its
// first faces preloaded; the shop never loads it.
// PR 12 (CN-025): the V12.4 shell (top bar, rail, To-do drawer) and its design language (look.css), the drawer's waiting
// lists (only what the person may open), "Mine" (`admin.todo`), the rail's own expanded / collapsed choice (a cookie) and
// where the guide opens for this person (`admin.guideOpens`, CN-026 (b)).
// PR 627–629 (CN-036): the shared Lumen patterns' styles (lumen-patterns.css) and numbers (`admin.patterns`: Undo
// seconds, "Show more" step) on the shell's model, for the one toast and the lists.
// PR 626 (CN-036): the Lumen shell's model adds whether the AI Center shows (lib/admin-shell/stages.ts: S15's part
// hidden by PR 652's closed-stage switch, and `ai.enabled`)
// and when the person last read their notes; the sidebar is full width unless the person collapsed it (cookie "0").
// PR 625 (CN-036): the theme layer (theme/lumen.css) — every colour, radius, font, shadow and motion time as a token —
// and this person's theme (look, light or dark, motion, the team's accent) on the shell's root, or on the page's own
// wrapper when there is no shell (the sign-in page).
import { preload } from 'react-dom';
import type { CSSProperties } from 'react';
import './theme/lumen.css';
import './theme/looks.css';
import '../../fonts/admin.css';
import '../../fonts/admin-ui.css';
import './admin.css';
// PR 21, 35: the product pages' styles, in the same stylesheet as the frame's (one render-blocking file, not two).
import './products/products.css';
import './shell.css';
import './look.css';
import './lumen-shell.css';
import './lumen-patterns.css';
import './lumen-sections.css';
// PR 648 (CN-036, lane C): each section moved by lane C keeps its own Lumen rules in its own file (lumen-help.css …).
import './lumen-help.css';
import './lumen-settings.css';
import './lumen-reports.css';
import './lumen-books.css';
import { cookies } from 'next/headers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminLookSettings, adminPatternsSettings, BUILT_ADMIN_LOOKS } from '@extas/settings';
import { guideModeOf } from '@/lib/admin-look/pick';
import { lookState } from '@/lib/admin-look/prefs';
import { themeAttrs, themeOf, themeStyle, type AdminTheme } from '@/lib/admin-look/theme';
import { AdminShell } from '@/components/admin/shell/AdminShell';
import { ShellTextProvider } from '@/components/admin/shell/ShellText';
import { langLabels } from '@/components/admin/AdminFrame';
import { adminFontPreloads } from '@/lib/admin-fonts';
import { adminView } from '@/lib/admin-page';
import { initialsOf, mineOf, RAIL_COOKIE, todoItems, type ShellModel } from '@/lib/admin-shell/model';
import { badgesFrom, cachedQueues, visibleQueues } from '@/lib/admin-shell/queues';
import { aiCenterShown } from '@/lib/admin-shell/stages';
import { shellSession } from '@/lib/admin-shell/session';
import type { Dict } from '@/lib/i18n';
import { t } from '@/lib/i18n';

type TodoSetting = { laterHours: number; mine: Record<string, string[]> };

async function shellModel(theme: AdminTheme, notesSeenAt: string | null): Promise<ShellModel | null> {
  const s = await shellSession();
  if (s.kind !== 'ok') return null;
  const view = await adminView(s.deps);
  const shell = (await s.deps.resolver.value('admin.shell', { storeId: MOTHER_STORE_ID }).catch(() => null)) as { badgeCacheSeconds: number } | null;
  const seconds = shell?.badgeCacheSeconds ?? 0;
  const viewer = { perms: s.perms, owner: s.owner, hidden: s.hidden };
  const scope = { storeId: MOTHER_STORE_ID };
  const [counts, todo, startPages, jar, patterns] = await Promise.all([
    cachedQueues({ db: s.deps.db, settings: s.deps.resolver, now: s.deps.now }, MOTHER_STORE_ID, seconds).catch(() => []),
    (s.deps.resolver.value('admin.todo', scope) as Promise<TodoSetting>).catch(() => adminLookSettings['admin.todo'].default),
    (s.deps.resolver.value('admin.startPages', scope) as Promise<Record<string, string>>).catch(() => ({})),
    cookies(),
    (s.deps.resolver.value('admin.patterns', scope) as Promise<ShellModel['patterns']>).catch(() => adminPatternsSettings['admin.patterns'].default),
  ]);
  const rows = visibleQueues(counts, viewer);
  const staff = s.guard.auth.staff;
  const role = s.roles[0];
  const labels = langLabels(view);
  return {
    lang: view.lang,
    dict: { shell: view.dict.shell as Dict, dash: { queue: (view.dict.dash as Dict).queue, age: (view.dict.dash as Dict).age } as Dict },
    storeName: view.storeName,
    me: { name: staff.displayName, initials: initialsOf(staff.displayName), role: role ? (view.lang === 'bn' ? role.nameBn : role.nameEn) : t(view.dict, 'shell.me.staff') },
    viewer: { perms: [...s.perms], owner: s.owner, hidden: [...s.hidden] },
    badges: badgesFrom(rows),
    badgeSeconds: seconds,
    langLabels: { group: labels.group, en: labels.en, enShort: labels.enShort, bn: labels.bn, bnShort: labels.bnShort },
    todo: todoItems(rows),
    todoMine: mineOf(s.roles, todo.mine, startPages, rows),
    laterHours: todo.laterHours,
    railExpanded: jar.get(RAIL_COOKIE)?.value !== '0',
    theme,
    aiShown: !s.hidden.has('ai') && aiCenterShown(s.hidden, (await s.deps.resolver.value('ai.enabled', scope).catch(() => false)) === true),
    notesSeenAt,
    patterns,
  };
}

/**
 * Where this person's guide opens (CN-026 (b)): their own choice while the team allows one, else the team's. The shell
 * has the side panel and the phone sheet; "panel" is the side panel, and the pop-up and own-page choices open it too
 * until follow-up 389 (resolveGuideMode).
 */
async function guideChoice(): Promise<string> {
  const look = await lookState();
  const choice = guideModeOf(look.guide, look.prefs);
  return choice === 'panel' ? 'side' : choice;
}

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const look = await lookState().catch(() => null);
  const theme = look?.theme ?? themeOf(null, undefined, BUILT_ADMIN_LOOKS);
  const [model, view, guideMode] = await Promise.all([shellModel(theme, look?.prefs.seen ?? null), adminView(), guideChoice().catch(() => null)]);
  for (const href of adminFontPreloads(view.lang, model !== null)) preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  // The error page draws in the browser: it gets the system states' words here (lib/admin-shell, SH-07).
  // follow-up 508: and the shared words for a refused save (no permission, gone, signed out) that every settings card uses
  const text = { lang: view.lang, dict: { shell: { state: (view.dict.shell as Dict).state, saveErr: (view.dict.shell as Dict).saveErr } } as Dict, inShell: model !== null };
  return (
    <ShellTextProvider value={text}>
      {model ? (
        <AdminShell model={model} guideMode={guideMode}>
          {children}
        </AdminShell>
      ) : (
        <div {...themeAttrs(theme)} style={themeStyle(theme) as CSSProperties}>
          {children}
        </div>
      )}
    </ShellTextProvider>
  );
}
