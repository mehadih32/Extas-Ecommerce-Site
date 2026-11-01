// PR 427 — a number in a chat's words (pure): the ways customers type it in Bengali, English and Banglish, and what is
// never taken for a number. Every number is made up.
import { describe, expect, it } from 'vitest';
import { e164Of, phonesInText } from './pure';

describe('PR 427 · a phone number in the chat', () => {
  it('finds a number typed in Bengali or English digits, with spaces, dashes, dots or a country code', () => {
    expect(phonesInText('amar number ০১৭১২-৩৪৫৬৭৮ bhai')).toEqual(['+8801712345678']);
    expect(phonesInText('আমার নম্বর ০১৮১২৩৪৫৬৭৮')).toEqual(['+8801812345678']);
    expect(phonesInText('call me: 017 1234 5678.')).toEqual(['+8801712345678']);
    expect(phonesInText('+880 1912-345678 e whatsapp')).toEqual(['+8801912345678']);
    expect(phonesInText('8801512345678')).toEqual(['+8801512345678']);
    expect(phonesInText('(01612) 345.678')).toEqual(['+8801612345678']);
    expect(phonesInText('number 1712345678')).toEqual(['+8801712345678']);
  });

  it('keeps each number once, in the order seen, and at most the limit', () => {
    expect(phonesInText('01712345678 ba 01812345678, abar 01712-345678')).toEqual(['+8801712345678', '+8801812345678']);
    expect(phonesInText('01712345678 01812345678 01912345678 01312345678', 2)).toHaveLength(2);
  });

  it('never cuts a number out of an order number, an amount or a code', () => {
    expect(phonesInText('order EX1712345678 kothay?')).toEqual([]);
    expect(phonesInText('017123456789012')).toEqual([]);
    expect(phonesInText('dam 1500 taka, size 42')).toEqual([]);
    expect(phonesInText('01212345678')).toEqual([]);
    expect(phonesInText('')).toEqual([]);
    expect(phonesInText(null)).toEqual([]);
  });

  it('stops a number where the next words start, even with an amount after it', () => {
    expect(phonesInText('01712345678 500 taka pathabo')).toEqual(['+8801712345678']);
  });

  it('answers a valid number as stored and anything else as null', () => {
    expect(e164Of('01712-345678')).toBe('+8801712345678');
    expect(e164Of('+1 555 0100 789')).toBeNull();
    expect(e164Of(null)).toBeNull();
  });
});
