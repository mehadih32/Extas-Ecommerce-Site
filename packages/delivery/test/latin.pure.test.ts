// SIM-F-048 (PR 179 follow-up): a Bengali address read in Latin letters for the sticker's second line — the way people
// write place names in Latin letters, Bengali digits as Western digits, Latin text left alone (no second line).
import { describe, expect, it } from 'vitest';
import { bengaliToLatin } from '../src/latin';

describe('bengaliToLatin', () => {
  it.each([
    ['মাস্টারপাড়া, গাবতলী, বগুড়া', 'Mastarpara, Gabtoli, Bogura'],
    ['মিরপুর ১০, ঢাকা', 'Mirpur 10, Dhaka'],
    ['বাসা নং ১২, সদর রোড, কুড়িগ্রাম', 'Basa Nong 12, Sodor Rod, Kurigram'],
    ['ধানমন্ডি ২৭', 'Dhanmondi 27'],
    ['বাজারের পাশে, উপজেলা মোড়', 'Bajarer Pashe, Upjela Mor'],
    ['রংপুর', 'Rongpur'],
    ['চট্টগ্রাম', 'Chottogram'],
    ['বান্দরবান', 'Bandorban'],
  ])('%s → %s', (bn, latin) => {
    expect(bengaliToLatin(bn)).toBe(latin);
  });

  it('keeps Latin parts, and gives nothing for an address with no Bengali letter', () => {
    expect(bengaliToLatin('House 4, রোড ৫, Banani')).toBe('House 4, Rod 5, Banani');
    expect(bengaliToLatin('House 4, Road 5')).toBeNull();
    expect(bengaliToLatin('')).toBeNull();
    expect(bengaliToLatin(null)).toBeNull();
  });

  it('reads a precomposed ড় the same as ড + nukta', () => {
    expect(bengaliToLatin('ড়')).toBe(bengaliToLatin('ড়'));
  });
});
