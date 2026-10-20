// CN-016 / PR 501 — /favicon.ico always answers: the owner's icon (`brand.favicon`) when one is uploaded, else the
// neutral icon in the theme of the day (lib/shop/favicon.ts). Without a database (CI, `next build`) the registry
// defaults draw the neutral icon.
import { getPrisma } from '@extas/db/client';
import { imageSources } from '@extas/media';
import { registry } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '@/lib/settings';
import { shopStoreId } from '@/lib/shop/context';
import { neutralIconSvg, smallestRendition } from '@/lib/shop/favicon';
import { shopTheme, todayIn } from '@/lib/shop/theme';

export const dynamic = 'force-dynamic';

/** Browsers re-ask for the icon rarely; a short cache keeps a theme change or a new upload visible the same day. */
const CACHE = 'public, max-age=3600';

export async function GET() {
  const storeId = shopStoreId();
  const resolver = settingsResolver();
  const read = async () => {
    if (!resolver) throw new Error('no database');
    const at = { storeId };
    return Promise.all([
      resolver.value('brand.favicon', at),
      resolver.value('theme.preset', at),
      resolver.value('theme.schedule', at),
      resolver.value('theme.colours', at),
      resolver.value('store.timeZone', at),
    ] as const);
  };
  let [favicon, preset, schedule, colours, timeZone] = [
    registry['brand.favicon'].default,
    registry['theme.preset'].default,
    registry['theme.schedule'].default,
    registry['theme.colours'].default,
    registry['store.timeZone'].default,
  ];
  try {
    [favicon, preset, schedule, colours, timeZone] = await withTimeout(read(), settingsTimeoutMs());
  } catch {
    // defaults: the neutral icon
  }
  if (favicon && resolver) {
    try {
      const found = await withTimeout(imageSources({ db: getPrisma(), settings: resolver }, storeId, [favicon]), settingsTimeoutMs());
      const url = smallestRendition(found.get(favicon));
      if (url) return new Response(null, { status: 302, headers: { location: url, 'cache-control': CACHE } });
    } catch {
      // fall through to the neutral icon
    }
  }
  const theme = shopTheme({ preset, schedule, colours, fonts: null, today: todayIn(timeZone), previewAllowed: false });
  return new Response(neutralIconSvg(theme.tokens), { headers: { 'content-type': 'image/svg+xml', 'cache-control': CACHE } });
}
