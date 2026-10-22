// PR 508 (owner, 23 Oct, urgent) — the admin session end to end: open the sign-in page, sign in, land on the admin,
// refresh and still be signed in, open the sign-in page again while signed in and still land on a working admin page
// (the owner's bug: /admin/login sent a signed-in owner to /admin/products, which crashed because the installation had
// no mother store, so he never got in), then log out, be back on the sign-in page, and find the admin closed again.
// A step fails on a 5xx, the error screen, a console error or an uncaught page error on an admin page.
// Runs in two places:
// - in CI on the production images against a fresh installation (tools/admin-login-e2e.sh, after the menu walk);
// - on the runner against new.extas.com.bd after a deploy (CN-016), through the preview login.
//   BASE=https://… E2E_EMAIL=… E2E_PASSWORD_FILE=… [E2E_NEW_PASSWORD_FILE=…] [SMOKE_HTTP_USER=… SMOKE_HTTP_PASSWORD=…]
//   [E2E_SHOTS=<dir>] node tools/admin-session-e2e.mjs
// When the sign-in asks for a new password (a first password), the one in E2E_NEW_PASSWORD_FILE is set (a random one
// without it). Never prints a password, a cookie or an e-mail. Needs the `playwright` package (NODE_PATH).
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ERROR_TEXT = /couldn.t load|a server error occurred|application error/i;
const LOGOUT_TEXT = /^\s*(log ?out|sign ?out|লগআউট|লগ আউট)\s*$/i;

/** Problems on a loaded page: a 5xx answer or the error screen. */
export function pageProblems(step, status, text) {
  const out = [];
  if (status >= 500) out.push(`${step}: answered ${status}`);
  if (ERROR_TEXT.test(text)) out.push(`${step}: shows the error screen`);
  return out;
}

/** True for a path on the sign-in page. */
export function onLogin(url) {
  try {
    return new URL(url).pathname.startsWith('/admin/login');
  } catch {
    return false;
  }
}

/** True for a signed-in admin page (any /admin page that is not the sign-in page). */
export function onAdmin(url) {
  try {
    const p = new URL(url).pathname;
    return /^\/admin(\/|$)/.test(p) && !p.startsWith('/admin/login');
  } catch {
    return false;
  }
}

/** A console message counts unless it is the browser's note on a 401 before signing in (the sign-in page asks). */
export function consoleCounts(text, signedIn) {
  if (!signedIn && /status of 401/.test(text)) return false;
  return true;
}

/** Hides anything secret-looking from a message before it is printed. */
export function scrub(text, secrets) {
  let s = String(text);
  for (const v of secrets) if (v) s = s.split(v).join('<hidden>');
  return s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<e-mail>').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>');
}

async function run() {
  const base = (process.env.BASE || 'http://localhost:3100').replace(/\/$/, '');
  const email = process.env.E2E_EMAIL;
  const file = process.env.E2E_PASSWORD_FILE;
  if (!email || !file) throw new Error('E2E_EMAIL and E2E_PASSWORD_FILE are required');
  const password = readFileSync(file, 'utf8').trim();
  const newFile = process.env.E2E_NEW_PASSWORD_FILE;
  const newPassword = newFile ? readFileSync(newFile, 'utf8').trim() : `e2e ${randomBytes(12).toString('hex')} passphrase`;
  const httpUser = process.env.SMOKE_HTTP_USER;
  const httpPassword = process.env.SMOKE_HTTP_PASSWORD;
  const secrets = [email, password, newPassword, httpPassword];
  const shots = process.env.E2E_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });

  const { chromium } = require('playwright');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const problems = [];
  let signedIn = false;
  let step = 'start';
  const shot = async (page, name) => {
    if (shots) await page.screenshot({ path: join(shots, `admin-login-${name}.png`), fullPage: false });
  };
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ...(httpUser && httpPassword ? { httpCredentials: { username: httpUser, password: httpPassword } } : {}),
    });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' && consoleCounts(m.text(), signedIn)) problems.push(`${step}: console error: ${scrub(m.text(), secrets).slice(0, 200)}`);
    });
    page.on('pageerror', (e) => problems.push(`${step}: page error: ${scrub(e.message, secrets).slice(0, 200)}`));
    const check = async (status) => problems.push(...pageProblems(step, status, await page.innerText('body')));

    step = '1 open the sign-in page';
    let r = await page.goto(`${base}/admin/login`);
    await check(r?.status() ?? 0);
    await page.waitForSelector('#ad-email', { timeout: 20_000 });
    await shot(page, '1-login');
    console.log(`ok   ${step}`);

    step = '2 sign in';
    await page.fill('#ad-email', email);
    await page.fill('#ad-password', password);
    await page.click('button[type=submit]');
    const asked = await Promise.race([
      page.waitForSelector('#ad-pw1', { timeout: 30_000 }).then(() => 'password'),
      page.waitForURL((u) => onAdmin(u.href), { timeout: 30_000 }).then(() => 'in'),
    ]).catch(() => 'stuck');
    if (asked === 'password') {
      if (await page.locator('#ad-cur').count()) await page.fill('#ad-cur', password);
      await page.fill('#ad-pw1', newPassword);
      await page.fill('#ad-pw2', newPassword);
      await page.click('button[type=submit]');
      await page.waitForURL((u) => onAdmin(u.href), { timeout: 30_000 }).catch(() => {});
    }
    if (!onAdmin(page.url())) {
      const text = scrub((await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 200), secrets);
      throw new Error(`still on the sign-in page after signing in (${asked}): ${text}`);
    }
    signedIn = true;
    await page.waitForLoadState('networkidle');
    await check(200);
    await shot(page, '2-dashboard');
    console.log(`ok   ${step} → ${new URL(page.url()).pathname}${asked === 'password' ? ' (new password set)' : ''}`);

    step = '3 refresh, still signed in';
    r = await page.reload();
    await page.waitForLoadState('networkidle');
    if (!onAdmin(page.url())) problems.push(`${step}: sent to ${new URL(page.url()).pathname}`);
    await check(r?.status() ?? 0);
    console.log(`ok   ${step}`);

    step = '4 the sign-in page while signed in';
    r = await page.goto(`${base}/admin/login`);
    await page.waitForLoadState('networkidle');
    if (!onAdmin(page.url())) problems.push(`${step}: stayed on ${new URL(page.url()).pathname} although signed in`);
    await check(r?.status() ?? 0);
    await shot(page, '3-login-while-signed-in');
    console.log(`ok   ${step} → ${new URL(page.url()).pathname}`);

    step = '5 log out';
    const button = page.getByRole('button', { name: LOGOUT_TEXT }).filter({ visible: true }).first();
    await button.click({ timeout: 20_000 });
    await page.waitForURL((u) => onLogin(u.href), { timeout: 30_000 });
    signedIn = false;
    await page.waitForSelector('#ad-email', { timeout: 20_000 });
    await check(200);
    await shot(page, '4-logged-out');
    console.log(`ok   ${step}`);

    step = '6 the admin is closed again';
    r = await page.goto(`${base}/admin/products`);
    if (!onLogin(page.url())) problems.push(`${step}: /admin/products opened without signing in`);
    await check(r?.status() ?? 0);
    console.log(`ok   ${step}`);
  } catch (e) {
    problems.push(`${step}: ${scrub(e instanceof Error ? e.message : String(e), secrets).split('\n')[0]}`);
  } finally {
    await browser.close();
  }
  if (problems.length) {
    console.error(`admin session e2e: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
    return 1;
  }
  console.log('admin session e2e: sign in → admin → refresh → sign-in page while signed in → log out → closed: all ok');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`admin session e2e: FAILED — ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    },
  );
}
