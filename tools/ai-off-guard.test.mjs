import { describe, expect, it } from 'vitest';
import { checkProofs, coveredKeys, parseJobCatalog, runGuard } from './ai-off-guard.mjs';

const CFG_CATALOG = { startMarker: 'export const JOB_CATALOG', endMarker: '] as const;' };

const SAMPLE = `
export const JOB_CATALOG = [
  textJob('aFirst', 'support', 'A', 'এ', "a description, with a comma and even a 'quoted' word", 'gyani', 100, 10, 'gemini-flash', 'note', 5),
  textJob('bSecond', 'orders', 'B', 'বি', 'plain', 'sawdagor', 10, 10, 'gemini-flash', 'note', 5),
  imageJob('cThird', 'studio', 'C', 'সি', 'plain', null, 1, 'fashn-core', 'note', 5),
] as const;
`;

describe('parseJobCatalog', () => {
  it('reads every call\'s key and agentKey, even past a comma/quote inside the description', () => {
    expect(parseJobCatalog(SAMPLE, CFG_CATALOG)).toEqual([
      { key: 'aFirst', agentKey: 'gyani' },
      { key: 'bSecond', agentKey: 'sawdagor' },
      { key: 'cThird', agentKey: null },
    ]);
  });
  it('returns nothing when the markers are not found (never guesses)', () => {
    expect(parseJobCatalog('no markers here', CFG_CATALOG)).toEqual([]);
  });
});

describe('coveredKeys', () => {
  const catalog = [{ key: 'supportReply' }, { key: 'supportClassify' }, { key: 'orderFraudJudge' }];
  it('matches by exact key and by prefix, never a key that no longer exists', () => {
    expect(coveredKeys({ jobKeyPrefixes: ['support'] }, catalog)).toEqual(['supportReply', 'supportClassify']);
    expect(coveredKeys({ jobKeys: ['orderFraudJudge'] }, catalog)).toEqual(['orderFraudJudge']);
    expect(coveredKeys({ jobKeys: ['renamedAway'] }, catalog)).toEqual([]);
  });
});

describe('checkProofs', () => {
  const files = { 'a.ts': 'alpha beta gamma' };
  const readFile = (f) => {
    if (!(f in files)) throw new Error('ENOENT');
    return files[f];
  };
  it('passes when every required substring is present', () => {
    expect(checkProofs({ proofs: [{ file: 'a.ts', mustInclude: ['alpha', 'gamma'] }] }, readFile)).toEqual([]);
  });
  it('reports exactly what is missing, never a vague failure', () => {
    expect(checkProofs({ proofs: [{ file: 'a.ts', mustInclude: ['alpha', 'delta'] }] }, readFile)).toEqual(['a.ts: missing "delta"']);
  });
  it('reports a missing file by name instead of throwing', () => {
    expect(checkProofs({ proofs: [{ file: 'missing.ts', mustInclude: ['x'] }] }, readFile)).toEqual(['missing.ts: not found']);
  });
});

describe('runGuard', () => {
  const cfg = {
    jobCatalog: CFG_CATALOG,
    checks: [
      { id: 'ok', nameEn: 'Ok', nameBn: 'ঠিক', fallbackEn: 'f', fallbackBn: 'ফ', jobKeyPrefixes: ['a'], proofs: [{ file: 'good.ts', mustInclude: ['present'] }] },
      { id: 'broken', nameEn: 'Broken', nameBn: 'ভাঙা', fallbackEn: 'f', fallbackBn: 'ফ', jobKeyPrefixes: ['b'], proofs: [{ file: 'good.ts', mustInclude: ['absent'] }] },
      { id: 'stale', nameEn: 'Stale', nameBn: 'পুরোনো', fallbackEn: 'f', fallbackBn: 'ফ', jobKeyPrefixes: ['nonExistentPrefix'], proofs: [{ file: 'good.ts', mustInclude: ['present'] }] },
    ],
  };
  const readFile = (f) => ({ 'good.ts': 'present' })[f];
  it('never invents a count — ok, n, and job coverage all come straight out of the scan', () => {
    const result = runGuard({ cfg, readFile, catalogText: SAMPLE, now: () => new Date('2026-11-12T00:00:00Z') });
    expect(result.at).toBe('2026-11-12T00:00:00.000Z');
    expect(result.n).toBe(3);
    expect(result.ok).toBe(1);
    expect(result.totalJobCount).toBe(3);
    expect(result.coveredJobCount).toBe(1); // only the passing check's job ('aFirst') is ever counted as covered
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
    expect(byId.ok.pass).toBe(true);
    expect(byId.ok.jobKeys).toEqual(['aFirst']);
    expect(byId.broken.pass).toBe(false);
    expect(byId.broken.reasons).toEqual(['good.ts: missing "absent"']);
    // a check whose job keys no longer exist in the catalogue fails honestly, as stale, rather than passing on 0 jobs
    expect(byId.stale.pass).toBe(false);
    expect(byId.stale.jobKeys).toEqual([]);
    expect(byId.stale.reasons).toEqual(['no JOB_CATALOG entry matches this check any more — it is stale']);
  });
  it('a failing check never counts its own jobs toward the covered total, even if the catalogue lists them', () => {
    const cfg2 = { jobCatalog: CFG_CATALOG, checks: [{ id: 'broken', nameEn: 'x', nameBn: 'x', fallbackEn: 'x', fallbackBn: 'x', jobKeyPrefixes: ['a', 'b'], proofs: [{ file: 'good.ts', mustInclude: ['absent'] }] }] };
    const result = runGuard({ cfg: cfg2, readFile, catalogText: SAMPLE, now: () => new Date() });
    expect(result.ok).toBe(0);
    expect(result.coveredJobCount).toBe(0);
  });

  // PR 506: a `journey: true` check proves a step of the ordinary customer journey has no AI job on its path at all
  // — it claims no JOB_CATALOG coverage on purpose, so it must pass on its proofs alone, never penalised as "stale".
  const journeyCfg = {
    jobCatalog: CFG_CATALOG,
    checks: [
      { id: 'journeyOk', nameEn: 'J', nameBn: 'জ', fallbackEn: 'f', fallbackBn: 'ফ', journey: true, jobKeys: [], proofs: [{ file: 'good.ts', mustInclude: ['present'] }] },
      { id: 'journeyBroken', nameEn: 'J2', nameBn: 'জ২', fallbackEn: 'f', fallbackBn: 'ফ', journey: true, jobKeys: [], proofs: [{ file: 'good.ts', mustInclude: ['absent'] }] },
      { id: 'notJourney', nameEn: 'N', nameBn: 'ন', fallbackEn: 'f', fallbackBn: 'ফ', jobKeyPrefixes: ['a'], proofs: [{ file: 'good.ts', mustInclude: ['present'] }] },
    ],
  };
  it('a journey check with zero job keys passes on its proofs alone, never flagged as stale', () => {
    const result = runGuard({ cfg: journeyCfg, readFile, catalogText: SAMPLE, now: () => new Date() });
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
    expect(byId.journeyOk.pass).toBe(true);
    expect(byId.journeyOk.journey).toBe(true);
    expect(byId.journeyOk.reasons).toEqual([]);
    expect(byId.notJourney.journey).toBe(false);
  });
  it('a journey check still fails honestly when its proof is missing, same as any other check', () => {
    const result = runGuard({ cfg: journeyCfg, readFile, catalogText: SAMPLE, now: () => new Date() });
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
    expect(byId.journeyBroken.pass).toBe(false);
    expect(byId.journeyBroken.reasons).toEqual(['good.ts: missing "absent"']);
  });
  it('journeyN/journeyOk count only the journey-tagged checks, never the rest', () => {
    const result = runGuard({ cfg: journeyCfg, readFile, catalogText: SAMPLE, now: () => new Date() });
    expect(result.journeyN).toBe(2);
    expect(result.journeyOk).toBe(1); // journeyOk passes, journeyBroken fails, notJourney is not counted either way
    expect(result.n).toBe(3);
  });
});
