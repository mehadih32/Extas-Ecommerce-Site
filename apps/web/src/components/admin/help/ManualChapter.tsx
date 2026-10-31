'use client';
// S18 · PR 387 (B7.5, HLP-01) — one chapter of the Site manual (/admin/help/manual): the section's overview, then each
// page guide in its six parts, drawn with the guide panel's own renderer (GuideBlocks: parsed blocks, never HTML). A link
// to another page guide goes to that page's place in the manual (its chapter, its anchor); a link to a section guide
// opens it in the guide panel beside the manual.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Guide, BoxKind } from '@/lib/admin-shell/guide';
import { GuideBlocks, type OnGuide } from '../shell/GuidePanel';
import { openGuide } from '../shell/events';

export interface ManualChapterTexts {
  about: string;
  open: string;
  top: string;
  boxes: Record<BoxKind, string>;
}

export interface ManualChapterPage {
  id: string;
  anchor: string;
  href: string | null;
  guide: Guide;
}

export function ManualChapter({
  base,
  section,
  sectionName,
  overview,
  pages,
  texts,
}: {
  base: string;
  section: string;
  sectionName: string;
  overview: Guide | null;
  pages: ManualChapterPage[];
  texts: ManualChapterTexts;
}) {
  const router = useRouter();
  const onGuide: OnGuide = (to) => {
    if (to.slug) {
      openGuide({ slug: to.slug, section: sectionName });
      return;
    }
    if (!to.page) return;
    const [sec, page] = to.page.split('/') as [string, string];
    const anchor = page === 'index' ? 'man-top' : `p-${sec}-${page}`;
    if (sec === section) {
      document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
      history.replaceState(null, '', `#${anchor}`);
    } else router.push(`${base}?c=${encodeURIComponent(sec)}#${anchor}`);
  };
  return (
    <div className="a2-man-ch a2-guidebody" data-testid="manual-chapter" data-section={section}>
      {overview ? (
        <section className="a2-card a2-man-sec" data-testid="manual-overview">
          <h2>{texts.about}</h2>
          <GuideBlocks blocks={overview.blocks} onGuide={onGuide} boxes={texts.boxes} />
        </section>
      ) : null}
      {pages.map((p) => (
        <article key={p.id} id={p.anchor} className="a2-card a2-man-sec" data-testid="manual-page" data-page={p.id}>
          <header className="a2-man-ph">
            <h2>{p.guide.title}</h2>
            {p.href ? (
              <Link className="a2-btn" href={p.href} data-testid="manual-open">
                {texts.open}
              </Link>
            ) : null}
          </header>
          <GuideBlocks blocks={p.guide.blocks} onGuide={onGuide} boxes={texts.boxes} />
          <a className="a2-man-top" href="#man-top">
            {texts.top}
          </a>
        </article>
      ))}
    </div>
  );
}
