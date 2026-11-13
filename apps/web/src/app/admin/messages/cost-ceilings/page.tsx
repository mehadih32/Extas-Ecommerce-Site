// S28 · PR 698 (CN-048; prototype v5 Messages cost ceilings; gap A5, N15) — Messages › Cost ceilings at
// /admin/messages/cost-ceilings: the month's SMS and WhatsApp spend against the owner's monthly ceilings (a bar and a word
// per channel: under, close at the warning share, reached), and the card to set them (the owner, `rules.approve`). At a
// ceiling a further message on that channel waits in the message log (never lost); with "cheapest channel" a step with
// a fallback goes by it while it is under its ceiling; an order's first message is never held. Off as shipped. Seeing needs
// `messages.channels.read`. The same card shows on the AI Center's cost book.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as ms from '@extas/messages';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CeilingCard } from '@/components/admin/v5/CeilingCard';
import { CeilingForm } from '@/components/admin/v5/CeilingForm';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { messagesDeps } from '@/lib/messages-api';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'messagesCostCeilings';
const HERE = '/admin/messages/cost-ceilings';

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.ceil.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CostCeilingsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('messages.channels.read', deps, MOTHER_STORE_ID)]);
  const view = withW5a(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="cost-ceilings" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="messages.channels.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.ceil.${k}`, v);
  const who: ms.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const status = await ms.readCostCeilings(await messagesDeps(access.deps), who);
  const canEdit = access.guard.permissions?.has('rules.approve') ?? false;
  const value = await access.deps.resolver.value('messages.costCeiling', { storeId: MOTHER_STORE_ID });
  const unit = 10 ** (new Intl.NumberFormat(view.locale, { style: 'currency', currency: status.currency }).resolvedOptions().maximumFractionDigits ?? 2);

  return (
    <div className="a2-z" data-testid="cost-ceilings" data-lm-ready="" data-on={status.enabled ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} right={<Link className="a2-btn sm" href="/admin/messages/channels">{c('back')}</Link>} />
      <CeilingCard dict={d} status={status} locale={view.locale} timeZone={view.timeZone} link={false} />
      <p className="a2-xs a2-mute a2-mt6">{c('explain')}</p>
      {canEdit ? (
        <details className="a2-card a2-mt12" data-testid="ceiling-more" open={!status.enabled}>
          <summary className="a2-h4">{t(d, 'w5a.more')}</summary>
          <div className="a2-mt12">
            <CeilingForm dict={d} before={value} currency={status.currency} unit={unit} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
