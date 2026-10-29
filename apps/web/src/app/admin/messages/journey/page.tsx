// S14 · PR 505 — Messages → Order journey (MSG-01, ADMIN-ARCHITECTURE §4.6; demo V12.4 #/admin/messages/journey):
// which event sends which message. The order's timeline (order received, self-confirm, confirmed, packed, booked, out
// for delivery, delivery day, delivered, Day-1 care, Day-3 review) and the event messages outside it (cancelled, cancel
// request refused, on hold, advance requested, gift receiver), each step with its switch, channel, fallback, time,
// orders and template; the message language, the amount line and the self-confirm under "More options". Each channel
// shows whether it is live or on its mock. The caps, quiet hours and master switch are on Channels & limits. Seeing
// needs `messages.journey.read`, saving `messages.journey.write` (the API checks it again). Nothing here sends.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as ms from '@extas/messages';
import { JOURNEY_STEPS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { JourneyForm } from '@/components/admin/messages/JourneyForm';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { label, withMessages } from '@/lib/admin-messages/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { messagesDeps } from '@/lib/messages-api';
import '../../settings-cards.css';
import '../messages.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/messages/journey';
const KEY = 'messagesJourney';
const MODE_TONE: Record<string, string> = { MOCK: 'gold', SANDBOX: 'info', LIVE: 'ok' };

export async function generateMetadata(): Promise<Metadata> {
  const view = withMessages(await adminView());
  return { title: `${t(view.dict, 'msg.journey.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function JourneyPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('messages.journey.read', deps, MOTHER_STORE_ID)]);
  const view = withMessages(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="messages.journey.read" />
      </div>
    );
  const who: ms.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const md0 = await messagesDeps(access.deps);
  const screen = await ms.journeyScreen(md0, who);
  // the template keys a step may name (every template the store has; Messages › Templates adds more) and the
  // languages each is written in per channel, so a step switched to another template shows its own
  const rows = await access.deps.db.notificationTemplate.findMany({ where: { storeId: MOTHER_STORE_ID, archivedAt: null }, orderBy: [{ key: 'asc' }, { locale: 'asc' }], select: { key: true, channel: true, locale: true } });
  const keys = [...new Set(rows.map((r) => r.key))];
  const langs: ms.JourneyScreen['templates'] = {};
  for (const r of rows) ((langs[r.key] ??= {})[r.channel as ms.MessageChannel] ??= []).push(r.locale);
  const md: Dict = { msg: d.msg as Dict };
  const x = (k: string) => t(d, `msg.journey.${k}`);

  return (
    <div className="a2-z" data-testid="messages-journey">
      <PageHead view={view} place={locateKey(KEY)} title={x('title')} sub={x('sub')} />
      <SectionTabs view={view} current={KEY} />
      {!screen.config.enabled ? (
        <div className="a2-note warn" data-testid="journey-master-off">
          <ShellIcon name="alert" size={15} />
          <span>
            {x('masterOff')}{' '}
            <Link className="a2-lnk" href="/admin/messages/channels">
              {x('masterLink')}
            </Link>
          </span>
        </div>
      ) : null}
      <div className="a2-gap8 a2-mt12" data-testid="journey-channels">
        {screen.channels.map((c) => (
          <span key={c.channel} className={`a2-pill ${MODE_TONE[c.mode ?? ''] ?? 'line'}`} data-channel={c.channel}>
            {label(d, 'channel', c.channel)} · {label(d, 'mode', c.mode ?? 'none')}
          </span>
        ))}
      </div>
      <JourneyForm dict={md} screen={{ config: screen.config, version: screen.version, templates: langs, perms: screen.perms }} steps={JOURNEY_STEPS} templateKeys={keys} />
      <p className="a2-xs a2-mute a2-mt12">
        {x('capsNote')}{' '}
        <Link className="a2-lnk" href="/admin/messages/channels">
          {x('masterLink')}
        </Link>
      </p>
    </div>
  );
}
