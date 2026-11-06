'use client';
// PR 597 follow-up (696) — the hash forwarder's script (PR 586, lib/seo/hash-forward) the React way. It works only as
// part of the server's HTML, where the browser runs it while it reads the page, before anything draws; hydration keeps
// that element as it is. A copy React makes in the browser never runs (a shop "page not found" is drawn in the
// browser, and so is a layout drawn again after a client move), and React 19 warns about such a script in development
// ("Encountered a script tag while rendering React component"). So a browser-made copy is an inert data block instead
// (`type="application/json"`, which React does not warn about), and the type that differs from the server's is
// expected (suppressHydrationWarning on this one element).
const INERT = 'application/json';

export function HashForwardScript({ code }: { code: string }) {
  return <script data-hash-forward="" type={typeof window === 'undefined' ? undefined : INERT} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: code }} />;
}
