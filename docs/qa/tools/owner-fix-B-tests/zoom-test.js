// node zoom-test.js <html>  — P7: desktop photo viewer. Whole picture first; drag and wheel reach all four edges; dblclick/Fit resets; Esc closes. Phone keeps the pinch viewer.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const html = path.resolve(process.argv[2]);
let pass = 0, fail = 0; const out = [];
const ok = (c, m) => { if (c) pass++; else fail++; out.push((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h, pid] of [[1366, 768, 'essential-pique-polo'], [1920, 1080, 'essential-pique-polo'], [1440, 900, 'classic-cotton-panjabi']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + html + '#/'); await p.waitForTimeout(400);
    await p.evaluate(() => { try { ST.seenIntro = true; saveState(); closeModal(); } catch (e) {} });
    await p.evaluate(x => { location.hash = '#/p/' + x; }, pid); await p.waitForTimeout(800);
    const tile = await p.$('.pdp-page .pdp-tile .pimg'); const tb = await tile.boundingBox();
    await p.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 3); await p.waitForTimeout(500);
    const T = `${w}x${h} ${pid}`;
    ok(!!(await p.$('.zm.zm-dk')), T + ' desktop viewer opens');
    const geo = () => p.evaluate(() => { const z = document.querySelector('.zm'); const tr = z.querySelector('.zm-trk'); const i = Math.round(tr.scrollLeft / tr.clientWidth); const sl = tr.children[i]; const pa = sl.querySelector('.zm-pan');
      const a = sl.getBoundingClientRect(), r = pa.getBoundingClientRect(); return { s: { l: a.left, t: a.top, r: a.right, b: a.bottom }, p: { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } }; });
    let g = await geo();
    ok(g.p.l >= g.s.l - 1 && g.p.r <= g.s.r + 1 && g.p.t >= g.s.t - 1 && g.p.b <= g.s.b + 1, T + ' level 1 shows the WHOLE picture inside the visible area ' + JSON.stringify(g.p));
    ok(g.p.h >= (g.s.b - g.s.t) * 0.9 || g.p.w >= (g.s.r - g.s.l) * 0.6, T + ' fitted picture uses the space (h ' + Math.round(g.p.h) + ' of ' + Math.round(g.s.b - g.s.t) + ')');
    const cx = (g.s.l + g.s.r) / 2, cy = (g.s.t + g.s.b) / 2;
    // zoom in with clicks to the deepest step
    for (let k = 0; k < 3; k++) { await p.mouse.click(cx, cy); await p.waitForTimeout(450); }
    g = await geo(); ok(g.p.w > (g.s.r - g.s.l) && g.p.h > (g.s.b - g.s.t), T + ' 3 clicks zoom past the screen (' + Math.round(g.p.w) + 'x' + Math.round(g.p.h) + ')');
    const drag = async (dx, dy) => { for (let k = 0; k < 4; k++) { await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 6 }); await p.mouse.move(cx + dx, cy + dy, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(60); } return geo(); };
    g = await drag(0, 900); ok(Math.abs(g.p.t - g.s.t) <= 1.5, T + ' mouse drag down reaches the TOP edge (gap ' + (g.p.t - g.s.t).toFixed(1) + ')');
    g = await drag(0, -900); ok(Math.abs(g.p.b - g.s.b) <= 1.5, T + ' mouse drag up reaches the BOTTOM edge (gap ' + (g.p.b - g.s.b).toFixed(1) + ')');
    g = await drag(900, 0); ok(Math.abs(g.p.l - g.s.l) <= 1.5, T + ' mouse drag right reaches the LEFT edge (gap ' + (g.p.l - g.s.l).toFixed(1) + ')');
    g = await drag(-900, 0); ok(Math.abs(g.p.r - g.s.r) <= 1.5, T + ' mouse drag left reaches the RIGHT edge (gap ' + (g.p.r - g.s.r).toFixed(1) + ')');
    const zoomedStill = await p.evaluate(() => document.querySelector('.zm-trk').classList.contains('zoomed'));
    ok(zoomedStill, T + ' a drag never counts as a click (still zoomed)');
    // wheel pan
    await p.mouse.move(cx, cy);
    for (let k = 0; k < 20; k++) await p.mouse.wheel(0, -200); await p.waitForTimeout(100);
    g = await geo(); ok(Math.abs(g.p.t - g.s.t) <= 1.5, T + ' wheel up reaches the TOP edge');
    for (let k = 0; k < 20; k++) await p.mouse.wheel(0, 200); await p.waitForTimeout(100);
    g = await geo(); ok(Math.abs(g.p.b - g.s.b) <= 1.5, T + ' wheel down reaches the BOTTOM edge');
    await p.keyboard.down('Shift'); for (let k = 0; k < 20; k++) await p.mouse.wheel(0, -200); await p.keyboard.up('Shift'); await p.waitForTimeout(100);
    g = await geo(); ok(Math.abs(g.p.l - g.s.l) <= 1.5, T + ' shift+wheel reaches the LEFT edge');
    for (let k = 0; k < 20; k++) await p.mouse.wheel(200, 0); await p.waitForTimeout(100);
    g = await geo(); ok(Math.abs(g.p.r - g.s.r) <= 1.5, T + ' sideways wheel reaches the RIGHT edge');
    // double click resets to the whole picture
    await p.mouse.dblclick(cx, cy); await p.waitForTimeout(500);
    g = await geo(); ok(g.p.l >= g.s.l - 1 && g.p.r <= g.s.r + 1 && g.p.t >= g.s.t - 1 && g.p.b <= g.s.b + 1, T + ' double-click goes back to the whole picture');
    // Fit button
    if (!(await p.$('.zm-tb'))) { ok(false, T + ' Fit / zoom buttons exist'); await ctx.close(); continue; }
    await p.mouse.click(cx, cy); await p.waitForTimeout(400); await p.click('.zm-tb[data-z="fit"]'); await p.waitForTimeout(400);
    g = await geo(); ok(g.p.t >= g.s.t - 1 && g.p.b <= g.s.b + 1, T + ' Fit button goes back to the whole picture');
    // + / - buttons
    await p.click('.zm-tb[data-z="in"]'); await p.waitForTimeout(350); g = await geo(); ok(g.p.h > (g.s.b - g.s.t) * 0.95 * 1.5, T + ' Zoom in button zooms');
    await p.click('.zm-tb[data-z="out"]'); await p.waitForTimeout(350); g = await geo(); ok(g.p.b <= g.s.b + 1, T + ' Zoom out button goes back');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(!(await p.$('.zm')), T + ' Esc closes');
    ok(errs.length === 0, T + ' no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  // phone: the pinch viewer, unchanged (no desktop tools)
  const mc = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const m = await mc.newPage(); await m.goto('file://' + html + '#/'); await m.waitForTimeout(400);
  await m.evaluate(() => { try { ST.seenIntro = true; saveState(); closeModal(); } catch (e) {} });
  await m.evaluate(() => { location.hash = '#/p/essential-pique-polo'; }); await m.waitForTimeout(800);
  await m.evaluate(() => zm_open('front')); await m.waitForTimeout(300);
  ok(!!(await m.$('.zm')) && !(await m.$('.zm.zm-dk')) && !(await m.$('.zm-tools')), 'phone 393: pinch viewer opens without the desktop tools (unchanged)');
  const hint = await m.$eval('.zm-hint', e => e.textContent); ok(/Pinch or double-tap/.test(hint), 'phone hint unchanged: ' + hint);
  await mc.close(); await b.close();
  console.log(out.join('\n')); console.log(`\nzoom test: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
