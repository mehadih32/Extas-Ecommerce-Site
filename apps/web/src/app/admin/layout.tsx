// PR 500 — every admin page: the demo's admin type (Instrument Sans for text, Archivo for headings, Hind Siliguri for
// Bengali from the root layout) and the admin styles. The frame itself is drawn by each page (components/admin).
// The fonts are self-hosted (src/fonts), so building never depends on a font download.
import '../../fonts/admin.css';
import './admin.css';

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div>{children}</div>;
}
