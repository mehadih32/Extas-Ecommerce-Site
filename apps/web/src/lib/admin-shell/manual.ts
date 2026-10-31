// S18 · PR 387 (Blueprint B7.5, §5 HLP-01; CN-014, CN-019 (3), CN-026) — the Site manual: the whole admin as one book,
// a chapter per section in the sidebar's order, each chapter the section's overview (docs/admin-guide/pages/<section>/
// index.md) and then every page guide of that section in the overview's order (help-pages.json), each in the same six
// parts (What · Why · How · every button and field · common mistakes · what happens next). It is the same text the guide
// panel shows, read from the server's copy of the docs (lib/admin-shell/guide.ts), so a page built later brings its own
// chapter page with it (the CI guide check fails a page without one) and nothing is written twice.
// A chapter is read when it is opened (all guides together are about a megabyte); the contents list needs only the
// titles. "Open this page" is offered only for a fixed address the person may open. No database, no React.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AdminSectionId } from '@extas/settings';
import { guideDir, readPageGuide, type Guide } from './guide';
import { HELP_PAGES, PAGE_GUIDE_ID, sectionPages } from './help-pages';
import { locate, SHELL_SECTIONS, sectionVisible, type ShellViewer } from './sections';

export interface ManualEntry {
  /** `<section>/<page>`: the page guide. */
  id: string;
  title: string;
  /** Where "Open this page" goes, or null (an address with a changing part, or a page the person may not open). */
  href: string | null;
}

export interface ManualOutlineChapter {
  section: AdminSectionId;
  /** The section overview's own title (the chapter's subtitle), or null when it has none yet. */
  overviewTitle: string | null;
  pages: ManualEntry[];
}

export interface ManualChapter extends ManualOutlineChapter {
  overview: Guide | null;
  guides: Record<string, Guide | null>;
}

/** The anchor of a page guide inside its chapter (`p-orders-confirm`). */
export const manualAnchor = (id: string) => `p-${id.replace('/', '-')}`;

/** A guide's title from its first `# ` line, without parsing the rest (the contents list reads every file). */
async function titleOf(id: string, dir: string): Promise<string | null> {
  if (!PAGE_GUIDE_ID.test(id)) return null;
  const [section, page] = id.split('/') as [string, string];
  const md = await readFile(join(/*turbopackIgnore: true*/ dir, 'pages', section, `${page}.md`), 'utf8').catch(() => null);
  if (md === null) return null;
  const m = /^#\s+(.+)$/m.exec(md);
  return m ? m[1]!.replace(/\*\*|`/g, '').trim() : id;
}

/** The address "Open this page" goes to: a fixed route the person may open (an owner may open every one). */
export function openHref(route: string, viewer: ShellViewer): string | null {
  if (route.includes('[')) return null;
  if (route === '/admin') return '/admin?home=1';
  const place = locate(route);
  if (!place?.page) return null;
  return viewer.owner || viewer.perms.has(place.page.perm) ? route : null;
}

/** The sections the person sees, in the sidebar's order. */
export const manualSections = (viewer: ShellViewer) => SHELL_SECTIONS.filter((s) => sectionVisible(s, viewer)).map((s) => s.id);

/** The book's contents: one chapter per visible section, with its pages' titles. Guides that are missing are left out. */
export async function manualOutline(viewer: ShellViewer, dir: string | null = guideDir()): Promise<ManualOutlineChapter[]> {
  if (!dir) return [];
  return Promise.all(
    manualSections(viewer).map(async (section) => {
      const rows = sectionPages(section);
      const [overviewTitle, titles] = await Promise.all([titleOf(`${section}/index`, dir), Promise.all(rows.map((r) => titleOf(r.id, dir)))]);
      const pages: ManualEntry[] = [];
      rows.forEach((r, i) => {
        const title = titles[i];
        if (title) pages.push({ id: r.id, title, href: openHref(r.route, viewer) });
      });
      return { section, overviewTitle, pages };
    }),
  );
}

/** One chapter in full: the overview and every page guide, or null for a section the person does not see. */
export async function readChapter(section: string, viewer: ShellViewer, dir: string | null = guideDir()): Promise<ManualChapter | null> {
  if (!dir || !manualSections(viewer).includes(section as AdminSectionId)) return null;
  const rows = sectionPages(section);
  const [overview, guides] = await Promise.all([readPageGuide(`${section}/index`, dir), Promise.all(rows.map((r) => readPageGuide(r.id, dir)))]);
  const pages: ManualEntry[] = [];
  const byId: Record<string, Guide | null> = {};
  rows.forEach((r, i) => {
    const g = guides[i] ?? null;
    if (!g) return;
    byId[r.id] = g;
    pages.push({ id: r.id, title: g.title, href: openHref(r.route, viewer) });
  });
  return { section: section as AdminSectionId, overviewTitle: overview?.title ?? null, overview, pages, guides: byId };
}

/** Every page guide id the manual can show (for the tests: each built page is in exactly one chapter). */
export const manualPageIds = () => HELP_PAGES.map((p) => p.id);
