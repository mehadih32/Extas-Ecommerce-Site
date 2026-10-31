// S19 · PR 392 — the vault's keys for the server's scripts: only a LIVE, switched-on Telegram connection reaches the
// server; values are shell-safe; an unchanged fingerprint reads nothing from the vault.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { envLines, serverSync, shellValue, type SyncDeps } from './server-sync';

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
    expect({ ...noVault, 'backup-settings.env': undefined }).toEqual({ 'telegram.env': '', 'backup.env': '', 'backup.key': '', 'backup-settings.env': undefined, 'origin-cert.pem': '', 'origin-key.pem': '', 'first-week.env': '' });
    // PR 507: the backup settings need no key, so they are there before the vault is
    expect(noVault['backup-settings.env']).toContain("BACKUP_TIME='02:30'\n");
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
});
