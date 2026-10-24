// PR 12 (CN-025) — what a page design is (the look registry, registry.ts). A design is one render module: its key, its
// name and one line about it in both languages, the data parts it draws (the page's one loader reads only those), the
// component that draws it and a small picture for Settings → Admin look. A page's design "A" may have no component:
// that is the page as it was built, drawn by its own route (the registry then only adds the "…" switch).
import type { ReactNode } from 'react';
import type { AdminSectionId } from '@extas/settings';
import type { ShellIconName } from '@/lib/admin-shell/icons';

export interface Words {
  en: string;
  bn: string;
}

export interface LookDesign<Props = never, Part extends string = string> {
  /** One capital letter: A, B, C … (the order they are listed in). */
  key: string;
  name: Words;
  desc: Words;
  /** The data parts it draws (the page's loader reads only these). */
  parts: readonly Part[];
  /** Draws the page; none = the route's own page (design A of a page built before the registry). */
  Render?: (props: Props) => ReactNode | Promise<ReactNode>;
  /** The small picture on Settings → Admin look (240 × 150). */
  Thumb: () => ReactNode;
}

export interface LookPage {
  id: string;
  section: AdminSectionId;
  icon: ShellIconName;
  /** Where the page is opened to preview a design (`?design=X` is added). */
  preview: string;
  /** The design a team sees until the owner picks one (`admin.look.pages`). */
  standard: string;
  designs: readonly LookDesign<never>[];
}

export const wordsIn = (lang: 'bn' | 'en', w: Words) => (lang === 'bn' ? w.bn : w.en);

/** The address that previews a design of a page. */
export function previewHref(page: Pick<LookPage, 'preview'>, key: string): string {
  return `${page.preview}${page.preview.includes('?') ? '&' : '?'}design=${encodeURIComponent(key)}`;
}
