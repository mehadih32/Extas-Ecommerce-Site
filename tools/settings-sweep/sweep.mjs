#!/usr/bin/env node
// PR 846 — Settings string sweep. Reads every t('English','বাংলা') pair in the prototype's
// docs/demo/admin-proto-v5/js/m-settings.js and checks that each fixed piece of text is somewhere in the real admin
// (apps/web/messages/*.json and the admin source). Prints the pieces that are missing, by prototype area.
// Usage: node tools/settings-sweep/sweep.mjs [--json] [--area=ERP]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const norm = (s) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export function pairs(src) {
  const out = [];
  const re = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)\s*,\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({ en: (m[1] ?? m[2]).replace(/\\'/g, "'"), bn: (m[3] ?? m[4]).replace(/\\'/g, "'"), at: m.index });
  }
  return out;
}

// the fixed pieces of a string: split on ${...} and on html tags, keep pieces with 4 or more letters
export function pieces(s) {
  return s
    .split(/\$\{[^}]*\}|<[^>]+>/)
    .map((p) => norm(p))
    .filter((p) => p.replace(/[^\p{L}]/gu, '').length >= 4);
}

function walk(dir, tails, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === '.next') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, tails, out);
    else if (tails.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

function corpus(lang) {
  const parts = [];
  for (const f of walk(join(root, 'apps/web/messages'), ['.' + lang + '.json'])) parts.push(readFileSync(f, 'utf8'));
  for (const f of walk(join(root, 'apps/web/src'), ['.tsx', '.ts'])) parts.push(readFileSync(f, 'utf8'));
  return norm(parts.join('\n').replace(/\\"/g, '"').replace(/\\u2019/g, "'"));
}

const AREAS = [
  ['Store details', 'function renderStore'],
  ['Payments', 'function renderPayments'],
  ['Team & roles', 'function renderTeam'],
  ['Keys', 'function renderKeys'],
  ['Backups', 'function renderBackups'],
  ['Site health', 'function renderHealth'],
  ['Updates', 'function renderUpdates'],
  ['Activity log', 'function renderActivity'],
  ['Data & privacy', 'function renderPrivacy'],
  ['AI control', 'function renderAi'],
  ['Demo products', 'function renderDemo'],
  ['Start fresh', 'function freshStart'],
  ['Telegram', 'function renderTelegram'],
  ['ERP connection', 'function renderErp'],
  ['Couriers', 'function renderCouriers'],
  ['Customer messages', 'function renderMessages'],
  ['Security', 'function renderSecurity'],
];

export function run({ area = '' } = {}) {
  const src = readFileSync(join(root, 'docs/demo/admin-proto-v5/js/m-settings.js'), 'utf8');
  const marks = AREAS.map(([n, k]) => [n, src.indexOf(k)])
    .filter((x) => x[1] >= 0)
    .sort((a, b) => a[1] - b[1]);
  const areaOf = (idx) => {
    let a = 'Frame and data';
    for (const [n, p] of marks) if (idx >= p) a = n;
    return a;
  };
  const en = corpus('en');
  const bn = corpus('bn');
  const list = pairs(src);
  const missing = [];
  for (const p of list) {
    const a = areaOf(p.at);
    if (area && !a.toLowerCase().includes(area.toLowerCase())) continue;
    const missingEn = pieces(p.en).filter((x) => !en.includes(x));
    const missingBn = pieces(p.bn).filter((x) => !bn.includes(x));
    if (missingEn.length || missingBn.length) missing.push({ area: a, en: p.en, missingEn, missingBn });
  }
  return { total: list.length, missing };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const area = (process.argv.find((a) => a.startsWith('--area=')) || '').slice(7);
  const r = run({ area });
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    const by = {};
    for (const m of r.missing) (by[m.area] ||= []).push(m);
    for (const [a, L] of Object.entries(by)) {
      console.log(`\n## ${a} (${L.length})`);
      for (const m of L) console.log(`  ${m.en.slice(0, 100)}${m.missingEn.length ? '  [EN]' : ''}${m.missingBn.length ? '  [BN]' : ''}`);
    }
    console.log(`\n${r.total} pairs, ${r.missing.length} with missing text`);
  }
}
