// S19 · PR 392 — `tsx src/server-sync-cli.ts --out <dir>`: the vault's keys for the server's scripts (server-sync.ts),
// run by infra/server/bin/extas-vault-sync in the live version's migrate image. It reads DATABASE_URL, VAULT_MASTER_KEY
// and SYNC_PREVIOUS (the server's last fingerprint), and writes <dir>/result.json ({fingerprint, changed, files}) and,
// when something changed, <dir>/files/<name> (0600) for each part. It prints file names only, never a value.
// Exit 0: done (changed or not); 1: the database could not be read; 2: wrong use.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { disconnectPrisma, getPrisma } from '@extas/db/client';
import { createVault } from '@extas/vault';
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
    const r = await serverSync({ db, vault }, { previous: process.env.SYNC_PREVIOUS || null });
    mkdirSync(join(out, 'files'), { recursive: true, mode: 0o700 });
    const names = r.files ? Object.keys(r.files) : [];
    for (const name of names) {
      const f = join(out, 'files', name);
      writeFileSync(f, r.files![name]!, { mode: 0o600 });
      chmodSync(f, 0o600);
    }
    writeFileSync(join(out, 'result.json'), `${JSON.stringify({ fingerprint: r.fingerprint, changed: r.files !== null, files: names, vault: Boolean(vault) })}\n`);
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
