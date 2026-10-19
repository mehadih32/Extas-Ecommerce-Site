#!/usr/bin/env node
// Runs the Prisma CLI. Offline commands (validate, format, generate, `migrate diff --from-empty`) never open a database
// connection, but Prisma still insists that the datasource variables exist. For those commands only, an unset
// DATABASE_URL / DATABASE_DIRECT_URL gets an inert placeholder (no host, no credentials). Commands that connect
// (migrate deploy, db pull …) get no placeholder: the server's real values must be set, or they fail loudly.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const offline = new Set(['validate', 'format', 'generate', 'version']);
const isOffline = offline.has(args[0]) || (args[0] === 'migrate' && args[1] === 'diff' && args.includes('--from-empty'));

const env = { ...process.env };
if (isOffline) {
  const placeholder = 'postgresql://offline-placeholder@127.0.0.1:1/offline-placeholder';
  env.DATABASE_URL ??= placeholder;
  env.DATABASE_DIRECT_URL ??= placeholder;
}
env.PRISMA_HIDE_UPDATE_MESSAGE ??= '1';

const require = createRequire(import.meta.url);
const cli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
