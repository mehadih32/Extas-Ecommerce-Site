// S19 · PR 362 follow-up (go-live day). Run on the VM by .github/workflows/golive-domain.yml: the application-data
// half of the main-domain switch (RUNBOOK.md §0 "the main domain is added to the store as its primary domain",
// S17's own Stores page) — the Caddy half is tools/golive-switch.mjs. Connects straight to PostgreSQL
// (DATABASE_DIRECT_URL), like the schema migrations. Never prints a connection string or a password.
//   tsx src/cli-primary-domain.ts --domain <host> --confirm "GO LIVE <host>"
import { PrismaClient } from './client';
import { setPrimaryDomain } from './primary-domain';

/** The exact words the go-ahead is typed as (same convention as tools/golive-switch.mjs). */
export const confirmPhrase = (domain: string) => `GO LIVE ${domain}`;

export function parseArgs(argv: string[]): { domain: string; confirm: string | null } {
  const a: { domain: string; confirm: string | null } = { domain: '', confirm: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--domain') a.domain = argv[++i] ?? '';
    else if (k === '--confirm') a.confirm = argv[++i] ?? '';
    else throw new Error(`unknown argument: ${k}`);
  }
  return a;
}

async function main(argv: string[] = process.argv.slice(2), log: (s: string) => void = console.log): Promise<number> {
  const a = parseArgs(argv);
  if (!a.domain) {
    log('usage: cli-primary-domain.ts --domain <host> --confirm "GO LIVE <host>"');
    return 2;
  }
  const phrase = confirmPhrase(a.domain);
  if (a.confirm !== phrase) {
    log(`Nothing written. Run again with: --confirm "${phrase}"`);
    return a.confirm === null ? 0 : 2;
  }
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    log('cli-primary-domain: DATABASE_DIRECT_URL is not set');
    return 1;
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const r = await setPrimaryDomain(prisma, a.domain);
    log(`primary domain: ${r.hostname} (store ${r.storeId}) ${r.created ? 'created' : 'updated'}${r.demoted.length ? `; demoted: ${r.demoted.join(', ')}` : ''}`);
    return 0;
  } catch (error) {
    log(`cli-primary-domain: FAILED — ${String(error instanceof Error ? error.message : error).split('\n').filter(Boolean).slice(-1)[0] ?? 'unknown error'}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
