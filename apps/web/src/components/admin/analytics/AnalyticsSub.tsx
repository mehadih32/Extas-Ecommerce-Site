// PR 802 — Website › Analytics' four sub-pages as the prototype draws them (js/m-website.js `an-sub`): Overview, Search,
// Behaviour and Speed. Overview and Behaviour are this tab's own pages; Search is the organic report (clicks and
// positions from Google and Bing) and Speed is the page-speed card of the SEO screen, so each chip opens the page that
// already holds that part. A plain row of links (server drawn), the open one marked.
import Link from 'next/link';
import { t, type Dict } from '@/lib/i18n';

export type AnalyticsSubId = 'overview' | 'search' | 'behaviour' | 'speed';

const HREF: Record<AnalyticsSubId, string> = {
  overview: '/admin/website/analytics',
  search: '/admin/website/seo/organic',
  behaviour: '/admin/website/analytics/behaviour',
  speed: '/admin/website/seo#a2s-seovt',
};

export function AnalyticsSub({ dict, current }: { dict: Dict; current: AnalyticsSubId }) {
  return (
    <nav className="lm-chips a2-mt12" aria-label={t(dict, 'webAnalytics.subNav.aria')} data-testid="web-analytics-sub">
      {(['overview', 'search', 'behaviour', 'speed'] as const).map((id) => (
        <Link key={id} className={`lm-chip${id === current ? ' on' : ''}`} href={HREF[id]} aria-current={id === current ? 'page' : undefined} data-testid={`web-sub-${id}`}>
          {t(dict, `webAnalytics.subNav.${id}`)}
        </Link>
      ))}
    </nav>
  );
}
