// CN-029 Phase 2 · PR 621 — the demo ERP run (no database, no network): without the demo key it waits, calls nobody and
// fails nothing; with it, the checks run against the address and time-out of the settings, the write checks only when
// `erp.acceptance.demoWrites` is on; the report page carries a Bengali line for the owner and never the key.
// qa-gate B2: the vault is opened only when the demo key is listed, and a database that cannot be read (down, or its
// tables not the ones this version knows) is "not run" with a reason, never a failure.
import { describe, expect, it } from 'vitest';
import { ERP_ACCEPTANCE_DEMO_KEY, MockErpWorld, seedAcceptanceStyle } from '@extas/adapters';
import { demoAcceptancePage, errorLine, runDemoAcceptance, type DemoAcceptanceDeps } from './erp-acceptance';

const T0 = new Date('2026-10-30T04:00:00Z');

function deps(o: { key: string | null; writes?: boolean; vault?: boolean; revoked?: boolean }, w = new MockErpWorld()) {
  w.now = () => T0;
  const asked: string[] = [];
  const listed: string[] = [];
  const calls: string[] = [];
  const values: Record<string, unknown> = { 'erp.acceptance.demoBaseUrl': 'https://demo.example.test', 'erp.acceptance.timeoutSeconds': 5, 'erp.acceptance.demoWrites': o.writes ?? false };
  const d: DemoAcceptanceDeps = {
    settings: { value: async (k) => values[k] },
    vault:
      o.vault === false
        ? null
        : {
            list: async (scope) => {
              listed.push(`${scope.storeId ?? 'installation'}`);
              return o.key ? [{ name: ERP_ACCEPTANCE_DEMO_KEY, storeId: null, revoked: o.revoked ?? false, keyVersion: 1, updatedAt: T0 }] : [];
            },
            get: async (name, scope) => {
              asked.push(`${name}@${scope.storeId ?? 'installation'}`);
              return name === ERP_ACCEPTANCE_DEMO_KEY ? o.key : null;
            },
          },
    runId: 'TEST',
    now: () => T0,
    fetch: async (input, init) => {
      calls.push(String(input));
      return w.fetch(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init ?? {});
    },
  };
  return { d, asked, listed, calls, w };
}

describe('PR 621 · the acceptance run against the demo ERP', () => {
  it('without the demo key it waits: no call, nothing failed, the page says so in Bengali', async () => {
    for (const x of [deps({ key: null }), deps({ key: null, vault: false })]) {
      const o = await runDemoAcceptance(x.d);
      expect(o).toEqual({ state: 'WAITING_FOR_KEY' });
      expect(x.calls).toEqual([]);
      const page = demoAcceptancePage(o, T0);
      expect(page).toContain('ডেমো ERP-এর চাবির অপেক্ষায়');
      expect(page).toContain('waiting for the demo key');
    }
    // qa-gate B2: only the installation's list of names is read; with no demo key the vault is never opened.
    const one = deps({ key: null });
    await runDemoAcceptance(one.d);
    expect([one.listed, one.asked]).toEqual([['installation'], []]);
    // A revoked demo key is no key.
    const gone = deps({ key: 'sample-revoked', revoked: true });
    expect(await runDemoAcceptance(gone.d)).toEqual({ state: 'WAITING_FOR_KEY' });
    expect(gone.asked).toEqual([]);
    // With the key set, it is opened from the installation's vault only.
    const w = new MockErpWorld();
    seedAcceptanceStyle({ world: w });
    const set = deps({ key: w.defaultKey }, w);
    await runDemoAcceptance(set.d);
    expect(set.asked).toEqual([`${ERP_ACCEPTANCE_DEMO_KEY}@installation`]);
  });

  it('qa-gate B2: a database whose tables are not the ones this version knows is "not run" with the reason; nothing called', async () => {
    // What Prisma throws for a renamed column (P2022): its first line is blank, then the call, then why.
    const prismaLike = Object.assign(new Error('\nInvalid `prisma.installationSecret.findMany()` invocation in\n/repo/packages/vault/src/vault.ts:154:40\n\n  151 …\nThe column `InstallationSecret.name` does not exist in the current database.'), { name: 'PrismaClientKnownRequestError', code: 'P2022' });
    for (const where of ['list', 'get', 'settings'] as const) {
      const w = new MockErpWorld();
      const x = deps({ key: w.defaultKey }, w);
      if (where === 'settings') x.d.settings = { value: async () => { throw prismaLike; } };
      else x.d.vault = { list: where === 'list' ? async () => { throw prismaLike; } : x.d.vault!.list, get: where === 'get' ? async () => { throw prismaLike; } : x.d.vault!.get };
      const o = await runDemoAcceptance(x.d);
      expect([where, o.state]).toEqual([where, 'NOT_RUN']);
      if (o.state !== 'NOT_RUN') throw new Error('expected not run');
      expect(o.reason).toMatch(/^the shop's database could not be read: P2022: The column `InstallationSecret.name` does not exist/);
      expect(x.calls).toEqual([]);
      const page = demoAcceptancePage(o, T0);
      expect(page).toContain('পরীক্ষা চালানো যায়নি');
      expect(page).toContain('not run. the shop');
      expect(page).not.toContain('..');
    }
  });

  it('qa-gate N1: an error in one line is never blank and never carries a database password', () => {
    expect(errorLine(Object.assign(new Error('\n\nInvalid `prisma.x.findMany()` invocation in\n/repo/a.ts:1:1\n\nCan\'t reach database server at `postgresql://extas:s3cret@db:5432`'), { code: 'P1001' }))).toBe("P1001: Can't reach database server at `postgresql://…@db:5432`");
    expect(errorLine(new Error(''))).toBe('Error');
    expect(errorLine(Object.assign(new Error('\n'), { code: 'P2022' }))).toBe('P2022');
    expect(errorLine('plain words')).toBe('plain words');
  });

  it('with the key it calls the demo address from the settings; writes off: only reads; the page never shows the key', async () => {
    const w = new MockErpWorld();
    seedAcceptanceStyle({ world: w });
    const x = deps({ key: w.defaultKey }, w);
    const o = await runDemoAcceptance(x.d);
    if (o.state !== 'RAN') throw new Error('expected a run');
    expect(o.report).toMatchObject({ target: 'demo', writes: false, driver: false, failed: 0, unreachable: false });
    expect(x.calls.every((u) => u.startsWith('https://demo.example.test/api/v1/ecommerce/'))).toBe(true);
    expect(w.v6().orders.size).toBe(0);
    const page = demoAcceptancePage(o, T0);
    expect(page).toMatch(/^# ERP acceptance — demo ERP\n\n\*\*সারকথা:\*\* সব ঠিক/);
    expect(page).not.toContain(w.defaultKey);
  });

  it('with demo writes on, the write checks run too (the ERP`s own actions stay SKIP)', async () => {
    const w = new MockErpWorld();
    seedAcceptanceStyle({ world: w });
    const o = await runDemoAcceptance(deps({ key: w.defaultKey, writes: true }, w).d);
    if (o.state !== 'RAN') throw new Error('expected a run');
    expect(o.report.failed).toBe(0);
    expect(o.report.results.filter((r) => r.status === 'SKIP').every((r) => r.kind === 'driver')).toBe(true);
    expect(w.v6().orders.size).toBeGreaterThan(0);
  });

  it('a refused demo key and an unreachable demo ERP are reported for the owner and fail no check', async () => {
    const w = new MockErpWorld();
    const bad = await runDemoAcceptance(deps({ key: 'sample-wrong-key' }, w).d);
    if (bad.state !== 'RAN') throw new Error('expected a run');
    expect([bad.report.keyRefused, bad.report.unreachable, bad.report.failed]).toEqual([true, false, 0]);
    expect(demoAcceptancePage(bad, T0)).toContain('চাবিটা আবার দিন');
    const down = deps({ key: w.defaultKey }, w);
    down.d.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const off = await runDemoAcceptance(down.d);
    if (off.state !== 'RAN') throw new Error('expected a run');
    expect([off.report.keyRefused, off.report.unreachable, off.report.failed]).toEqual([false, true, 0]);
    expect(demoAcceptancePage(off, T0)).toContain('পৌঁছানো গেল না');
  });
});
