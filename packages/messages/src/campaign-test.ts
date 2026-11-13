// S28 · PR 697 (CN-048; prototype v5 Marketing › Message campaigns; gap M4) — a test send: the words of one of the shop's
// own templates, sent once to ONE address the person types (their own phone or e-mail), before a campaign goes to a group.
// It goes by the channel's own sender (the practice stand-in until its key is typed in, so nothing leaves while the keys
// are missing), is logged like every message (step `campaignTest`, no customer, no campaign), and counts in the message
// costs when the provider says what it cost. It never reaches a customer: the address is typed, one per call, and a shop
// gets at most TEST_SENDS_PER_DAY a day. `messages.campaigns.write`. A WhatsApp template goes only once the provider
// approved it (as every WhatsApp message does).
import { randomUUID } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import type { MessageChannel } from '@extas/settings';
import { z } from 'zod';
import { MessagesError, nowOf, setting, type MessagesDeps, type OutgoingMessage, type Who } from './context';
import { runContext } from './engine';
import { maskingSender, render, smsCostMinor, smsParts, templateValues, type RenderInput } from './pure';

/** A guard, not a business number: the most test sends a shop makes in one day. */
export const TEST_SENDS_PER_DAY = 10; // hardcode-ok: a guard against use as a bulk sender
export const CAMPAIGN_TEST_STEP = 'campaignTest';

const input = z
  .object({
    templateId: z.string().uuid(),
    /** A phone number (SMS, WhatsApp) or an e-mail address. */
    to: z.string().trim().min(5).max(120),
  })
  .strict();

export type CampaignTestResult = { ok: true; channel: MessageChannel; mode: string | null; costMinor: number | null } | { ok: false; reason: string };

const PHONE = /^\+?[0-9]{8,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One test send. Refusals are `{ ok: false, reason }` (never a throw) except a missing permission or bad input. */
export async function sendCampaignTest(deps: MessagesDeps, who: Who, raw: unknown): Promise<CampaignTestResult> {
  await requirePermission(deps.db, who.actor, 'messages.campaigns.write', { storeId: who.storeId });
  const parsed = input.safeParse(raw ?? {});
  if (!parsed.success) throw new MessagesError('INVALID_INPUT', 'the test send is not valid', parsed.error.issues.map((i) => i.path.join('.') || '(input)'));
  const S = who.storeId;
  const t = await deps.db.notificationTemplate.findFirst({ where: { id: parsed.data.templateId, storeId: S, archivedAt: null }, select: { id: true, key: true, channel: true, locale: true, subject: true, body: true, providerTemplateId: true, providerStatus: true } });
  if (!t) throw new MessagesError('NOT_FOUND', 'no such template', ['templateId']);
  const channel = t.channel as MessageChannel;
  const to = parsed.data.to.replace(/[\s-]/g, '');
  if (channel === 'EMAIL' ? !EMAIL.test(parsed.data.to) : !PHONE.test(to)) return { ok: false, reason: 'BAD_ADDRESS' };
  const c = await runContext(deps, S);
  if (!c.master) return { ok: false, reason: 'MASTER_OFF' };
  const now = nowOf(deps);
  const dayStart = new Date(now.getTime() - 24 * 3_600_000); // hardcode-ok: the last 24 hours
  if ((await deps.db.notificationLog.count({ where: { storeId: S, step: CAMPAIGN_TEST_STEP, createdAt: { gte: dayStart } } })) >= TEST_SENDS_PER_DAY) return { ok: false, reason: 'LIMIT' };
  const lang = t.locale === 'en' ? 'en' : 'bn';
  const currency = await setting(deps, S, 'store.currency');
  const sample: RenderInput = { storeName: c.storeName, customerName: 'Test', orderNumber: '', senderName: '', currency, dueMinor: 0, link: null, amountLine: c.amountLine[lang], exactAmount: null };
  const words = render(t.body, channel === 'EMAIL' ? (t.subject ?? '') : null, sample);
  if (!words.ok) return { ok: false, reason: words.reason };
  const sms = channel === 'SMS';
  const parts = sms ? smsParts(words.text).parts : null;
  const log = await deps.db.notificationLog.create({ data: { storeId: S, channel, recipient: channel === 'EMAIL' ? parsed.data.to : to, status: 'QUEUED', dedupeKey: `${CAMPAIGN_TEST_STEP}:${randomUUID()}`, step: CAMPAIGN_TEST_STEP, templateId: t.id, locale: t.locale }, select: { id: true } });
  let sender: Awaited<ReturnType<MessagesDeps['sender']>> | null = null;
  const end = async (data: Record<string, unknown>) => deps.db.notificationLog.update({ where: { id: log.id }, data: data as never });
  try {
    sender = await deps.sender(S, channel);
    let template: OutgoingMessage['template'] = null;
    if (channel === 'WHATSAPP' && sender.mode !== 'MOCK') {
      if (t.providerStatus !== 'APPROVED' || !t.providerTemplateId) {
        await end({ status: 'SKIPPED', reason: 'WA_TEMPLATE_NOT_APPROVED' });
        return { ok: false, reason: 'WA_TEMPLATE_NOT_APPROVED' };
      }
      template = { name: t.providerTemplateId, language: c.whatsapp.languageCodes[lang], params: templateValues(t.body, sample) };
    }
    const r = await sender.send({ to: channel === 'EMAIL' ? parsed.data.to : to, text: words.text, subject: words.subject, purpose: CAMPAIGN_TEST_STEP, ...(sms ? { senderId: maskingSender(c.masking) } : {}), ...(template ? { template } : {}) });
    if (!r.ok) {
      await end({ status: 'FAILED', reason: 'SEND_FAILED', error: r.error.slice(0, 300), provider: sender.provider, mode: sender.mode });
      return { ok: false, reason: 'SEND_FAILED' };
    }
    const costMinor = sender.mode === 'MOCK' ? null : (r.costMinor ?? (sms ? smsCostMinor(parts ?? 0, c.smsRates, maskingSender(c.masking) !== null) : null));
    await end({ status: 'SENT', sentAt: now, providerMessageId: r.messageId, provider: sender.provider, mode: sender.mode, segments: parts, costMinor });
    await audit(deps.db, who.actor, { storeId: S, action: 'campaign.test', entityType: 'NotificationTemplate', entityId: t.id, before: null, after: { channel, mode: sender.mode } }, { source: 'admin-api', ...who.ctx });
    return { ok: true, channel, mode: sender.mode, costMinor };
  } catch (e) {
    await end({ status: 'FAILED', reason: 'SEND_FAILED', error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    return { ok: false, reason: 'SEND_FAILED' };
  }
}
