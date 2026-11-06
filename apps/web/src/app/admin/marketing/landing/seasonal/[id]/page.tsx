// S12 · PR 246 — /admin/marketing/landing/seasonal/<id> (`new` for a new page): a seasonal page's headline, link,
// occasion and intro; its parts switched on or off in their fixed order; its collection and journal category; its line,
// reasons and countdown; Save, Make live (asks once more), Take down, Archive and Restore (nothing is deleted), Open and
// Copy link. Seeing needs `marketing.landing.read`, changing `marketing.landing.write`. Guide:
// docs/admin-guide/pages/marketing/seasonal-editor.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SeasonalEditor, type EditorPage } from '@/components/admin/marketing/SeasonalEditor';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { seasonalChoices, seasonalOne } from '@/lib/marketing/seasonal';
import { seasonalSectionsOf } from '@/lib/marketing/seasonal-model';
import { shopOrigin } from '@/lib/shop/meta';
import bn from '../../../../../../../messages/admin-seasonal.bn.json';
import en from '../../../../../../../messages/admin-seasonal.en.json';
import '../../../../settings-cards.css';
import '../../landing.css';

export const dynamic = 'force-dynamic';

const LIST = '/admin/marketing/landing/seasonal';
const KEY = 'marketingSeasonalPage';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'sp.builderMeta'), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }> };

export default async function SeasonalEditorPage(props: Props) {
  const deps = adminDeps();
  const [{ id }, plain] = await Promise.all([props.params, adminView(deps)]);
  const here = `${LIST}/${encodeURIComponent(id)}`;
  const access = await pageAccess('marketing.landing.read', deps, MOTHER_STORE_ID);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="seasonal-editor" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.landing.read" />
      </div>
    );
  const s = (k: string) => t(d, `sp.${k}`);
  const crumb = (
    <Link className="bd-crumb" href={LIST} data-testid="sp-back">
      {s('b.back')}
    </Link>
  );
  const isNew = id === 'new';
  const [page, choices, set, domain] = await Promise.all([
    isNew ? Promise.resolve(null) : seasonalOne(access.deps.db, id),
    seasonalChoices(access.deps.db),
    access.deps.resolver.value('marketing.seasonal', { storeId: MOTHER_STORE_ID }),
    shopOrigin(MOTHER_STORE_ID).catch(() => undefined),
  ]);
  if (!isNew && !page)
    return (
      <div className="a2-z">
        <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={s('builderMeta')} />
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const canWrite = access.guard.permissions?.has('marketing.landing.write') ?? false;
  const start: EditorPage = page ?? { id: null, slug: '', titleEn: '', titleBn: null, introEn: null, introBn: null, occasion: null, state: 'draft', lastLive: null, sections: seasonalSectionsOf([]), version: null };
  const words = { sp: (d as Record<string, Dict>).sp ?? {} } as Dict;
  const lang = view.lang === 'bn' ? 'bn' : 'en';

  return (
    <div className="a2-z" data-testid="seasonal-editor" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={page ? page.titleEn : s('newTitle')} />
      <SectionTabs view={view} current={KEY} />
      <SeasonalEditor
        words={words}
        page={start}
        occasions={set.occasions.map((o) => ({ key: o.key, name: o[lang] || o.en }))}
        collections={choices.collections}
        categories={choices.categories}
        origin={domain?.origin ?? ''}
        canWrite={canWrite}
        listHref={LIST}
        locale={view.locale}
      />
    </div>
  );
}
