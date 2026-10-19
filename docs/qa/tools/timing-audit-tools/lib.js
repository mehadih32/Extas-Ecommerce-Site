/* Timing audit (L29) — shared helpers. One browser, foreground.
   usage: NODE_PATH=/opt/npm-tools/node_modules node tools/<suite>.js [build.html]
   Default build: ../timing.html (build it from proto/: bash tools/build.sh <scratchpad>/timing-audit/timing.html) */
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const BUILD = path.resolve(process.argv[2] || path.join(ROOT, 'timing.html'));
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = {
  d1366: { viewport: { width: 1366, height: 768 } },
  d1920: { viewport: { width: 1920, height: 1080 } },
  phone: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
};

let browser = null;
async function getBrowser(){ if(!browser) browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); return browser; }
async function closeBrowser(){ if(browser){ await browser.close(); browser = null; } }

async function newPage(dev){
  const b = await getBrowser();
  const ctx = await b.newContext(DEVICES[dev]);
  /* fonts from Google may be blocked here: never wait on them */
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => { (page._errs = page._errs || []).push(String(e && e.message || e)); });
  page._dev = dev;
  return page;
}

/* open a route with the intro dismissed and the chosen language */
async function open(page, hash, opts){
  opts = opts || {};
  const url = 'file://' + BUILD + (hash || '#/');
  if(!page._loaded){
    await page.goto('file://' + BUILD + '#/');
    await page.evaluate((o) => { ST.seenIntro = true; if(o.lang) ST.lang = o.lang; if(o.setup) (new Function(o.setup))(); saveState(); }, opts);
    page._loaded = true;
    await page.goto(url);
    await page.reload();
  } else {
    await page.evaluate((o) => { if(o.lang && ST.lang !== o.lang){ ST.lang = o.lang; saveState(); } if(o.setup){ (new Function(o.setup))(); saveState(); } }, opts);
    await page.evaluate((h) => { if(location.hash !== h) location.hash = h; else rerender(); }, hash || '#/');
  }
  await page.waitForTimeout(opts.wait || 900);
  await page.evaluate(() => { if(document.querySelector('.modal-back') && typeof closeModal === 'function') closeModal(); });
}

/* scrollLeft read the way the shop reads it (home tracks keep a float) */
async function sl(page, id){ return page.evaluate(i => { const e = document.getElementById(i); return e ? e.scrollLeft : null; }, id); }
async function isMoving(page, id, ms){
  const a = await sl(page, id); await page.waitForTimeout(ms || 400); const b = await sl(page, id);
  return { moving: a !== null && Math.abs(b - a) >= 1, delta: b - a };
}
/* install a watcher: resolves with ms from now until the row moves >= 1px (or -1 on timeout) */
async function armMoveWatch(page, id, timeout){
  await page.evaluate(([i, to]) => {
    const e = document.getElementById(i); window.__mw = { done: false, ms: -1 };
    const x0 = e.scrollLeft, t0 = performance.now();
    const tick = () => { const now = performance.now(); if(Math.abs(e.scrollLeft - x0) >= 1){ window.__mw = { done: true, ms: Math.round(now - t0) }; return; }
      if(now - t0 > to){ window.__mw = { done: true, ms: -1 }; return; } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [id, timeout || 6000]);
}
async function readMoveWatch(page, timeout){
  const t = Date.now();
  while(Date.now() - t < (timeout || 7000)){ const r = await page.evaluate(() => window.__mw); if(r && r.done) return r.ms; await page.waitForTimeout(50); }
  return -1;
}
async function center(page, sel){
  const h = await page.$(sel); if(!h) return null;
  await h.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(150);
  const bb = await h.boundingBox(); if(!bb) return null;
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, bb };
}
/* CDP touch for the phone */
async function cdp(page){ if(!page._cdp) page._cdp = await page.context().newCDPSession(page); return page._cdp; }
async function touch(page, type, x, y){
  const c = await cdp(page);
  await c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
}
async function swipe(page, x0, y0, x1, y1, steps, msPerStep){
  await touch(page, 'touchStart', x0, y0);
  for(let i = 1; i <= (steps || 8); i++){ await touch(page, 'touchMove', x0 + (x1 - x0) * i / (steps || 8), y0 + (y1 - y0) * i / (steps || 8)); await page.waitForTimeout(msPerStep || 16); }
  await touch(page, 'touchEnd');
}
async function tap(page, x, y){ await touch(page, 'touchStart', x, y); await page.waitForTimeout(60); await touch(page, 'touchEnd'); }

/* results */
const RESULTS = [];
function rec(r){
  r.pass = r.pass === undefined ? null : r.pass;
  RESULTS.push(r);
  const tag = r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'INFO';
  console.log(`[${tag}] ${r.id} · ${r.dev || ''}${r.lang ? '/' + r.lang : ''} · ${r.page || ''} · ${r.what} → ${r.measured}${r.note ? '  (' + r.note + ')' : ''}`);
}
function save(name){
  const f = path.join(OUT, name + '.json');
  fs.writeFileSync(f, JSON.stringify(RESULTS, null, 1));
  const p = RESULTS.filter(r => r.pass === true).length, fl = RESULTS.filter(r => r.pass === false).length;
  console.log(`\n${name}: ${RESULTS.length} checks — ${p} pass, ${fl} fail, ${RESULTS.length - p - fl} info → ${f}`);
}
async function scrollY(page){ return page.evaluate(() => window.pageYOffset); }
async function locked(page){
  /* try to scroll the page with the wheel / programmatic attempt and see if it moves */
  return page.evaluate(() => { const cs = getComputedStyle(document.body).overflow, hs = getComputedStyle(document.documentElement).overflow; return { body: cs, html: hs }; });
}
module.exports = { BUILD, OUT, DEVICES, getBrowser, closeBrowser, newPage, open, sl, isMoving, armMoveWatch, readMoveWatch, center, cdp, touch, swipe, tap, rec, save, RESULTS, scrollY, locked };
