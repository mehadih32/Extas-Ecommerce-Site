// S22 · PR 431 (Blueprint B4.14 item 7) — late chats in the notifications drawer: a chat whose ticket timer ran out
// (the first answer or the solution) is put in its owner's notifications, and a late chat nobody has taken in the
// notifications of the people who may give chats out (`support.assign`), while `support.tickets` and its `notify` are
// on. Each note links to the chat. The note goes away by itself once the chat is answered, waits for the customer or
// is solved: it is read live from the tickets, nothing is stored.
import type { PrismaClient } from '@extas/db/client';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import { lateChats } from '@extas/support';
import type { AdminLang } from '../admin-i18n';
import { adminDicts } from '../admin-i18n';
import { t } from '../i18n';
import type { AppResolver } from '../settings';
import type { LoginNote } from '../admin-security/login-notes';

/** The late chats of this person, as notifications (most late first). */
export async function lateChatNotes(deps: { db: PrismaClient; resolver: AppResolver; now?: () => Date }, who: { actor: Actor; ctx?: RequestContext }, lang: AdminLang): Promise<LoginNote[]> {
  const rows = await lateChats({ db: deps.db, settings: deps.resolver, now: deps.now }, { actor: who.actor, storeId: MOTHER_STORE_ID, ctx: who.ctx });
  const dict = adminDicts[lang];
  return rows.map((r) => ({
    id: `late-${r.conversationId}-${r.stage}`,
    title: t(dict, 'shell.ntf.lateChat.title'),
    body: [r.name ?? r.refCode, t(dict, `shell.ntf.lateChat.${r.stage}`), ...(r.unowned ? [t(dict, 'shell.ntf.lateChat.unowned')] : [])].join(' · '),
    href: `/admin/support/c/${r.conversationId}`,
    at: r.dueAt.toISOString(),
  }));
}
