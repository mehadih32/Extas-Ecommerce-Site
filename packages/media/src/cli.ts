// Media commands for the server (later run by the image worker container on a schedule):
//   tsx src/cli.ts render-pending [--store <id>]   makes the sizes of every photo that has none yet
//   tsx src/cli.ts regenerate --store <id>         remakes every size of a store after a settings change
// The database comes from DATABASE_URL, keys from the vault (VAULT_MASTER_KEY), local storage from EXTAS_MEDIA_DIR.
import { disconnectPrisma, getPrisma } from '@extas/db/client';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import { createVault } from '@extas/vault';
import { pendingAssets, regenerateStore, renderAsset } from './jobs';
import { mediaRuntime } from './runtime';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  const db = getPrisma();
  const key = process.env.VAULT_MASTER_KEY;
  const deps = mediaRuntime({ db, settings: new SettingsResolver(prismaBackend(db), registry), vault: key && key.length >= 32 ? createVault(db, key) : null });
  const store = arg('--store');
  const storeId = store ? Number(store) : undefined;
  if (store && (!Number.isInteger(storeId) || storeId! < 1)) throw new Error('--store needs a store id');

  if (cmd === 'render-pending') {
    const take = await deps.settings.value('media.library.pageSize', storeId ? { storeId } : {});
    let done = 0;
    const failed: string[] = [];
    for (;;) {
      const ids = await pendingAssets(deps, { storeId, take, exclude: failed });
      for (const id of ids) {
        try {
          await renderAsset(deps, id);
          done++;
        } catch (e) {
          failed.push(id);
          console.warn(`media: ${id} failed (${e instanceof Error ? e.message : String(e)})`);
        }
      }
      if (ids.length < take) break;
    }
    console.log(`media render-pending: ${done} rendered, ${failed.length} failed`);
    return failed.length ? 1 : 0;
  }
  if (cmd === 'regenerate') {
    if (!storeId) throw new Error('regenerate needs --store <id>');
    const r = await regenerateStore(deps, storeId);
    console.log(`media regenerate: store ${storeId} — ${r.rendered} rendered, ${r.unchanged} unchanged, ${r.failed.length} failed`);
    return r.failed.length ? 1 : 0;
  }
  console.error('usage: cli.ts render-pending [--store <id>] | regenerate --store <id>');
  return 2;
}

main()
  .then(async (code) => {
    await disconnectPrisma();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(`media: ${e instanceof Error ? e.message : String(e)}`);
    await disconnectPrisma();
    process.exit(1);
  });
