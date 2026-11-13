// S28 · PR 705 — the pure side of People, Roles and the Activity log: the permission tree and its tri-state boxes, and what a
// log row may show of a change (field names only) and of a CSV cell.
import { describe, expect, it } from 'vitest';
import { csvOf } from './activity-log';
import { buildTree, changedKeys, diffKeys, toggleGroup, triOf } from './people-pure';

const cat = [
  { key: 'orders.read', group: 'orders', label: { en: 'See orders', bn: 'অর্ডার দেখা' }, groupLabel: { en: 'Orders', bn: 'অর্ডার' } },
  { key: 'orders.edit', group: 'orders', label: { en: 'Edit orders', bn: 'অর্ডার বদল' }, groupLabel: { en: 'Orders', bn: 'অর্ডার' } },
  { key: 'staff.read', group: 'staff', label: { en: 'See staff', bn: 'স্টাফ দেখা' }, groupLabel: { en: 'Staff', bn: 'স্টাফ' } },
];

describe('the permission tree', () => {
  it('puts every key once under its group, in catalogue order', () => {
    const tree = buildTree(cat);
    expect(tree.map((b) => [b.group, b.keys.map((k) => k.key)])).toEqual([['orders', ['orders.read', 'orders.edit']], ['staff', ['staff.read']]]);
    expect(tree[0]!.label.bn).toBe('অর্ডার');
  });

  it('a group box is all, some or none', () => {
    const keys = ['orders.read', 'orders.edit'];
    expect(triOf(keys, new Set())).toBe('none');
    expect(triOf(keys, new Set(['orders.read']))).toBe('some');
    expect(triOf(keys, new Set(keys))).toBe('all');
  });

  it('ticking a group gives all its keys and unticking takes them all, without touching other groups', () => {
    const held = new Set(['staff.read', 'orders.read']);
    expect([...toggleGroup(held, ['orders.read', 'orders.edit'], true)].sort()).toEqual(['orders.edit', 'orders.read', 'staff.read']);
    expect([...toggleGroup(held, ['orders.read', 'orders.edit'], false)]).toEqual(['staff.read']);
    expect(held.size).toBe(2); // the old set is not changed
  });

  it('says what a save would change', () => {
    expect(diffKeys(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({ added: ['c'], removed: ['a'] });
  });
});

describe('the activity log shows no values', () => {
  it('a change lists the names of the fields only', () => {
    expect(changedKeys({ phone: '01711', name: 'A' }, { phone: '01822', status: 'x' })).toEqual(['name', 'phone', 'status']);
    expect(changedKeys(null, 'text')).toEqual([]);
    expect(changedKeys(null, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${String(i).padStart(2, '0')}`, 1]))).length).toBe(12);
  });

  it('a CSV cell that would run as a formula is made safe, and commas and quotes are escaped', () => {
    const csv = csvOf([{ id: '1', at: '2026-11-01T00:00:00.000Z', who: '=HYPERLINK("x")', whoType: 'STAFF', action: 'a,b', entity: 'Order', entityId: null, fields: ['x', 'y'] }]);
    expect(csv.split('\n')[1]).toBe(`2026-11-01T00:00:00.000Z,"'=HYPERLINK(""x"")",STAFF,"a,b",Order,,x y`);
  });
});
