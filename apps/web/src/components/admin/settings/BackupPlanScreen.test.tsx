// PR 842 — Backups & restore as the prototype draws it: "Back up now" in the page head, the Schedule card with the line about
// how many checked copies Google Drive keeps (from the setting, never a fixed 3), "Run drill now"; both languages have every word.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../../messages/admin-backups.bn.json';
import en from '../../../../messages/admin-backups.en.json';
import type { Dict } from '@/lib/i18n';
import { BackupNowButton, BackupSettingsCard, RequestsCard, type BackupSettings } from './BackupPlanScreen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const dict = (m: unknown) => ({ backups: m }) as unknown as Dict;
const values = {
  drive: { keepCopies: 5, keepDriveDays: 30 },
  plan: { dailyTime: '03:00', keepLocalDays: 7, keepBlobDays: 30, keepLocalWalDays: 3, minFreePct: 10, folderName: 'x' },
  drill: { enabled: true, day: 1, time: '04:00', blob: true, drive: true },
  alerts: { telegramOnFail: true, telegramOnSuccess: false },
  blob: { container: 'backups' },
  gate: { freshHours: 30, drillDays: 40 },
} as unknown as BackupSettings;

describe('Backups & restore (PR 842)', () => {
  it('shows the head button only to someone who may back up', () => {
    expect(renderToStaticMarkup(<BackupNowButton d={dict(en)} canRun />)).toContain('Back up now');
    expect(renderToStaticMarkup(<BackupNowButton d={dict(en)} canRun={false} />)).toBe('');
  });
  it('titles the settings card Schedule and says how many copies Drive keeps from the setting', () => {
    const html = renderToStaticMarkup(<BackupSettingsCard d={dict(en)} values={values} defaults={values} canWrite />);
    expect(html).toContain('Schedule');
    expect(html).toContain('Google Drive always keeps the newest 5.');
    const none = renderToStaticMarkup(<BackupSettingsCard d={dict(en)} values={{ ...values, drive: { ...values.drive, keepCopies: 0 } } as never} defaults={values} canWrite />);
    expect(none).not.toContain('always keeps the newest');
  });
  it('names the drill button as the prototype does, in both languages', () => {
    const html = renderToStaticMarkup(<RequestsCard d={dict(en)} locale="en" timeZone="UTC" initial={[]} canRun />);
    expect(html).toContain('Run drill now');
    expect(renderToStaticMarkup(<RequestsCard d={dict(bn)} locale="bn" timeZone="UTC" initial={[]} canRun />)).toContain('এখনই মহড়া');
  });
  it('has the Restore guide (PDF) button for everyone who can see the card, pointing at the guide route (PR 852)', () => {
    for (const canRun of [true, false]) {
      const html = renderToStaticMarkup(<RequestsCard d={dict(en)} locale="en" timeZone="UTC" initial={[]} canRun={canRun} />);
      expect(html).toContain('Restore guide (PDF)');
      expect(html).toContain('href="/api/admin/backups/restore-guide"');
    }
    expect(renderToStaticMarkup(<RequestsCard d={dict(bn)} locale="bn" timeZone="UTC" initial={[]} canRun />)).toContain('রিস্টোর গাইড (PDF)');
  });
  it('has the same words in both languages', () => {
    const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
});
