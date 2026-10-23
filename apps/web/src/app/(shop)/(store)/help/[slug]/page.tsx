// PR 75 — the help pages at /help/<slug> and /bn/help/<slug> (Blueprint D3.17, C12): FAQ, delivery, exchange and
// returns, privacy, terms, our story and contact. Each reads the live Smart Rules, the owner's own words and the store's
// details (lib/shop/help-data); with nothing true to say it shows "Coming soon", like every help address still to come
// (Ways to pay, Careers, the size guide: CN-010), and stays out of search engines.
import type { Metadata } from 'next';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { HelpPage } from '@/components/shop/help/HelpPage';
import { shopContext } from '@/lib/shop/context';
import { loadHelp } from '@/lib/shop/help-data';
import { isHelpSlug } from '@/lib/shop/help-pages';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const c = await shopContext();
  if (!isHelpSlug(slug)) return { ...(await shopMetadata(c, 'soon-help', c.t('soon.title'))), robots: { index: false, follow: true } };
  const m = (await loadHelp(c)).models[slug];
  if (m.soon) return { ...(await shopMetadata(c, `help-${slug}`, c.t('soon.title'))), robots: { index: false, follow: true } };
  return shopMetadata(c, `help-${slug}`, m.title);
}

export default async function Help(props: Props) {
  const { slug } = await props.params;
  const c = await shopContext();
  if (!isHelpSlug(slug)) return <ComingSoon c={c} soonKey="help" />;
  const data = await loadHelp(c);
  if (data.models[slug].soon) return <ComingSoon c={c} soonKey="help" />;
  return <HelpPage c={c} slug={slug} data={data} />;
}
