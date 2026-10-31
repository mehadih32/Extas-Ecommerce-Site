// S21 · PR 419 (B7.3) — `tsx src/run-history-cli.ts --tool smoke|journeys --dir <run folder>`: keeps one run of the
// smoke test or the saved journeys in SiteAuditRun with its findings (run-history.ts), on the server from the release's
// migrate image right after the run (infra/deploy/smoke.sh, journeys.sh). The folder holds the run's result.json (and,
// for the smoke test, rows.json). It reads only DATABASE_URL (or DATABASE_DIRECT_URL); it prints counts only.
// Exit 0: kept, known before, or not kept because the database could not be read (said; a run is never failed by its
// history). Exit 2: wrong use or no readable result.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { disconnectPrisma, getPrisma } from '@extas/db/client';
import { journeysRunInput, keepRun, smokeRunInput } from './run-history';

const readJson = (p: string): unknown => {
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as unknown;
  } catch {
    return null;
  }
};

async function main(argv: string[]): Promise<number> {
  const at = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const tool = at('--tool');
  const dir = at('--dir');
  if ((tool !== 'smoke' && tool !== 'journeys') || !dir) {
    console.error('usage: run-history-cli.ts --tool smoke|journeys --dir <run folder>');
    return 2;
  }
  process.env.DATABASE_URL ||= process.env.DATABASE_DIRECT_URL;
  if (!process.env.DATABASE_URL) {
    console.error('run history: DATABASE_URL is not set');
    return 2;
  }
  const resultPath = join(dir, 'result.json');
  let writtenAt: Date;
  try {
    writtenAt = statSync(resultPath).mtime;
  } catch {
    console.error('run history: no result.json in the run folder');
    return 2;
  }
  const input = tool === 'smoke' ? smokeRunInput(readJson(resultPath), readJson(join(dir, 'rows.json')), writtenAt) : journeysRunInput(readJson(resultPath), writtenAt);
  if (!input) {
    console.error('run history: the result could not be read');
    return 2;
  }
  try {
    const kept = await keepRun(getPrisma(), input);
    console.log(`run history: ${tool} run ${kept === 'kept' ? 'kept' : 'was kept before'} (${input.ok ? 'passed' : 'failed'}, ${input.findings.length} finding(s))`);
  } catch (e) {
    console.error(`run history: not kept, the database could not be written (${String((e as Error)?.name ?? 'error').slice(0, 60)})`);
  } finally {
    await disconnectPrisma().catch(() => {});
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  () => process.exit(0),
);
