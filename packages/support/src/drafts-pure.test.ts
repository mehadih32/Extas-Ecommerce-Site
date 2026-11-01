// PR 432 — SIM-F-012's acceptance test: the ten chats of the simulation run (Banglish and Bengali) with the question
// each one really asked. Keyword drafts got six of them wrong; the store's own word lists (the defaults of
// `support.draftKeywords`) in SIM-F-012's order must get all ten right. Plus the measures in Bengali digits, the bulk
// count, the language, and the draft's words filled without a promise of money.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { bodyIn, classifyMessage, draftTextKey, fillDraft, isBengaliScript, normaliseText, piecesIn, wordsOf } from './drafts-pure';

const W = registry['support.draftWords'].default;
const K = registry['support.draftKeywords'].default;
const BULK = registry['support.drafts'].default.bulkPieces;
const kind = (text: string) => classifyMessage(text, K, BULK);

describe('SIM-F-012: what the customer asked (the simulation run\'s ten chats)', () => {
  const chats: [string, string, string | null][] = [
    ['SIM-10', '40 polos lagbe, 4 ta size e', 'bulk'],
    ['SIM-11', 'cancel korte chai', 'cancel'],
    ['SIM-17', 'rider 50 taka beshi chailo', 'complaint:overcharge'],
    ['SIM-20', 'white order korsilam, blue pathiyeche', 'complaint:wrong'],
    ['SIM-24', '6 din hoye gelo, parcel ekhono pai nai', 'late'],
    ['SIM-28', 'উচ্চতা ৫ ফুট ৬, ওজন ৬৫', 'size'],
    ['SIM-31', 'আমার অর্ডার কোথায়?', 'status'],
    ['SIM-33', 'size boro hoyeche, exchange korte chai', 'exchange'],
    ['SIM-40', 'polo tar rong uthe geche', 'complaint:fade'],
    ['SIM-47', 'shirt ta chera, ki korbo', 'complaint:damage'],
  ];
  for (const [sim, text, want] of chats)
    it(`${sim}: "${text}" → ${want}`, () => {
      const k = kind(text);
      expect(k.complaint ? `${k.intent}:${k.complaint}` : k.intent).toBe(want);
    });

  it('a greeting, and a message with nothing known, are told apart', () => {
    expect(kind('Assalamu alaikum').intent).toBe('greeting');
    expect(kind('😊').intent).toBe('unknown');
  });
});

describe('the rules under the drafts', () => {
  it('reads Bengali digits, the measures and the bulk count', () => {
    expect(normaliseText('ওজন ৬৫  KG')).toBe('ওজন 65 kg');
    expect(bodyIn('উচ্চতা ৫ ফুট ৬, ওজন ৬৫')).toEqual({ heightIn: 66, weightKg: 65 });
    expect(bodyIn("5'8 72kg")).toEqual({ heightIn: 68, weightKg: 72 });
    expect(bodyIn('170 cm, 70 kg')).toEqual({ heightIn: 67, weightKg: 70 });
    expect(bodyIn('5 ft only')).toBeNull();
    const pieces = wordsOf(K.pieces);
    expect(piecesIn(normaliseText('৪০টা পোলো লাগবে'), pieces)).toBe(40);
    expect(piecesIn('rider 50 taka beshi', pieces)).toBe(0);
    expect(kind('৩টা শার্ট লাগবে, সাইজ M').intent).toBe('size');
  });

  it('answers Bengali letters in Bengali; Banglish is Latin letters', () => {
    expect(isBengaliScript('আমার অর্ডার কোথায়?')).toBe(true);
    expect(isBengaliScript('amar order kothay')).toBe(false);
  });

  it('picks the text: no order → asks for it; no size → asks the measures; a late parcel on a status question', () => {
    const o = { status: 'IN_TRANSIT', parcel: true };
    expect(draftTextKey({ intent: 'status', complaint: null }, { order: null, late: false, size: null })).toBe('noOrder');
    expect(draftTextKey({ intent: 'status', complaint: null }, { order: o, late: false, size: null })).toBe('statusShipped');
    expect(draftTextKey({ intent: 'status', complaint: null }, { order: o, late: true, size: null })).toBe('late');
    expect(draftTextKey({ intent: 'status', complaint: null }, { order: { status: 'DELIVERED', parcel: true }, late: false, size: null })).toBe('statusDelivered');
    expect(draftTextKey({ intent: 'size', complaint: null }, { order: null, late: false, size: null })).toBe('sizeAsk');
    expect(draftTextKey({ intent: 'size', complaint: null }, { order: null, late: false, size: 'L' })).toBe('size');
    expect(draftTextKey({ intent: 'complaint', complaint: 'overcharge' }, { order: o, late: false, size: null })).toBe('overcharge');
    expect(draftTextKey({ intent: 'bulk', complaint: null }, { order: null, late: false, size: null })).toBe('bulk');
  });

  it('fills the words; a fact not known is a dash, never an invented value', () => {
    const hello = fillDraft(W.helloNoName.en, {});
    expect(fillDraft(W.statusShipped.en, { hello, number: 'EX1001', courier: 'Sample Courier', tracking: null })).toBe('Hi, order EX1001 is on its way with Sample Courier, tracking —.');
    expect(fillDraft(W.size.bn, { hello: fillDraft(W.hello.bn, { name: 'রহিম' }), size: 'L' })).toBe('রহিম, আসসালামু আলাইকুম। আপনার উচ্চতা আর ওজনে L সাইজ ভালো ফিট হবে।');
  });
});
