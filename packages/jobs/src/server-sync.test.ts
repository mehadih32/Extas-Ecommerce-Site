// S19 · PR 392 — the vault's keys for the server's scripts: only a LIVE, switched-on Telegram connection reaches the
// server; values are shell-safe; an unchanged fingerprint reads nothing from the vault.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { envLines, journeysSettingsPart, serverSync, shellValue, speedSettingsPart, type PartContext, type SyncDeps } from './server-sync';

type Row = { id: string; kind: string; provider: string; mode: string; enabled: boolean; config: unknown; storeId: number | null; archivedAt: Date | null; createdAt: Date };

function deps(rows: Row[], secrets: Record<string, string>) {
  const reads: string[] = [];
  const d = {
    db: { integration: { findMany: async () => rows.filter((r) => r.storeId === null && r.archivedAt === null) } },
    vault: {
      list: async () => Object.keys(secrets).map((name) => ({ name, storeId: null, revoked: false, keyVersion: 1, updatedAt: new Date('2026-10-31T00:00:00Z') })),
      get: async (name: string) => {
        reads.push(name);
        return secrets[name] ?? null;
      },
    },
  } as unknown as SyncDeps;
  return { d, reads };
}

const tg = (over: Partial<Row> = {}): Row => ({
  id: 'i1', kind: 'TELEGRAM', provider: 'telegram', mode: 'LIVE', enabled: true, config: { chatId: '-1001' }, storeId: null, archivedAt: null, createdAt: new Date(), ...over,
});
const TOKEN = '1234567:BBHdqTcvCH1vGWJxfSeofSAs0K5PALDsawZ';

describe('server sync (PR 392)', () => {
  it('a LIVE Telegram connection becomes telegram.env, single-quoted', async () => {
    const { d } = deps([tg()], { 'telegram.botToken': TOKEN });
    const r = await serverSync(d);
    expect(r.files?.['telegram.env']).toBe(`TELEGRAM_BOT_TOKEN='${TOKEN}'\nTELEGRAM_CHAT_ID='-1001'\n`);
    expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a MOCK, switched-off or store-only connection leaves the file empty (alerts stay in the server log)', async () => {
    for (const row of [tg({ mode: 'MOCK' }), tg({ enabled: false }), tg({ storeId: 3 }), tg({ archivedAt: new Date() }), tg({ config: {} })]) {
      const { d } = deps([row], { 'telegram.botToken': TOKEN });
      expect((await serverSync(d)).files?.['telegram.env']).toBe('');
    }
    const { d } = deps([tg()], {});
    expect((await serverSync(d)).files?.['telegram.env']).toBe('');
  });

  it('no vault key on the server: everything empty, nothing read', async () => {
    const { d } = deps([tg()], { 'telegram.botToken': TOKEN });
    const noVault = (await serverSync({ ...d, vault: null })).files!;
    expect({ ...noVault, 'backup-settings.env': undefined, 'journeys-settings.env': undefined }).toEqual({ 'telegram.env': '', 'backup.env': '', 'backup.key': '', 'backup-settings.env': undefined, 'origin-cert.pem': '', 'origin-key.pem': '', 'first-week.env': '', 'journeys-settings.env': undefined, 'speed-settings.env': "VITALS_REQUESTED=''\n" });
    // PR 507: the backup settings need no key, so they are there before the vault is
    expect(noVault['backup-settings.env']).toContain("BACKUP_TIME='02:30'\n");
    // PR 414: the journeys' schedule too (off as it ships)
    expect(noVault['journeys-settings.env']).toContain("JOURNEYS_ON='no'\n");
  });

  it('PR 414: the journeys file from the setting; "Run now" as seconds, and a new press changes the fingerprint', async () => {
    const ctx = (v?: unknown) => ({ db: null, vault: null, connections: [], secret: async () => null, ...(v ? { settings: { value: async (k: string) => (k === 'health.journeys' ? v : undefined) } } : {}) }) as unknown as PartContext;
    expect((await journeysSettingsPart.build(ctx())).split('\n').filter(Boolean)).toEqual([
      "JOURNEYS_ON='no'",
      "JOURNEYS_EVERY='daily'",
      "JOURNEYS_HOUR='6'",
      "JOURNEYS_WEEKDAY='5'",
      "JOURNEYS_KEEP='30'",
      "JOURNEYS_REQUESTED=''",
      "JOURNEYS_UI=''",
    ]);
    const set = { enabled: true, every: 'weekly', hour: 22, weekday: 1, keepRuns: 5, runRequestedAt: '2026-10-31T10:00:00.000Z' };
    const env = await journeysSettingsPart.build(ctx(set));
    expect(env).toContain("JOURNEYS_ON='yes'\nJOURNEYS_EVERY='weekly'\nJOURNEYS_HOUR='22'\nJOURNEYS_WEEKDAY='1'\nJOURNEYS_KEEP='5'\n");
    expect(env).toContain(`JOURNEYS_REQUESTED='${Date.parse(set.runRequestedAt) / 1000}'\n`);
    expect(await journeysSettingsPart.watch!(ctx(set))).toEqual([set, registry['health.uiChecks'].default]);
  });

  it('PR 416: the UI checks the owner switched on go to the journeys file; off or none chosen is empty', async () => {
    const ctx = (ui: unknown) => ({ db: null, vault: null, connections: [], secret: async () => null, settings: { value: async (k: string) => (k === 'health.uiChecks' ? ui : undefined) } }) as unknown as PartContext;
    const on = { enabled: true, layout: true, text: false, images: true, taps: true };
    expect(await journeysSettingsPart.build(ctx(on))).toContain("JOURNEYS_UI='layout,images,taps'\n");
    expect(await journeysSettingsPart.build(ctx({ ...on, enabled: false }))).toContain("JOURNEYS_UI=''\n");
    expect(await journeysSettingsPart.build(ctx({ enabled: true, layout: false, text: false, images: false, taps: false }))).toContain("JOURNEYS_UI=''\n");
    const before = await journeysSettingsPart.watch!(ctx(on));
    expect(await journeysSettingsPart.watch!(ctx({ ...on, text: true }))).not.toEqual(before);
  });

  it('PR 402: the first-week watch reaches the server only once started, with its end worked out', async () => {
    const { d } = deps([], {});
    const at = (fw: unknown) => serverSync({ ...d, settings: { value: async (k: string) => (k === 'golive.firstWeek' ? fw : registry[k as keyof typeof registry].default) } });
    const base = { enabled: true, startedAt: '2026-11-05T15:00:00.000Z', days: 7, smokeEveryHours: 4, dailyTime: '20:30' };
    expect((await at(base)).files?.['first-week.env']).toBe(
      "FIRST_WEEK_START='2026-11-05T15:00:00.000Z'\nFIRST_WEEK_UNTIL='2026-11-12T15:00:00.000Z'\nFIRST_WEEK_DAILY_TIME='20:30'\nFIRST_WEEK_SMOKE_H='4'\n",
    );
    expect((await at({ ...base, enabled: false })).files?.['first-week.env']).toBe('');
    expect((await at({ ...base, startedAt: null })).files?.['first-week.env']).toBe('');
    expect((await at(base)).fingerprint).not.toBe((await at({ ...base, days: 8 })).fingerprint);
  });

  it('the same fingerprint again reads nothing from the vault; a change reads again', async () => {
    const rows = [tg()];
    const { d, reads } = deps(rows, { 'telegram.botToken': TOKEN });
    const first = await serverSync(d);
    expect(reads).toEqual(['telegram.botToken', 'googleDrive.backupKey']);
    const again = await serverSync(d, { previous: first.fingerprint });
    expect(again).toEqual({ fingerprint: first.fingerprint, files: null });
    expect(reads).toHaveLength(2);
    rows[0] = tg({ config: { chatId: '-1002' } });
    const changed = await serverSync(d, { previous: first.fingerprint });
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(changed.files?.['telegram.env']).toContain("TELEGRAM_CHAT_ID='-1002'");
  });

  it('shell values: a quote cannot end the value, a line break is refused, names are checked', () => {
    expect(shellValue(`a'b; rm -rf /`)).toBe(`'a'\\''b; rm -rf /'`);
    expect(() => shellValue('a\nb')).toThrow(/line break/);
    expect(() => envLines({ 'bad-name': 'x' })).toThrow(/not an env name/);
  });

  it('PR 417: "Measure now" on the Speed page as seconds; a new press changes the fingerprint', async () => {
    const ctx = (v?: unknown) => ({ db: null, vault: null, connections: [], secret: async () => null, ...(v ? { settings: { value: async (k: string) => (k === 'health.speed' ? v : undefined) } } : {}) }) as unknown as PartContext;
    expect(await speedSettingsPart.build(ctx())).toBe("VITALS_REQUESTED=''\n");
    const set = { months: 12, runRequestedAt: '2026-10-31T10:00:00.000Z' };
    expect(await speedSettingsPart.build(ctx(set))).toBe(`VITALS_REQUESTED='${Date.parse(set.runRequestedAt) / 1000}'\n`);
    expect(await speedSettingsPart.watch!(ctx(set))).not.toEqual(await speedSettingsPart.watch!(ctx({ ...set, runRequestedAt: '2026-10-31T11:00:00.000Z' })));
    expect(await speedSettingsPart.watch!(ctx(set))).toEqual(await speedSettingsPart.watch!(ctx({ ...set, months: 6 })));
  });
});
