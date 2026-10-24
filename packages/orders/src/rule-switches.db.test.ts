// S06 · PR 544 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL) — the rule master switches: one list of
// every fraud and duplicate rule (the duplicate check, its rules A–E, H, I, the two-size check, the identity graph, the
// risk score with each signal, the risk sections) with its own switch, as each setting ships it (nothing changes by
// default); a switch writes only its own `enabled`, all-or-nothing, refused on a stale list, audited, and behind its
// own permissions. Switching never blocks anyone or decides an order. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { DUPLICATE_SCENARIOS, RISK_SIGNAL_KEYS, registry, type Key } from '@extas/settings';
import { riskRules, RULE_DEFS, switchRules, type OrdersDeps } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 544 · the rule master switches (PostgreSQL)', () => {
  let f: OrdersFixture;
  /** The fixture's settings with a write side that keeps what is set (the app passes its SettingsResolver). */
  const d = () => {
    const base = f.ordersDeps();
    return { ...base, settings: { value: base.settings.value.bind(base.settings), set: async (k: Key, v: unknown) => void f.overrides.set(k, v) } } as OrdersDeps & { settings: OrdersDeps['settings'] & { set: (k: Key, v: unknown) => Promise<void> } };
  };

  beforeAll(async () => {
    f = await setUpOrders('rule_switches');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('one list of every rule, each as its setting ships it, with words in both languages', async () => {
    const list = await riskRules(d(), f.staff);
    const keys = list.rules.map((r) => r.key);
    expect(keys).toEqual(RULE_DEFS.map((x) => x.key));
    expect(keys).toEqual(expect.arrayContaining(['orders.duplicates', 'risk.duplicateRules', ...DUPLICATE_SCENARIOS.map((s) => `risk.duplicateRules.${s}`), 'orders.twoSize', 'risk.identity', 'risk.score', ...RISK_SIGNAL_KEYS.map((k) => `risk.signals.${k}`), 'risk.sections']));
    for (const r of list.rules) {
      expect(r.enabled, r.key).toBe(r.byDefault);
      expect(r.label.en, r.key).toBeTruthy();
      expect(r.label.bn, r.key).toBeTruthy();
    }
    const by = new Map(list.rules.map((r) => [r.key, r]));
    // as today (CN-018): the duplicate check on, its rules engine and the score off, rule A on under an off master
    expect(by.get('orders.duplicates')).toMatchObject({ enabled: true, active: true });
    expect(by.get('risk.duplicateRules')).toMatchObject({ enabled: false, active: false, parent: 'orders.duplicates' });
    expect(by.get('risk.duplicateRules.A')).toMatchObject({ enabled: true, active: false, parent: 'risk.duplicateRules' });
    expect(by.get('risk.signals.refusals')).toMatchObject({ enabled: registry['risk.signals'].default.refusals.enabled, active: false, parent: 'risk.score' });
    expect(list.version).toMatch(/^[0-9a-f]{16}$/);
  });

  it('a switch writes only its own enabled; several at once; active follows the switches above', async () => {
    const before = await riskRules(d(), f.staff);
    const after = await switchRules(d(), f.staff, { version: before.version, switches: { 'risk.duplicateRules': true, 'risk.duplicateRules.B': false, 'risk.signals.newPhone': false } });
    const by = new Map(after.rules.map((r) => [r.key, r]));
    expect(by.get('risk.duplicateRules')).toMatchObject({ enabled: true, active: true });
    expect(by.get('risk.duplicateRules.A')).toMatchObject({ enabled: true, active: true });
    expect(by.get('risk.duplicateRules.B')).toMatchObject({ enabled: false, active: false });
    expect(by.get('risk.signals.newPhone')).toMatchObject({ enabled: false });
    expect(after.version).not.toBe(before.version);
    // every other number of the settings stays as it was
    const dup = f.overrides.get('risk.duplicateRules') as typeof registry['risk.duplicateRules']['default'];
    expect(dup).toEqual({ ...registry['risk.duplicateRules'].default, enabled: true, rules: { ...registry['risk.duplicateRules'].default.rules, B: { ...registry['risk.duplicateRules'].default.rules.B, enabled: false } } });
    const sig = f.overrides.get('risk.signals') as typeof registry['risk.signals']['default'];
    expect(sig.newPhone).toEqual({ ...registry['risk.signals'].default.newPhone, enabled: false });
    expect(sig.refusals).toEqual(registry['risk.signals'].default.refusals);
    const row = await f.t.prisma.auditLog.findFirst({ where: { action: 'risk.rules.switch' }, orderBy: { createdAt: 'desc' } });
    expect(row).toMatchObject({ before: { 'risk.duplicateRules': false, 'risk.duplicateRules.B': true, 'risk.signals.newPhone': true }, after: { 'risk.duplicateRules': true, 'risk.duplicateRules.B': false, 'risk.signals.newPhone': false } });
  });

  it('refused: a stale list, an unknown rule (nothing written), a bad body, and without the permissions', async () => {
    const now = await riskRules(d(), f.staff);
    expect(await code(switchRules(d(), f.staff, { version: '0000000000000000', switches: { 'risk.score': true } }))).toBe('STALE');
    expect(await code(switchRules(d(), f.staff, { switches: { 'risk.score': true, 'risk.blockEveryone': true } }))).toBe('NOT_FOUND');
    expect((await riskRules(d(), f.staff)).version).toBe(now.version);
    expect(await code(switchRules(d(), f.staff, { switches: {} }))).toBe('INVALID_INPUT');
    expect(await code(switchRules(d(), f.staff, { switches: { 'risk.score': 'yes' } }))).toBe('INVALID_INPUT');
    expect(await code(riskRules(d(), f.reader))).toBe('FORBIDDEN');
    expect(await code(switchRules(d(), f.reader, { switches: { 'risk.score': true } }))).toBe('FORBIDDEN');
    // a switch that is already so writes nothing and logs nothing
    const n = await f.t.prisma.auditLog.count({ where: { action: 'risk.rules.switch' } });
    await switchRules(d(), f.staff, { switches: { 'orders.duplicates': true } });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'risk.rules.switch' } })).toBe(n);
  });
});
