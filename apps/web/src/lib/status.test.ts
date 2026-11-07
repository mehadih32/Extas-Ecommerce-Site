// Follow-up 575 (PR 621): the status page shows the last ERP acceptance run against the demo ERP
// (state/erp-acceptance.json, written by infra/deploy/erp-acceptance.sh): passed, failed, waiting for the demo key,
// not reached, key refused, not run, or not finished; none when the file is missing.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import dict from '../../messages/status.bn.json';
import { t } from './i18n';
import { erpAcceptanceLine, runtimeState } from './status';

describe('follow-up 575: the last ERP acceptance run on the status page', () => {
  const before = process.env.EXTAS_STATE_DIR;
  let dir = '';
  afterEach(() => {
    process.env.EXTAS_STATE_DIR = before;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('reads state/erp-acceptance.json with the other runtime files; a missing file is none', async () => {
    dir = mkdtempSync(join(tmpdir(), 'status-erp-'));
    process.env.EXTAS_STATE_DIR = dir;
    expect((await runtimeState()).erpAcceptance).toBeNull();
    writeFileSync(join(dir, 'erp-acceptance.json'), JSON.stringify({ at: '2026-11-06T22:00:00Z', exit: 0, state: 'RAN', passed: 14, failed: 0, skipped: 2, unreachable: false, keyRefused: false }));
    expect((await runtimeState()).erpAcceptance).toMatchObject({ state: 'RAN', passed: 14 });
  });

  it('one line for each outcome, with its tone; every word is in the Bengali file', () => {
    expect(erpAcceptanceLine(null)).toEqual({ key: 'erpNone', vars: {}, tone: 'soft' });
    expect(erpAcceptanceLine({ state: 'RAN', passed: 14, failed: 0, skipped: 2 })).toEqual({ key: 'erpOk', vars: { passed: 14, skipped: 2 }, tone: 'ok' });
    expect(erpAcceptanceLine({ state: 'RAN', passed: 12, failed: 2, skipped: 0 })).toEqual({ key: 'erpFail', vars: { failed: 2, passed: 12 }, tone: 'bad' });
    expect(erpAcceptanceLine({ state: 'RAN', passed: 0, failed: 0, unreachable: true })).toMatchObject({ key: 'erpUnreachable', tone: 'warn' });
    expect(erpAcceptanceLine({ state: 'RAN', passed: 0, failed: 0, keyRefused: true })).toMatchObject({ key: 'erpKeyRefused', tone: 'warn' });
    expect(erpAcceptanceLine({ state: 'WAITING_FOR_KEY' })).toMatchObject({ key: 'erpWaitingKey', tone: 'soft' });
    expect(erpAcceptanceLine({ state: 'NOT_RUN' })).toMatchObject({ key: 'erpNotRun', tone: 'warn' });
    expect(erpAcceptanceLine({ state: 'NOT_FINISHED' })).toMatchObject({ key: 'erpNotFinished', tone: 'bad' });
    expect(erpAcceptanceLine({ state: 'NOT_IN_VERSION' })).toMatchObject({ key: 'erpNone', tone: 'soft' });
    expect(erpAcceptanceLine({ state: 'SOMETHING' as never })).toMatchObject({ key: 'erpNone' });
    for (const key of ['erpTitle', 'erpNone', 'erpOk', 'erpFail', 'erpUnreachable', 'erpKeyRefused', 'erpWaitingKey', 'erpNotRun', 'erpNotFinished']) expect(t(dict, key), key).not.toBe(key);
  });
});
