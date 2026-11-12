// S15 · PR 311 — the masking layer applied before anything leaves the server (Blueprint A5.1–A5.4). Pure, no
// network and no database: see ai-writer-live.test.ts for the end-to-end proof that `liveAiWriter` actually calls
// this on every outbound request.
import { describe, expect, it } from 'vitest';
import { maskKnownIdentity, maskPersonalData } from '../src/ai-writer/masking';

describe('maskPersonalData (PR 311)', () => {
  it('strips an e-mail address anywhere in the text', () => {
    const r = maskPersonalData('Contact rahim.miah+orders@example.com for a reply.');
    expect(r.masked).toBe('Contact [EMAIL] for a reply.');
    expect(r.redactions).toBe(1);
  });

  it('strips a bare Bangladeshi mobile number', () => {
    const r = maskPersonalData('Call 01712345678 now.');
    expect(r.masked).toBe('Call [PHONE] now.');
    expect(r.redactions).toBe(1);
  });

  it('strips a mobile number however it is punctuated or prefixed', () => {
    for (const typed of ['01712345678', '+8801712345678', '8801712345678', '00880 1712 345678', '01712-345-678', '01712.345.678']) {
      const r = maskPersonalData(`Number: ${typed}.`);
      expect(r.masked).toBe('Number: [PHONE].');
      expect(r.redactions).toBe(1);
    }
  });

  it('strips more than one match and counts each one', () => {
    const r = maskPersonalData('Rider: 01812345678, backup rider: 01912345678, reach us at help@extas.com.bd.');
    expect(r.masked).toBe('Rider: [PHONE], backup rider: [PHONE], reach us at [EMAIL].');
    expect(r.redactions).toBe(3);
  });

  it('leaves ordinary numbers and prices alone', () => {
    const text = 'SKU EXTAS-000123456, price 1,499 টাকা, order ORD-20261111-003, qty 12.';
    const r = maskPersonalData(text);
    expect(r.masked).toBe(text);
    expect(r.redactions).toBe(0);
  });

  it('leaves text with nothing to mask completely unchanged', () => {
    const r = maskPersonalData('Write a search title for this polo shirt.');
    expect(r.masked).toBe('Write a search title for this polo shirt.');
    expect(r.redactions).toBe(0);
  });

  it('is safe to run twice: masking an already-masked text finds nothing new', () => {
    const once = maskPersonalData('Call 01712345678 or mail rahim@example.com.');
    const twice = maskPersonalData(once.masked);
    expect(twice.masked).toBe(once.masked);
    expect(twice.redactions).toBe(0);
  });
});

describe('maskKnownIdentity (PR 311)', () => {
  const identity = { name: 'Rahim Mia', phone: '01712345678', email: 'rahim@example.com', address: '123 Road 7, Dhanmondi, Dhaka' };

  it('strips every field it is given, case-insensitively', () => {
    const r = maskKnownIdentity('rahim mia called from 01712345678 about his order to 123 Road 7, Dhanmondi, Dhaka.', identity);
    expect(r.masked).toBe('[CUSTOMER] called from [PHONE] about his order to [ADDRESS].');
    expect(r.redactions).toBe(3);
  });

  it('only strips the fields it is given, leaving the rest of the text alone', () => {
    const r = maskKnownIdentity('Rahim Mia asked about delivery to Dhanmondi.', { name: 'Rahim Mia' });
    expect(r.masked).toBe('[CUSTOMER] asked about delivery to Dhanmondi.');
    expect(r.redactions).toBe(1);
  });

  it('skips an empty or whitespace-only field rather than matching everything', () => {
    const r = maskKnownIdentity('Some ordinary text with nothing to strip.', { name: '  ', phone: null, email: undefined });
    expect(r.masked).toBe('Some ordinary text with nothing to strip.');
    expect(r.redactions).toBe(0);
  });

  it('skips a value shorter than three characters so a stray initial is left alone', () => {
    const r = maskKnownIdentity('Mr A left a note.', { name: 'A' });
    expect(r.masked).toBe('Mr A left a note.');
    expect(r.redactions).toBe(0);
  });

  it('escapes a value that contains regular-expression special characters', () => {
    const r = maskKnownIdentity('Reach M.D. (Rahim) on his line.', { name: 'M.D. (Rahim)' });
    expect(r.masked).toBe('Reach [CUSTOMER] on his line.');
    expect(r.redactions).toBe(1);
  });

  it('counts a name repeated twice in the same text as two redactions', () => {
    const r = maskKnownIdentity('Rahim Mia called. Rahim Mia called again.', { name: 'Rahim Mia' });
    expect(r.masked).toBe('[CUSTOMER] called. [CUSTOMER] called again.');
    expect(r.redactions).toBe(2);
  });
});
