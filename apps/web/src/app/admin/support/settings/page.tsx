// S22 · PR 425 — Support › Support settings (docs/ADMIN-ARCHITECTURE.md §4.7, CN-018: settings inside their section):
// the inbox (per page, the longest reply, "take it on reply", "waiting after a reply"), a line on customer numbers
// (masked the shop's one way, `customers.phoneMask`, whole only with `customers.phone`); "More options" holds files in
// a conversation (on or off, how many, how big, which kinds). Read with `support.read`, each card saved whole with `support.settings` (the API checks again).
// PR 426: the channels (a Facebook Page or a WhatsApp number added by its id, switched on, renamed, put away; the site's
// live chat once it is on), the live chat card (off as it ships) and, under "More options", Meta's reply window.
// Optional behaviour ships off. Nothing here moves money or changes an order.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sp from '@extas/support';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { ChannelsCard, type ChannelsTexts } from '@/components/admin/support/ChannelsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { kindName, withInbox } from '@/lib/admin-support/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/support/settings';
const API = '/api/admin/support/settings';

export async function generateMetadata(): Promise<Metadata> {
  const view = withInbox(await adminView());
  return { title: `${t(view.dict, 'sup.set.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function SupportSettingsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('support.read', deps, MOTHER_STORE_ID)]);
  const view = withInbox(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="supportSettings" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="support.read" />
      </div>
    );
  const who: sp.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const [cards, channels] = await Promise.all([sp.supportSettingsView({ db: access.deps.db, settings: access.deps.resolver }, who), sp.supportChannels({ db: access.deps.db, settings: access.deps.resolver }, who)]);
  const canEdit = access.guard.permissions?.has('support.settings') ?? false;
  const s = (k: string) => t(d, `sup.set.${k}`);
  const texts = (card: string): FieldsCardTexts => ({
    h: s(`${card}.h`),
    d: s(`${card}.d`),
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  });
  const inbox: FieldsCardField[] = [
    { kind: 'number', path: 'pageSize', label: s('inbox.pageSize'), min: 10, max: 200 },
    { kind: 'number', path: 'replyMaxChars', label: s('inbox.replyMaxChars'), min: 100, max: 4000 },
    { kind: 'switch', path: 'assignOnReply', label: s('inbox.assignOnReply'), help: s('inbox.assignOnReplyHelp') },
    { kind: 'switch', path: 'waitingOnReply', label: s('inbox.waitingOnReply'), help: s('inbox.waitingOnReplyHelp') },
  ];
  const attachments: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('attachments.enabled') },
    { kind: 'number', path: 'maxPerMessage', label: s('attachments.maxPerMessage'), min: 1, max: 10 },
    { kind: 'number', path: 'maxMb', label: s('attachments.maxMb'), min: 1, max: 50 },
    { kind: 'checks', path: 'kinds', label: s('attachments.kinds'), options: (['image', 'video', 'pdf'] as const).map((k) => ({ value: k, label: s(`attachments.kind.${k}`) })) },
  ];
  const liveChat: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('liveChat.enabled'), help: s('liveChat.enabledHelp') },
    { kind: 'number', path: 'maxChars', label: s('liveChat.maxChars'), min: 50, max: 4000 },
    { kind: 'number', path: 'perMinute', label: s('liveChat.perMinute'), min: 1, max: 60, help: s('liveChat.perMinuteHelp') },
    { kind: 'number', path: 'pollSeconds', label: s('liveChat.pollSeconds'), min: 2, max: 60 },
    { kind: 'number', path: 'cookieDays', label: s('liveChat.cookieDays'), min: 1, max: 365, help: s('liveChat.cookieDaysHelp') },
  ];
  const windowFields: FieldsCardField[] = [
    { kind: 'number', path: 'replyWindowHours', label: s('window.replyWindowHours'), min: 1, max: 168, help: s('window.replyWindowHoursHelp') },
    { kind: 'number', path: 'webhookMaxBodyKb', label: s('window.webhookMaxBodyKb'), min: 16, max: 2048 },
  ];
  const ch = (k: string) => s(`channels.${k}`);
  const channelTexts: ChannelsTexts = {
    ...(Object.fromEntries(
      (['h', 'd', 'empty', 'conversations', 'on', 'off', 'archivedTag', 'chatOff', 'switchOn', 'switchOff', 'archive', 'restore', 'rename', 'save', 'cancel', 'addH', 'addKind', 'addId', 'addIdHelp', 'addName', 'add', 'added', 'saved'] as const).map((k) => [k, ch(k)]),
    ) as Omit<ChannelsTexts, 'readOnly' | 'kinds' | 'err'>),
    readOnly: s('readOnly'),
    kinds: Object.fromEntries(sp.CHANNEL_KINDS.map((k) => [k, kindName(d, k)])),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'NOT_FOUND', 'forbidden', 'FORBIDDEN', 'unauthorized', 'network', 'other'].map((c) => [c, t(d, `sup.set.channels.err.${c}`)])),
  };
  const screen = <K extends sp.SupportSettingKey>(k: K) => ({ key: k, value: cards[k].value as unknown as Record<string, unknown>, version: cards[k].version });

  return (
    <div className="a2-z" data-testid="support-settings">
      <PageHead view={view} place={locateKey('supportSettings')} title={s('title')} sub={s('sub')} />
      <SectionTabs view={view} current="supportSettings" />
      <ChannelsCard rows={channels.rows} canEdit={canEdit && channels.canEdit} texts={channelTexts} />
      <FieldsCard url={API} screen={screen('support.liveChat')} fields={liveChat} texts={texts('liveChat')} canEdit={canEdit} testId="support-set-livechat" />
      <FieldsCard url={API} screen={screen('support.inbox')} fields={inbox} texts={texts('inbox')} canEdit={canEdit} testId="support-set-inbox" />
      <p className="a2-xs a2-mute a2-mt12" data-testid="support-set-phones">{s('phones')}</p>
      <details className="a2-card a2-mt12" data-testid="support-set-more">
        <summary className="a2-h4">{s('more')}</summary>
        <p className="a2-xs a2-mute a2-mt6">{s('moreSub')}</p>
        <FieldsCard url={API} screen={screen('support.attachments')} fields={attachments} texts={texts('attachments')} canEdit={canEdit} testId="support-set-attachments" />
        <FieldsCard url={API} screen={screen('support.channels')} fields={windowFields} texts={texts('window')} canEdit={canEdit} testId="support-set-window" />
      </details>
    </div>
  );
}
