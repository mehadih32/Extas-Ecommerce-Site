/* L29 · hover / menu / tooltip / card / header-motion / toast timing (desktop, real mouse) */
const L = require('./lib');
const SETUP = "ST.user = Object.keys(ST.accounts)[0]; if(!ST.bag.length){ var p = DB.products[0], c=p.colors[0], s=p.sizes.filter(function(z){return stockOf(p.id,c,z)>0;})[0]; bagAdd({kind:'item',product:p.id,color:c,size:s,qty:1}); }";

async function pollMs(page, fnSrc, timeout){
  return page.evaluate(([src, to]) => new Promise(res => { const f = new Function('return (' + src + ')'); const t0 = performance.now();
    const tick = () => { let v = false; try{ v = f(); }catch(e){} if(v) return res(Math.round(performance.now() - t0)); if(performance.now() - t0 > to) return res(-1); requestAnimationFrame(tick); }; tick(); }), [fnSrc, timeout || 3000]);
}
/* start a watcher (in page) and return a handle we can read after doing a mouse action */
async function armPoll(page, fnSrc, timeout){
  await page.evaluate(([src, to]) => { const f = new Function('return (' + src + ')'); window.__pw = { done: false, ms: -1 }; const t0 = performance.now();
    const tick = () => { let v = false; try{ v = f(); }catch(e){} if(v){ window.__pw = { done: true, ms: Math.round(performance.now() - t0) }; return; } if(performance.now() - t0 > to){ window.__pw = { done: true, ms: -1 }; return; } requestAnimationFrame(tick); }; tick(); }, [fnSrc, timeout || 3000]);
}
async function readPoll(page){ for(let i = 0; i < 200; i++){ const r = await page.evaluate(() => window.__pw); if(r && r.done) return r.ms; await page.waitForTimeout(25); } return -1; }
async function box(page, sel){ return page.evaluate(s => { const e = typeof s === 'string' ? document.querySelector(s) : null; if(!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom }; }, sel); }

async function mega(page, dev, lang){
  const base = { dev, lang, page: 'home (header)' };
  await L.open(page, '#/', { lang, wait: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const items = await page.evaluate(() => megaItems().filter(a => a.hasAttribute('data-mega')).slice(0, 2).map(a => { const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, b: r.bottom, nav: a.getAttribute('data-nav') || a.textContent.trim() }; }));
  if(items.length < 2){ L.rec({ ...base, id: 'MM-00', what: 'mega menu present', measured: 'not found', pass: false }); return; }
  const [a, b] = items;
  const away = { x: 30, y: 600 };
  await page.mouse.move(away.x, away.y);
  await page.waitForTimeout(400);
  const isOpen = "!!(document.getElementById('mega-panel') && document.getElementById('mega-panel').classList.contains('on'))";
  const isClosed = '!(' + isOpen + ')';
  /* MM-01 open delay */
  await page.mouse.move(a.x, a.y - 30);
  await armPoll(page, isOpen, 2000);
  await page.mouse.move(a.x, a.y);
  let ms = await readPoll(page);
  L.rec({ ...base, id: 'MM-01', what: 'mouse rests on a menu item → panel opens after ~150 ms (100–260)', measured: ms < 0 ? 'never opened' : ms + ' ms', pass: ms >= 100 && ms <= 260 });
  /* MM-04 into the panel → stays open */
  const pb = await box(page, '#mega-panel');
  if(pb){ await page.mouse.move(a.x, a.b + 6, { steps: 2 }); await page.mouse.move(a.x, Math.min(pb.b - 20, a.b + 80), { steps: 4 }); await page.waitForTimeout(600); }
  let open = await page.evaluate(isOpen);
  L.rec({ ...base, id: 'MM-02', what: 'mouse moves from the item down into the panel → stays open (0.6 s later)', measured: open ? 'open' : 'CLOSED', pass: open });
  /* MM-05 leave the panel → closes after ~250 ms */
  await armPoll(page, isClosed, 2000);
  await page.mouse.move(away.x, (pb ? pb.b : 500) + 60);
  ms = await readPoll(page);
  L.rec({ ...base, id: 'MM-03', what: 'mouse leaves the panel → closes after ~250 ms (200–360)', measured: ms < 0 ? 'still open after 2 s' : ms + ' ms', pass: ms >= 200 && ms <= 360 });
  /* MM-06 brief pass over an item (< 100 ms) → never opens */
  await page.mouse.move(a.x, a.y); await page.waitForTimeout(60); await page.mouse.move(away.x, away.y);
  await page.waitForTimeout(500);
  open = await page.evaluate(isOpen);
  L.rec({ ...base, id: 'MM-04', what: 'mouse just passes over an item (60 ms) → panel never opens', measured: open ? 'OPENED' : 'stayed closed', pass: !open });
  /* MM-07 leave the item upward (not into panel) → closes ~250 ms */
  await page.mouse.move(a.x, a.y); await page.waitForTimeout(350);
  await armPoll(page, isClosed, 2000);
  await page.mouse.move(away.x, away.y);
  ms = await readPoll(page);
  L.rec({ ...base, id: 'MM-05', what: 'mouse leaves the item (not into the panel) → closes after ~250 ms (200–360)', measured: ms < 0 ? 'still open after 2 s' : ms + ' ms', pass: ms >= 200 && ms <= 360 });
  /* MM-08 switch item while open → instant */
  await page.mouse.move(a.x, a.y); await page.waitForTimeout(350);
  await armPoll(page, `document.querySelector('.hdr .nav-i.mega-on') && document.querySelector('.hdr .nav-i.mega-on').getBoundingClientRect().left > ${a.x}`, 2000);
  await page.mouse.move(b.x, b.y, { steps: 3 });
  ms = await readPoll(page);
  L.rec({ ...base, id: 'MM-06', what: 'panel open, mouse slides to the next item → switches at once (≤ 120 ms incl. measuring)', measured: ms < 0 ? 'did not switch' : ms + ' ms', pass: ms >= 0 && ms <= 120 });
  /* MM-09 Esc → closes at once, focus on the item */
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  const esc = await page.evaluate(([isO]) => ({ open: (new Function('return ' + isO))(), focus: !!(document.activeElement && document.activeElement.classList.contains('nav-i')) }), [isOpen]);
  L.rec({ ...base, id: 'MM-07', what: 'Esc → closes at once, keyboard focus on the menu item', measured: `${esc.open ? 'OPEN' : 'closed'} · focus ${esc.focus ? 'on item' : 'LOST'}`, pass: !esc.open && esc.focus });
  await page.mouse.move(away.x, away.y); await page.waitForTimeout(400);
  /* MM-10 stress: 20 fast in/out ending outside */
  for(let i = 0; i < 20; i++){ await page.mouse.move(a.x, a.y); await page.waitForTimeout(20); await page.mouse.move(away.x, away.y); await page.waitForTimeout(20); }
  await page.waitForTimeout(500);
  const s1 = await page.evaluate(isOpen); await page.waitForTimeout(800); const s2 = await page.evaluate(isOpen);
  L.rec({ ...base, id: 'MM-08', what: '20 fast enter/leave cycles ending outside → closed, and nothing re-opens later', measured: `+0.5 s ${s1 ? 'OPEN' : 'closed'} · +1.3 s ${s2 ? 'OPEN' : 'closed'}`, pass: !s1 && !s2 });
  /* ending on the item */
  for(let i = 0; i < 20; i++){ await page.mouse.move(a.x, a.y); await page.waitForTimeout(20); await page.mouse.move(away.x, away.y); await page.waitForTimeout(20); }
  await page.mouse.move(a.x, a.y);
  await page.waitForTimeout(450);
  const s3 = await page.evaluate(isOpen);
  L.rec({ ...base, id: 'MM-09', what: '20 fast cycles ending ON the item → open (after the 150 ms intent)', measured: s3 ? 'open' : 'CLOSED', pass: s3 });
  /* MM-11 mousedown outside → closes at once */
  await page.mouse.move(a.x, a.b + 40); await page.waitForTimeout(100);
  await page.mouse.move(away.x, 700, { steps: 1 });
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(60);
  const s4 = await page.evaluate(isOpen);
  L.rec({ ...base, id: 'MM-10', what: 'click anywhere outside → closed', measured: s4 ? 'OPEN' : 'closed', pass: !s4 });
  /* MM-12 click a link in the panel → navigates; the panel is gone on the new page */
  await page.mouse.move(a.x, a.y); await page.waitForTimeout(350);
  const link = await page.evaluate(() => { const l = document.querySelector('#mega-panel .mega-a[href^="#/c/"]'); if(!l) return null; const r = l.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
  if(link){
    await page.mouse.move(a.x, a.b + 4, { steps: 2 }); await page.mouse.move(link.x, link.y, { steps: 5 }); await page.mouse.click(link.x, link.y);
    await page.waitForTimeout(500);
    const st = await page.evaluate(([isO]) => ({ page: CUR.page, open: (new Function('return ' + isO))(), exp: [...document.querySelectorAll('.hdr .nav-i[aria-expanded="true"]')].length }), [isOpen]);
    /* the mouse is now resting over the page body under the header */
    L.rec({ ...base, id: 'MM-11', what: 'click a link inside the panel → new page, panel closed (no stale open state)', measured: `page ${st.page} · panel ${st.open ? 'STILL OPEN' : 'closed'} · aria-expanded=true on ${st.exp} item(s)`, pass: st.page === 'category' && !st.open && st.exp === 0, note: 'mouse still over where the panel was' });
    await page.mouse.move(away.x, away.y); await page.waitForTimeout(500);
    const st2 = await page.evaluate(([isO]) => (new Function('return ' + isO))(), [isOpen]);
    L.rec({ ...base, id: 'MM-11b', what: '…and after the mouse moves away the panel is closed', measured: st2 ? 'STILL OPEN' : 'closed', pass: !st2 });
  }
  /* MM-13 keyboard: Space opens; Tab past the end of the nav closes */
  await L.open(page, '#/', { lang, wait: 800 });
  await page.evaluate(() => { const it = megaItems().filter(a => a.hasAttribute('data-mega'))[0]; it.focus(); });
  await page.keyboard.press('Space'); await page.waitForTimeout(80);
  const k1 = await page.evaluate(isOpen);
  await page.evaluate(() => { const b = document.querySelector('.hdr .hdr-r button, .hdr .hdr-r a'); if(b) b.focus(); });
  await page.waitForTimeout(80);
  const k2 = await page.evaluate(isOpen);
  L.rec({ ...base, id: 'MM-12', what: 'keyboard: Space opens; focus moves out of nav + panel → closes', measured: `Space: ${k1 ? 'open' : 'CLOSED'} · focus out: ${k2 ? 'STILL OPEN' : 'closed'}`, pass: k1 && !k2 });
}

async function headerMotion(page, dev){
  const base = { dev, lang: 'en', page: 'home (header)' };
  await L.open(page, '#/', { wait: 300 });
  await page.mouse.move(600, 600);
  await page.evaluate(() => { const l = [...document.querySelectorAll('.hdr .logo')].find(e => e.getClientRects().length && getComputedStyle(e).display !== 'none'); if(l) l.setAttribute('data-qa-logo', '1'); });
  const sels = ['.hdr [data-qa-logo]', '.hdr .hdr-wa-disc', '.hdr .hdr-bag.has svg', '.hdr .hdr-bag.has .count-dot'];
  const info = await page.evaluate((ss) => ss.map(s => { const e = document.querySelector(s); if(!e) return { s, none: true }; const a = e.getAnimations(); return { s, n: a.length, it: a.map(x => x.effect.getComputedTiming().iterations), dur: a.map(x => x.effect.getComputedTiming().duration), delay: a.map(x => x.effect.getComputedTiming().delay) }; }), sels);
  const maxEnd = Math.max(...info.filter(i => !i.none && i.n).map(i => Math.max(...i.dur.map((d, k) => i.delay[k] + d * 3))));
  await page.waitForTimeout(Math.min(30000, maxEnd + 800));
  const after = await page.evaluate((ss) => ss.map(s => { const e = document.querySelector(s); if(!e) return null; return e.getAnimations().map(a => a.playState); }), sels);
  sels.forEach((s, i) => { if(info[i].none) return;
    if(!info[i].n){ L.rec({ ...base, id: 'HA-01 ' + s, what: 'header motion stops after 3 rounds', measured: 'element has no motion on desktop (nothing to stop)', pass: null }); return; }
    const running = (after[i] || []).filter(x => x === 'running').length;
    L.rec({ ...base, id: 'HA-01 ' + s, what: `header motion stops after 3 rounds (checked at ${Math.round((maxEnd + 800) / 1000)} s)`, measured: running ? `${running} animation(s) still running (iterations ${info[i].it})` : `stopped (iterations ${info[i].it.join(',')})`, pass: !running }); });
  for(const [s, hov] of [['.hdr [data-qa-logo]', '.hdr [data-qa-logo]'], ['.hdr .hdr-wa-disc', '.hdr .hdr-wa'], ['.hdr .hdr-bag.has svg', '.hdr .hdr-bag.has']]){
    const hb = await box(page, hov); if(!hb) continue;
    const any = await page.evaluate(x => { const e = document.querySelector(x); return !!e && (e.getAnimations().length > 0 || getComputedStyle(e).animationName !== 'none'); }, s);
    if(!any){ L.rec({ ...base, id: 'HA-02 ' + s, what: 'hover restarts the motion', measured: 'no motion defined for this element on desktop', pass: null }); continue; }
    await page.mouse.move(hb.x, hb.y, { steps: 3 }); await page.waitForTimeout(150);
    const run = await page.evaluate(x => document.querySelector(x).getAnimations().some(a => a.playState === 'running'), s);
    await page.mouse.move(600, 600, { steps: 3 }); await page.waitForTimeout(700);
    const run2 = await page.evaluate(x => document.querySelector(x).getAnimations().some(a => a.playState === 'running'), s);
    L.rec({ ...base, id: 'HA-02 ' + s, what: 'hover restarts the motion; leaving stops it again (checked 0.7 s after leave)', measured: `hover: ${run ? 'running' : 'NOT running'} · leave: ${run2 ? 'STILL running' : 'stopped'}`, pass: run && !run2 });
  }
}

async function tips(page, dev, lang){
  const base = { dev, lang, page: 'home (header)' };
  await L.open(page, '#/', { lang, wait: 600 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(600, 600); await page.waitForTimeout(300);
  /* WhatsApp tip */
  const wa = await box(page, '.hdr .hdr-wa');
  if(wa){
    await armPoll(page, "getComputedStyle(document.querySelector('.hdr .hdr-wa-tip')).opacity > 0.95", 2000);
    await page.mouse.move(wa.x, wa.y, { steps: 2 });
    const msIn = await readPoll(page);
    await armPoll(page, "getComputedStyle(document.querySelector('.hdr .hdr-wa-tip')).visibility === 'hidden' || getComputedStyle(document.querySelector('.hdr .hdr-wa-tip')).opacity < 0.05", 2000);
    await page.mouse.move(600, 600, { steps: 2 });
    const msOut = await readPoll(page);
    L.rec({ ...base, id: 'TT-01', what: 'WhatsApp tip: shows on hover (~0.18 s), clears on leave (≤ 0.4 s)', measured: `in ${msIn} ms · out ${msOut} ms`, pass: msIn >= 0 && msIn <= 400 && msOut >= 0 && msOut <= 400 });
    /* click the WA icon (it opens a new tab) — focus stays on the icon: does the tip stay stuck? */
    await page.evaluate(() => { const a = document.querySelector('.hdr .hdr-wa'); a.addEventListener('click', e => e.preventDefault(), { once: true }); });
    await page.mouse.click(wa.x, wa.y); await page.mouse.move(600, 600, { steps: 2 }); await page.waitForTimeout(450);
    const stuck = await page.evaluate(() => { const t = document.querySelector('.hdr .hdr-wa-tip'); return +getComputedStyle(t).opacity > 0.5 && getComputedStyle(t).visibility !== 'hidden'; });
    L.rec({ ...base, id: 'TT-02', what: 'after clicking the WhatsApp icon with the mouse and moving away, the tip clears', measured: stuck ? 'tip STAYS visible' : 'cleared', pass: !stuck });
    await page.mouse.click(600, 650);
  }
  /* header icon labels ([data-tip]) — appear after 0.25 s, leave clears */
  const tip = await page.evaluate(() => { const e = [...document.querySelectorAll('.hdr [data-tip]')].find(x => x.getClientRects().length); if(!e) return null; e.setAttribute('data-qa-tip', '1'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if(tip){
    const op = "+getComputedStyle(document.querySelector('[data-qa-tip]'), '::before').opacity";
    await armPoll(page, op + ' > 0.95', 2000);
    await page.mouse.move(tip.x, tip.y, { steps: 2 });
    const msIn = await readPoll(page);
    await armPoll(page, op + ' < 0.05', 2000);
    await page.mouse.move(600, 600, { steps: 2 });
    const msOut = await readPoll(page);
    L.rec({ ...base, id: 'TT-03', what: 'header icon label: appears after the 0.25 s delay (0.25–0.5 s), clears on leave (≤ 0.3 s)', measured: `in ${msIn} ms · out ${msOut} ms`, pass: msIn >= 230 && msIn <= 520 && msOut >= 0 && msOut <= 300 });
    /* 20 fast passes → no label left showing */
    for(let i = 0; i < 20; i++){ await page.mouse.move(tip.x, tip.y); await page.waitForTimeout(15); await page.mouse.move(600, 600); await page.waitForTimeout(15); }
    await page.waitForTimeout(400);
    const left = await page.evaluate(op);
    L.rec({ ...base, id: 'TT-04', what: '20 fast passes over a header icon → no label left showing', measured: 'opacity ' + left, pass: left < 0.05 });
  }
}

async function cards(page, dev, lang){
  const base = { dev, lang, page: 'category' };
  await L.open(page, '#/c/polos', { lang, wait: 1200, setup: SETUP });
  /* a grid card (not a slider copy) */
  const sel = await page.evaluate(() => { const w = [...document.querySelectorAll('.pcard-w')].find(x => !x.closest('[data-sm]') && !x.closest('[aria-hidden="true"]') && x.getBoundingClientRect().width > 100); if(!w) return null; w.setAttribute('data-qa-card', '1'); w.scrollIntoView({ block: 'center' }); return true; });
  if(!sel){ L.rec({ ...base, id: 'CD-00', what: 'grid card', measured: 'none', pass: false }); return; }
  await page.waitForTimeout(300);
  const cb = await box(page, '[data-qa-card] .pimg');
  const out = { x: 10, y: 400 };
  await page.mouse.move(out.x, out.y);
  const alt = "(document.querySelector('[data-qa-card] .pcard-alt') ? +getComputedStyle(document.querySelector('[data-qa-card] .pcard-alt')).opacity : -1)";
  const qa = "(document.querySelector('[data-qa-card] .pcard-qa') ? +getComputedStyle(document.querySelector('[data-qa-card] .pcard-qa')).opacity : -1)";
  await page.mouse.move(cb.x, cb.y, { steps: 3 }); await page.waitForTimeout(400);
  const in1 = await page.evaluate(`[${alt}, ${qa}]`);
  await page.mouse.move(out.x, out.y, { steps: 3 }); await page.waitForTimeout(400);
  const out1 = await page.evaluate(`[${alt}, ${qa}]`);
  L.rec({ ...base, id: 'CD-01', what: 'card hover: back view + quick-add show; leave: both clear (0.2 s)', measured: `hover alt ${in1[0]} qa ${in1[1]} · leave alt ${out1[0]} qa ${out1[1]}`, pass: in1[0] > 0.95 && in1[1] > 0.95 && out1[0] < 0.05 && out1[1] < 0.05 });
  /* stress */
  for(let i = 0; i < 20; i++){ await page.mouse.move(cb.x, cb.y); await page.waitForTimeout(15); await page.mouse.move(out.x, out.y); await page.waitForTimeout(15); }
  await page.waitForTimeout(400);
  const out2 = await page.evaluate(`[${alt}, ${qa}]`);
  L.rec({ ...base, id: 'CD-02', what: '20 fast enter/leave cycles → back view and quick-add both cleared', measured: `alt ${out2[0]} · qa ${out2[1]}`, pass: out2[0] < 0.05 && out2[1] < 0.05 });
  /* click a quick-add size that is already in the bag (toast, no redraw), then leave */
  await page.mouse.move(cb.x, cb.y, { steps: 3 }); await page.waitForTimeout(400);
  const btn = await page.evaluate(() => { const bs = [...document.querySelectorAll('[data-qa-card] .pcard-qa-s button:not([hidden])')]; const b = bs[bs.length - 1]; if(!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, pid: b.getAttribute('data-pid'), c: b.getAttribute('data-c'), s: b.getAttribute('data-s') }; });
  if(btn){
    /* first click adds (page redraws), second click on the same size → "already in your bag" toast, no redraw */
    await page.mouse.click(btn.x, btn.y); await page.waitForTimeout(500);
    await page.evaluate(() => { const w = [...document.querySelectorAll('.pcard-w')].find(x => !x.closest('[data-sm]') && !x.closest('[aria-hidden="true"]') && x.getBoundingClientRect().width > 100); if(w) w.setAttribute('data-qa-card', '1'); });
    await page.mouse.move(cb.x + 2, cb.y, { steps: 2 }); await page.waitForTimeout(400);
    const btn2 = await page.evaluate(() => { const bs = [...document.querySelectorAll('[data-qa-card] .pcard-qa-s button:not([hidden])')]; const b = bs[bs.length - 1]; if(!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(out.x, out.y, { steps: 3 }); await page.waitForTimeout(400);
    const afterAdd = await page.evaluate("[...document.querySelectorAll('.pcard-qa')].filter(q => +getComputedStyle(q).opacity > 0.5).length");
    L.rec({ ...base, id: 'CD-03', what: 'quick-add a size (page redraws), then leave → no quick-add panel left open', measured: afterAdd + ' panel(s) open', pass: afterAdd === 0 });
    if(btn2){
      await page.mouse.move(cb.x, cb.y, { steps: 3 }); await page.waitForTimeout(300);
      await page.mouse.click(btn2.x, btn2.y); await page.waitForTimeout(200);
      const toastTxt = await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
      await page.mouse.move(out.x, out.y, { steps: 3 }); await page.waitForTimeout(500);
      const after = await page.evaluate("[...document.querySelectorAll('.pcard-qa')].filter(q => +getComputedStyle(q).opacity > 0.5).length");
      const fw = await page.evaluate(() => { const a = document.activeElement; return a && a.closest && a.closest('.pcard-qa') ? 'focus on quick-add button' : 'focus ' + (a && a.tagName); });
      L.rec({ ...base, id: 'CD-04', what: 'click a quick-add size that is already in the bag (toast, no redraw), then leave → panel clears', measured: `toast "${toastTxt.slice(0, 40)}" · after leave: ${after} panel(s) open · ${fw}${after ? ' (STUCK open via :focus-within)' : ''}`, pass: after === 0 });
      await page.mouse.click(out.x, out.y + 200); await page.waitForTimeout(300);
      const after2 = await page.evaluate("[...document.querySelectorAll('.pcard-qa')].filter(q => +getComputedStyle(q).opacity > 0.5).length");
      L.rec({ ...base, id: 'CD-04b', what: '…a click elsewhere then clears it', measured: after2 + ' panel(s) open', pass: after2 === 0 });
    }
  }
}

async function toasts(page, dev, lang){
  const base = { dev, lang, page: 'home' };
  await L.open(page, '#/', { lang, wait: 600 });
  /* TO-01: core toast lifetime */
  await page.evaluate(() => { window.__t0 = performance.now(); toast('QA timing toast'); });
  let ms = await pollMs(page, "!document.querySelector('.toast')", 6000);
  ms = await page.evaluate(() => Math.round(performance.now() - window.__t0));
  L.rec({ ...base, id: 'TO-01', what: 'toast disappears after 2.6 s (2.5–2.8)', measured: ms + ' ms', pass: ms >= 2500 && ms <= 2800 });
  /* TO-02: clicks pass through the toast */
  await page.evaluate(() => toast('QA click-through'));
  const thr = await page.evaluate(() => { const t = document.querySelector('.toast').getBoundingClientRect(); const e = document.elementFromPoint(t.left + 10, t.top + t.height / 2); return { pe: getComputedStyle(document.querySelector('.toast')).pointerEvents, under: e && !e.closest('.toast') }; });
  L.rec({ ...base, id: 'TO-02', what: 'a toast never blocks a click on what is under it', measured: `pointer-events ${thr.pe} · element under the toast reachable: ${thr.under}`, pass: thr.under });
  /* TO-03: a second toast replaces the first and gets its full time */
  await page.waitForTimeout(3000);
  await page.evaluate(() => { toast('first'); });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { window.__t1 = performance.now(); toast('second'); });
  await pollMs(page, "!document.querySelector('.toast')", 6000);
  ms = await page.evaluate(() => Math.round(performance.now() - window.__t1));
  L.rec({ ...base, id: 'TO-03', what: 'a new toast 2 s after another gets its own full 2.6 s', measured: ms + ' ms', pass: ms >= 2500 && ms <= 2800 });
  /* TO-04: undo toast (bag) — 6 s, then another toast replaces it */
  await page.evaluate(() => { window.__t2 = performance.now(); bag_undoToast('Moved to wishlist'); });
  await pollMs(page, "!document.querySelector('.toast')", 9000);
  ms = await page.evaluate(() => Math.round(performance.now() - window.__t2));
  L.rec({ ...base, id: 'TO-04', what: 'bag "Undo" toast stays 6 s (5.9–6.3)', measured: ms + ' ms', pass: ms >= 5900 && ms <= 6300 });
  /* TO-05: toast with a link — the mouse resting on "View bag" */
  await page.evaluate(() => { toast('Added to bag — QA'); const tt = document.querySelector('.toast'); const l = document.createElement('a'); l.href = '#/bag'; l.className = 'toast-link'; l.textContent = 'View bag'; tt.appendChild(document.createTextNode(' ')); tt.appendChild(l); window.__t3 = performance.now(); });
  const lb = await box(page, '.toast .toast-link');
  if(lb){ await page.mouse.move(lb.x, lb.y, { steps: 2 }); }
  await pollMs(page, "!document.querySelector('.toast')", 9000);
  ms = await page.evaluate(() => Math.round(performance.now() - window.__t3));
  L.rec({ ...base, id: 'TO-05', what: 'toast with a "View bag" / "Undo" link: does NOT vanish while the mouse is on it (WCAG 2.2.1)', measured: `vanished after ${ms} ms with the mouse on the link`, pass: ms > 4000 });
  /* TO-06 (added TA-2, T7): the resume half — mouse leaves the link → the toast goes again, with at least 1.5 s left (1.4–3.0 s) */
  if(await page.evaluate(() => !!document.querySelector('.toast'))){
    await page.evaluate(() => { window.__t4 = performance.now(); });
    await page.mouse.move(20, 200, { steps: 2 });
    await pollMs(page, "!document.querySelector('.toast')", 8000);
    const ms6 = await page.evaluate(() => Math.round(performance.now() - window.__t4));
    L.rec({ ...base, id: 'TO-06', what: 'toast held under the mouse: mouse leaves → it goes again after ≥ 1.5 s (1.4–3.0 s)', measured: ms6 + ' ms after leave', pass: ms6 >= 1400 && ms6 <= 3000 });
  } else L.rec({ ...base, id: 'TO-06', what: 'toast held under the mouse: mouse leaves → it goes again after ≥ 1.5 s', measured: 'toast already gone (TO-05 failed)', pass: false });
  await page.mouse.move(600, 600);
}

(async () => {
  for(const dev of ['d1366', 'd1920']){
    for(const lang of ['en', 'bn']){
      if(dev === 'd1920' && lang === 'bn') continue;
      const page = await L.newPage(dev);
      await L.open(page, '#/', { lang, setup: SETUP });
      await mega(page, dev, lang);
      await tips(page, dev, lang);
      await cards(page, dev, lang);
      await toasts(page, dev, lang);
      if(lang === 'en') await headerMotion(page, dev);
      if(page._errs) L.rec({ dev, lang, id: 'JS', what: 'page errors during hover suite', measured: page._errs.slice(0, 3).join(' | '), pass: false });
      await page.context().close();
    }
  }
  L.save('hover');
  await L.closeBrowser();
})().catch(async e => { console.error(e); L.save('hover'); await L.closeBrowser(); process.exit(1); });
