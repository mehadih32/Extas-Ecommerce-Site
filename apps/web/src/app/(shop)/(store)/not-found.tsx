// The shop's "page not found" (demo PAGES.notfound) for a page that throws Next's notFound() (through lib/shop/not-found
// shopNotFound). The view (a short line and the way home; on a desktop a search box, the live categories and the
// WhatsApp line, D-019) moved to components/shop/NotFoundView in the PR 40 follow-up, which also draws it on the server
// for an unknown address. Bestsellers join with the product cards (PR 43).
// S11 · PR 235: every address that ends here is counted for the 404 report ~~(lib/seo/not-found, in the background)~~
// (PR 235 follow-up: by the page that answers "not found", lib/shop/not-found shopNotFound: Next draws this page on the
// server with every shop page, so counting here counted every page the visitor opened).
import type { Metadata } from 'next';
import { NotFoundView, notFoundMetadata } from '@/components/shop/NotFoundView';
import { shopContext } from '@/lib/shop/context';

export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata(await shopContext());
}

export default async function NotFound() {
  return <NotFoundView c={await shopContext()} />;
}
