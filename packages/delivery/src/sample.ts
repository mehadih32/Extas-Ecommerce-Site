// The SAMPLE gazetteer shipped in this repository (data/gazetteer-sample.csv, made by scripts/make-sample-gazetteer.mjs
// from public place names only). Not exported from the package root: it reads a file next to the package, which a
// bundler cannot follow; the command line and the tests import it directly.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readGazetteerCsv, type GazetteerRow } from './csv';

export const SAMPLE_GAZETTEER_PATH = fileURLToPath(new URL('../data/gazetteer-sample.csv', import.meta.url));

export function sampleGazetteerRows(path: string = SAMPLE_GAZETTEER_PATH): GazetteerRow[] {
  return readGazetteerCsv(readFileSync(path, 'utf8'));
}
