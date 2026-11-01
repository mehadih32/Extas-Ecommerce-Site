// S14 · PR 290 — one e-mail template at /admin/messages/email/templates/[id] ("new" for a new one): its name, language,
// subject and words with a preview on a sample customer; Archive (sends already made keep their own words; restore it
// from the E-mail page's "More options"). Seeing needs `messages.journey.read`, changing `messages.email.write`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CustomerAct } from '@/components/admin/customers/CustomerAct';
import { EmailTemplateForm } from '@/components/admin/customers/EmailTemplateForm';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { withMessages } from '@/lib/admin-messages/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t, type Dict } from '@/lib/i18n';
import '../../email.css';

export const dynamic = 'force-dynamic';

const BASE = '/admin/messages/email';
const KEY = 'messagesEmail';

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(withMessages(await adminView()));
  return { title: `${t(view.dict, 'cus.mail.templates')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Params = Promise<{ id: string }>;

export default async function EmailTemplatePage({ params }: { params: Params }) {
  const deps = adminDeps();
  const [plain, { id }, access] = await Promise.all([adminView(deps), params, pageAccess('messages.journey.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(withMessages(plain));
  const d = view.dict;
  const here = `${BASE}/templates/${encodeURIComponent(id)}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="messages.journey.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const isNew = id === 'new';
  const [e, aiOn] = await Promise.all([cu.emailTemplateEditor(customersDeps(access.deps), who, isNew ? null : id), cu.aiWriterOn(customersDeps(access.deps), MOTHER_STORE_ID)]);
  if (!e || (!isNew && !e.template))
    return (
      <div className="a2-z">
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const tp = e.template;
  const cdict: Dict = { cus: d.cus as Dict };
  const back = (
    <Link className="a2-b" href={BASE}>
      {t(d, 'cus.mail.title')}
    </Link>
  );
  return (
    <div className="a2-z" data-testid="messages-email-template">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={back}
        title={tp ? tp.name : t(d, 'cus.mail.t.newTitle')}
        sub={t(d, 'cus.mail.t.sub')}
        right={
          tp && !tp.archivedAt && e.settings.enabled && e.canWrite ? (
            <CustomerAct dict={cdict} url={`/api/admin/messages/email/templates/${tp.id}/archive`} body={{ archived: true }} label={t(d, 'cus.mail.archive')} tone="ghost" testId="mail-template-archive" />
          ) : null
        }
      />
      <SectionTabs view={view} current={KEY} />
      {!e.settings.enabled ? (
        <section className="a2-card a2-mt12" data-testid="mail-off">
          <h2 className="a2-h3">{t(d, 'cus.mail.offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{t(d, e.canWrite ? 'cus.mail.offBody' : 'cus.mail.offAsk')}</p>
        </section>
      ) : tp?.archivedAt ? (
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute">{t(d, 'cus.mail.t.archivedNote')}</p>
        </section>
      ) : (
        <EmailTemplateForm key={tp ? tp.version : 'new'} dict={cdict} id={tp?.id ?? null} version={tp?.version ?? null} name={tp?.name ?? ''} locale={tp?.locale ?? (view.lang === 'en' ? 'en' : 'bn')} subject={tp?.subject ?? ''} body={tp?.body ?? ''} storeName={view.storeName ?? ''} canWrite={e.canWrite} aiOn={aiOn} />
      )}
    </div>
  );
}
