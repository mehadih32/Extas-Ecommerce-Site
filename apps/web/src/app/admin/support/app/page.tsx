// S22 · PR 435 (Blueprint B4.11) — Support › Support app: each employee puts support on its own icon on their phone or
// computer (Android and desktop: the browser's install; iPhone: Safari's "Add to Home Screen") and switches notifications
// on for that device, sends themselves a test, and sees their devices. Read with `support.read`; everything here is the
// person's own (their devices), nothing about the shop changes. Off in Support settings (`support.app`), the page says
// so and links there. Practice mode (the push key not in Keys & connections yet) is said in words.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sp from '@extas/support';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SupportAppPanel, type SupportAppTexts } from '@/components/admin/support/SupportAppPanel';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withInbox } from '@/lib/admin-support/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { SUPPORT_APP, supportPushWiring } from '@/lib/support-push';
import '../../settings-cards.css';
import '../support.css';

export const dynamic = 'force-dynamic';

const API = '/api/admin/support/app';

export async function generateMetadata(): Promise<Metadata> {
  const view = withInbox(await adminView());
  return { title: `${t(view.dict, 'sup.app.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function SupportAppPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('support.read', deps, MOTHER_STORE_ID)]);
  const view = withInbox(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(SUPPORT_APP.page)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="supportApp" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="support-app" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="support.read" />
      </div>
    );
  const who: sp.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const state = await sp.supportAppState({ db: access.deps.db, settings: access.deps.resolver, push: supportPushWiring(access.deps) }, who);
  const a = (k: string) => t(d, `sup.app.${k}`);
  const keys = (group: string, list: readonly string[]) => Object.fromEntries(list.map((k) => [k, a(`${group}.${k}`)]));
  const texts: SupportAppTexts = {
    install: keys('install', ['h', 'd', 'button', 'done', 'ios', 'other', 'standalone']) as SupportAppTexts['install'],
    notify: keys('notify', ['h', 'd', 'pushOff', 'practice', 'on', 'off', 'isOn', 'isOffHere', 'test', 'tested', 'testedPractice', 'denied', 'unsupported', 'failed']) as SupportAppTexts['notify'],
    devices: keys('devices', ['h', 'none', 'since', 'last', 'failing', 'unnamed']) as SupportAppTexts['devices'],
    err: keys('err', ['PUSH_OFF', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other']),
  };

  return (
    <div className="a2-z" data-testid="support-app" data-lm-ready="">
      <PageHead view={view} place={locateKey('supportApp')} title={a('title')} sub={a('sub')} />
      <SectionTabs view={view} current="supportApp" />
      {state.enabled ? (
        <SupportAppPanel api={API} worker={SUPPORT_APP.worker} scope={SUPPORT_APP.scope} initial={state} locale={view.lang === 'bn' ? 'bn-BD' : 'en-GB'} texts={texts} />
      ) : (
        <div className="a2-sc a2-mt12 sp-app-off" data-testid="support-app-off">
          <p>{a('off')}</p>
          <Link className="a2-btn" href="/admin/support/settings">
            {a('offLink')}
          </Link>
        </div>
      )}
    </div>
  );
}
