// S22 · PR 429 — the product page reads the words a support chat's link carries: the same words @extas/support writes.
import { describe, expect, it } from 'vitest';
import { SHARE_QUERY } from '@extas/support/pure';
import { COLOUR_QUERY, REF_QUERY, SIZE_QUERY } from './routes';
import { supportRefOf } from './support-ref-model';

describe('PR 429 · a support chat’s product link in the shop', () => {
  it('the page reads the colour, size and reference words the chat writes', () => {
    expect({ colour: COLOUR_QUERY, size: SIZE_QUERY, ref: REF_QUERY }).toEqual(SHARE_QUERY);
  });

  it('keeps only a reference of the right shape', () => {
    expect(supportRefOf('abcd2345ef')).toBe('abcd2345ef');
    for (const bad of [null, undefined, '', 'ABCD2345EF', 'abc', 'abcd 2345ef', 'x'.repeat(30), '<script>']) expect(supportRefOf(bad)).toBeNull();
  });
});
