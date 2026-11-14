// PR 75 — the help pages at /help/<slug> and /bn/help/<slug> (Blueprint D3.17, C12): FAQ, delivery, exchange and
// returns, privacy, terms, our story and contact. Each reads the live Smart Rules, the owner's own words and the store's
// details (lib/shop/help-data); with nothing true to say it shows "Coming soon", like every help address still to come
// (Ways to pay, Careers, the size guide: CN-010), and stays out of search engines.
// S11 · PR 224: the FAQ page's questions as FAQ data for search engines and AI assistants, exactly the ones it shows
// (`seo.structuredData.faq`, optional markup, off as shipped; Google shows no FAQ rich result since 7 May 2026).
import type { Metadata } from 'next';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { HelpPage } from '@/components/shop/help/HelpPage';
import { PolicyDocPage } from '@/components/shop/help/PolicyDocPage';
import { JsonLd } from '@/components/shop/JsonLd';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { loadHelp } from '@/lib/shop/help-data';
import { helpFaqItems, isHelpSlug } from '@/lib/shop/help-pages';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata, shopOrigin } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';
import { faqLd } from '@/lib/shop/structured-data';
import { isNewPolicy } from '@/lib/website-policies/model';
import { livePolicyWords } from '@/lib/website-policies/shop';
import { getPrisma } from '@extas/db/client';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const c = await shopContext();
  // PR 718: a policy page written in Website › Policies (cancellation, wallet, reviews, cookies)
  if (isNewPolicy(slug)) {
    const w = await livePolicyWords(getPrisma(), c.storeId, slug);
    if (!w) return { ...(await shopMetadata(c, 'soon-help', c.t('soon.title'))), robots: { index: false, follow: true } };
    const title = (c.lang === 'bn' ? w.title?.bn : w.title?.en) || w.title?.en || '';
    return shopMetadata(c, `help-${slug}`, title, { seo: { kind: 'help', tokens: { name: title }, body: (c.lang === 'bn' ? w.lede?.bn : w.lede?.en) ?? undefined } });
  }
  if (!isHelpSlug(slug)) return { ...(await shopMetadata(c, 'soon-help', c.t('soon.title'))), robots: { index: false, follow: true } };
  const m = (await loadHelp(c)).models[slug];
  if (m.soon) return shopMetadata(c, `help-${slug}`, c.t('soon.title'), { index: false });
  return shopMetadata(c, `help-${slug}`, m.title, { seo: { kind: 'help', tokens: { name: m.title }, body: m.lede } });
}

export default async function Help(props: Props) {
  const { slug } = await props.params;
  const c = await shopContext();
  if (isNewPolicy(slug)) {
    const w = await livePolicyWords(getPrisma(), c.storeId, slug);
    return w ? <PolicyDocPage c={c} slug={slug} words={w} /> : <ComingSoon c={c} soonKey="help" />;
  }
  if (!isHelpSlug(slug)) return <ComingSoon c={c} soonKey="help" />;
  const data = await loadHelp(c);
  if (data.models[slug].soon) return <ComingSoon c={c} soonKey="help" />;
  const sd = (await readPageSettings(['seo.structuredData'] as const, c.storeId))['seo.structuredData'];
  const here = sd.faq && slug === 'faq' ? await shopOrigin() : undefined;
  const ld = here ? faqLd(here, hrefIn(c.lang, ROUTES.help(slug)), helpFaqItems(data.models[slug])) : null;
  return (
    <>
      <JsonLd data={[ld]} />
      <HelpPage c={c} slug={slug} data={data} />
    </>
  );
}
