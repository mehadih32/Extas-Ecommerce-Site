// S11 · PR 235 follow-up (6 Nov, lane B) — the one way a shop page answers "page not found": the address is counted for
// the 404 report (lib/seo/not-found, in the background, with the page that linked here) and Next's notFound() draws
// the shop's not-found page. The counting used to sit in that not-found page itself, but Next draws a section's
// not-found page on the server for every page of the section (it travels with the page, ready for the browser), so
// every shop page the visitor opened was counted as missing. A guard test keeps every shop page on this helper.
// PR 40 follow-up (6 Nov, lane B): `markedMissing` — the proxy already answered HTTP 404 for an address the shop has no
// page for (lib/shop/unknown-address), so the catch-all draws the not-found page on the server and counts it here.
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { recordNotFound } from '@/lib/seo/not-found';
import { rewriteMark } from './rewrite-mark';
import { NOT_FOUND_HEADER } from './unknown-address';

/** Counts the address as missing for the 404 report, with the page that linked here (background, never waited for). */
export function countMissing(c: { storeId: number; path: string }): void {
  void headers().then(
    (h) => recordNotFound(c.storeId, c.path, h.get('referer')),
    () => recordNotFound(c.storeId, c.path, null),
  );
}

/** Counts the address as missing and answers "page not found". */
export function shopNotFound(c: { storeId: number; path: string }): never {
  countMissing(c);
  notFound();
}

/** Whether the proxy marked this request as an address with no page (it answers HTTP 404 already). */
export async function markedMissing(): Promise<boolean> {
  return (await headers()).get(NOT_FOUND_HEADER) === rewriteMark();
}
