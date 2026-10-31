// S11 · PR 588 (Blueprint C12.1) — the Bengali translation gate in front of the shop's pages (the proxy). A Bengali page
// that is not marked ready (`language.bengali.readyPages`) is always kept out of search engines, the sitemap and
// hreflang (lib/shop/meta, the sitemaps); while the owner chose `english` (`language.bengali.gate`), a visitor is also
// sent to its English twin with a temporary redirect, never cached, so the page opens in Bengali the moment it is
// marked ready. Only content pages have a gate key (`bengaliPageKey`); bag, checkout, account and search never move.
// The proxy never waits on the database: the settings come from the in-process resolver, and a slow or missing one
// leaves every page where it is.
import type { BengaliGateSettings } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { ROUTES } from '../shop/routes';

const trim = (p: string) => p.replace(/^\/+|\/+$/g, '');
const first = (route: string) => trim(route).split('/')[0]!;

/** The gate's page key of a shop address (without /bn and its query), or null when the gate does not apply. */
export function bengaliPageKey(rawPath: string, productPrefix: string): string | null {
  const segs = trim(rawPath.replace(/[?#].*$/, '')).split('/').filter(Boolean);
  if (!segs.length) return 'home';
  const [a, b] = segs;
  const prefix = trim(productPrefix).split('/').filter(Boolean);
  if (prefix.length && segs.length > prefix.length && prefix.every((p, i) => segs[i] === p)) return `${prefix.join('/')}/${segs[prefix.length]}`;
  if (segs.length === 2 && a === first(ROUTES.category('x'))) return `collections/${b}`;
  if (segs.length === 2 && a === first(ROUTES.help('x'))) return `help-${b}`;
  if (segs.length === 2 && a === first(ROUTES.combo('x'))) return `combo/${b}`;
  if (a === trim(ROUTES.combos)) {
    if (!b) return trim(ROUTES.combos);
    if (`/${a}/${b}` === ROUTES.buildSet) return trim(ROUTES.buildSet);
    return segs.length === 2 ? `combos/${b}` : null;
  }
  return null;
}

/** Whether a Bengali visitor is sent to the English twin (the gate's `english` choice, a content page not ready). */
export function sendToEnglish(o: { lang: string; bengaliOn: boolean; gate: BengaliGateSettings; ready: readonly string[]; key: string | null }): boolean {
  return o.lang === 'bn' && o.bengaliOn && o.gate.notReady === 'english' && o.key !== null && !o.ready.includes(o.key);
}

/** For the proxy: whether this Bengali address goes to its English twin now (false when the settings cannot be read). */
export async function bengaliGateSends(storeId: number, path: string): Promise<boolean> {
  const r = settingsResolver();
  if (!r) return false;
  try {
    const at = { storeId };
    // as shipped (`unlisted`) one read and done: nothing else is looked at
    const gate = await withTimeout(r.value('language.bengali.gate', at), settingsTimeoutMs());
    if (gate.notReady !== 'english') return false;
    const [bengaliOn, ready, prefix] = await withTimeout(
      Promise.all([r.value('language.bengali.enabled', at), r.value('language.bengali.readyPages', at), r.value('naming.productPathPrefix', at)]),
      settingsTimeoutMs(),
    );
    return sendToEnglish({ lang: 'bn', bengaliOn, gate, ready, key: bengaliPageKey(path, prefix) });
  } catch {
    return false;
  }
}
