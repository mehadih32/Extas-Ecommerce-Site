'use client';
// S18 · PR 387 (B7.5, HLP-01) — one chapter of the Site manual (/admin/help/manual): the section's overview, then each
// page guide in its six parts, drawn with the guide panel's own renderer (GuideBlocks: parsed blocks, never HTML). A link
// to another page guide goes to that page's place in the manual (its chapter, its anchor); a link to a section guide
// opens it in the guide panel beside the manual.
// PR 388: a page with a picture (docs/admin-guide/marks.json, taken by the smoke test) shows it under its title with the
// numbered marks (ManualShots).
// PR 937 (prototype v5 "set-man"): each page is a fold-out (summary = the page's name) with the guide inside and "Open this page";
// the first page starts open, a link to a page's place opens it, and "Expand all" / "Collapse all" open or close every one.
// `allOpen` (the print view that saves the whole manual as a PDF) keeps every page open.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Guide, BoxKind } from '@/lib/admin-shell/guide';
import { GuideBlocks, type OnGuide } from '../shell/GuidePanel';
import { openGuide } from '../shell/events';
import type { PageShot } from '@/lib/admin-shell/shots';
import { ManualShots } from './ManualShots';

export interface ManualChapterTexts {
  about: string;
  open: string;
  top: string;
  boxes: Record<BoxKind, string>;
  /** PR 388: the picture's alt text and "taken …" line. */
  shot: string;
  taken: string | null;
  /** PR 937: the two buttons above the fold-outs. */
  expandAll: string;
  collapseAll: string;
}

export interface ManualChapterPage {
  id: string;
  anchor: string;
  href: string | null;
  guide: Guide;
  shots: PageShot[];
}

export function ManualChapter({
  base,
  section,
  sectionName,
  overview,
  pages,
  texts,
  allOpen = false,
}: {
  base: string;
  section: string;
  sectionName: string;
  overview: Guide | null;
  pages: ManualChapterPage[];
  texts: ManualChapterTexts;
  allOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>(() => (pages[0] ? { [pages[0].id]: true } : {}));
  const openAnchor = (anchor: string) => {
    const hit = pages.find((x) => x.anchor === anchor);
    if (hit) setOpen((o) => ({ ...o, [hit.id]: true }));
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    const hit = pages.find((x) => x.anchor === h);
    if (!hit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a link to a page opens its fold-out once, on arrival
    setOpen((o) => ({ ...o, [hit.id]: true }));
    requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView({ block: 'start' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, []);
  const onGuide: OnGuide = (to) => {
    if (to.slug) {
      openGuide({ slug: to.slug, section: sectionName });
      return;
    }
    if (!to.page) return;
    const [sec, page] = to.page.split('/') as [string, string];
    const anchor = page === 'index' ? 'man-top' : `p-${sec}-${page}`;
    if (sec === section) {
      openAnchor(anchor);
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
      {pages.length > 1 && !allOpen ? (
        <div className="a2-man-acc-bar" data-testid="manual-acc-bar">
          <button type="button" className="a2-btn sm" onClick={() => setOpen(Object.fromEntries(pages.map((x) => [x.id, true])))} data-testid="manual-expand">
            {texts.expandAll}
          </button>
          <button type="button" className="a2-btn sm" onClick={() => setOpen({})} data-testid="manual-collapse">
            {texts.collapseAll}
          </button>
        </div>
      ) : null}
      {pages.map((p) => (
        <details
          key={p.id}
          id={p.anchor}
          className="a2-card a2-man-sec a2-man-acc"
          data-testid="manual-page"
          data-page={p.id}
          open={allOpen || Boolean(open[p.id])}
          onToggle={(e) => {
            if (allOpen) return;
            const now = e.currentTarget.open;
            setOpen((o) => (Boolean(o[p.id]) === now ? o : { ...o, [p.id]: now }));
          }}
        >
          <summary className="a2-man-sum">
            <h2>{p.guide.title}</h2>
          </summary>
          <header className="a2-man-ph">
            {p.href ? (
              <Link className="a2-btn" href={p.href} data-testid="manual-open">
                {texts.open}
              </Link>
            ) : null}
          </header>
          <ManualShots shots={p.shots} title={p.guide.title} alt={texts.shot} taken={texts.taken} />
          <GuideBlocks blocks={p.guide.blocks} onGuide={onGuide} boxes={texts.boxes} />
          <a className="a2-man-top" href="#man-top">
            {texts.top}
          </a>
        </details>
      ))}
    </div>
  );
}
