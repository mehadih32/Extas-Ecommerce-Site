import { describe, expect, it } from 'vitest';
import { fieldOrder } from './pure';

describe('PR 115 · the field order (CN-012)', () => {
  it('keeps the owner order, drops unknown and repeated names, and adds what he left out', () => {
    expect(fieldOrder(['phone', 'name', 'address'])).toEqual(['phone', 'name', 'address']);
    expect(fieldOrder(['address', 'address', 'email'])).toEqual(['address', 'name', 'phone']);
    expect(fieldOrder([])).toEqual(['name', 'phone', 'address']);
    expect(fieldOrder(null)).toEqual(['name', 'phone', 'address']);
  });
});
