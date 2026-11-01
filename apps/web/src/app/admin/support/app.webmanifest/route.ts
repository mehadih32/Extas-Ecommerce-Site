// S22 · PR 435 (Blueprint B4.11) — the support app's manifest: its own id and scope (only support), the name under the
// icon, standalone display, the admin's colours and the icons. 404 while `support.app` is off (the pages then do not link
// it). No session needed: nothing in it is private (the shop's name at most).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps } from '@/lib/admin-auth';
import { SUPPORT_APP, SUPPORT_APP_COLOURS, supportAppName } from '@/lib/support-push';
import { inboxDicts } from '@/lib/admin-support/i18n';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** Android shows about this many letters under an icon; a longer name falls back to the one word. */
const SHORT_NAME_MAX = 12;

export async function GET(): Promise<Response> {
  const deps = adminDeps();
  const app = deps ? await deps.resolver.value('support.app', { storeId: MOTHER_STORE_ID }).catch(() => null) : null;
  if (!deps || !app?.enabled) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const name = await supportAppName(deps, app.appName, 'en');
  const word = t(inboxDicts.en, 'sup.app.word');
  const icon = (size: number, purpose: 'any' | 'maskable') => ({ src: SUPPORT_APP.icon(size), sizes: `${size}x${size}`, type: 'image/png', purpose });
  const manifest = {
    id: `${SUPPORT_APP.scope}/`,
    name,
    short_name: name.length <= SHORT_NAME_MAX ? name : word,
    start_url: SUPPORT_APP.scope,
    scope: SUPPORT_APP.scope,
    display: 'standalone',
    orientation: 'any',
    background_color: SUPPORT_APP_COLOURS.background,
    theme_color: SUPPORT_APP_COLOURS.background,
    icons: [icon(192, 'any'), icon(512, 'any'), icon(512, 'maskable')],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-cache' } });
}
