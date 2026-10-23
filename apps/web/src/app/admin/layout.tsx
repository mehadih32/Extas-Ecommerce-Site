// PR 500 — every admin page: the demo's admin type (Instrument Sans for text, Archivo for headings, Hind Siliguri for
// Bengali from the root layout) and the admin styles. The fonts are self-hosted (src/fonts), so building never depends
// on a font download.
// PR 12 (CN-018, CN-022) — the new admin shell around every signed-in admin page (14 sections, demo V12.3 #/admin):
// drawn here once per request with the person's sections, keys and waiting-work badges; the sign-in page and a request
// without a session get the page alone (the page sends them to sign in).
import '../../fonts/admin.css';
import './admin.css';
// PR 21, 35: the product pages' styles, in the same stylesheet as the frame's (one render-blocking file, not two).
import './products/products.css';
import './shell.css';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminShell } from '@/components/admin/shell/AdminShell';
import { ShellTextProvider } from '@/components/admin/shell/ShellText';
import { langLabels } from '@/components/admin/AdminFrame';
import { adminView } from '@/lib/admin-page';
import { initialsOf, type ShellModel } from '@/lib/admin-shell/model';
import { badgesFrom, cachedQueues, visibleQueues } from '@/lib/admin-shell/queues';
import { shellSession } from '@/lib/admin-shell/session';
import type { Dict } from '@/lib/i18n';
import { t } from '@/lib/i18n';

async function shellModel(): Promise<ShellModel | null> {
  const s = await shellSession();
  if (s.kind !== 'ok') return null;
  const view = await adminView(s.deps);
  const shell = (await s.deps.resolver.value('admin.shell', { storeId: MOTHER_STORE_ID }).catch(() => null)) as { badgeCacheSeconds: number } | null;
  const seconds = shell?.badgeCacheSeconds ?? 0;
  const viewer = { perms: s.perms, owner: s.owner };
  const counts = await cachedQueues({ db: s.deps.db, settings: s.deps.resolver, now: s.deps.now }, MOTHER_STORE_ID, seconds).catch(() => []);
  const staff = s.guard.auth.staff;
  const role = s.roles[0];
  const labels = langLabels(view);
  return {
    lang: view.lang,
    dict: { shell: view.dict.shell as Dict },
    storeName: view.storeName,
    me: { name: staff.displayName, initials: initialsOf(staff.displayName), role: role ? (view.lang === 'bn' ? role.nameBn : role.nameEn) : t(view.dict, 'shell.me.staff') },
    viewer: { perms: [...s.perms], owner: s.owner },
    badges: badgesFrom(visibleQueues(counts, viewer)),
    badgeSeconds: seconds,
    langLabels: { group: labels.group, en: labels.en, enShort: labels.enShort, bn: labels.bn, bnShort: labels.bnShort },
  };
}

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [model, view] = await Promise.all([shellModel(), adminView()]);
  // The error page draws in the browser: it gets the system states' words here (lib/admin-shell, SH-07).
  const text = { lang: view.lang, dict: { shell: { state: (view.dict.shell as Dict).state } } as Dict, inShell: model !== null };
  return (
    <ShellTextProvider value={text}>{model ? <AdminShell model={model}>{children}</AdminShell> : <div>{children}</div>}</ShellTextProvider>
  );
}
