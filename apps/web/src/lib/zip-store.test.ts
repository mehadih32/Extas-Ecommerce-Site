// PR 846 — the ZIP writer: the known CRC-32 value, the layout a ZIP reader expects, and a refusal of two files with one name.
import { describe, expect, it } from 'vitest';
import { buildZip, crc32 } from './zip-store';

describe('zip-store', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes local headers, a central directory and an end record that point at each other', () => {
    const zip = buildZip([{ name: 'orders.csv', data: 'id\n1\n' }, { name: 'customers.csv', data: 'name\nআমিনা\n' }], new Date(Date.UTC(2026, 10, 15, 10, 20, 30)));
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const dirAt = v.getUint32(end + 16, true);
    expect(v.getUint32(dirAt, true)).toBe(0x02014b50);
    // the first entry: its stored size, CRC and name
    const size = v.getUint32(dirAt + 20, true);
    expect(size).toBe(5);
    expect(v.getUint32(dirAt + 16, true)).toBe(crc32(new TextEncoder().encode('id\n1\n')));
    const nameLen = v.getUint16(dirAt + 28, true);
    expect(new TextDecoder().decode(zip.slice(dirAt + 46, dirAt + 46 + nameLen))).toBe('orders.csv');
    // the data sits right after its local header and name
    expect(new TextDecoder().decode(zip.slice(30 + 10, 30 + 10 + 5))).toBe('id\n1\n');
    // the second entry's local header offset is where the second local header really is
    const second = dirAt + 46 + nameLen;
    expect(v.getUint32(second + 42, true)).toBe(30 + 10 + 5);
    expect(v.getUint32(30 + 10 + 5, true)).toBe(0x04034b50);
  });

  it('refuses two files with one name and builds an empty ZIP', () => {
    expect(() => buildZip([{ name: 'a.csv', data: '' }, { name: 'a.csv', data: '' }])).toThrow(/duplicate/);
    expect(buildZip([]).length).toBe(22);
  });
});
