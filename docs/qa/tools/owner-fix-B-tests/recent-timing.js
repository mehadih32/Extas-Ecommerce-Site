// node recent-timing.js <html> — P5: the grid of 4 (desktop) swaps every N s; mouse hover, keyboard focus and a touch hold each pause it with their own flag; each has a tested resume; timer cleared on route change; never empty.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const html = path.resolve(process.argv[2]);
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { c ? pass++ : fail++; out.push((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' @ ' + (e.stack||'').split('\n').slice(1,3).join(' ')));
  await p.goto('file://' + html + '#/'); await p.waitForTimeout(400);
  await p.evaluate(() => { ST.seenIntro = true; ST.recent = []; saveState(); try { closeModal(); } catch (e) {} });
  const go = async h => { await p.evaluate(() => { location.hash = '#/blank-x'; }); await p.waitForTimeout(60); await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(700); };
  // fresh visitor: never empty
  await go('#/p/essential-pique-polo');
  let st = await p.evaluate(() => { const g = document.getElementById('ob-rv-grid'); return { n: g ? g.querySelectorAll('.pcard').length : 0, t: g ? g.closest('section').querySelector('h2').textContent : '' }; });
  ok(st.n === 4, 'fresh visitor: grid shows 4 cards (never empty) — ' + st.n); ok(/More like this/.test(st.t), 'fresh visitor title: ' + st.t);
  for (const id of ['textured-knit-polo', 'oxford-cotton-shirt', 'heavyweight-hoodie', 'slim-chino-trousers', 'classic-cotton-panjabi']) await go('#/p/' + id);
  await p.evaluate(() => { optSet('pdp.recentSwapSec', 2); });
  await go('#/p/essential-pique-polo');
  st = await p.evaluate(() => { const g = document.getElementById('ob-rv-grid'); return { n: g.querySelectorAll('.pcard').length, t: g.closest('section').querySelector('h2').textContent, pages: +g.closest('section').getAttribute('data-pages'), phoneSlider: !!document.getElementById('sl-recent'), phoneHidden: getComputedStyle(document.getElementById('sl-recent').closest('section')).display }; });
  ok(st.n === 4 && /Recently viewed/.test(st.t) && st.pages >= 2, `with history: 4 cards, title "${st.t}", ${st.pages} pages`);
  ok(st.phoneHidden === 'none', 'desktop: the phone slider of recently viewed is hidden (display ' + st.phoneHidden + ')');
  const first = () => p.evaluate(() => [...document.querySelectorAll('#ob-rv-grid .pcard-w')].map(e => e.getAttribute('data-pid')).join(','));
  await p.evaluate(() => document.getElementById('ob-rv-grid').scrollIntoView({ block: 'center' })); await p.mouse.move(5, 5);
  const a0 = await first(); let t0 = Date.now();
  let a1 = a0; while (a1 === a0 && Date.now() - t0 < 5000) { await p.waitForTimeout(30); a1 = await first(); }
  ok(a1 !== a0, 'swaps on its own (first swap ' + (Date.now() - t0) + ' ms after the read)');
  t0 = Date.now(); let a2 = a1; while (a2 === a1 && Date.now() - t0 < 5000) { await p.waitForTimeout(30); a2 = await first(); }
  const dt = Date.now() - t0; ok(a2 !== a1 && dt > 1800 && dt < 2600, 'next swap ~2 s later (' + dt + ' ms; setting 2 s)');
  // mouse hover pause + resume
  const gb = await (await p.$('#ob-rv-grid')).boundingBox();
  await p.mouse.move(gb.x + gb.width / 2, gb.y + 40); const h0 = await first(); await p.waitForTimeout(4500); const h1 = await first();
  ok(h0 === h1, 'mouse hover: held for 4.5 s');
  const flags = await p.evaluate(() => OWNB.rv && { hover: OWNB.rv.hover, focus: OWNB.rv.focus, touch: OWNB.rv.touch }); ok(flags && flags.hover && !flags.focus && !flags.touch, 'hover sets only the mouse flag ' + JSON.stringify(flags));
  await p.mouse.move(5, 5); let t1 = Date.now(), h2 = h1; while (h2 === h1 && Date.now() - t1 < 5000) { await p.waitForTimeout(40); h2 = await first(); }
  const r1 = Date.now() - t1; ok(h2 !== h1 && r1 < 2600, 'mouse leave: resumes, next swap in ' + r1 + ' ms (time spent before the hover still counts)');
  // keyboard focus pause + resume
  await p.evaluate(() => { const a = document.querySelector('#ob-rv-grid a'); a.focus(); });
  const f0 = await first(); await p.waitForTimeout(4000); const f1 = await first(); ok(f0 === f1, 'keyboard focus inside: held for 4 s');
  const fl2 = await p.evaluate(() => ({ hover: OWNB.rv.hover, focus: OWNB.rv.focus, touch: OWNB.rv.touch })); ok(fl2.focus && !fl2.hover && !fl2.touch, 'focus sets only the focus flag ' + JSON.stringify(fl2));
  await p.evaluate(() => { document.activeElement.blur(); document.body.focus(); });
  t1 = Date.now(); let f2 = f1; while (f2 === f1 && Date.now() - t1 < 5000) { await p.waitForTimeout(40); f2 = await first(); }
  ok(f2 !== f1, 'focus leaves the grid: resumes (' + (Date.now() - t1) + ' ms)');
  // touch hold: 4 s after the finger lifts
  await p.evaluate(() => { const g = document.getElementById('ob-rv-grid'); const e = new Event('touchstart', { bubbles: true }); Object.defineProperty(e, 'touches', { value: [{ clientX: 10, clientY: 10 }, { clientX: 20, clientY: 20 }].slice(0, 1) }); g.dispatchEvent(e); });
  const u0 = await first(); await p.waitForTimeout(3000); ok(u0 === await first(), 'finger down: held 3 s');
  await p.evaluate(() => { const g = document.getElementById('ob-rv-grid'); const e = new Event('touchend', { bubbles: true }); Object.defineProperty(e, 'touches', { value: [] }); Object.defineProperty(e, 'changedTouches', { value: [{ clientX: 10, clientY: 10 }] }); g.dispatchEvent(e); });
  await p.waitForTimeout(3000); ok(u0 === await first(), 'finger lifted: still held 3 s later (4 s touch hold)');
  const fl3 = await p.evaluate(() => ({ hover: OWNB.rv.hover, focus: OWNB.rv.focus, touch: OWNB.rv.touch })); ok(fl3.touch && !fl3.hover && !fl3.focus, 'touch sets only the touch flag ' + JSON.stringify(fl3));
  t1 = Date.now(); let u2 = u0; while (u2 === u0 && Date.now() - t1 < 5000) { await p.waitForTimeout(40); u2 = await first(); }
  const r3 = Date.now() - t1; ok(u2 !== u0 && r3 < 3200, 'touch hold ends by itself, then it swaps (' + (r3 + 3000) + ' ms after lift)');
  // a mouse leave never clears focus/touch and vice versa (separate flags)
  await p.evaluate(() => { const a = document.querySelector('#ob-rv-grid a'); a.focus(); });
  await p.mouse.move(gb.x + 30, gb.y + 30); await p.mouse.move(5, 5); await p.waitForTimeout(100);
  const fl4 = await p.evaluate(() => ({ hover: OWNB.rv.hover, focus: OWNB.rv.focus })); ok(fl4.focus && !fl4.hover, 'mouse leave does not clear the keyboard pause ' + JSON.stringify(fl4));
  await p.evaluate(() => { document.activeElement.blur(); });
  // hidden tab
  // route change clears the timer
  await go('#/c/polos'); const alive = await p.evaluate(() => !!OWNB.rv); ok(!alive, 'route change: timer cleared');
  // phone: untouched (no grid shown)
  await p.evaluate(() => optReset('pdp.recentSwapSec'));
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await ctx.close();
  const mc = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true }); const m = await mc.newPage();
  await m.goto('file://' + html + '#/'); await m.waitForTimeout(400);
  await m.evaluate(() => { ST.seenIntro = true; ST.recent = ['textured-knit-polo', 'oxford-cotton-shirt']; saveState(); try { closeModal(); } catch (e) {} });
  await m.evaluate(() => { location.hash = '#/p/essential-pique-polo'; }); await m.waitForTimeout(800);
  const ph = await m.evaluate(() => ({ grid: getComputedStyle(document.querySelector('[data-testid="recent-grid"]')).display, slider: getComputedStyle(document.getElementById('sl-recent').closest('section')).display, timer: !!OWNB.rv }));
  ok(ph.grid === 'none' && ph.slider !== 'none' && !ph.timer, 'phone 393: recently viewed slider as before, no grid, no timer ' + JSON.stringify(ph));
  await mc.close(); await b.close();
  console.log(out.join('\n')); console.log(`\nrecent grid timing: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
