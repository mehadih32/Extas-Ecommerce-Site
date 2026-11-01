// S14 · PR 290 — what an offer e-mail's reader does, from the shop's public addresses (email-html.ts `emailUrls`): the
// open pixel (the first open is kept), a click on one of the template's own links (the first click and the count; it
// counts as an open too) and the unsubscribe — his "no" to offer e-mails, a dated ConsentRecord (EMAIL, MARKETING,
// source `email.unsubscribe`) like every other answer, so the engine leaves him out of every later offer e-mail. Each
// works only for an e-mail of an e-mail send (step `crmEmail`) that was sent; anything else is ignored and answers the
// same, so the addresses tell a stranger nothing. Nothing here sends a message, moves money or deletes anything.
import { CRM_EMAIL_STEP } from '@extas/settings';
import type { Db, MessagesDeps } from './context';
import { emailLinks } from './email-html';
import { linkHost } from './engine';

/** The source of an unsubscribe in the consent history. */
export const EMAIL_UNSUBSCRIBE_SOURCE = 'email.unsubscribe';

/** Stands in for the shop's home while it has no address (never a place anyone is sent). */
const NO_HOME = 'https://no-home.invalid/';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sentEmail(db: Db, id: string) {
  if (!ID.test(id)) return null;
  return db.notificationLog.findFirst({
    where: { id, step: CRM_EMAIL_STEP, channel: 'EMAIL', status: { in: ['SENT', 'DELIVERED'] } },
    select: { id: true, storeId: true, customerId: true, broadcastId: true, openedAt: true, clickedAt: true, unsubscribedAt: true },
  });
}

/** The open pixel: the first open is kept (later ones change nothing). */
export async function emailOpened(db: Db, id: string, now: Date): Promise<void> {
  const m = await sentEmail(db, id);
  if (m && !m.openedAt) await db.notificationLog.updateMany({ where: { id: m.id, openedAt: null }, data: { openedAt: now } });
}

/**
 * A click on the template's link number `n`: counted (the first click kept, and as an open), and the address to send
 * the reader to — always one of the template's own links. Null: no such e-mail or link (the route sends him home).
 */
export async function emailClicked(deps: Pick<MessagesDeps, 'db' | 'settings'>, id: string, n: number, now: Date): Promise<string | null> {
  const m = await sentEmail(deps.db, id);
  if (!m || !m.broadcastId || !Number.isInteger(n) || n < 0) return null;
  const b = await deps.db.broadcast.findFirst({ where: { id: m.broadcastId, storeId: m.storeId }, select: { body: true } });
  // the links are numbered with `{link}` in its place even while the shop has no address now, so the numbers never shift
  const host = await linkHost(deps, m.storeId);
  const home = host ? `https://${host}/` : NO_HOME;
  const to = b?.body ? (emailLinks(b.body, home)[n] ?? null) : null;
  if (!to || to === NO_HOME) return null;
  await deps.db.notificationLog.update({ where: { id: m.id }, data: { clicks: { increment: 1 }, ...(m.clickedAt ? {} : { clickedAt: now }), ...(m.openedAt ? {} : { openedAt: now }) } });
  return to;
}

/** Is this an e-mail he can unsubscribe from, and did he already? (The unsubscribe page's first look.) */
export async function emailUnsubscribeState(db: Db, id: string): Promise<{ known: boolean; done: boolean }> {
  const m = await sentEmail(db, id);
  return { known: !!m?.customerId, done: !!m?.unsubscribedAt };
}

/** He unsubscribes: his "no" to offer e-mails, once (pressing again changes nothing). True when the e-mail is known. */
export async function emailUnsubscribe(db: Db, id: string, now: Date): Promise<boolean> {
  const m = await sentEmail(db, id);
  if (!m?.customerId) return false;
  if (m.unsubscribedAt) return true;
  const who = await db.customer.findFirst({ where: { id: m.customerId, storeId: m.storeId }, select: { phone: true } });
  const marked = await db.notificationLog.updateMany({ where: { id: m.id, unsubscribedAt: null }, data: { unsubscribedAt: now } });
  if (marked.count === 1) await db.consentRecord.create({ data: { storeId: m.storeId, customerId: m.customerId, phone: who?.phone ?? null, channel: 'EMAIL', scope: 'MARKETING', granted: false, source: EMAIL_UNSUBSCRIBE_SOURCE, createdAt: now } });
  return true;
}
