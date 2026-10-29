// PR 292 — the WhatsApp rules without a database: template names, Meta's numbered body, the values in order, the words
// Meta would refuse, and a customer's reply read as a self-confirm answer (Bengali digits too).
import { describe, expect, it } from 'vitest';
import { metaBody, replyWords, sampleInput, selfConfirmAnswerOf, templateValues, waBodyProblems, waTemplateName, type SampleSettings } from './pure';

const shop: SampleSettings = { storeName: 'Sample Shop', host: 'shop.example', currency: 'BDT', amountLine: { bn: 'বাকি {amount}।', en: 'Due {amount}.' }, exactAmount: null };

describe('PR 292 · WhatsApp words', () => {
  it('names a template from its key', () => {
    expect(waTemplateName('order.placed')).toBe('order_placed');
    expect(waTemplateName('order.selfConfirmCancel')).toBe('order_self_confirm_cancel');
  });

  it('numbers the values for Meta and fills them in the same order', () => {
    const body = 'Hi {customerName}, order {orderNumber}: {amountLine} Thanks.';
    expect(metaBody(body)).toEqual({ text: 'Hi {{1}}, order {{2}}: {{3}} Thanks.', tokens: ['customerName', 'orderNumber', 'amountLine'] });
    const cod = templateValues(body, sampleInput(shop, 'en', 'cod'));
    expect(cod[0]).toBe('Rahim');
    expect(cod[1]).toBe('100234');
    expect(cod[2]).toMatch(/^Due .*2,490\.$/);
    // nothing due: no amount line, and WhatsApp never gets an empty value
    expect(templateValues(body, sampleInput(shop, 'en', 'prepaid'))[2]).toBe('-');
    expect(sampleInput(shop, 'bn', 'partPaid')).toMatchObject({ customerName: 'রহিম', dueMinor: 149_000, link: 'https://shop.example/account/orders/100234' });
  });

  it('names what Meta would refuse', () => {
    expect(waBodyProblems('Hi {customerName}, thanks.')).toEqual([]);
    expect(waBodyProblems('{customerName}, thanks.')).toEqual(['STARTS_WITH_VALUE']);
    expect(waBodyProblems('Your order is {orderNumber}.')).toEqual(['ENDS_WITH_VALUE']);
    expect(waBodyProblems('Hi {customerName} {orderNumber} ok')).toEqual(['VALUES_TOUCH']);
    expect(waBodyProblems(`Hi ${'x'.repeat(1_030)} ok`)).toEqual(['TOO_LONG']);
  });

  it('reads a reply as a self-confirm answer, Bengali digits too; anything else is not one', () => {
    expect(replyWords('  stop  now ')).toBe('STOP NOW');
    expect([' 1 ', '২', '3.', '১)'].map(selfConfirmAnswerOf)).toEqual([1, 2, 3, 1]);
    expect(['4', '12', 'yes', '', '1 please'].map(selfConfirmAnswerOf)).toEqual([null, null, null, null, null]);
  });
});
