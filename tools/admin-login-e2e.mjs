// PR 4 (owner, 20 Oct) — the sign-in journey end to end: log in → the admin loads. A real browser signs in as the
// first owner with the generated first password, sets their own password when asked, lands on the admin and then opens
// every page in the admin's menu. Any server error ("This page couldn't load", a 5xx) fails it. CI runs it on the
// production images against a fresh installation (tools/admin-login-e2e.sh) on every pull request and every push to
// main, so no deploy goes out without it passing (deploy.yml waits for CI).
//   BASE=http://localhost:3100 E2E_EMAIL=… E2E_PASSWORD_FILE=… node tools/admin-login-e2e.mjs
// Needs the `playwright` package (CI installs it outside the workspace and sets NODE_PATH). Never prints a password.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ERROR_TEXT = /couldn.t load|server error|application error/i;

/** Problems on a loaded admin page: a 5xx answer or the error screen. */
export function pageProblems(path, status, text) {
  const out = [];
  if (status >= 500) out.push(`${path}: answered ${status}`);
  if (ERROR_TEXT.test(text)) out.push(`${path}: shows the error screen`);
  return out;
}

/** The admin pages to open: every distinct /admin/… link in the menu, without the sign-in page or query strings. */
export function adminLinks(hrefs) {
  const seen = new Set();
  for (const h of hrefs) {
    const path = h.split(/[?#]/)[0];
    if (/^\/admin(\/|$)/.test(path) && !path.startsWith('/admin/login') && !path.startsWith('/api/')) seen.add(path);
  }
  return [...seen].sort();
}

async function run() {
  const base = (process.env.BASE || 'http://localhost:3100').replace(/\/$/, '');
  const email = process.env.E2E_EMAIL;
  const file = process.env.E2E_PASSWORD_FILE;
  if (!email || !file) throw new Error('E2E_EMAIL and E2E_PASSWORD_FILE are required');
  const first = readFileSync(file, 'utf8').trim();
  const { chromium } = require('playwright');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const problems = [];
  try {
    const page = await browser.newPage();
    // Signed out, an admin page sends you to the sign-in page (never an error).
    const out = await page.goto(`${base}/admin/products`);
    problems.push(...pageProblems('/admin/products (signed out)', out?.status() ?? 0, await page.innerText('body')));
    if (!page.url().includes('/admin/login')) problems.push(`signed out, /admin/products did not go to the sign-in page (${page.url()})`);

    await page.fill('#ad-email', email);
    await page.fill('#ad-password', first);
    await page.click('button[type=submit]');
    // The first password is someone else's choice, so the form asks for the owner's own one.
    const step = await Promise.race([
      page.waitForSelector('#ad-pw1', { timeout: 20_000 }).then(() => 'password'),
      page.waitForURL((u) => !u.pathname.startsWith('/admin/login'), { timeout: 20_000 }).then(() => 'in'),
    ]).catch(() => 'stuck');
    if (step === 'password') {
      const own = `e2e ${randomBytes(12).toString('hex')} passphrase`;
      await page.fill('#ad-pw1', own);
      await page.fill('#ad-pw2', own);
      await page.click('button[type=submit]');
      await page.waitForURL((u) => !u.pathname.startsWith('/admin/login'), { timeout: 20_000 }).catch(() => {});
    }
    if (page.url().includes('/admin/login')) {
      const text = (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 200);
      throw new Error(`still on the sign-in page after signing in (${step}): ${text}`);
    }
    await page.waitForLoadState('networkidle');
    const landing = new URL(page.url()).pathname;
    problems.push(...pageProblems(`${landing} (after sign-in)`, 200, await page.innerText('body')));
    console.log(`signed in: landed on ${landing}`);

    const links = adminLinks(await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') ?? '')));
    if (!links.length) problems.push('the admin menu has no links');
    for (const path of ['/admin', ...links]) {
      const r = await page.goto(`${base}${path}`);
      const found = pageProblems(path, r?.status() ?? 0, await page.innerText('body'));
      if (new URL(page.url()).pathname.startsWith('/admin/login')) found.push(`${path}: sent back to the sign-in page`);
      problems.push(...found);
      console.log(`${found.length ? 'FAIL' : 'ok  '} ${path} → ${new URL(page.url()).pathname} (${r?.status() ?? '?'})`);
    }
  } finally {
    await browser.close();
  }
  if (problems.length) {
    console.error(`admin sign-in e2e: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
    return 1;
  }
  console.log('admin sign-in e2e: log in → the admin loads, every menu page opens');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`admin sign-in e2e: FAILED — ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    },
  );
}
