// PR 500 — the Keys & connections catalogue matches the adapters in code: every adapter is listed, a row marked
// `adapter: true` names a real adapter with exactly its secret fields and modes, and config fields exist in its schema.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { allAdapters, connectionCatalogue, findConnection } from '../src';

describe('connection catalogue (PR 500)', () => {
  it('lists every adapter in code exactly once', () => {
    for (const a of allAdapters) {
      const rows = connectionCatalogue.filter((c) => c.adapter && c.kind === a.kind && c.provider === a.provider);
      expect(rows, `${a.kind}:${a.provider}`).toHaveLength(1);
    }
  });

  it('ids are unique and camelCase', () => {
    const ids = connectionCatalogue.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    expect(findConnection('azureBlob')?.provider).toBe('azureBlob');
    expect(findConnection('nope')).toBeUndefined();
  });

  it('a row with an adapter declares exactly its secrets, a mode it offers and config keys it accepts', () => {
    for (const c of connectionCatalogue.filter((x) => x.adapter)) {
      const a = allAdapters.find((x) => x.kind === c.kind && x.provider === c.provider);
      expect(a, c.id).toBeDefined();
      expect(c.secrets.map((s) => s.field).sort()).toEqual([...a!.secrets].sort());
      expect(a!.modes).toContain(c.targetMode);
      const shape = (a!.configSchema as unknown as z.ZodObject).shape as Record<string, unknown>;
      for (const f of c.config) expect(Object.keys(shape), `${c.id}.${f.field}`).toContain(f.field);
    }
  });

  it('rows without an adapter ask for nothing (no fake behaviour)', () => {
    for (const c of connectionCatalogue.filter((x) => !x.adapter)) {
      expect(c.secrets).toHaveLength(0);
      expect(c.config).toHaveLength(0);
      expect(allAdapters.some((a) => a.kind === c.kind && a.provider === c.provider)).toBe(false);
    }
  });
});
