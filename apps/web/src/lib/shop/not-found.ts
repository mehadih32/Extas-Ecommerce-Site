// S11 · PR 235 follow-up (6 Nov, lane B) — the one way a shop page answers "page not found": the address is counted for
// the 404 report (lib/seo/not-found, in the background, with the page that linked here) and Next's notFound() draws
// the shop's not-found page. The counting used to sit in that not-found page itself, but Next draws a section's
// not-found page on the server for every page of the section (it travels with the page, ready for the browser), so
// every shop page the visitor opened was counted as missing. A guard test keeps every shop page on this helper.
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { recordNotFound } from '@/lib/seo/not-found';

/** Counts the address as missing (background, never waited for) and answers "page not found". */
export function shopNotFound(c: { storeId: number; path: string }): never {
  void headers().then(
    (h) => recordNotFound(c.storeId, c.path, h.get('referer')),
    () => recordNotFound(c.storeId, c.path, null),
  );
  notFound();
}
