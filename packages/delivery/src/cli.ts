// Command line of the delivery-zone engine. It connects straight to PostgreSQL (DATABASE_DIRECT_URL, else DATABASE_URL)
// and never prints a connection string — only counts and place codes.
//   tsx src/cli.ts import [file.csv] [--archive-missing] [--dry-run]
//        bring the gazetteer in line with the file (default: the sample, data/gazetteer-sample.csv); safe to re-run
//   tsx src/cli.ts import --deploy
//        what every deploy runs (the migrate image): keeps the SAMPLE list current, but only while no other list has
//        been imported — a real national list, once imported, is never overwritten by the sample
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { PrismaClient } from '@extas/db/client';
import { GazetteerFileError, readGazetteerCsv } from './csv';
import { describeImport, importGazetteer, lastImportSource } from './import';
import { SAMPLE_GAZETTEER_PATH } from './sample';

const SAMPLE_SOURCE = 'sample';
const oneLine = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error';

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const deploy = flags.has('--deploy');
  const given = rest.find((a) => !a.startsWith('--'));
  if (command !== 'import' || (deploy && given)) {
    console.error('usage: cli.ts import [file.csv] [--archive-missing] [--dry-run] | import --deploy');
    return 2;
  }
  const file = given ?? SAMPLE_GAZETTEER_PATH;
  const source = given ? basename(given) : SAMPLE_SOURCE;
  let rows;
  try {
    rows = readGazetteerCsv(readFileSync(file, 'utf8'));
  } catch (e) {
    if (e instanceof GazetteerFileError) {
      for (const p of e.problems.slice(0, 50)) console.error(`gazetteer file: line ${p.line}${p.field ? ` (${p.field})` : ''}: ${p.message}`);
      return 1;
    }
    console.error(`gazetteer file: ${oneLine(e)}`);
    return 1;
  }
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('gazetteer import: DATABASE_DIRECT_URL is not set');
    return 1;
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    if (deploy) {
      const last = await lastImportSource(prisma);
      if (last !== null && last !== SAMPLE_SOURCE) {
        console.log('gazetteer import: skipped — another list was imported, the sample never overwrites it');
        return 0;
      }
    }
    const report = await importGazetteer(prisma, rows, { source, archiveMissing: flags.has('--archive-missing'), dryRun: flags.has('--dry-run'), ctx: { source: 'cli' } });
    console.log(describeImport(report));
    return 0;
  } catch (e) {
    console.error(`gazetteer import: FAILED — ${oneLine(e)}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main(process.argv.slice(2));
