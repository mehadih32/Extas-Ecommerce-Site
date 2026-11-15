// parity F4 · PR 835 — the SMS length rule the campaign wizard shows (prototype Message campaigns: Bengali 70, English 160).
import { describe, expect, it } from 'vitest';
import { smsParts } from './CampaignForm';

describe('smsParts', () => {
  it('counts nothing for an empty text', () => {
    expect(smsParts('')).toEqual({ n: 0, parts: 0, uni: false, one: 160 });
  });
  it('English: 160 letters are one SMS, 161 are two', () => {
    expect(smsParts('a'.repeat(160)).parts).toBe(1);
    expect(smsParts('a'.repeat(161)).parts).toBe(2);
    expect(smsParts('a'.repeat(306)).parts).toBe(2);
    expect(smsParts('a'.repeat(307)).parts).toBe(3);
  });
  it('Bengali: 70 letters are one SMS, 71 are two, 134 are two, 135 are three', () => {
    const bn = (n: number) => 'ক'.repeat(n);
    expect(smsParts(bn(70))).toMatchObject({ parts: 1, uni: true, one: 70 });
    expect(smsParts(bn(71)).parts).toBe(2);
    expect(smsParts(bn(134)).parts).toBe(2);
    expect(smsParts(bn(135)).parts).toBe(3);
  });
  it('one Bengali letter makes the whole text Unicode', () => {
    expect(smsParts(`${'a'.repeat(100)}ক`).uni).toBe(true);
    expect(smsParts(`${'a'.repeat(100)}ক`).parts).toBe(2);
  });
});
