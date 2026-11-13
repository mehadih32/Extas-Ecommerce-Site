// S15 · PR 318 — the permission matrix's pure helpers: the resource catalogue, the level catalogue, and the
// enforcement primitives. Everything else here (`permissionsView`, `setAgentPermission`, `agentPermissionLevel`)
// touches Prisma, so it is proven in `permissions-api.db.test.ts` instead, the same split `approvals.ts`/
// `approvals.test.ts` already use.
import { describe, expect, it } from 'vitest';
import {
  agentMayActAlone,
  agentMayProposeOrAct,
  DEFAULT_LEVEL,
  isPermissionLevel,
  isResourceKey,
  LEVELS,
  resourceLabel,
  RESOURCES,
} from './permissions';

describe('RESOURCES', () => {
  it('is the Blueprint\'s own seven resources, each with a non-empty English and Bengali name, no duplicate key', () => {
    expect(RESOURCES.map((r) => r.key)).toEqual(['orders', 'stock', 'prices', 'courier', 'money', 'customerData', 'code']);
    for (const r of RESOURCES) {
      expect(r.nameEn.length).toBeGreaterThan(0);
      expect(r.nameBn.length).toBeGreaterThan(0);
    }
    expect(new Set(RESOURCES.map((r) => r.key)).size).toBe(RESOURCES.length);
  });
});

describe('isResourceKey / resourceLabel', () => {
  it('accepts every catalogue key and rejects anything else — a closed list, unlike the approval queue\'s kinds', () => {
    for (const r of RESOURCES) expect(isResourceKey(r.key)).toBe(true);
    expect(isResourceKey('some-made-up-resource')).toBe(false);
  });

  it('returns the known catalogue\'s own label, in the language asked for, and the raw key for anything unknown', () => {
    expect(resourceLabel('money', 'en')).toBe('Money');
    expect(resourceLabel('money', 'bn')).toBe('টাকা');
    expect(resourceLabel('customerData', 'en')).toBe('Customer data');
    expect(resourceLabel('nope', 'en')).toBe('nope');
  });
});

describe('LEVELS / isPermissionLevel', () => {
  it('is exactly alone, propose, none — in that order', () => {
    expect(LEVELS).toEqual(['alone', 'propose', 'none']);
  });

  it('accepts only those three strings', () => {
    expect(isPermissionLevel('alone')).toBe(true);
    expect(isPermissionLevel('propose')).toBe(true);
    expect(isPermissionLevel('none')).toBe(true);
    expect(isPermissionLevel('maybe')).toBe(false);
    expect(isPermissionLevel('')).toBe(false);
  });
});

describe('DEFAULT_LEVEL', () => {
  it('is the safe, off-by-default level — never "alone" (CLAUDE.md rule 1, CN-018)', () => {
    expect(DEFAULT_LEVEL).toBe('propose');
  });
});

describe('agentMayActAlone / agentMayProposeOrAct', () => {
  it('agentMayActAlone is true for "alone" only', () => {
    expect(agentMayActAlone('alone')).toBe(true);
    expect(agentMayActAlone('propose')).toBe(false);
    expect(agentMayActAlone('none')).toBe(false);
  });

  it('agentMayProposeOrAct is true for anything but "none"', () => {
    expect(agentMayProposeOrAct('alone')).toBe(true);
    expect(agentMayProposeOrAct('propose')).toBe(true);
    expect(agentMayProposeOrAct('none')).toBe(false);
  });
});
