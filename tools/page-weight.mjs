#!/usr/bin/env node
// PR 88 — the page and image weight targets (docs/qa/page-weight.json), checked on the Lighthouse reports CI already
// writes for the seeded storefront (lighthouserc.seeded.json; every run sits in .lighthouseci as lhr-*.json, the median
// runs in .lighthouseci-seeded as *.report.json): everything a page downloaded
// (Lighthouse `total-byte-weight`) and every image it downloaded (`network-requests`, transfer size), per kind of page.
// The median run of each page is judged, as the Lighthouse budget does.
// usage: node tools/page-weight.mjs <dir of Lighthouse JSON reports> [budget file, default docs/qa/page-weight.json]
// Exits 1 on any page over its budget, or when the folder holds no report at all.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The page's own path, without the host, the query and the Bengali prefix. */
export function pagePath(url) {
  const u = new URL(url);
  return u.pathname.replace(/^\/bn(?=\/|$)/, '') || '/';
}

/** The budget a page falls under (the first that matches), or null. */
export function budgetFor(budgets, url) {
  const p = pagePath(url);
  const q = new URL(url).search;
  return budgets.find((b) => new RegExp(b.match).test(`${p}${q}`)) ?? null;
}

/** What one report says about weight: the page total and each image, in bytes. */
export function weightsOf(lhr) {
  const total = lhr.audits?.['total-byte-weight']?.numericValue ?? 0;
  const items = lhr.audits?.['network-requests']?.details?.items ?? [];
  const images = items.filter((i) => i.resourceType === 'Image').map((i) => ({ url: i.url, bytes: i.transferSize ?? 0 }));
  return { total, images };
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

/** The problems of one page's runs (the median run by page total), as plain sentences. */
export function judge(budget, url, runs) {
  if (!budget || !runs.length) return [];
  const sorted = [...runs].sort((a, b) => a.total - b.total);
  const median = sorted[Math.floor(sorted.length / 2)];
  const out = [];
  if (budget.pageBytes && median.total > budget.pageBytes) out.push(`${url}: the page loads ${kb(median.total)}, over its ${kb(budget.pageBytes)} budget (${budget.id})`);
  if (budget.imageBytes)
    for (const img of median.images)
      if (img.bytes > budget.imageBytes) out.push(`${url}: the image ${img.url} is ${kb(img.bytes)}, over the ${kb(budget.imageBytes)} budget (${budget.id})`);
  return out;
}

/** Reads every report in `dir` and checks it; returns the lines to print and the problems. */
export function checkDir(dir, budgets) {
  const by = new Map();
  for (const f of readdirSync(dir).filter((x) => /^lhr-.*\.json$|\.report\.json$/.test(x))) {
    const lhr = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const url = lhr.requestedUrl ?? lhr.finalDisplayedUrl;
    if (!url) continue;
    by.set(url, [...(by.get(url) ?? []), weightsOf(lhr)]);
  }
  const lines = [];
  const problems = [];
  for (const [url, runs] of [...by].sort()) {
    const b = budgetFor(budgets, url);
    const median = [...runs].sort((x, y) => x.total - y.total)[Math.floor(runs.length / 2)];
    lines.push(`${b ? b.id.padEnd(9) : '—'.padEnd(9)} ${kb(median.total).padStart(8)}  ${median.images.length} image(s)  ${url}`);
    problems.push(...judge(b, url, runs));
  }
  return { pages: by.size, lines, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  const file = process.argv[3] ?? join(root, 'docs/qa/page-weight.json');
  const { budgets } = JSON.parse(readFileSync(file, 'utf8'));
  const { pages, lines, problems } = checkDir(dir, budgets);
  console.log(lines.join('\n'));
  if (!pages) {
    console.error(`page-weight: no Lighthouse report in ${dir}`);
    process.exit(1);
  }
  if (problems.length) {
    console.error(problems.map((p) => `::error::${p}`).join('\n'));
    process.exit(1);
  }
  console.log(`page-weight: ${pages} page(s) within their budgets`);
}
