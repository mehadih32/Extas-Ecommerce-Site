import { describe, expect, it } from 'vitest';
import { parseOwnerValues } from '../src/owner-values';
import { registry } from '../src/registry';

const file = (o: unknown) => JSON.stringify(o);

describe('parseOwnerValues (CN-009 owner values on the server)', () => {
  it('accepts known keys with a reason and the OK flag', () => {
    const v = parseOwnerValues(file({ reason: 'CN-009', ownerApproved: true, values: { 'media.watermark.text': 'www.example.com' } }), registry);
    expect(v.reason).toBe('CN-009');
    expect(Object.keys(v.values)).toEqual(['media.watermark.text']);
  });
  it('refuses an unknown key, no reason, no values or bad JSON', () => {
    expect(() => parseOwnerValues(file({ reason: 'x', ownerApproved: true, values: { 'no.such.key': 1 } }), registry)).toThrow(/not in the settings registry/);
    expect(() => parseOwnerValues(file({ reason: ' ', ownerApproved: true, values: { 'media.watermark.text': 'a' } }), registry)).toThrow(/reason/);
    expect(() => parseOwnerValues(file({ reason: 'x', ownerApproved: true, values: {} }), registry)).toThrow(/at least one/);
    expect(() => parseOwnerValues(file({ reason: 'x', values: { 'media.watermark.text': 'a' } }), registry)).toThrow(/ownerApproved/);
    expect(() => parseOwnerValues('{', registry)).toThrow(/JSON/);
  });
});
