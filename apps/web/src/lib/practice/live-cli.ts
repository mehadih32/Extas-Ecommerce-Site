// PR 880 (final round) — the practice shop on the real database, with nobody sitting down for it.
// Run on the VM by .github/workflows/practice-seed.yml with the migrate image of the live version (it carries this folder):
//   tsx live-cli.ts seed [--turn-on]   fills the big practice set (about 850 orders over six months, 240 people, 72+ styles,
//                                      claims, payouts, ad spend, reviews); a shop that holds only the small set is topped up
//   tsx live-cli.ts status             counts only
// Rules: ADDITIVE and IDEMPOTENT. Every row is made from its own key with "skip when it exists", so a second run changes
// nothing; a run on a store with the small practice set adds only what is missing and never edits an existing order.
// Every row it makes is flagged `isPractice`, so the real totals, real customers and ads never see it (lists follow the
// practice switch) and "Reset practice data" (owner's PIN) removes exactly these rows. It never deletes anything and never
// touches a real row. `--turn-on` writes the owner's practice switch (and the automatic fill) into the settings log.
// Nothing is printed but names of tables and counts.
import { MOTHER_STORE_ID, PrismaClient } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver, storeTarget } from '@extas/settings';
import { seedPractice } from './seed';
import { syncPracticeVisibility } from './visibility';

const REASON = 'PR 880 practice data (workflow practice-seed)'; // hardcode-ok: the change-log reason

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== 'seed' && command !== 'status') {
    console.error('usage: live-cli.ts seed [--turn-on] | status');
    return 2;
  }
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('practice: DATABASE_DIRECT_URL is not set');
    return 1;
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const store = await prisma.store.findFirst({ where: { id: MOTHER_STORE_ID }, select: { id: true } });
    if (!store) {
      console.error('practice: there is no mother store yet (deploy first)');
      return 1;
    }
    const storeId = store.id;
    const resolver = new SettingsResolver(prismaBackend(prisma), registry);
    const counts = async (): Promise<Record<string, number>> => ({
      orders: await prisma.order.count({ where: { storeId, isPractice: true } }),
      realOrders: await prisma.order.count({ where: { storeId, isPractice: false } }),
      customers: await prisma.customer.count({ where: { storeId, isPractice: true } }),
      products: await prisma.product.count({ where: { storeId, isPractice: true } }),
      claims: await prisma.courierClaim.count({ where: { storeId, isPractice: true } }),
      payouts: await prisma.courierSettlement.count({ where: { storeId, isPractice: true } }),
    });
    const line = (c: Record<string, number>) =>
      Object.entries(c)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'nothing';
    if (command === 'status') {
      console.log(`practice status: ${line(await counts())}`);
      console.log(`practice switch: ${(await resolver.value('practice.enabled', { storeId })).on ? 'on' : 'off'}`);
      return 0;
    }
    console.log(`practice before: ${line(await counts())}`);
    const r = await seedPractice(prisma, storeId, new Date(), { rich: true, richAnywhere: true });
    console.log(`practice seed: ${r.seeded ? `added · ${line(r.counts)}` : `nothing to add (${r.reason ?? 'done'})`}`);
    if (rest.includes('--turn-on')) {
      for (const key of ['practice.enabled', 'practice.autoFill'] as const) {
        const w = await resolver.set(key, { on: true }, storeTarget(storeId), { reason: REASON });
        console.log(`settings set: ${key} ${w.changed ? 'changed' : 'unchanged'}`);
      }
    }
    // products, combos and posts follow the switch (nothing happens when they already do); pictures come from the server clock
    const on = (await resolver.value('practice.enabled', { storeId })).on;
    const v = await syncPracticeVisibility(prisma, storeId, on);
    console.log(`practice visibility: switch ${on ? 'on' : 'off'} · shown ${v.shown} · hidden ${v.hidden}`);
    console.log(`practice after: ${line(await counts())}`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`practice: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`);
    process.exit(1);
  },
);
