// PR 863 — the one-report schedule (Reports › Schedule, PR 854): defaults, saving, the rules the server keeps (a channel when it is on, a real
// hour, a real report name), turning it off keeps the hour, and each store has its own. Runs without a database: permission is allowed and
// the `ReportSchedule` table is a small in-memory stand-in (the real table is covered by the database tests of the job that sends them).
import { describe, expect, it, vi } from 'vitest';

vi.mock('@extas/auth', async (orig) => ({ ...(await orig<typeof import('@extas/auth')>()), requirePermission: vi.fn(async () => undefined) }));

import { reportSchedule, saveReportSchedule, REPORT_SCHEDULE_KEY, REPORT_SCHEDULE_TIMES, type CatalogueDeps, type Who } from '../src';

type Row = { storeId: number; reportKey: string; frequency: string; channels: string[]; enabled: boolean; recipients: unknown; lastSentAt: Date | null };

function fake() {
  const rows: Row[] = [];
  const at = (k: { storeId: number; reportKey: string }) => rows.find((r) => r.storeId === k.storeId && r.reportKey === k.reportKey);
  const db = {
    reportSchedule: {
      findUnique: async ({ where }: { where: { storeId_reportKey: { storeId: number; reportKey: string } } }) => at(where.storeId_reportKey) ?? null,
      upsert: async ({ where, create, update }: { where: { storeId_reportKey: { storeId: number; reportKey: string } }; create: Row; update: Partial<Row> }) => {
        const r = at(where.storeId_reportKey);
        if (r) Object.assign(r, update);
        else rows.push({ lastSentAt: null, ...create });
      },
    },
  };
  return { rows, deps: { db, settings: { value: async () => null } } as unknown as CatalogueDeps };
}
const who = (storeId = 1): Who => ({ actor: { staffUserId: 'u1' }, storeId });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe('Report schedule (PR 854, tests PR 863)', () => {
  it('a report never scheduled is off, weekly at 09:00, to Telegram', async () => {
    const { deps } = fake();
    expect(await reportSchedule(deps, who(), 'products')).toEqual({ report: 'products', enabled: false, frequency: 'weekly', time: '09:00', channels: ['telegram'], lastSentAt: null });
  });

  it('saving keeps one row per report with the hour inside it', async () => {
    const { deps, rows } = fake();
    const saved = await saveReportSchedule(deps, who(), { report: 'profit', frequency: 'monthly', time: '18:00', channels: ['telegram', 'email'], enabled: true });
    expect(saved).toMatchObject({ report: 'profit', enabled: true, frequency: 'monthly', time: '18:00', channels: ['telegram', 'email'] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ storeId: 1, reportKey: `${REPORT_SCHEDULE_KEY}profit`, recipients: { time: '18:00' } });
    await saveReportSchedule(deps, who(), { report: 'profit', frequency: 'daily', time: '08:00', channels: ['email'], enabled: true });
    expect(rows).toHaveLength(1);
    expect((await reportSchedule(deps, who(), 'profit')).frequency).toBe('daily');
  });

  it('turning it off keeps the hour and the channels', async () => {
    const { deps } = fake();
    await saveReportSchedule(deps, who(), { report: 'areas', frequency: 'weekly', time: '21:00', channels: ['email'], enabled: true });
    const off = await saveReportSchedule(deps, who(), { report: 'areas', frequency: 'weekly', time: '21:00', channels: ['email'], enabled: false });
    expect(off).toMatchObject({ enabled: false, time: '21:00', channels: ['email'] });
  });

  it('refuses a schedule that is on with no channel, a wrong hour or a wrong report name', async () => {
    const { deps, rows } = fake();
    expect(await code(saveReportSchedule(deps, who(), { report: 'team', frequency: 'weekly', time: '09:00', channels: [], enabled: true }))).toBe('INVALID_INPUT');
    expect(await code(saveReportSchedule(deps, who(), { report: 'team', frequency: 'weekly', time: '25:99', channels: ['telegram'], enabled: true }))).toBe('INVALID_INPUT');
    expect(await code(saveReportSchedule(deps, who(), { report: 'Team Report!', frequency: 'weekly', time: '09:00', channels: ['telegram'], enabled: true }))).toBe('INVALID_INPUT');
    expect(await code(saveReportSchedule(deps, who(), { report: 'team', frequency: 'hourly' as never, time: '09:00', channels: ['telegram'], enabled: true }))).toBe('INVALID_INPUT');
    expect(await code(reportSchedule(deps, who(), '../etc'))).toBe('INVALID_INPUT');
    expect(rows).toHaveLength(0);
  });

  it('an off schedule with no channel is allowed (nothing will be sent)', async () => {
    const { deps } = fake();
    expect(await code(saveReportSchedule(deps, who(), { report: 'team', frequency: 'weekly', time: '09:00', channels: [], enabled: false }))).toBe('ok');
  });

  it('each store and each report has its own schedule', async () => {
    const { deps } = fake();
    await saveReportSchedule(deps, who(1), { report: 'orders', frequency: 'daily', time: '10:00', channels: ['telegram'], enabled: true });
    expect((await reportSchedule(deps, who(2), 'orders')).enabled).toBe(false);
    expect((await reportSchedule(deps, who(1), 'customers')).enabled).toBe(false);
    expect((await reportSchedule(deps, who(1), 'orders')).enabled).toBe(true);
  });

  it('the box offers the five hours of the prototype', () => {
    expect(REPORT_SCHEDULE_TIMES).toEqual(['08:00', '09:00', '10:00', '18:00', '21:00']);
  });
});
