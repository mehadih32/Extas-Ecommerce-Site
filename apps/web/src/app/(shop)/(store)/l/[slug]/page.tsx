// S13 · PR 254 (Blueprint MKT-05, C12 "ad landings /l/<slug> noindex,follow", demo 70-landing.js) — a landing page made
// for ads: one product, its offer and an order box on the page. It is served only while `marketing.landing` is on and the
// page is published (Marketing › Landing pages); its parts come in their fixed order, each one the owner switched on.
// Every price is the product's own live price; the promises (delivery, exchange, returns, "try it on in front of the
// rider") are the shop's own live rules and switches — SIM-F-034: the try-on line the checkout shows is on this page too.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getPrisma } from '@extas/db/client';
import { LandingPage } from '@/components/shop/landing/LandingPage';
import { publishedLanding } from '@/lib/marketing/landing';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

const switchFor = cache((storeId: number) => readPageSettings(['marketing.landing'] as const, storeId));
const pageFor = cache(async (storeId: number, slug: string) => {
  if (!process.env.DATABASE_URL) return null;
  const on = (await switchFor(storeId))['marketing.landing'].on;
  if (!on) return null;
  try {
    return await publishedLanding(getPrisma(), storeId, slug);
  } catch {
    return null;
  }
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [c, { slug }] = await Promise.all([shopContext(), props.params]);
  const page = await pageFor(c.storeId, decodeURIComponent(slug));
  if (!page) return {};
  const title = (c.lang === 'bn' && page.titleBn) || page.titleEn;
  return { ...(await shopMetadata(c, `landing-${page.slug}`, title, { index: false })), robots: { index: false, follow: true } };
}

export default async function LandingRoute(props: Props) {
  const [c, { slug }] = await Promise.all([shopContext(), props.params]);
  const page = await pageFor(c.storeId, decodeURIComponent(slug));
  if (!page) notFound();
  return <LandingPage c={c} page={page} />;
}
