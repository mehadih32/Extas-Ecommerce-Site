// PR 12 (CN-032) — /fresh-start (and /bn/fresh-start): one button that clears this site's saved data in this browser
// only (lib/fresh-start.ts), for a page that will not open or goes blank in one browser. `?to=admin` opens the admin's
// sign-in afterwards; otherwise the shop's home in the page's language.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import bn from '../../../messages/recover.bn.json';
import en from '../../../messages/recover.en.json';
import { FreshStartButton } from '@/components/FreshStart';
import { t } from '@/lib/i18n';
import { LANG_HEADER } from '@/lib/shop/lang';
import '../global-error.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const d = (await headers()).get(LANG_HEADER) === 'en' ? en : bn;
  return { title: t(d, 'pageTitle'), robots: { index: false, follow: false } };
}

export default async function FreshStartPage() {
  const d = (await headers()).get(LANG_HEADER) === 'en' ? en : bn;
  return (
    <div className="ge">
      <main className="ge-card" data-testid="fresh-start-page">
        <h1>{t(d, 'pageTitle')}</h1>
        <p>{t(d, 'pageBody')}</p>
        <div className="ge-actions">
          <FreshStartButton dict={d} className="ge-btn pri" />
        </div>
      </main>
    </div>
  );
}
