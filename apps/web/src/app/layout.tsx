import type { Metadata, Viewport } from 'next';
import '../fonts/site.css';
import './globals.css';
import dict from '../../messages/status.bn.json';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: t(dict, 'title'),
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bn">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
