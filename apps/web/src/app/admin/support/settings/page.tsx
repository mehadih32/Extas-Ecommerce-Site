// S22 · PR 425 — Support › Support settings (docs/ADMIN-ARCHITECTURE.md §4.7, CN-018: settings inside their section):
// the inbox (per page, the longest reply, "take it on reply", "waiting after a reply"), a line on customer numbers
// (masked the shop's one way, `customers.phoneMask`, whole only with `customers.phone`); "More options" holds files in
// a conversation (on or off, how many, how big, which kinds). Read with `support.read`, each card saved whole with `support.settings` (the API checks again).
// PR 426: the channels (a Facebook Page or a WhatsApp number added by its id, switched on, renamed, put away; the site's
// live chat once it is on), the live chat card (off as it ships) and, under "More options", Meta's reply window.
// CN-020 (3): the "Call me" card (off as it ships) — when the checkout offers it; its call-backs land in the inbox.
// PR 428: the "Customer beside the chat" card (on as it ships) — the customer card on every chat, how many latest orders.
// PR 429: the "Products in the chat" card (off as it ships) — the reply box's catalogue drawer: photos per product,
// products per search, how many days an order from the link is credited to the chat.
// PR 430: the "Orders from the chat" card (off as it ships) — the chat's bag and "Create order", and the words of the
// pay link message the owner's advance rule sends (under "More options" inside the card's own fold).
// PR 431: the "Tickets and timers" card (off as it ships) — the first-answer minutes, the solution hours, late chats in
// the bell.
// PR 432: the "Draft answers (EXTAS AI)" card (off as it ships) — the language for Banglish, the questions marked for a
// person, the bulk count; under "More options" the drafts' words and the words that tell questions apart.
// PR 433: the "Follow-ups on chats without an order" card (off as it ships) — which chats, the quiet hours, the caps
// (per chat, per person, per day, the reply window), win-back, the language, the owner's coupon to mention; under
// "More options" the follow-ups' words.
// PR 434: the "Privacy inside support" card (own chats only, numbers in messages masked; off) and the "Support block
// list" card (off; blocking itself needs `support.block`, the owner's).
// PR 435: the "Support app" card (off as it ships) — offer the app, its name, notifications, what they are about, what
// a locked phone shows, how long a phone that is off is tried.
// PR 538: the "Desk hours" card (off = always open; the days, opens, closes), the "Tell the owner when nobody answers"
// card (off; minutes, outside desk hours wait or tell, the name, the hourly cap, how far back, the line's language and
// words) and the "Link safety" card (off; trusted sites, bare number addresses, the shortener, ending and file lists).
// PR 427: the "Who is writing" card (off as it ships) — the number from WhatsApp or the chat's words, its customer, one
// person across channels.
// Optional behaviour ships off. Nothing here moves money or changes an order.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { DESK_DAYS, ESCALATION_BOUNDS, ESCALATION_LANGS, ESCALATION_OUTSIDE_HOURS, ESCALATION_WORDS_MAX, LINK_LIST_MAX, SUPPORT_APP_EVENTS, SUPPORT_APP_NAME_MAX, SUPPORT_APP_PREVIEWS } from '@extas/settings';
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
  // CN-020 (3): "Call me" at checkout (off as it ships); its call-backs land in this inbox
  const callMe: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('callMe.enabled'), help: s('callMe.enabledHelp') },
    { kind: 'number', path: 'failedTries', label: s('callMe.failedTries'), min: 1, max: 10 },
    { kind: 'number', path: 'idleSeconds', label: s('callMe.idleSeconds'), min: 15, max: 900 },
    { kind: 'number', path: 'perPhonePerDay', label: s('callMe.perPhonePerDay'), min: 1, max: 20, help: s('callMe.perPhonePerDayHelp') },
  ];
  // PR 428: the customer beside the chat (on as it ships: B4.5 is locked)
  const context: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('context.enabled'), help: s('context.enabledHelp') },
    { kind: 'number', path: 'recentOrders', label: s('context.recentOrders'), help: s('context.recentOrdersHelp'), min: 1, max: 10 },
  ];
  // PR 429: products in the chat (off as it ships)
  const catalogue: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('catalogue.enabled'), help: s('catalogue.enabledHelp') },
    { kind: 'number', path: 'photos', label: s('catalogue.photos'), help: s('catalogue.photosHelp'), min: 0, max: 3 },
    { kind: 'number', path: 'results', label: s('catalogue.results'), help: s('catalogue.resultsHelp'), min: 4, max: 20 },
    { kind: 'number', path: 'creditDays', label: s('catalogue.creditDays'), help: s('catalogue.creditDaysHelp'), min: 1, max: 90 },
  ];
  // PR 430: orders from the chat (off as it ships); the pay link message's words in both languages
  const cart: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('cart.enabled'), help: s('cart.enabledHelp') },
    { kind: 'pair', path: 'payLinkWords', label: { en: s('cart.wordsEn'), bn: s('cart.wordsBn') }, help: s('cart.wordsHelp'), max: 400, rows: 3 },
  ];
  // PR 431: tickets and timers (off as it ships); the windows' bounds are the setting's own
  const tickets: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('tickets.enabled'), help: s('tickets.enabledHelp') },
    { kind: 'number', path: 'firstResponseMinutes', label: s('tickets.first'), help: s('tickets.firstHelp'), min: sp.TICKET_FIRST_MINUTES.min, max: sp.TICKET_FIRST_MINUTES.max },
    { kind: 'number', path: 'resolutionHours', label: s('tickets.resolution'), help: s('tickets.resolutionHelp'), min: sp.TICKET_RESOLUTION_HOURS.min, max: sp.TICKET_RESOLUTION_HOURS.max },
    { kind: 'switch', path: 'notify', label: s('tickets.notify'), help: s('tickets.notifyHelp') },
  ];
  // PR 432: draft answers (off as it ships); the words under "More options"
  const intentName = (k: string) => t(d, `sup.dr.i.${k}`);
  const drafts: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('drafts.enabled'), help: s('drafts.enabledHelp') },
    { kind: 'select', path: 'banglishReply', label: s('drafts.banglish'), help: s('drafts.banglishHelp'), options: (['bn', 'en'] as const).map((v) => ({ value: v, label: s(`drafts.${v}`) })) },
    { kind: 'checks', path: 'handover', label: s('drafts.handover'), options: sp.DRAFT_INTENTS.map((v) => ({ value: v, label: intentName(v) })) },
    { kind: 'number', path: 'bulkPieces', label: s('drafts.bulk'), help: s('drafts.bulkHelp'), min: sp.DRAFT_BULK_PIECES.min, max: sp.DRAFT_BULK_PIECES.max },
  ];
  const textName = (k: string) => (['cancel', 'late', 'bulk', 'exchange', 'size', 'greeting', 'unknown'].includes(k) ? intentName(k) : ['overcharge', 'wrong', 'damage', 'fade'].includes(k) ? t(d, `sup.dr.c.${k}`) : s(`draftWords.x.${k}`));
  const draftWords: FieldsCardField[] = sp.DRAFT_TEXTS.map((k) => ({ kind: 'pair', path: k, label: { en: `${textName(k)} · ${s('draftWords.x.en')}`, bn: `${textName(k)} · ${s('draftWords.x.bn')}` }, max: 400, rows: 2 }));
  const draftKeywords: FieldsCardField[] = sp.DRAFT_WORD_LISTS.map((k) => ({ kind: 'text', path: k, label: k === 'pieces' ? s('draftWords.x.pieces') : textName(k), max: 600 }));
  // PR 433: follow-ups on chats without an order (off as it ships); the words under "More options"
  const fb = sp.FOLLOW_UP_BOUNDS;
  const followUp: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('followUp.enabled'), help: s('followUp.enabledHelp') },
    { kind: 'checks', path: 'rules', label: s('followUp.rules'), options: sp.FOLLOW_UP_RULES.map((v) => ({ value: v, label: s(`followUp.rule.${v}`) })) },
    { kind: 'number', path: 'afterHours', label: s('followUp.afterHours'), help: s('followUp.afterHoursHelp'), min: fb.afterHours.min, max: fb.afterHours.max },
    { kind: 'number', path: 'maxPerChat', label: s('followUp.maxPerChat'), min: fb.maxPerChat.min, max: fb.maxPerChat.max },
    { kind: 'number', path: 'gapDays', label: s('followUp.gapDays'), help: s('followUp.gapDaysHelp'), min: fb.gapDays.min, max: fb.gapDays.max },
    { kind: 'number', path: 'perDay', label: s('followUp.perDay'), min: fb.perDay.min, max: fb.perDay.max },
    { kind: 'number', path: 'windowMarginMinutes', label: s('followUp.windowMargin'), help: s('followUp.windowMarginHelp'), min: fb.windowMarginMinutes.min, max: fb.windowMarginMinutes.max },
    { kind: 'number', path: 'cancelledDays', label: s('followUp.cancelledDays'), min: fb.cancelledDays.min, max: fb.cancelledDays.max },
    { kind: 'select', path: 'banglishReply', label: s('followUp.banglish'), help: s('followUp.banglishHelp'), options: (['bn', 'en'] as const).map((v) => ({ value: v, label: s(`followUp.${v}`) })) },
    { kind: 'text', path: 'offerCode', label: s('followUp.offerCode'), help: s('followUp.offerCodeHelp'), max: 40 },
  ];
  const followUpName = (k: string) => (k === 'offer' ? s('followUpWords.x.offer') : s(`followUp.rule.${k}`));
  const followUpWords: FieldsCardField[] = sp.FOLLOW_UP_TEXTS.map((k) => ({ kind: 'pair', path: k, label: { en: `${followUpName(k)} · ${s('followUpWords.x.en')}`, bn: `${followUpName(k)} · ${s('followUpWords.x.bn')}` }, max: 400, rows: 2 }));
  // PR 434: privacy inside support and the support block list (both off as they ship)
  const privacy: FieldsCardField[] = [
    { kind: 'switch', path: 'ownChatsOnly', label: s('privacy.ownChatsOnly'), help: s('privacy.ownChatsOnlyHelp') },
    { kind: 'switch', path: 'maskNumbersInText', label: s('privacy.maskNumbersInText'), help: s('privacy.maskNumbersInTextHelp') },
  ];
  const blockList: FieldsCardField[] = [{ kind: 'switch', path: 'enabled', label: s('blockList.enabled'), help: s('blockList.enabledHelp') }];
  // PR 435: the support app (off as it ships)
  const app: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('app.enabled'), help: s('app.enabledHelp') },
    { kind: 'text', path: 'appName', label: s('app.appName'), help: s('app.appNameHelp'), max: SUPPORT_APP_NAME_MAX },
    { kind: 'switch', path: 'push', label: s('app.push'), help: s('app.pushHelp') },
    { kind: 'checks', path: 'events', label: s('app.events'), options: SUPPORT_APP_EVENTS.map((v) => ({ value: v, label: s(`app.event.${v}`) })) },
    { kind: 'select', path: 'preview', label: s('app.preview'), options: SUPPORT_APP_PREVIEWS.map((v) => ({ value: v, label: s(`app.previewOpt.${v}`) })) },
    { kind: 'number', path: 'ttlMinutes', label: s('app.ttlMinutes'), min: 1, max: 1440 },
  ];
  // PR 538: desk hours, telling the owner when nobody answers, link safety (all off as they ship)
  const deskHours: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('deskHours.enabled'), help: s('deskHours.enabledHelp') },
    { kind: 'checks', path: 'days', label: s('deskHours.days'), options: DESK_DAYS.map((v) => ({ value: v, label: s(`deskHours.day.${v}`) })) },
    { kind: 'text', path: 'opens', label: s('deskHours.opens'), help: s('deskHours.timeHelp'), max: 5 },
    { kind: 'text', path: 'closes', label: s('deskHours.closes'), help: s('deskHours.timeHelp'), max: 5 },
  ];
  const eb = ESCALATION_BOUNDS;
  const escalation: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('escalation.enabled'), help: s('escalation.enabledHelp') },
    { kind: 'number', path: 'minutes', label: s('escalation.minutes'), help: s('escalation.minutesHelp'), min: eb.minutes.min, max: eb.minutes.max },
    { kind: 'select', path: 'outsideHours', label: s('escalation.outsideHours'), options: ESCALATION_OUTSIDE_HOURS.map((v) => ({ value: v, label: s(`escalation.outside.${v}`) })) },
    { kind: 'switch', path: 'showName', label: s('escalation.showName') },
    { kind: 'number', path: 'perHour', label: s('escalation.perHour'), min: eb.perHour.min, max: eb.perHour.max },
    { kind: 'number', path: 'lookBackHours', label: s('escalation.lookBackHours'), help: s('escalation.lookBackHoursHelp'), min: eb.lookBackHours.min, max: eb.lookBackHours.max },
    { kind: 'select', path: 'lang', label: s('escalation.lang'), options: ESCALATION_LANGS.map((v) => ({ value: v, label: s(`followUp.${v}`) })) },
    { kind: 'pair', path: 'words', label: { en: s('escalation.wordsEn'), bn: s('escalation.wordsBn') }, help: s('escalation.wordsHelp'), max: ESCALATION_WORDS_MAX, rows: 2 },
  ];
  const linkSafety: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('linkSafety.enabled'), help: s('linkSafety.enabledHelp') },
    { kind: 'text', path: 'trustedSites', label: s('linkSafety.trustedSites'), help: s('linkSafety.trustedSitesHelp'), max: LINK_LIST_MAX },
    { kind: 'switch', path: 'flagNumbers', label: s('linkSafety.flagNumbers') },
    { kind: 'text', path: 'shorteners', label: s('linkSafety.shorteners'), help: s('linkSafety.listHelp'), max: LINK_LIST_MAX },
    { kind: 'text', path: 'riskyEndings', label: s('linkSafety.riskyEndings'), help: s('linkSafety.listHelp'), max: LINK_LIST_MAX },
    { kind: 'text', path: 'riskyFiles', label: s('linkSafety.riskyFiles'), help: s('linkSafety.listHelp'), max: LINK_LIST_MAX },
  ];
  // PR 427: who is writing (off as it ships)
  const identity: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('identity.enabled'), help: s('identity.enabledHelp') },
    { kind: 'switch', path: 'fromText', label: s('identity.fromText'), help: s('identity.fromTextHelp') },
    { kind: 'switch', path: 'autoLink', label: s('identity.autoLink'), help: s('identity.autoLinkHelp') },
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
      <FieldsCard url={API} screen={screen('checkout.callMe')} fields={callMe} texts={texts('callMe')} canEdit={canEdit} testId="support-set-callme" />
      <FieldsCard url={API} screen={screen('support.identity')} fields={identity} texts={texts('identity')} canEdit={canEdit} testId="support-set-identity" />
      <FieldsCard url={API} screen={screen('support.context')} fields={context} texts={texts('context')} canEdit={canEdit} testId="support-set-context" />
      <FieldsCard url={API} screen={screen('support.catalogue')} fields={catalogue} texts={texts('catalogue')} canEdit={canEdit} testId="support-set-catalogue" />
      <FieldsCard url={API} screen={screen('support.cart')} fields={cart} texts={texts('cart')} canEdit={canEdit} testId="support-set-cart" />
      <FieldsCard url={API} screen={screen('support.tickets')} fields={tickets} texts={texts('tickets')} canEdit={canEdit} testId="support-set-tickets" />
      <FieldsCard url={API} screen={screen('support.drafts')} fields={drafts} texts={texts('drafts')} canEdit={canEdit} testId="support-set-drafts" />
      <FieldsCard url={API} screen={screen('support.followUp')} fields={followUp} texts={texts('followUp')} canEdit={canEdit} testId="support-set-followup" />
      <FieldsCard url={API} screen={screen('support.privacy')} fields={privacy} texts={texts('privacy')} canEdit={canEdit} testId="support-set-privacy" />
      <FieldsCard url={API} screen={screen('support.blockList')} fields={blockList} texts={texts('blockList')} canEdit={canEdit} testId="support-set-blocklist" />
      <FieldsCard url={API} screen={screen('support.app')} fields={app} texts={texts('app')} canEdit={canEdit} testId="support-set-app" />
      <FieldsCard url={API} screen={screen('support.deskHours')} fields={deskHours} texts={texts('deskHours')} canEdit={canEdit} testId="support-set-desk" />
      <FieldsCard url={API} screen={screen('support.escalation')} fields={escalation} texts={texts('escalation')} canEdit={canEdit} testId="support-set-escalation" />
      <FieldsCard url={API} screen={screen('support.linkSafety')} fields={linkSafety} texts={texts('linkSafety')} canEdit={canEdit} testId="support-set-links" />
      <p className="a2-xs a2-mute a2-mt12" data-testid="support-set-phones">{s('phones')}</p>
      <details className="a2-card a2-mt12" data-testid="support-set-more">
        <summary className="a2-h4">{s('more')}</summary>
        <p className="a2-xs a2-mute a2-mt6">{s('moreSub')}</p>
        <FieldsCard url={API} screen={screen('support.attachments')} fields={attachments} texts={texts('attachments')} canEdit={canEdit} testId="support-set-attachments" />
        <FieldsCard url={API} screen={screen('support.channels')} fields={windowFields} texts={texts('window')} canEdit={canEdit} testId="support-set-window" />
        <FieldsCard url={API} screen={screen('support.draftWords')} fields={draftWords} texts={texts('draftWords')} canEdit={canEdit} testId="support-set-draft-words" />
        <FieldsCard url={API} screen={screen('support.draftKeywords')} fields={draftKeywords} texts={texts('draftKeywords')} canEdit={canEdit} testId="support-set-draft-keywords" />
        <FieldsCard url={API} screen={screen('support.followUpWords')} fields={followUpWords} texts={texts('followUpWords')} canEdit={canEdit} testId="support-set-followup-words" />
      </details>
    </div>
  );
}
