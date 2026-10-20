import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '../fonts/site.css';
import './globals.css';
import dict from '../../messages/status.bn.json';
import { t } from '@/lib/i18n';
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
  return (
    <html lang={isShopLang(lang) ? lang : 'bn'}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
