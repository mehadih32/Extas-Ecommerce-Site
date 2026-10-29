// S14 · PR 505 — the template editor's rules without a database: the tokens a template may use (the default pack's own
// list), what the editor says about a template's words, its preview on the sample order (SIM-F-001, SIM-F-031), which
// message sends which template, and the auto-reply's window and hours.
import { describe, expect, it } from 'vitest';
import { TEMPLATE_TOKENS } from '@extas/seed';
import { DEFAULT_JOURNEY } from '@extas/settings';
import { autoReplyKey, BLOCKING_PROBLEMS, MESSAGE_TOKENS, previewTemplate, templateProblems, templateUses, unknownTokens, withinHours, type SampleSettings } from './pure';

const shop: SampleSettings = { storeName: 'Shop', host: 'shop.example', currency: 'BDT', amountLine: { en: 'Keep {amount} ready.', bn: '{amount} হাতে রাখুন।' }, exactAmount: null };

describe('PR 505 · the template editor`s rules', () => {
  it('a template may use exactly the tokens the default pack allows', () => {
    expect([...MESSAGE_TOKENS].sort()).toEqual([...TEMPLATE_TOKENS].sort());
    expect(unknownTokens({ body: 'Hi {customerName}, {orderNo} {orderNo}', subject: '{total} {foo}' })).toEqual(['orderNo', 'foo']);
  });

  it('names what stops a save and what is only a warning', () => {
    const sms = (body: string, locale = 'en') => templateProblems({ channel: 'SMS', locale, body, subject: null }, true);
    expect(sms('  ')).toEqual(['EMPTY']);
    expect(sms('Order {orderNo}')).toEqual(['UNKNOWN_TOKEN']);
    expect(sms('x'.repeat(2_001))).toEqual(['TOO_LONG']);
    expect(templateProblems({ channel: 'EMAIL', locale: 'en', body: 'Hi', subject: ' ' }, true)).toEqual(['NO_SUBJECT']);
    // SIM-F-025: a Bengali template written in English
    expect(sms('{storeName}: order {orderNumber} is packed.', 'bn')).toEqual(['NOT_BENGALI']);
    expect(sms('{storeName}: অর্ডার {orderNumber} প্যাক হয়েছে।', 'bn')).toEqual([]);
    // SIM-F-001: an amount token makes a paid order skip the message
    expect(sms('Pay {amountDue} to the rider.')).toEqual(['AMOUNT_ON_PAID']);
    // SIM-F-031: a link the shop cannot make yet
    expect(templateProblems({ channel: 'SMS', locale: 'en', body: 'Track: {trackingLink}', subject: null }, false)).toEqual(['LINK_PROMISE']);
    expect([...BLOCKING_PROBLEMS].sort()).toEqual(['EMPTY', 'NO_SUBJECT', 'TOO_LONG', 'UNKNOWN_TOKEN']);
  });

  it('SIM-F-001: the preview asks only for what is due — nothing on a prepaid order', () => {
    const [cod, prepaid, part] = previewTemplate({ channel: 'SMS', locale: 'en', body: '{storeName}: order {orderNumber} is on its way. {amountLine}', subject: null }, shop);
    expect(cod).toMatchObject({ sample: 'cod', ok: true, smsParts: 1 });
    expect(cod!.ok && cod!.text).toContain('2,490');
    expect(prepaid!.ok && prepaid!.text).toBe('Shop: order 100234 is on its way.');
    expect(part!.ok && part!.text).toContain('1,490');
    const due = previewTemplate({ channel: 'SMS', locale: 'en', body: 'Pay {amountDue}.', subject: null }, shop);
    expect(due[1]).toMatchObject({ sample: 'prepaid', ok: false, reason: 'AMOUNT_RULE' });
    const bn = previewTemplate({ channel: 'WHATSAPP', locale: 'bn', body: '{customerName}, অর্ডার {orderNumber}। {amountLine}', subject: null }, shop);
    expect(bn[0]!.ok && bn[0]!.text).toMatch(/^রহিম, অর্ডার 100234। .*হাতে রাখুন।$/);
    expect(bn[0]).toMatchObject({ smsParts: null });
  });

  it('SIM-F-031: without the shop`s address a link is never promised empty', () => {
    const p = previewTemplate({ channel: 'SMS', locale: 'en', body: 'Track it: {trackingLink}', subject: null }, { ...shop, host: null });
    expect(p.every((x) => !x.ok && x.reason === 'NO_LINK')).toBe(true);
  });

  it('which message sends which template, on which channels', () => {
    const u = templateUses({
      journey: DEFAULT_JOURNEY,
      duplicateTemplate: 'order.cancelledDuplicate',
      advance: { template: 'order.advanceRequest', channels: { SMS: true, WHATSAPP: false } },
      consentTemplates: ['consent.stopped', 'consent.started'],
      consentReplyOn: false,
      autoReply: { enabled: false, template: 'reply.received' },
    });
    expect(u.get('order.placed')).toEqual([{ use: 'placed', channels: ['SMS', 'EMAIL'], on: true }]);
    expect(u.get('order.selfConfirm')).toEqual([{ use: 'selfConfirm', channels: ['WHATSAPP', 'SMS'], on: false }]);
    expect(u.get('order.selfConfirmed')).toEqual([{ use: 'selfConfirmAnswer', channels: ['WHATSAPP', 'SMS'], on: false }]);
    expect(u.get('order.advanceRequest')).toEqual([{ use: 'advanceRequest', channels: ['SMS'], on: true }]);
    expect(u.get('reply.received')).toEqual([{ use: 'autoReply', channels: ['WHATSAPP'], on: false }]);
    expect(u.get('order.cancelledDuplicate')).toEqual([{ use: 'cancelDuplicate', channels: ['SMS'], on: false }]);
  });

  it('the auto-reply: one key per number in each window; the shop`s hours may wrap midnight', () => {
    const at = new Date('2026-10-29T04:00:00Z');
    expect(autoReplyKey('+8801700000505', at, 24)).toBe(autoReplyKey('+8801700000505', new Date(at.getTime() + 3_600_000), 24));
    expect(autoReplyKey('+8801700000505', at, 24)).not.toBe(autoReplyKey('+8801700000505', new Date(at.getTime() + 24 * 3_600_000), 24));
    // 04:00 UTC is 10:00 in Dhaka
    expect(withinHours(at, 'Asia/Dhaka', 10, 22)).toBe(true);
    expect(withinHours(at, 'Asia/Dhaka', 11, 22)).toBe(false);
    expect(withinHours(at, 'Asia/Dhaka', 22, 11)).toBe(true);
    expect(withinHours(at, 'Asia/Dhaka', 22, 10)).toBe(false);
  });
});
