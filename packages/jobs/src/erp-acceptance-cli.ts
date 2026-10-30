// CN-029 Phase 2 · PR 621 — `tsx src/erp-acceptance-cli.ts --out <dir> [--run <id>]`: the ERP v6 acceptance run against
// the demo ERP, on the server from the release's migrate image (infra/deploy/erp-acceptance.sh, called nightly by
// .github/workflows/erp-acceptance.yml and before every release by deploy.yml). It reads only DATABASE_URL (the
// settings and the vault's rows) and VAULT_MASTER_KEY (to open the demo key); it prints counts and check names only,
// never a key, an address or a customer. It writes <dir>/report.json and <dir>/README.md.
// Exit 0: passed, waiting for the demo key, the demo ERP could not be reached, or it refused the key (each reported; none
// is a failure of the shop, and the key is the owner's to type again), or not run because the shop's database could not
// be read (qa-gate B2: reported with the reason; the practice ERP in CI is the hard gate).
// Exit 1: a check failed (the release waits), or an error that is not the database's. Exit 2: wrong use.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { disconnectPrisma, getPrisma } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { createVault } from '@extas/vault';
import { demoAcceptancePage, errorLine, runDemoAcceptance, type DemoAcceptanceOutcome } from './erp-acceptance';

/** A Prisma error (the database is down, or its tables are not the ones this version knows): "not run", not a failure. */
const isDatabaseError = (e: unknown): boolean =>
  Boolean(e && typeof e === 'object' && (/^Prisma/.test((e as Error).name ?? '') || /^P\d{4}$/.test(String((e as { code?: unknown }).code ?? ''))));

function writeReport(out: string, outcome: DemoAcceptanceOutcome, now: Date): void {
  mkdirSync(out, { recursive: true });
  const json = outcome.state === 'RAN' ? { state: 'RAN', ...outcome.report } : outcome.state === 'NOT_RUN' ? { state: 'NOT_RUN', reason: outcome.reason, at: now.toISOString() } : { state: outcome.state, at: now.toISOString() };
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(json, null, 2)}\n`);
  writeFileSync(join(out, 'README.md'), demoAcceptancePage(outcome, now));
}

async function main(argv: string[]): Promise<number> {
  const at = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const out = at('--out');
  if (!out) {
    console.error('usage: erp-acceptance-cli.ts --out <dir> [--run <id>]');
    return 2;
  }
  if (!process.env.DATABASE_URL) {
    console.error('erp acceptance: DATABASE_URL is not set');
    return 2;
  }
  const now = new Date();
  const runId = (at('--run') ?? now.toISOString().replace(/\D/g, '').slice(0, 12)).replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'run';
  const db = getPrisma();
  try {
    const settings = new SettingsResolver(prismaBackend(db), registry);
    const master = process.env.VAULT_MASTER_KEY;
    const vault = master && master.length >= 32 ? createVault(db, master) : null;
    let outcome: DemoAcceptanceOutcome;
    try {
      outcome = await runDemoAcceptance({ settings, vault, runId });
    } catch (e) {
      if (!isDatabaseError(e)) throw e;
      outcome = { state: 'NOT_RUN', reason: `the shop's database could not be read: ${errorLine(e)}` };
    }
    writeReport(out, outcome, now);
    if (outcome.state === 'NOT_RUN') {
      console.log(`erp acceptance: not run (${outcome.reason}); nothing called, nothing failed`);
      return 0;
    }
    if (outcome.state === 'WAITING_FOR_KEY') {
      console.log('erp acceptance: waiting for the demo key (nothing called, nothing failed)');
      return 0;
    }
    const r = outcome.report;
    console.log(`erp acceptance: ${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped${r.unreachable ? ' (the demo ERP could not be reached)' : ''}${r.keyRefused ? ' (the demo ERP refused the key: the owner types it again)' : ''}`);
    for (const x of r.results.filter((y) => y.status === 'FAIL')) console.log(`  FAIL ${x.id}`);
    return r.failed ? 1 : 0;
  } finally {
    await disconnectPrisma();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`erp acceptance: ${errorLine(e)}`);
    process.exit(1);
  },
);
