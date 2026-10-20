// PR 84 / 588 — a shop page's title and its two-language links. Both twins name each other (hreflang), and a Bengali
// page stays out of search engines until the owner marks it ready (`language.bengali.readyPages`, the translation gate
// of PR 588), so a half-translated page is never found. While the whole site is staging, the root layout keeps every
// page noindex anyway; this gate is what remains after go-live.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ShopContext } from './context';
import { hrefIn } from './lang';

/** Whether the Bengali twin of a page may be indexed. */
export function bengaliReady(pageKey: string, ready: readonly string[]): boolean {
  return ready.includes(pageKey);
}

async function origin(): Promise<URL | undefined> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return undefined;
  const proto = h.get('x-forwarded-proto') === 'http' || /^(localhost|127\.)/.test(host) ? 'http' : 'https';
  return new URL(`${proto}://${host}`);
}

export async function shopMetadata(c: ShopContext, pageKey: string, title: string | null): Promise<Metadata> {
  const ready = bengaliReady(pageKey, c.s['language.bengali.readyPages']);
  const bnOn = c.s['language.bengali.enabled'];
  const base = await origin();
  const m: Metadata = {
    title: title ? c.t('meta.page', { page: title, store: c.storeName }) : c.t('meta.title', c.vars),
    ...(base ? { metadataBase: base } : {}),
    alternates: {
      canonical: hrefIn(c.lang, c.path),
      ...(bnOn && ready ? { languages: { en: hrefIn('en', c.path), bn: hrefIn('bn', c.path) } } : {}),
    },
  };
  if (c.lang === 'bn' && !ready) m.robots = { index: false, follow: true };
  return m;
}
