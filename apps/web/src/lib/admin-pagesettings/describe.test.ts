// PR 740 — the schema tree the page-settings editor draws from: shapes, blank values, equality. Made-up schemas only.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { blank, describeSchema, humanise, sameValue } from './describe';

describe('describeSchema (PR 740)', () => {
  it('reads switches, numbers with bounds, enums and text', () => {
    const n = describeSchema(z.object({ on: z.boolean(), per: z.number().int().min(2).max(8), mode: z.enum(['a', 'b']), note: z.string().max(40) }));
    expect(n).toMatchObject({ t: 'obj' });
    const props = (n as Extract<typeof n, { t: 'obj' }>).props;
    expect(props.find((p) => p.k === 'on')?.n).toEqual({ t: 'bool' });
    expect(props.find((p) => p.k === 'per')?.n).toMatchObject({ t: 'int', min: 2, max: 8 });
    expect(props.find((p) => p.k === 'mode')?.n).toEqual({ t: 'enum', values: ['a', 'b'] });
    expect(props.find((p) => p.k === 'note')?.n).toMatchObject({ t: 'str', max: 40 });
  });

  it('reads a nullable value and a list', () => {
    expect(describeSchema(z.string().nullable())).toMatchObject({ t: 'nullable', of: { t: 'str' } });
    expect(describeSchema(z.array(z.number()).max(3))).toMatchObject({ t: 'arr', max: 3 });
  });
});

describe('blank / humanise / sameValue (PR 740)', () => {
  it('a blank value fits its shape', () => {
    expect(blank({ t: 'bool' })).toBe(false);
    expect(blank({ t: 'int', min: 4 })).toBe(4);
    expect(blank({ t: 'str' })).toBe('');
    expect(blank({ t: 'enum', values: ['x', 'y'] })).toBe('x');
    expect(blank({ t: 'nullable', of: { t: 'str' } })).toBeNull();
    expect(blank({ t: 'arr', item: { t: 'str' } })).toEqual([]);
  });

  it('humanises a code name', () => {
    expect(humanise('perRow')).toBe('Per row');
    expect(humanise('show_all-items')).toBe('Show all items');
  });

  it('the order of names never matters', () => {
    expect(sameValue({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
  });
});
