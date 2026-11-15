// PR 740–744 — Website › Page settings at /admin/website/page-settings?screen=<screen> (the page body; page.tsx calls it) (home, category, product, thanks, bag,
// account, search, currency, email, cookie, appicon): the settings that sit inside a shop page, each drawn from its own
// shape by one editor (components/admin/website/PageSettingsEditor.tsx; lib/admin-pagesettings). Rare options wait under
// "More options". Seeing needs the screen's read key (`website.read`, or `settings.read` for the shop-wide ones), saving its
// write key (the API checks again; audited `settings.pagesettings.save`). Guide: docs/admin-guide/pages/website/page-settings.md.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { PageSettingsEditor } from '@/components/admin/website/PageSettingsEditor';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { emailPreview } from '@/lib/admin-pagesettings/email-preview';
import { isScreenId, SCREENS, SCREEN_IDS } from '@/lib/admin-pagesettings/screens';
import { pageSettingsView } from '@/lib/admin-pagesettings/service';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-pagesettings.bn.json';
import en from '../../../../../messages/admin-pagesettings.en.json';
import './page-settings.css';

const BASE = '/admin/website/page-settings';
const KEY = 'websitePageSettings';

type Props = { asked: string };

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

/** A nested words file as one flat list: `{a: {b: 'x'}}` → `{'a.b': 'x'}`. */
function flat(d: Dict, at = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [[`${at}${k}`, v]] : Object.entries(flat(v, `${at}${k}.`)))));
}

export async function screenMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'ps.metaTitle'), robots: { index: false, follow: false } };
}

export async function ScreenPage({ asked }: Props) {
  if (!isScreenId(asked)) notFound();
  const screen = SCREENS[asked];
  const here = `${BASE}?screen=${asked}`;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess(screen.read, deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  const g = (k: string) => t(d, `ps.${k}`);
  const chips = (
    <>
      {(['pages', 'shop'] as const).map((grp) => (
        <div key={grp}>
          <p className="ps-gl">{g(`group.${grp}`)}</p>
          <ul className="ps-chips">
            {SCREEN_IDS.filter((s) => SCREENS[s].group === grp).map((s) => (
              <li key={s}>
                <Link className="ps-chip" href={`${BASE}?screen=${s}`} aria-current={s === asked ? 'page' : undefined} data-testid={`ps-chip-${s}`}>
                  {g(`screen.${s}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z ps-page" data-testid="ps-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission={screen.read} />
      </div>
    );
  const v = await pageSettingsView({ db: access.deps.db, resolver: access.deps.resolver }, asked);
  if (asked === 'email') {
    const look = v.sections[0]!.fields[0]!.value as Parameters<typeof emailPreview>[1];
    const host = (await headers()).get('host');
    v.preview = await emailPreview({ db: access.deps.db, resolver: access.deps.resolver }, look, { lang: view.lang === 'bn' ? 'bn' : 'en', host, text: g('email.sample'), unsubscribe: g('email.unsubscribe') });
  }
  const canEdit = access.guard.permissions?.has(screen.write) ?? false;
  return (
    <div className="a2-z ps-page" data-testid="ps-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g(`screen.${asked}`)} sub={g(`sub.${asked}`)} />
      <SectionTabs view={view} current={KEY} />
      {chips}
      {!canEdit ? <p className="lm-sub">{g('readOnly')}</p> : null}
      <PageSettingsEditor key={v.version} screen={asked} view={v} widgets={screen.widgets} texts={flat((d.ps ?? {}) as Dict)} canEdit={canEdit} openHref={screen.open} />
    </div>
  );
}
