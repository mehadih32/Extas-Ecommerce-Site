// Command line of the seed package:
//   tsx src/cli.ts check                       PR 509 owner-data check (CI; no database)
//   tsx src/cli.ts pack --store <slug>         PR 508 apply the general default pack to one store
//   tsx src/cli.ts pack --all-stores           … to every store
//   tsx src/cli.ts mother-store                PR 508 a fresh installation's mother store (a draft, no name)
//   tsx src/cli.ts sample [--beside-live-store] PR 14 the sample catalogue (dev, CI and the preview only)
//   tsx src/cli.ts export --out <file>         PR 509 installation export, without the owner's own data
//   tsx src/cli.ts import --in <file> [--map <ref>=<storeId> …]
// Database commands connect straight to PostgreSQL (DATABASE_DIRECT_URL), like the schema migrations. Nothing here
// prints a connection string, a password or a value: only table names, keys and counts.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSchema } from '@extas/db';
import { PrismaClient } from '@extas/db/client';
import { ownerDataRegister, registry } from '@extas/settings';
import { guardDetectors } from './detectors';
import { exportInstallation, importInstallation, OwnerDataLeak } from './export';
import { ensureMotherStore, MotherStoreRefused } from './mother-store';
import { checkOwnerData, describeFindings } from './owner-data-check';
import { applyPack, applyPackToAllStores, defaultPack, type PackReport } from './pack';
import { sampleCatalogue, SampleSeedRefused, seedSample } from './sample';

const counts = (r: Record<string, number>) =>
  Object.entries(r)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${t} ${n}`)
    .join(', ') || 'nothing';

const packLine = (r: PackReport) =>
  `pack ${r.packKey} v${r.version} → store ${r.storeId}: ${r.status} · created ${counts(r.created)}${r.recorded ? ' · recorded' : ''}`;

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function check(): number {
  const detectors = guardDetectors();
  if (!detectors) {
    console.error('owner-data check: tools/hardcode-guard.json not found');
    return 1;
  }
  const findings = checkOwnerData({ registry, register: ownerDataRegister, schema: loadSchema(), pack: defaultPack, sample: sampleCatalogue, detectors });
  for (const line of describeFindings(findings)) console.log(line);
  const owner = Object.values(registry).filter((s) => s.isOwnerData).length;
  console.log(
    `owner-data check: ${Object.keys(registry).length} settings (${owner} owner data), register ${ownerDataRegister.tables.length} tables · ${ownerDataRegister.columns.length} columns · ${ownerDataRegister.settingPrefixes.length} prefixes · media, default pack, sample data — ${findings.length} finding(s)`,
  );
  return findings.length ? 1 : 0;
}

async function withDb(run: (prisma: PrismaClient) => Promise<number>): Promise<number> {
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('seed: DATABASE_DIRECT_URL is not set');
    return 1;
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    return await run(prisma);
  } catch (error) {
    if (error instanceof SampleSeedRefused || error instanceof OwnerDataLeak || error instanceof MotherStoreRefused) {
      console.error(`seed: ${error.message}`);
      return 1;
    }
    const message = String(error instanceof Error ? error.message : error).split('\n').filter(Boolean).slice(-1)[0];
    console.error(`seed: FAILED — ${message ?? 'unknown error'}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'check':
      return check();
    case 'pack':
      return withDb(async (prisma) => {
        if (rest.includes('--all-stores')) {
          const reports = await applyPackToAllStores(prisma, defaultPack);
          for (const r of reports) console.log(packLine(r));
          console.log(`pack: ${reports.length} store(s)`);
          return 0;
        }
        const slug = arg(rest, '--store');
        if (!slug) {
          console.error('usage: cli.ts pack --store <slug> | --all-stores');
          return 2;
        }
        const store = await prisma.store.findUnique({ where: { slug }, select: { id: true } });
        if (!store) {
          console.error(`pack: no store with the address "${slug}"`);
          return 1;
        }
        console.log(packLine(await applyPack(prisma, defaultPack, { storeId: store.id })));
        return 0;
      });
    case 'mother-store':
      return withDb(async (prisma) => {
        const r = await ensureMotherStore(prisma);
        console.log(`mother store: ${r.created ? 'made' : 'unchanged'} (store ${r.storeId})`);
        return 0;
      });
    case 'sample':
      return withDb(async (prisma) => {
        const r = await seedSample(prisma, { besideLiveStore: rest.includes('--beside-live-store') });
        console.log(packLine(r.pack));
        console.log(
          `sample seed: ${r.status} · store ${r.storeId} · created ${counts(r.created)}${r.categoriesShown ? ` · categories shown ${r.categoriesShown}` : ''}${r.recorded ? ' · recorded' : ''}`,
        );
        return 0;
      });
    case 'export':
      return withDb(async (prisma) => {
        const out = arg(rest, '--out');
        if (!out) {
          console.error('usage: cli.ts export --out <file>');
          return 2;
        }
        const bundle = await exportInstallation(prisma);
        writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
        console.log(
          `export: ${Object.keys(bundle.settings).length} installation settings, ${bundle.stores.length} store(s); left out ${bundle.omitted.settingKeys.length} owner settings, ${bundle.omitted.tables.length} tables, ${bundle.omitted.columns.length} columns, all media`,
        );
        return 0;
      });
    case 'import':
      return withDb(async (prisma) => {
        const file = arg(rest, '--in');
        if (!file) {
          console.error('usage: cli.ts import --in <file> [--map <ref>=<storeId> …]');
          return 2;
        }
        const storeMap: Record<string, number> = {};
        rest.forEach((a, i) => {
          if (a !== '--map') return;
          const [ref, id] = (rest[i + 1] ?? '').split('=');
          if (ref && id && /^\d+$/.test(id)) storeMap[ref] = Number(id);
        });
        const r = await importInstallation(prisma, JSON.parse(readFileSync(file, 'utf8')), { storeMap });
        console.log(
          `import: settings written ${r.settings.written.length}, unchanged ${r.settings.unchanged.length}, owner data skipped ${r.settings.skippedOwner.length}, unknown ${r.settings.skippedUnknown.length}, rejected ${r.settings.rejected.length}`,
        );
        for (const s of r.stores) console.log(`  ${s.ref} → store ${s.storeId}: settings ${s.settingsWritten} · ${packLine(s.pack)}`);
        if (r.storesSkipped.length) console.log(`  no target store for: ${r.storesSkipped.join(', ')} (use --map)`);
        return 0;
      });
    default:
      console.error('usage: cli.ts check | pack | mother-store | sample | export | import');
      return 2;
  }
}

process.exitCode = await main(process.argv.slice(2));
