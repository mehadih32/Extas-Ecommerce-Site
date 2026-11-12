// S15 · PR 324 — reading back `tools/ai-off-guard.mjs`'s committed report: found beside the deployed docs (same
// `EXTAS_DOCS_DIR`/repository-roots resolution as `admin-shell/guide.ts`), and honestly absent (`null`), never
// invented, when no report exists yet or the file does not parse as one.
// S15 · PR 506 extends the fixture and the type guard with `journey`/`journeyN`/`journeyOk` (see `./ai-off-guard.ts`).
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aiOffGuardReportFile, readAiOffGuardReport, type AiOffGuardReport } from './ai-off-guard';

const SAMPLE: AiOffGuardReport = {
  at: '2026-11-12T00:00:00.000Z',
  n: 11,
  ok: 11,
  totalJobCount: 68,
  coveredJobCount: 30,
  journeyN: 6,
  journeyOk: 6,
  checks: [
    { id: 'support', nameEn: 'Support replies', nameBn: 'সাপোর্টের উত্তর', fallbackEn: 'Saved replies', fallbackBn: 'সংরক্ষিত উত্তর', journey: true, pass: true, jobKeys: ['supportReply'], reasons: [] },
    { id: 'checkoutCod', nameEn: 'Placing a Cash-on-Delivery order', nameBn: 'ক্যাশ অন ডেলিভারিতে অর্ডার করা', fallbackEn: 'No AI on this path', fallbackBn: 'এই পথে AI নেই', journey: true, pass: true, jobKeys: [], reasons: [] },
  ],
};

async function docsFixture(): Promise<string> {
  const docsDir = await mkdtemp(join(tmpdir(), 'extas-ai-off-'));
  await mkdir(join(docsDir, 'docs', 'reports'), { recursive: true });
  return docsDir;
}

describe('the AI-off guard report (PR 324)', () => {
  it('is honestly absent on a fresh checkout with no report yet', async () => {
    const docsDir = await docsFixture();
    expect(aiOffGuardReportFile({} as NodeJS.ProcessEnv, docsDir)).toBeNull();
    expect(await readAiOffGuardReport({} as NodeJS.ProcessEnv, docsDir)).toBeNull();
  });

  it('reads the real, already-computed report once the tool has written it', async () => {
    const docsDir = await docsFixture();
    await writeFile(join(docsDir, 'docs', 'reports', 'ai-off-guard.json'), JSON.stringify(SAMPLE));
    expect(aiOffGuardReportFile({} as NodeJS.ProcessEnv, docsDir)).toBe(join(docsDir, 'docs', 'reports', 'ai-off-guard.json'));
    const read = await readAiOffGuardReport({} as NodeJS.ProcessEnv, docsDir);
    expect(read).toEqual(SAMPLE);
  });

  it('prefers EXTAS_DOCS_DIR over the given folder, the same way the admin guide panel does', async () => {
    const deployed = await docsFixture();
    const repo = await docsFixture();
    await writeFile(join(deployed, 'docs', 'reports', 'ai-off-guard.json'), JSON.stringify(SAMPLE));
    expect(await readAiOffGuardReport({ ...process.env, EXTAS_DOCS_DIR: deployed }, repo)).toEqual(SAMPLE);
  });

  it('never invents a report from a file that does not parse as one', async () => {
    const docsDir = await docsFixture();
    await writeFile(join(docsDir, 'docs', 'reports', 'ai-off-guard.json'), '{"not": "a report"}');
    expect(await readAiOffGuardReport({} as NodeJS.ProcessEnv, docsDir)).toBeNull();
    await writeFile(join(docsDir, 'docs', 'reports', 'ai-off-guard.json'), 'not even json');
    expect(await readAiOffGuardReport({} as NodeJS.ProcessEnv, docsDir)).toBeNull();
  });

  // PR 506: the report also carries journeyN/journeyOk, and a check may be `journey: true` — the UI reads these
  // straight off the already-computed report, same as every other field, never deriving them itself.
  it('is rejected (null) when journeyN/journeyOk are missing, same as any other required field', async () => {
    const docsDir = await docsFixture();
    const { journeyN, journeyOk, ...withoutJourney } = SAMPLE;
    await writeFile(join(docsDir, 'docs', 'reports', 'ai-off-guard.json'), JSON.stringify(withoutJourney));
    expect(await readAiOffGuardReport({} as NodeJS.ProcessEnv, docsDir)).toBeNull();
  });

  it('carries the journey flag and the journeyN/journeyOk counts through untouched', async () => {
    const docsDir = await docsFixture();
    await writeFile(join(docsDir, 'docs', 'reports', 'ai-off-guard.json'), JSON.stringify(SAMPLE));
    const read = await readAiOffGuardReport({} as NodeJS.ProcessEnv, docsDir);
    expect(read?.journeyN).toBe(6);
    expect(read?.journeyOk).toBe(6);
    expect(read?.checks.every((c) => c.journey)).toBe(true);
  });
});
