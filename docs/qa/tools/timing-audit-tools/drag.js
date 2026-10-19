/* L29 · drag (added in TA-2 for T3): every auto-moving row can be mouse-dragged,
   a click that ends a real drag does NOT open the card, a plain click still does,
   and a phone tap still opens it (touch untouched). One browser, foreground. */
const L = require('./lib');
const PAGES = [['home', '#/'], ['category', '#/c/polos'], ['product', '#/p/essential-pique-polo'], ['account', '#/account/foryou']];
const SETUP = "ST.user = Object.keys(ST.accounts)[0];";

async function tracks(page){ return page.evaluate(() => [...document.querySelectorAll('[data-sm]')].map(e => e.id).filter(i => SMOOTH.peek(i))); }
async function cardPoint(page, id){
  await page.evaluate((i) => { const e = document.getElementById(i); const r = e.getBoundingClientRect(); window.scrollBy(0, r.top - (innerHeight - r.height) / 2); }, id);
  await page.waitForTimeout(250);
  return page.evaluate((i) => {
    const e = document.getElementById(i), r = e.getBoundingClientRect();
    for(const fx of [0.5, 0.4, 0.6, 0.3, 0.7]){
      const x = r.left + r.width * fx, y = r.top + r.height * 0.45, t = document.elementFromPoint(x, y);
      const a = t && t.closest('a[href]');
      if(a && e.contains(a)) return { x, y, href: a.getAttribute('href') };
    }
    return null;
  }, id);
}
async function outside(page){ await page.mouse.move(6, 300); await page.waitForTimeout(200); }

(async () => {
  const page = await L.newPage('d1366');
  await L.open(page, '#/', { setup: SETUP });
  for(const [pg, h] of PAGES){
    await L.open(page, h, { wait: 1300 });
    const ids = await tracks(page);
    for(const id of ids){
      const base = { dev: 'd1366', lang: 'en', page: pg };
      await outside(page);
      const c = await cardPoint(page, id);
      if(!c){ L.rec({ ...base, id: 'DR-00 ' + id, what: 'a card link under the row centre', measured: 'no link found', pass: null }); continue; }
      const h0 = await page.evaluate(() => location.hash);
      /* DR-01: drag 120 px and let go on the row → row moved, no ghost drag, NO navigation */
      await page.evaluate(i => { window.__ds = 0; const e = document.getElementById(i); if(!e._dsW2){ e._dsW2 = 1; e.addEventListener('dragstart', d => { if(!d.defaultPrevented) window.__ds++; }); } }, id);
      await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(150);
      const x0 = await L.sl(page, id);
      await page.mouse.down(); await page.mouse.move(c.x - 120, c.y, { steps: 10 });
      const x1 = await L.sl(page, id);
      await page.mouse.up(); await page.waitForTimeout(600);
      const h1 = await page.evaluate(() => location.hash), ds = await page.evaluate(() => window.__ds);
      L.rec({ ...base, id: 'DR-01 ' + id, what: 'mouse drag released on a card → row follows the mouse, no ghost drag, the card does NOT open', measured: `moved ${Math.round(Math.abs(x1 - x0))} px · dragstart ${ds} · ${h1 === h0 ? 'stayed on the page' : 'NAVIGATED to ' + h1}`, pass: Math.abs(x1 - x0) >= 60 && !ds && h1 === h0 });
      if(h1 !== h0){ await L.open(page, h, { wait: 1300 }); }
      /* DR-02: a plain click on a card still opens it */
      await outside(page);
      const c2 = await cardPoint(page, id);
      if(!c2){ L.rec({ ...base, id: 'DR-02 ' + id, what: 'plain click opens the card', measured: 'no link found', pass: null }); continue; }
      await page.mouse.move(c2.x, c2.y, { steps: 4 }); await page.waitForTimeout(300);   /* hover pauses the row: the target stays put */
      const want = await page.evaluate(([x, y]) => { const a = document.elementFromPoint(x, y).closest('a[href]'); return a ? a.getAttribute('href') : null; }, [c2.x, c2.y]);
      await page.mouse.click(c2.x, c2.y); await page.waitForTimeout(700);
      const h2 = await page.evaluate(() => location.hash);
      L.rec({ ...base, id: 'DR-02 ' + id, what: 'plain mouse click on a card (no drag) → the card opens', measured: h2 !== h0 ? `opened ${h2}` : 'did NOT open', pass: h2 !== h0 && (!want || h2.indexOf(want.replace(/\?.*$/, '')) === 0) });
      await L.open(page, h, { wait: 1300 });
    }
  }
  await page.context().close();
  /* DR-03: phone — a tap on a card still opens it (touch path unchanged) */
  const ph = await L.newPage('phone');
  await L.open(ph, '#/', { setup: SETUP });
  for(const [pg, h] of PAGES.slice(1, 3)){
    await L.open(ph, h, { wait: 1300 });
    const ids = await tracks(ph);
    if(!ids.length) continue;
    let id = ids[0], c = null;
    for(const t of ids){ c = await cardPoint(ph, t); if(c){ id = t; break; } }   /* review rows have no links: take the first row with cards */
    if(!c){ L.rec({ dev: 'phone', lang: 'en', page: pg, id: 'DR-03 ' + id, what: 'phone tap opens the card', measured: 'no link found', pass: null }); continue; }
    const h0 = await ph.evaluate(() => location.hash);
    await L.tap(ph, c.x, c.y); await ph.waitForTimeout(800);
    const h1 = await ph.evaluate(() => location.hash);
    L.rec({ dev: 'phone', lang: 'en', page: pg, id: 'DR-03 ' + id, what: 'phone: a tap on a card still opens it (touch path unchanged)', measured: h1 !== h0 ? `opened ${h1}` : 'did NOT open', pass: h1 !== h0 });
  }
  await ph.context().close();
  L.save('drag');
  await L.closeBrowser();
})().catch(async e => { console.error(e); L.save('drag'); await L.closeBrowser(); process.exit(1); });
