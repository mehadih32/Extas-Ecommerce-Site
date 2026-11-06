// S19 · PR 653 (CN-036) — the writer of the redirect import from the old shop's public sitemap. Runs in the migrate
// image of the live version (infra/deploy/redirect-import.sh mounts this folder at /repo/apps/web/redirect-import, where
// the @extas packages resolve), after the shell fetched the old site's sitemap files with GET only. It never contacts
// any site itself.
//   - reads the live catalogue of the store (published products, visible categories, the sets page) and its settings
//     (`naming.productPathPrefix`, `naming.redirectStatusCode`, `seo.redirects.keepMonths`,
//     `seo.notFound.suggestMatchAtLeast`, `combos.landing`), and matches every old address (../map.mjs);
//   - with --commit, files each pair as a Redirect row of source `wordpress` with the redirect manager's own rules
//     (apps/web/src/lib/seo/redirects-admin.ts `putForward`): never over a page the shop has, no chains (a target that
//     is itself forwarded is followed to its end, older rows pointing at the address repointed), kept `keepMonths`,
//     never deleted; every write in the audit log as the system with the reason. The map forwards only while
//     `seo.redirects.wordpressMapLive` is on (off until the go-live switch, PR 587), so nothing changes for a visitor.
//   - writes <out>/result.json and README.md (every address, its page, and the ones without a twin, for the owner).
// Usage: tsx import.ts --in <dir of .xml> --old-site <host> --out <dir> [--commit] [--store <id>]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { audit, SYSTEM } from '@extas/auth';
import { disconnectPrisma, getPrisma, MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { mapAddresses, oldAddresses, redirectKey, reportMarkdown, tally } from '../map.mjs';

const SOURCE = 'wordpress';
const PATH_MAX = 500;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

interface Row {
  from: string;
  to: string | null;
  how: string;
  twin: boolean;
  percent?: number;
  url: string | null;
  result?: string;
}

/** Where a path finally lands after following enabled forwards (as `finalTarget` in redirects-admin.ts). */
async function finalTarget(tx: Tx, storeId: number, path: string): Promise<string> {
  let to = redirectKey(path);
  const seen = new Set([to]);
  for (;;) {
    const r = await tx.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: to } } });
    if (!r || !r.enabled || r.archivedAt) return to;
    const next = redirectKey(r.toPath);
    if (seen.has(next)) return to;
    seen.add(next);
    to = next;
  }
}

async function main() {
  const dir = arg('in');
  const oldSite = (arg('old-site') ?? '').toLowerCase();
  const out = arg('out');
  const commit = process.argv.includes('--commit');
  const storeId = Number(arg('store') ?? MOTHER_STORE_ID);
  if (!dir || !oldSite || !out || !Number.isInteger(storeId)) throw new Error('usage: import.ts --in <dir> --old-site <host> --out <dir> [--commit] [--store <id>]');
  const reason = (process.env.IMPORT_REASON ?? '').slice(0, 300) || 'PR 653: the old shop public sitemap import';
  const db = getPrisma();
  const settings = new SettingsResolver(prismaBackend(db), registry);
  const at = { storeId };
  const [prefix, status, redirects, notFound, landing] = await Promise.all([
    settings.value('naming.productPathPrefix', at),
    settings.value('naming.redirectStatusCode', at),
    settings.value('seo.redirects', at),
    settings.value('seo.notFound', at),
    settings.value('combos.landing', at),
  ]);
  const xml = readdirSync(dir)
    .filter((f) => f.endsWith('.xml'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'));
  const addresses = oldAddresses(xml, oldSite);
  const [products, categories] = await Promise.all([
    db.product.findMany({ where: { storeId, status: 'PUBLISHED', archivedAt: null }, select: { slug: true } }),
    db.category.findMany({ where: { storeId, isVisible: true, archivedAt: null }, select: { slug: true, nameEn: true } }),
  ]);
  const rows: Row[] = mapAddresses(addresses, {
    prefix,
    products: products.map((p) => p.slug),
    categories: categories.map((c) => ({ slug: c.slug, words: [c.nameEn] })),
    combosHub: landing.on === true,
    minPercent: notFound.suggestMatchAtLeast,
  });
  const problems: string[] = [];
  if (addresses.length === 0) problems.push('the sitemap files held no address of the old site');
  let written = 0;
  let unchanged = 0;
  let repointed = 0;
  if (commit && rows.some((r) => r.to)) {
    const keepUntil = new Date();
    keepUntil.setUTCMonth(keepUntil.getUTCMonth() + redirects.keepMonths);
    const ctx = { source: 'cli' };
    await db.$transaction(
      async (tx) => {
        for (const r of rows) {
          if (!r.to) continue;
          if (r.from.length > PATH_MAX || r.to.length > PATH_MAX) {
            r.result = 'too long';
            continue;
          }
          const to = await finalTarget(tx, storeId, r.to);
          if (to === r.from) {
            r.result = 'self';
            continue;
          }
          r.to = to;
          const older = await tx.redirect.findMany({ where: { storeId, toPath: r.from, enabled: true, archivedAt: null } });
          for (const o of older) {
            await tx.redirect.update({ where: { id: o.id }, data: { toPath: to } });
            await audit(tx, SYSTEM, { storeId, action: 'seo.redirect.repoint', entityType: 'Redirect', entityId: o.id, before: { toPath: r.from }, after: { toPath: to, reason } }, ctx);
            repointed++;
          }
          const cur = await tx.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: r.from } } });
          if (cur && cur.enabled && !cur.archivedAt && redirectKey(cur.toPath) === to) {
            r.result = 'same';
            unchanged++;
            continue;
          }
          const row = cur
            ? await tx.redirect.update({ where: { id: cur.id }, data: { toPath: to, enabled: true, archivedAt: null, statusCode: status, source: SOURCE, keepUntil } })
            : await tx.redirect.create({ data: { storeId, fromPath: r.from, toPath: to, statusCode: status, source: SOURCE, enabled: true, keepUntil } });
          await audit(
            tx,
            SYSTEM,
            { storeId, action: cur ? 'seo.redirect.update' : 'seo.redirect.create', entityType: 'Redirect', entityId: row.id, before: cur ? { toPath: cur.toPath, enabled: cur.enabled, source: cur.source } : null, after: { fromPath: r.from, toPath: to, source: SOURCE, reason } },
            ctx,
          );
          r.result = cur ? 'update' : 'new';
          written++;
        }
        await audit(tx, SYSTEM, { storeId, action: 'seo.redirect.import', entityType: 'Redirect', entityId: SOURCE, before: null, after: { kind: SOURCE, written, unchanged, repointed, reason, ...tally(rows) } }, ctx);
      },
      { timeout: 300_000, maxWait: 10_000 },
    );
  }
  const result = {
    at: process.env.IMPORT_AT ?? new Date().toISOString(),
    sha: process.env.IMPORT_SHA ?? '',
    oldSite,
    storeId,
    committed: commit,
    written,
    unchanged,
    repointed,
    wordpressMapLive: redirects.wordpressMapLive,
    tally: tally(rows),
    rows,
    problems,
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(out, 'README.md'), reportMarkdown(result));
  console.log(`redirect import: ${result.tally.addresses} addresses, ${result.tally.twins} twins, ${result.tally.listed} without a twin (listed), ${result.tally.same} already pages; ${commit ? `written ${written}, unchanged ${unchanged}, repointed ${repointed}` : 'dry run'}`);
}

main()
  .then(() => disconnectPrisma())
  .catch(async (e: unknown) => {
    console.error(`redirect import FAILED: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    await disconnectPrisma().catch(() => undefined);
    process.exit(1);
  });
