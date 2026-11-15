// PR 744 — /manifest.webmanifest: what a phone shows when a visitor adds the shop to the home screen (`app.homeScreen`,
// Website › Page settings › Home-screen icon). 404 while the switch is off (the pages then link no manifest). No session:
// nothing in it is private (the shop's name, the colours and the owner's icon). Without a database the registry's defaults
// (off) answer 404. lib/shop/manifest.ts builds it.
import { registry } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '@/lib/settings';
import { shopStoreId } from '@/lib/shop/context';
import { buildManifest } from '@/lib/shop/manifest';
import { iconSizes } from '@/lib/shop/manifest-icon';
import { shopTheme, todayIn } from '@/lib/shop/theme';

export const dynamic = 'force-dynamic';

const NO = () => new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });

export async function GET() {
  const storeId = shopStoreId();
  const resolver = settingsResolver();
  if (!resolver) return NO();
  const at = { storeId };
  try {
    const [set, name, preset, schedule, colours, timeZone] = await withTimeout(
      Promise.all([resolver.value('app.homeScreen', at), resolver.value('store.name', at), resolver.value('theme.preset', at), resolver.value('theme.schedule', at), resolver.value('theme.colours', at), resolver.value('store.timeZone', at)] as const),
      settingsTimeoutMs(),
    );
    if (!set.on) return NO();
    const theme = shopTheme({ preset, schedule, colours, fonts: null, today: todayIn(timeZone), previewAllowed: false });
    const icons = (await iconSizes(storeId, set.icon)).map(({ width: _w, ...rest }) => rest);
    const manifest = buildManifest({ set, storeName: name ?? '', background: theme.tokens.bg, icons, fallbackIcon: { src: '/favicon.ico', sizes: 'any', type: 'image/svg+xml' } }); // hardcode-ok: the shop's own tab-icon address and its type
    if (!manifest) return NO();
    return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  } catch {
    return NO();
  }
}

void registry; // the registry's defaults are the settings' own; the import keeps the route tied to it
