// S19 · PR 587 (CN-035 step 4c; PR 403; docs/golive/RUNBOOK.md step 4) — the server half of the main-domain switch,
// staged and NOT run: it writes the two lines of infra/config/server.conf that put the main domain beside the staging
// host and take the preview password and `noindex` off the main domain ONLY:
//   EXTAS_EXTRA_HOSTS="<domain> www.<domain>"   EXTAS_MAIN_OPEN="yes"
// The staging host keeps its password and noindex always (its own Caddy block). The domain is an argument, never code.
//   node tools/golive-switch.mjs --domain <main domain> [--no-www]               → the plan and the change, nothing written
//   node tools/golive-switch.mjs --domain <main domain> --confirm "GO LIVE <main domain>"   → server.conf written
// Only on the owner's own "go live" (CLAUDE.md: the go-live switch of the main domain is his alone; BLOCKED 25). After
// writing: commit `PR 587: go live — <domain>` and push; the push re-runs server setup (server-setup.yml), which must show
// "PR 403 · main domain: open". Then the DNS change in Cloudflare (runbook step 5). Undo: --undo (EXTAS_MAIN_OPEN="no",
// the main domain locked again; DNS back to the exported records). It never touches DNS and never asks the main domain.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_CONF = join(root, "infra/config/server.conf");
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** The exact words the owner's go-ahead is typed as. */
export const confirmPhrase = (domain) => `GO LIVE ${domain}`;

const read = (text, key) => {
  const m = text.match(new RegExp(`^${key}="([^"]*)"`, "m"));
  return m ? m[1] : null;
};
const write = (text, key, value) => text.replace(new RegExp(`^(${key}=)"[^"]*"`, "m"), `$1"${value}"`);

/**
 * The new server.conf for the switch (or its undo). Throws on a host name that is not plain, on the staging host
 * itself, and on a file without the two lines. The comments after each value stay as they are.
 */
export function switchConf(text, domain, { www = true, undo = false } = {}) {
  const d = String(domain ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!HOST.test(d)) throw new Error(`not a plain host name: ${domain}`);
  const staging = read(text, "EXTAS_STAGING_HOST");
  const extra = read(text, "EXTAS_EXTRA_HOSTS");
  const open = read(text, "EXTAS_MAIN_OPEN");
  if (staging === null || extra === null || open === null) throw new Error("server.conf has no EXTAS_STAGING_HOST, EXTAS_EXTRA_HOSTS or EXTAS_MAIN_OPEN line");
  if (d === staging.toLowerCase() || `www.${d}` === staging.toLowerCase()) throw new Error("the main domain cannot be the staging host: the staging host stays locked always");
  if (undo) return { text: write(text, "EXTAS_MAIN_OPEN", "no"), changes: open === "no" ? [] : [`EXTAS_MAIN_OPEN: "${open}" → "no"`] };
  const want = www && !d.startsWith("www.") ? [d, `www.${d}`] : [d];
  const hosts = [...want, ...extra.split(/\s+/).filter((h) => h && !want.includes(h.toLowerCase()))].join(" ");
  const changes = [];
  if (hosts !== extra) changes.push(`EXTAS_EXTRA_HOSTS: "${extra}" → "${hosts}"`);
  if (open !== "yes") changes.push(`EXTAS_MAIN_OPEN: "${open}" → "yes"`);
  return { text: write(write(text, "EXTAS_EXTRA_HOSTS", hosts), "EXTAS_MAIN_OPEN", "yes"), changes };
}

export function parseArgs(argv) {
  const a = { domain: "", confirm: null, conf: DEFAULT_CONF, www: true, undo: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--domain") a.domain = argv[++i] ?? "";
    else if (k === "--confirm") a.confirm = argv[++i] ?? "";
    else if (k === "--conf") a.conf = argv[++i] ?? DEFAULT_CONF;
    else if (k === "--no-www") a.www = false;
    else if (k === "--undo") a.undo = true;
    else throw new Error(`unknown argument: ${k}`);
  }
  return a;
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const a = parseArgs(argv);
  const before = readFileSync(a.conf, "utf8");
  const { text, changes } = switchConf(before, a.domain, { www: a.www, undo: a.undo });
  const phrase = a.undo ? `UNDO ${a.domain}` : confirmPhrase(a.domain);
  log(a.undo ? "Undo of the main-domain switch (PR 403): the main domain locked again." : "Main-domain switch (PR 587 / 403), server half:");
  for (const c of changes) log(`  ${c}`);
  if (!changes.length) {
    log("  nothing to change: server.conf already says so");
    return 0;
  }
  if (a.confirm !== phrase) {
    log(`\nNothing written. Only on the owner's own "go live", run again with: --confirm "${phrase}"`);
    return a.confirm === null ? 0 : 2;
  }
  writeFileSync(a.conf, text);
  log(`\nWritten: ${a.conf}. Next: commit "PR 587: go live — ${a.domain}", push, wait for server setup ("PR 403 · main domain: open"), then the DNS step (runbook step 5).`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main());
  } catch (e) {
    console.error(`golive-switch: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
}
