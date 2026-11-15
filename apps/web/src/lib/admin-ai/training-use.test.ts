// PR 820 — switching a training correction or document off and on: the list of ids changes by one, a double tap changes nothing,
// and only a live correction or document can be switched.
import { describe, expect, it, vi } from 'vitest';
import { nextOff, setTrainingUse, trainingOffIds } from './training-use';

describe('PR 820 · training use switches', () => {
  it('adds an id when switched off, removes it when used again, and leaves the list alone otherwise', () => {
    expect(nextOff([], 'a', false)).toEqual(['a']);
    expect(nextOff(['a'], 'a', false)).toEqual(['a']);
    expect(nextOff(['a', 'b'], 'a', true)).toEqual(['b']);
    expect(nextOff(['b'], 'a', true)).toEqual(['b']);
  });
  it('reads the switched-off ids as a set', async () => {
    const resolver = { value: async () => ({ ids: ['x', 'y'] }) } as never;
    expect([...(await trainingOffIds(resolver))]).toEqual(['x', 'y']);
  });
  it('writes through the settings history only when something changed, and refuses a row that is not live', async () => {
    const set = vi.fn(async () => undefined);
    const find = vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'doc1' ? { id: 'doc1', kind: 'document' } : null));
    const deps = { db: { aiTrainingExample: { findFirst: find } }, resolver: { value: async () => ({ ids: ['doc1'] }), set } } as never;
    const who = { actor: { staffUserId: 'u1' } } as never;
    await setTrainingUse(deps, who, { id: 'doc1', on: false });
    expect(set).not.toHaveBeenCalled();
    await setTrainingUse(deps, who, { id: 'doc1', on: true });
    expect(set).toHaveBeenCalledWith('ai.trainingOff', { ids: [] }, expect.anything(), expect.objectContaining({ actorId: 'u1' }));
    await expect(setTrainingUse(deps, who, { id: 'gone', on: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(setTrainingUse(deps, who, { id: 'doc1' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
