/* L29 · sliders: every stop has a resume, measured.
   Desktop (real mouse) 1366×768 + 1920×1080, phone 393×852 with CDP touch. */
const L = require('./lib');
const SETUP_BAG = "ST.user = Object.keys(ST.accounts)[0]; if(!ST.bag.length){ var ps = DB.products.slice(0,3); ps.forEach(function(p){ var c=p.colors[0], s=p.sizes.filter(function(z){return stockOf(p.id,c,z)>0;})[0]; if(s) bagAdd({kind:'item',product:p.id,color:c,size:s,qty:1}); }); }";

async function outsidePoint(page, id){
  return page.evaluate((i) => {
    const e = document.getElementById(i), r = e.getBoundingClientRect(), H = innerHeight, W = innerWidth;
    const cands = [[r.left + r.width / 2, r.top - 30], [r.left + r.width / 2, r.bottom + 30], [r.left + r.width / 2, r.top - 70], [r.left + r.width / 2, r.bottom + 70], [W - 8, H - 8], [8, H / 2]];
    for(const [x, y] of cands){
      if(y < 90 || y > H - 4) continue;
      const t = document.elementFromPoint(x, y); if(!t) continue;
      if(t.closest('[data-sm]') || t.closest('.hdr') || t.closest('#mega-panel') || t.closest('.hm-slnav')) continue;
      return { x, y };
    }
    return { x: W / 2, y: H - 6 };
  }, id);
}
async function bringIn(page, id){
  await page.evaluate((i) => { const e = document.getElementById(i); const r = e.getBoundingClientRect(); window.scrollBy(0, r.top - (innerHeight - r.height) / 2); }, id);
  await page.waitForTimeout(250);
  return page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom }; }, id);
}
async function tracks(page){ return page.evaluate(() => [...document.querySelectorAll('[data-sm]')].map(e => e.id).filter(i => SMOOTH.peek(i))); }

async function desktopTrack(page, dev, lang, pg, id){
  const base = { dev, lang, page: pg };
  const c = await bringIn(page, id);
  const out = await outsidePoint(page, id);
  await page.mouse.move(out.x, out.y);
  await page.waitForTimeout(500);
  let m = await L.isMoving(page, id, 500);
  L.rec({ ...base, id: 'SL-01 ' + id, what: 'drifts on its own (no mouse)', measured: m.moving ? `moving (${m.delta.toFixed(1)} px / 0.5 s)` : 'still', pass: m.moving });
  /* hover → still */
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.waitForTimeout(250);
  m = await L.isMoving(page, id, 700);
  L.rec({ ...base, id: 'SL-02 ' + id, what: 'mouse over → still', measured: m.moving ? `still moving (${m.delta.toFixed(1)} px)` : 'still (0 px / 0.7 s)', pass: !m.moving });
  /* leave → moves at once */
  await L.armMoveWatch(page, id, 6000);
  await page.mouse.move(out.x, out.y, { steps: 3 });
  let ms = await L.readMoveWatch(page);
  L.rec({ ...base, id: 'SL-03 ' + id, what: 'mouse leaves → moving again (≤ 500 ms)', measured: ms < 0 ? 'not moving after 6 s' : ms + ' ms', pass: ms >= 0 && ms <= 500 });
  /* wheel over the row, then leave */
  await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(150);
  await page.mouse.wheel(60, 0); await page.waitForTimeout(400);
  await L.armMoveWatch(page, id, 6000);
  await page.mouse.move(out.x, out.y, { steps: 3 });
  ms = await L.readMoveWatch(page);
  L.rec({ ...base, id: 'SL-04 ' + id, what: 'sideways wheel/trackpad on the row, then leave → moving (≤ 500 ms)', measured: ms < 0 ? 'not moving after 6 s' : ms + ' ms', pass: ms >= 0 && ms <= 500 });
  /* mouse drag ending on the row, then leave */
  await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(150);
  await page.mouse.down(); await page.mouse.move(c.x - 140, c.y, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(700);                       /* snap glide ≤ 320 ms */
  m = await L.isMoving(page, id, 500);
  const stillAfterDrag = !m.moving;
  await L.armMoveWatch(page, id, 6000);
  await page.mouse.move(out.x, out.y, { steps: 3 });
  ms = await L.readMoveWatch(page);
  L.rec({ ...base, id: 'SL-05 ' + id, what: 'mouse drag released on the row: still while over it; leave → moving (≤ 500 ms)', measured: (stillAfterDrag ? 'still while over · ' : 'MOVED while over · ') + (ms < 0 ? 'not moving after 6 s' : 'leave→move ' + ms + ' ms'), pass: stillAfterDrag && ms >= 0 && ms <= 500 });
  /* mouse drag that leaves the row and is released outside */
  await page.waitForTimeout(300);
  await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(150);
  await page.evaluate(i => { window.__ds = 0; const e = document.getElementById(i); if(!e._dsW){ e._dsW = 1; e.addEventListener('dragstart', (d) => { if(!d.defaultPrevented) window.__ds++; }); } }, id);
  const x0 = await L.sl(page, id);
  await page.mouse.down(); await page.mouse.move(c.x - 100, c.y, { steps: 6 });
  const x1 = await L.sl(page, id);
  await page.mouse.move(out.x, out.y, { steps: 6 });
  await L.armMoveWatch(page, id, 7000);
  await page.mouse.up();
  await page.mouse.move(out.x + 4, out.y + 2);          /* a real hand always nudges the mouse after letting go */
  ms = await L.readMoveWatch(page, 8000);
  const ds = await page.evaluate(() => window.__ds);
  L.rec({ ...base, id: 'SL-06b ' + id, what: 'a mouse drag on the row moves the row (no browser "ghost" link/picture drag)', measured: (ds ? `browser ghost drag started (dragstart ×${ds}) · ` : '') + `row moved ${(x1 - x0).toFixed(0)} px for a 100 px drag`, pass: !ds && Math.abs(x1 - x0) >= 60 });
  L.rec({ ...base, id: 'SL-06 ' + id, what: 'mouse drag released OFF the row → moving again (≤ 500 ms after the snap, i.e. ≤ 850 ms)', measured: ms < 0 ? 'not moving after 7 s' : ms + ' ms after release', pass: ms >= 0 && ms <= 850 });
  /* the cursor leaves during the snap glide (drag released on the row, mouse out at once) */
  await page.waitForTimeout(300);
  await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(150);
  await page.mouse.down(); await page.mouse.move(c.x - 130, c.y, { steps: 8 }); await page.mouse.up();
  await page.mouse.move(out.x, out.y);                  /* immediately, while it glides to the card edge */
  await page.waitForTimeout(400);                       /* glide done */
  await L.armMoveWatch(page, id, 6000);
  ms = await L.readMoveWatch(page);
  L.rec({ ...base, id: 'SL-07 ' + id, what: 'mouse leaves while the row is still gliding to a card edge → moving once the glide ends (≤ 500 ms)', measured: ms < 0 ? 'not moving after 6 s' : (ms + 400) + ' ms after leave', pass: ms >= 0 && ms <= 500 });
  /* stress: 20 fast in/out, end outside → moving; end inside → still */
  await page.waitForTimeout(200);
  for(let i = 0; i < 20; i++){ await page.mouse.move(c.x, c.y); await page.waitForTimeout(15); await page.mouse.move(out.x, out.y); await page.waitForTimeout(15); }
  m = await L.isMoving(page, id, 500);
  const st1 = await page.evaluate(i => { const s = SMOOTH.peek(i); return s ? { hover: s.hover, pause: Math.max(0, s.pause - Date.now()) } : null; }, id);
  await page.mouse.move(c.x, c.y); await page.waitForTimeout(200);
  const m2 = await L.isMoving(page, id, 500);
  await page.mouse.move(out.x, out.y); await page.waitForTimeout(300);
  L.rec({ ...base, id: 'SL-08 ' + id, what: '20 fast enter/leave cycles: ends outside → moving; then inside → still', measured: `outside: ${m.moving ? 'moving' : 'STILL'} (hover=${st1 && st1.hover}, hold=${st1 && st1.pause} ms) · inside: ${m2.moving ? 'MOVING' : 'still'}`, pass: m.moving && !m2.moving });
}

/* the page scrolls under a still cursor (vertical wheel): the row slides out from under the mouse */
async function scrollAway(page, dev, lang, pg, id){
  const c = await bringIn(page, id);
  await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(300);
  const need = Math.ceil(((c.b - c.t) / 2 + 60) / 100);
  for(let i = 0; i < need; i++){ await page.mouse.wheel(0, 100); await page.waitForTimeout(30); }
  await L.armMoveWatch(page, id, 7000);
  const ms = await L.readMoveWatch(page, 8000);
  const under = await page.evaluate(([x, y, i]) => { const t = document.elementFromPoint(x, y); return !!(t && t.closest('#' + i)); }, [c.x, c.y, id]);
  const st = await page.evaluate(i => { const s = SMOOTH.peek(i); return s ? s.hover : null; }, id);
  L.rec({ dev, lang, page: pg, id: 'SL-09 ' + id, what: 'scrolling the page DOWN with the wheel while the cursor passes over the row → once the row is out from under the cursor it moves again (≤ 500 ms)', measured: (under ? 'cursor still over row · ' : '') + (ms < 0 ? 'not moving after 7 s' : ms + ' ms after the last wheel step') + ` (hover flag ${st})`, pass: under ? null : (ms >= 0 && ms <= 500) });
  await page.mouse.move(5, 300);
}
/* a re-render while the mouse rests on a row (e.g. a heart / quick add on a card) */
async function rerenderUnder(page, dev, lang, pg, id){
  const c = await bringIn(page, id);
  await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(300);
  await page.evaluate(() => rerender()); await page.waitForTimeout(400);
  const has = await page.evaluate(i => !!document.getElementById(i), id);
  if(!has) return;
  const m = await L.isMoving(page, id, 700);
  L.rec({ dev, lang, page: pg, id: 'SL-10 ' + id, what: 'page redraws (heart / quick add / language) while the mouse rests on the row → row stays still under the cursor', measured: m.moving ? `MOVING under the cursor (${m.delta.toFixed(1)} px / 0.7 s) until the mouse moves` : 'still', pass: !m.moving });
  await page.mouse.move(c.x + 3, c.y, { steps: 2 }); await page.waitForTimeout(200);
  const m2 = await L.isMoving(page, id, 600);
  L.rec({ dev, lang, page: pg, id: 'SL-10b ' + id, what: '…after the redraw, the next small mouse move stops it', measured: m2.moving ? 'still MOVING' : 'still', pass: !m2.moving });
  await page.mouse.move(5, 300);
}

/* the hero: arrows + keyboard */
async function heroArrows(page, dev, lang){
  const base = { dev, lang, page: 'home' };
  const id = 'hm-sltrack';
  const c = await bringIn(page, id);
  const nxt = await page.evaluate(() => { const b = document.querySelector('.hm-slnav.next').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  const out = await outsidePoint(page, id);
  await page.mouse.move(out.x, out.y); await page.waitForTimeout(300);
  /* arrows fade in on hover, out on leave */
  await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(300);
  const opIn = await page.evaluate(() => getComputedStyle(document.querySelector('.hm-slnav.next')).opacity);
  await page.mouse.move(out.x, out.y, { steps: 3 }); await page.waitForTimeout(300);
  const opOut = await page.evaluate(() => getComputedStyle(document.querySelector('.hm-slnav.next')).opacity);
  L.rec({ ...base, id: 'HR-01', what: 'hero arrows fade in on hover, fade out on leave (0.15 s)', measured: `in ${opIn} · out ${opOut}`, pass: +opIn > 0.9 && +opOut < 0.1 });
  /* click → one card */
  await page.mouse.move(nxt.x, nxt.y, { steps: 4 }); await page.waitForTimeout(200);
  const step = await page.evaluate(() => hm_step(document.getElementById('hm-sltrack')));
  const a = await L.sl(page, id);
  await page.mouse.click(nxt.x, nxt.y); await page.waitForTimeout(600);
  const b = await L.sl(page, id);
  const d = b - a;
  L.rec({ ...base, id: 'HR-02', what: 'click › → moves exactly one card', measured: `${d.toFixed(1)} px (one card = ${step} px)`, pass: Math.abs(Math.abs(d) - step) <= 3 || Math.abs(Math.abs(d) - step) >= (await page.evaluate(() => document.getElementById('hm-sltrack')._smHalf)) - 3 });
  /* still while the mouse is on the arrow */
  const m = await L.isMoving(page, id, 600);
  L.rec({ ...base, id: 'HR-03', what: 'mouse resting on the arrow after the click → row still', measured: m.moving ? 'MOVING' : 'still', pass: !m.moving });
  /* leave the slider → moves at once */
  await L.armMoveWatch(page, id, 8000);
  await page.mouse.move(out.x, out.y, { steps: 4 });
  const ms = await L.readMoveWatch(page, 9000);
  const st = await page.evaluate(() => { const s = SMOOTH.peek('hm-sltrack'); return { hover: s.hover, active: document.activeElement && document.activeElement.className }; });
  L.rec({ ...base, id: 'HR-04', what: 'after clicking an arrow, the mouse leaves the slider → moving again (≤ 500 ms)', measured: ms < 0 ? `NOT moving after 8 s (hover flag ${st.hover}, focus on "${st.active}")` : ms + ' ms', pass: ms >= 0 && ms <= 500 });
  await page.waitForTimeout(300);                       /* TA-2: let the 0.15 s fade finish before reading (same 300 ms as HR-01); TA-1 read it ~50 ms in */
  const opAfter = await page.evaluate(() => getComputedStyle(document.querySelector('.hm-slnav.next')).opacity);
  L.rec({ ...base, id: 'HR-05', what: 'after an arrow click and leave, the arrows fade out again', measured: 'opacity ' + opAfter, pass: +opAfter < 0.1 });
  /* clicking elsewhere (focus leaves) → resumes after the 1.5 s keyboard grace */
  await L.armMoveWatch(page, id, 6000);
  await page.mouse.click(out.x, out.y);
  const ms2 = await L.readMoveWatch(page);
  L.rec({ ...base, id: 'HR-06', what: '…then a click elsewhere on the page → moving again', measured: ms2 < 0 ? 'not moving after 6 s' : ms2 + ' ms after the click', pass: ms2 >= 0 && ms2 <= 2000, note: '1.5 s focus grace by design' });
  /* keyboard: Tab into a slide → still; Tab out → resumes after 1.5 s */
  await page.evaluate(() => { const s = [...document.querySelectorAll('#hm-sltrack .hm-sl')].find(a => a.tabIndex === 0); if(s){ s.focus(); } });
  await page.waitForTimeout(300);
  const mk = await L.isMoving(page, id, 600);
  L.rec({ ...base, id: 'HR-07', what: 'keyboard focus on a hero slide → still', measured: mk.moving ? 'MOVING' : 'still', pass: !mk.moving });
  await L.armMoveWatch(page, id, 6000);
  await page.evaluate(() => { document.activeElement.blur(); document.body.focus(); });
  const ms3 = await L.readMoveWatch(page);
  L.rec({ ...base, id: 'HR-08', what: 'keyboard focus leaves the hero → moving again after the 1.5 s grace', measured: ms3 < 0 ? 'not moving after 6 s' : ms3 + ' ms', pass: ms3 >= 1300 && ms3 <= 1900 });
}

/* phone: touch keeps the 4 s hold */
async function phoneTrack(page, pg, id){
  const base = { dev: 'phone', lang: 'en', page: pg };
  await page.evaluate(() => { if(!window.__noNav){ window.__noNav = 1; document.addEventListener('click', e => { if(e.target.closest && e.target.closest('[data-sm]')){ e.preventDefault(); e.stopPropagation(); } }, true); } });
  const c = await bringIn(page, id);
  let m = await L.isMoving(page, id, 600);
  L.rec({ ...base, id: 'SLT-01 ' + id, what: 'drifts on its own', measured: m.moving ? 'moving' : 'STILL', pass: m.moving });
  /* tap (touch, no move) → hold 4 s → moves */
  await L.touch(page, 'touchStart', c.x, c.y); await page.waitForTimeout(60);
  await L.armMoveWatch(page, id, 7000);
  await L.touch(page, 'touchEnd');
  let ms = await L.readMoveWatch(page, 8000);
  L.rec({ ...base, id: 'SLT-02 ' + id, what: 'finger tap → stays still 4 s, then drifts (3.8–4.6 s)', measured: ms < 0 ? 'not moving after 7 s' : ms + ' ms', pass: ms >= 3800 && ms <= 4600 });
  /* swipe → glides to a card edge, holds 4 s, then drifts */
  await page.waitForTimeout(300);
  const c2 = await bringIn(page, id);
  await L.swipe(page, c2.x + 80, c2.y, c2.x - 80, c2.y, 10, 16);
  await page.waitForTimeout(700);
  m = await L.isMoving(page, id, 500);
  const still = !m.moving;
  await L.armMoveWatch(page, id, 7000);
  ms = await L.readMoveWatch(page, 8000);
  const total = ms < 0 ? -1 : ms + 1200;
  L.rec({ ...base, id: 'SLT-03 ' + id, what: 'finger swipe → snaps, holds ~4 s, then drifts (total 3.9–5.0 s after lift)', measured: (still ? 'held · ' : 'MOVED early · ') + (ms < 0 ? 'not moving after 7 s' : '~' + total + ' ms after lift'), pass: still && total >= 3900 && total <= 5000 });
  const hv = await page.evaluate(i => SMOOTH.peek(i) && SMOOTH.peek(i).hover, id);
  L.rec({ ...base, id: 'SLT-04 ' + id, what: 'a tap never leaves the mouse "hover" flag on (the old L27 freeze)', measured: 'hover flag ' + hv, pass: hv === false });
}

(async () => {
  for(const dev of ['d1366', 'd1920']){
    for(const lang of (dev === 'd1366' ? ['en', 'bn'] : ['en'])){
      const page = await L.newPage(dev);
      await L.open(page, '#/', { lang, setup: SETUP_BAG });
      const pages = [['home', '#/'], ['category', '#/c/polos'], ['product', '#/p/essential-pique-polo'], ['bag', '#/bag'], ['account', '#/account/foryou']];
      if(lang === 'bn') pages.splice(2);
      for(const [pg, h] of pages){
        await L.open(page, h, { lang, wait: 1300 });
        await page.evaluate(() => window.scrollTo(0, 0));
        const ids = await tracks(page);
        if(!ids.length){ L.rec({ dev, lang, page: pg, id: 'SL-00', what: 'auto-moving rows on this page', measured: 'none at this width (rows fit, nothing drifts)', pass: null }); continue; }
        for(const id of ids){ await desktopTrack(page, dev, lang, pg, id); }
        if(pg === 'home'){ await heroArrows(page, dev, lang); await scrollAway(page, dev, lang, pg, 'hm-flash1'); await scrollAway(page, dev, lang, pg, 'hm-revtrack'); await rerenderUnder(page, dev, lang, pg, 'hm-revtrack'); }
        if(pg === 'category' && lang === 'en'){ await rerenderUnder(page, dev, lang, pg, ids[0]); await scrollAway(page, dev, lang, pg, ids[0]); }
      }
      await page.context().close();
    }
  }
  const page = await L.newPage('phone');
  await L.open(page, '#/', { setup: SETUP_BAG });
  const order = await page.evaluate(() => Object.keys(ST.orders)[0]);
  for(const [pg, h] of [['home', '#/'], ['category', '#/c/polos'], ['product', '#/p/essential-pique-polo'], ['bag', '#/bag'], ['thanks', '#/thanks/' + order], ['account', '#/account/foryou']]){
    await L.open(page, h, { wait: 1300 });
    const ids = await tracks(page);
    if(!ids.length){ L.rec({ dev: 'phone', page: pg, id: 'SLT-00', what: 'auto-moving rows on this page', measured: 'none', pass: null }); continue; }
    for(const id of (pg === 'home' ? ids : ids.slice(0, 2))) await phoneTrack(page, pg, id);
  }
  await page.context().close();
  L.save('sliders');
  await L.closeBrowser();
})().catch(async e => { console.error(e); L.save('sliders'); await L.closeBrowser(); process.exit(1); });
