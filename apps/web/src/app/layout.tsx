import type { Metadata, Viewport } from 'next';
import { Hind_Siliguri } from 'next/font/google';
import './globals.css';
import dict from '../../messages/status.bn.json';
import { t } from '@/lib/i18n';

const bengali = Hind_Siliguri({ subsets: ['bengali', 'latin'], weight: ['400', '600'], variable: '--font-bengali', display: 'optional' });
// display optional: the text never waits for or re-paints with the web font; returning visits use the cached font.

export const metadata: Metadata = {
  title: t(dict, 'title'),
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bn" className={bengali.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
