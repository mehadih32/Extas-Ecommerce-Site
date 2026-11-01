// S22 · PR 435 (Blueprint B4.11) — every support page: while the support app is offered (`support.app`, off as it
// ships) the pages carry the app's manifest (fetched with the session's credentials, the staging site is behind a
// password), Apple's home-screen tags and icon, and register its service worker. Opened from its icon (display-mode
// standalone), the frame shows only support: the admin's other sections are hidden (support.css, `.sp-app-shell`).
import type { ReactNode } from 'react';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { SupportAppWorker } from '@/components/admin/support/SupportAppWorker';
import { adminDeps } from '@/lib/admin-auth';
import { SUPPORT_APP, SUPPORT_APP_COLOURS, supportAppName } from '@/lib/support-push';
import './support.css';

export default async function SupportLayout({ children }: { children: ReactNode }) {
  const deps = adminDeps();
  const app = deps ? await deps.resolver.value('support.app', { storeId: MOTHER_STORE_ID }).catch(() => null) : null;
  if (!deps || !app?.enabled) return children;
  const name = await supportAppName(deps, app.appName, 'en');
  return (
    <>
      <link rel="manifest" href={SUPPORT_APP.manifest} crossOrigin="use-credentials" />
      <link rel="apple-touch-icon" href={SUPPORT_APP.icon(180)} />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content={name} />
      <meta name="theme-color" content={SUPPORT_APP_COLOURS.background} />
      <SupportAppWorker worker={SUPPORT_APP.worker} scope={SUPPORT_APP.scope} />
      <span className="sp-app-shell" hidden />
      {children}
    </>
  );
}
