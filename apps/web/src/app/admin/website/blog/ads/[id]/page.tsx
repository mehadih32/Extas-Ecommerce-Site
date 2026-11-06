// S12 · PR 592 (Blueprint C11.5) — one house ad at /admin/website/blog/ads/<id> (`new` makes one), drawn in Lumen
// (CN-036, data-lm-ready): what it shows and where it leads, its picture, words in both languages, dates and weight
// with a live preview; switch on / off and set aside; and its places (where, for which pages, after which paragraph or
// card, a popup's trigger and cap), each switched on / off and set aside on its own. A new ad and a new place start
// switched off. Seeing needs `blog.read`; every change `blog.publish`. Guide: docs/admin-guide/pages/website/blog-ad.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { HouseAdEditor } from '@/components/admin/website/HouseAdEditor';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps, isUuid } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { adOptions, adsScreen } from '@/lib/journal/house-ads';
import bn from '../../../../../../../messages/admin-house-ads.bn.json';
import en from '../../../../../../../messages/admin-house-ads.en.json';
import '../ads.css';

export const dynamic = 'force-dynamic';

const KEY = 'blogAd';
type Props = { params: Promise<{ id: string }> };

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [view, { id }] = await Promise.all([adminView().then(withScreen), props.params]);
  return { title: t(view.dict, id === 'new' ? 'ha.e.metaNew' : 'ha.e.metaEdit'), robots: { index: false, follow: false } };
}

export default async function HouseAdPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, { id }] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID), props.params]);
  const view = withScreen(plain);
  const d = view.dict;
  const here = `/admin/website/blog/ads/${id}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  if (id !== 'new' && !isUuid(id)) notFound();
  const l = (k: string, vars?: Record<string, string | number>) => t(d, `ha.e.${k}`, vars);
  const canPublish = access.guard.permissions?.has('blog.publish') ?? false;
  const [screen, options] = await Promise.all([adsScreen(access.deps.db, access.deps.resolver, new Date()), adOptions(access.deps.db)]);
  const ad = id === 'new' ? null : (screen.ads.find((a) => a.id === id) ?? null);
  if (id !== 'new' && !ad) notFound();
  if (id === 'new' && !canPublish)
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="blog.publish" />
      </div>
    );
  // every word the editor draws, in the admin's language (the shop name in the preview's label)
  const words = Object.fromEntries(Object.entries((view.lang === 'bn' ? bn : en).ha.e).map(([k, v]) => [k, k === 'label' ? v.replace('{shop}', view.storeName ?? '') : v]));
  const kinds = Object.fromEntries((['banner', 'product', 'combo', 'category'] as const).map((k) => [k, t(d, `ha.kind_${k}`)]));
  const set = screen.card.value;

  return (
    <div className="a2-z ha-page" data-testid="blog-ad" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={
          <Link className="ha-crumb" href="/admin/website/blog/ads">
            {l('back')}
          </Link>
        }
        title={ad ? ad.name : l('titleNew')}
        sub={l('sub')}
      />
      <SectionTabs view={view} current={KEY} />
      {set.on ? null : (
        <p className="lm-card ha-off" role="note">
          {t(d, 'ha.off')}
        </p>
      )}
      {canPublish ? null : (
        <p className="lm-card ha-ro" data-testid="ha-e-readonly">
          {l('readOnly')}
        </p>
      )}
      <HouseAdEditor ad={ad} options={options} words={words} kinds={kinds} canWrite={canPublish} defaults={{ pct: set.popupScrollPct, seconds: set.popupSeconds, capTimes: set.capTimes, capDays: set.capDays }} />
    </div>
  );
}
