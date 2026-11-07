// Follow-up 155 (PR 58, 75) — the size guide page at /help/size-guide and /bn/help/size-guide (demo 10-size-guide.js
// sg_deskPage, D-018): "Find my size" (the same window the footer opens, while Find My Size can answer for a category),
// then every selling category's size chart as a table, read from the owner's charts (lib/shop/size-guide), so a new
// chart shows here by itself. Drawn on the server: the page itself adds no script. No chart at all: "Coming soon",
// kept out of search engines, like every help address with nothing true to say yet.
import type { Metadata } from 'next';
import '@/components/shop/help/help.css';
import '@/components/shop/size-guide/size-guide.css';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { SizeGuideTables } from '@/components/shop/size-guide/SizeGuideTables';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';
import { sizeGuideData } from '@/lib/shop/size-guide';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  const data = await sizeGuideData(c.storeId, c.lang);
  if (!data?.entries.length) return shopMetadata(c, 'help-size-guide', c.t('soon.title'), { index: false });
  return shopMetadata(c, 'help-size-guide', c.t('sizeGuide.title'), { seo: { kind: 'help', tokens: { name: c.t('sizeGuide.title') }, body: c.t('sizeGuide.lede') } });
}

export default async function SizeGuide() {
  const c = await shopContext();
  const data = await sizeGuideData(c.storeId, c.lang);
  if (!data?.entries.length) return <ComingSoon c={c} soonKey="help" />;
  return <SizeGuideTables c={c} data={data} />;
}
