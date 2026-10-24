// PR 12 (CN-025) — design A of a page built before the look registry: the page as it is, drawn by its own route. The
// registry lists it so Settings → Admin look shows the page and its picture; the V12.4 designs B and C of Orders and
// Products come after launch (PROGRESS.md follow-ups 381, 382; CN-027).
import type { LookDesign } from './types';
import { LookThumb } from './thumbs';

export function classicDesign(page: string): LookDesign<never> {
  return {
    key: 'A',
    name: { en: 'Classic list', bn: 'ক্লাসিক তালিকা' },
    desc: { en: 'The page as it is today: its own list, filters and actions.', bn: 'পাতাটা এখন যেমন: নিজের তালিকা, ফিল্টার আর কাজ।' },
    parts: [],
    Thumb: () => <LookThumb page={page} id="A" />,
  };
}
