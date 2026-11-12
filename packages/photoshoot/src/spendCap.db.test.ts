// S24 · PR 468 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): `ensurePhotoshootAgentRow` against
// the actual `AiAgent` table — seeds the row once, is idempotent, and never touches the owner's own `enabled`,
// `monthlyCapMinor`, `keepOnWhenMasterOff` or `schedule` once he has set them (the same guarantee admin-ai's own
// `ensureAgentRows` makes for the seven fixed agents, PR 304).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { ensurePhotoshootAgentRow, PHOTOSHOOT_AGENT_CODE, PHOTOSHOOT_AGENT_KEY, PHOTOSHOOT_AGENT_NAME_EN } from './spendCap';

describe.skipIf(!HAS_TEST_DB)('PR 468 · ensurePhotoshootAgentRow (PostgreSQL)', () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_agent_seed');
  });

  afterAll(async () => t.drop());

  it('creates the row once, off, with no cap — never an invented number (CN-018)', async () => {
    const row = await ensurePhotoshootAgentRow(t.prisma);
    expect(row.key).toBe(PHOTOSHOOT_AGENT_KEY);
    expect(row.code).toBe(PHOTOSHOOT_AGENT_CODE);
    expect(row.nameEn).toBe(PHOTOSHOOT_AGENT_NAME_EN);
    expect(row.isChief).toBe(false);
    expect(row.enabled).toBe(false);
    expect(row.monthlyCapMinor).toBeNull();
    expect(row.keepOnWhenMasterOff).toBe(false);
    expect(await t.prisma.aiAgent.count({ where: { key: PHOTOSHOOT_AGENT_KEY } })).toBe(1);
  });

  it('is idempotent and never touches the owner\'s own enabled/cap/keep-on/schedule once set', async () => {
    await ensurePhotoshootAgentRow(t.prisma);
    await t.prisma.aiAgent.update({ where: { key: PHOTOSHOOT_AGENT_KEY }, data: { enabled: true, monthlyCapMinor: 50000, keepOnWhenMasterOff: true, schedule: { kind: 'always' } } });

    const again = await ensurePhotoshootAgentRow(t.prisma);
    expect(again.enabled).toBe(true);
    expect(again.monthlyCapMinor).toBe(50000);
    expect(again.keepOnWhenMasterOff).toBe(true);
    expect(again.schedule).toEqual({ kind: 'always' });
    expect(await t.prisma.aiAgent.count({ where: { key: PHOTOSHOOT_AGENT_KEY } })).toBe(1); // still exactly one row
  });

  it('is never counted among the seven fixed EXTAS agents — a distinct key, outside that roster', async () => {
    await ensurePhotoshootAgentRow(t.prisma);
    const row = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: PHOTOSHOOT_AGENT_KEY } });
    expect(['gyani', 'prohori', 'bhandari', 'sawdagor', 'shilpi', 'doot', 'tirondaj']).not.toContain(row.key);
  });
});
