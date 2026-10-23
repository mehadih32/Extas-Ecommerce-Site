import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { preload } from 'react-dom';
import '../fonts/site.css';
import './globals.css';
import dict from '../../messages/status.bn.json';
import { t } from '@/lib/i18n';
import { shopDefaultFontPreloads } from '@/lib/shop/font-preload';
import { isShopLang, LANG_HEADER } from '@/lib/shop/lang';

export const metadata: Metadata = {
  title: t(dict, 'title'),
  robots: { index: false, follow: false },
  // CN-016: the tab icon always answers (app/favicon.ico/route.ts: the owner's icon or a neutral one).
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // PR 84: a shop page carries its language from the proxy (English at the root, Bengali under /bn); the progress page
  // and the admin keep Bengali as the page language, as before.
  const lang = (await headers()).get(LANG_HEADER);
  // Follow-up 23 (PR 82): a shop page's first-screen fonts, before anything waits for the database, so React sends them
  // in the response's Link header and the browser starts them before the page's scripts (lib/shop/font-preload.ts
  // shopDefaultFontPreloads). Low priority: the stylesheets still come first (at high priority the fonts took the
  // line from them and the first paint came ~250 ms later on a slow phone line).
  if (isShopLang(lang)) for (const href of shopDefaultFontPreloads()) preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous', fetchPriority: 'low' });
  return (
    <html lang={isShopLang(lang) ? lang : 'bn'}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
