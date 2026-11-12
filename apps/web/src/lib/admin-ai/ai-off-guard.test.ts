// S15 · PR 324 — reading back `tools/ai-off-guard.mjs`'s committed report: found beside the deployed docs (same
// `EXTAS_DOCS_DIR`/repository-roots resolution as `admin-shell/guide.ts`), and honestly absent (`null`), never
// invented, when no report exists yet or the file does not parse as one.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aiOffGuardReportFile, readAiOffGuardReport, type AiOffGuardReport } from './ai-off-guard';

const SAMPLE: AiOffGuardReport = {
  at: '2026-11-12T00:00:00.000Z',
  n: 7,
  ok: 7,
  totalJobCount: 65,
  coveredJobCount: 27,
  checks: [{ id: 'support', nameEn: 'Support replies', nameBn: 'সাপোর্টের উত্তর', fallbackEn: 'Saved replies', fallbackBn: 'সংরক্ষিত উত্তর', pass: true, jobKeys: ['supportReply'], reasons: [] }],
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
});
