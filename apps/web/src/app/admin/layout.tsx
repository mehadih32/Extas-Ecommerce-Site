// PR 500 — every admin page: the demo's admin type (Instrument Sans for text, Archivo for headings, Hind Siliguri for
// Bengali from the root layout) and the admin styles. The frame itself is drawn by each page (components/admin).
import { Archivo, Instrument_Sans } from 'next/font/google';
import './admin.css';

// display optional: text never waits for or re-paints with a web font (CLS 0); a later visit uses the cached font.
const body = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-instrument', display: 'optional' });
const display = Archivo({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-archivo', display: 'optional' });

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${body.variable} ${display.variable}`}>{children}</div>;
}
