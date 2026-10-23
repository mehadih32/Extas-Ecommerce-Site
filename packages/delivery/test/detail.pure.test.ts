// PR 563 · SIM-F-030 — the address-detail check: a landmark-only line ("bazar er pashe, Kurigram") has no house, road,
// para or village and is flagged for the call; whole words only, a word with its number counts, both scripts.
import { describe, expect, it } from 'vitest';
import { ADDRESS_DETAIL_WORDS } from '@extas/settings';
import { hasAddressDetail } from '../src/detail';

const W = [...ADDRESS_DETAIL_WORDS];

describe('hasAddressDetail (PR 563, SIM-F-030)', () => {
  it.each(['House 4, Road 5, Dhanmondi, Dhaka 1209', 'Road 12, House 42', 'H#12, Rd 5, Mirpur 10', 'h12 rd5 Uttara', 'Flat 3B, Shanti Tower, Banani', 'Vill: Char Para, Kurigram', 'বাড়ি ১২, রোড ৫, ধানমন্ডি', 'উত্তর পাড়া, পীরগঞ্জ', 'Uttor para, Pirganj, Rangpur', 'House no 7 Holding 22'])(
    'a line that says where the house is: %s',
    (line) => {
      expect(hasAddressDetail(line, W)).toBe(true);
    },
  );

  it.each(['bazar er pashe, Kurigram', 'Shahid Minar er pashe', 'masjid er samne, Bogura', 'Kurigram', 'Kazipara, Mirpur', 'স্কুলের পাশে, কুড়িগ্রাম'])('a landmark or a place name only: %s', (line) => {
    expect(hasAddressDetail(line, W)).toBe(false);
  });

  it('whole words only: "gram" is not Kurigram, "st" is not Mistri, "h" is not Hatirjheel', () => {
    expect(hasAddressDetail('Kurigram', ['gram'])).toBe(false);
    expect(hasAddressDetail('Mistripara', ['st'])).toBe(false);
    expect(hasAddressDetail('Hatirjheel', ['h'])).toBe(false);
    expect(hasAddressDetail('Gram Kurigram', ['gram'])).toBe(true);
  });

  it('two-word entries match in order; the gazetteer fold makes spellings meet; an empty list never flags', () => {
    expect(hasAddressDetail('flat no 4, Gulshan', ['flat no'])).toBe(true);
    expect(hasAddressDetail('no flat, Gulshan', ['flat no'])).toBe(false);
    expect(hasAddressDetail('Mohollah 3', ['mohollah'])).toBe(true);
    expect(hasAddressDetail('Shaheed Minar', [])).toBe(true);
  });
});
