// S19 · PR 392 — `tsx src/server-sync-cli.ts --out <dir>`: the vault's keys for the server's scripts (server-sync.ts),
// run by infra/server/bin/extas-vault-sync in the live version's migrate image. It reads DATABASE_URL, VAULT_MASTER_KEY
// and SYNC_PREVIOUS (the server's last fingerprint), and writes <dir>/result.json ({fingerprint, changed, files}) and,
// when something changed, <dir>/files/<name> (0600) for each part. It prints file names only, never a value.
// PR 507: it also reads <dir>/done.json (the requests the server finished: [{id, ok, detail}]) and SYNC_STALE_H, and
// puts the backups and drills asked for in the admin into result.json `requests` ([{id, kind, source}], now RUNNING).
// PR 396: the restores too (kind RESTORE_STAGING / RESTORE_PRODUCTION with backup, at and stagingOf); a finished one
// may carry the backup the server used.
// Exit 0: done (changed or not); 1: the database could not be read; 2: wrong use.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { disconnectPrisma, getPrisma } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { createVault } from '@extas/vault';
import { serverRequests, type FinishedRequest } from './backup-requests';
import { serverRestoreRequests } from './restore-requests';
import { serverSync } from './server-sync';

async function main(argv: string[]): Promise<number> {
  const i = argv.indexOf('--out');
  const out = i >= 0 ? argv[i + 1] : undefined;
  if (!out) {
    console.error('usage: server-sync-cli.ts --out <dir>');
    return 2;
  }
  if (!process.env.DATABASE_URL) {
    console.error('server sync: DATABASE_URL is not set');
    return 2;
  }
  const db = getPrisma();
  try {
    const master = process.env.VAULT_MASTER_KEY;
    const vault = master && master.length >= 32 ? createVault(db, master) : null;
    const resolver = new SettingsResolver(prismaBackend(db), registry);
    const settings = { value: (key: string) => resolver.value(key as never) as Promise<unknown> };
    const r = await serverSync({ db, vault, settings }, { previous: process.env.SYNC_PREVIOUS || null });
    const doneFile = join(out, 'done.json');
    let finished: FinishedRequest[] = [];
    try {
      finished = existsSync(doneFile) ? (JSON.parse(readFileSync(doneFile, 'utf8')) as FinishedRequest[]) : [];
    } catch {
      console.error('server sync: done.json does not read; no request finished this run');
    }
    const staleHours = Number(process.env.SYNC_STALE_H) > 0 ? Number(process.env.SYNC_STALE_H) : 12;
    const done = Array.isArray(finished) ? finished : [];
    const req = await serverRequests(db, { finished: done, staleHours });
    const rest = await serverRestoreRequests(db, { finished: done, staleHours });
    mkdirSync(join(out, 'files'), { recursive: true, mode: 0o700 });
    const names = r.files ? Object.keys(r.files) : [];
    for (const name of names) {
      const f = join(out, 'files', name);
      writeFileSync(f, r.files![name]!, { mode: 0o600 });
      chmodSync(f, 0o600);
    }
    writeFileSync(
      join(out, 'result.json'),
      `${JSON.stringify({ fingerprint: r.fingerprint, changed: r.files !== null, files: names, vault: Boolean(vault), requests: [...req.taken, ...rest.taken], finished: req.finished + rest.finished, stale: req.stale + rest.stale })}\n`,
    );
    console.log(r.files ? `server sync: ${names.length} file(s): ${names.join(', ')}` : 'server sync: unchanged');
    return 0;
  } catch (e) {
    console.error(`server sync: ${e instanceof Error ? e.name : 'error'} — the database could not be read`);
    return 1;
  } finally {
    await disconnectPrisma();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  () => process.exit(1),
);
