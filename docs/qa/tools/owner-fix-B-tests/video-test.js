// node video-test.js <html> — C6: product video tile. Poster first (no YouTube request), player on click, no layout shift, LCP not the video.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const html = path.resolve(process.argv[2]);
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { c ? pass++ : fail++; out.push((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h, mob, pid] of [[1366, 768, false, 'heavyweight-hoodie'], [1920, 1080, false, 'textured-knit-polo'], [393, 852, true, 'heavyweight-hoodie'], [360, 800, true, 'classic-cotton-panjabi']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob });
    const p = await ctx.newPage(); const yt = []; const errs = [];
    p.on('request', r => { if (/youtube|ytimg|googlevideo/.test(r.url())) yt.push(r.url()); }); p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + html + '#/'); await p.waitForTimeout(400);
    await p.evaluate(() => { ST.seenIntro = true; saveState(); try { closeModal(); } catch (e) {} });
    await p.evaluate(() => { new PerformanceObserver(l => { const e = l.getEntries(); window.__lcp = e[e.length - 1]; }).observe({ type: 'largest-contentful-paint', buffered: true });
      window.__cls = 0; new PerformanceObserver(l => { l.getEntries().forEach(x => { if (!x.hadRecentInput) window.__cls += x.value; }); }).observe({ type: 'layout-shift', buffered: true }); });
    await p.evaluate(x => { location.hash = '#/p/' + x; }, pid); await p.waitForTimeout(900);
    const T = `${w}x${h} ${pid}`;
    ok(!!(await p.$('.pdp-vtile .pdp-vbtn')), T + ' video tile with poster + play button');
    ok(!!(await p.$('.pdp-vthumb')), T + ' video thumbnail in the strip');
    ok(yt.length === 0, T + ' nothing loaded from YouTube before play (' + yt.length + ')');
    const lcp = await p.evaluate(() => { const e = window.__lcp && window.__lcp.element; return e ? (e.closest('.pdp-vtile') ? 'VIDEO' : (e.className && e.className.baseVal !== undefined ? 'svg' : e.tagName + '.' + e.className)) : 'none'; });
    ok(lcp !== 'VIDEO', T + ' LCP element is not the video (' + lcp + ')');
    await p.evaluate(() => pdp_viewTo('video', false)); await p.waitForTimeout(500);
    const r0 = await p.evaluate(() => document.querySelector('.pdp-vtile').getBoundingClientRect().toJSON());
    const cls0 = await p.evaluate(() => window.__cls);
    if (mob) await p.tap('.pdp-vtile .pdp-vbtn'); else await p.click('.pdp-vtile .pdp-vbtn');
    await p.waitForTimeout(1500);
    const f = await p.evaluate(() => { const i = document.querySelector('.pdp-vtile iframe'); return i ? { src: i.src, r: i.getBoundingClientRect().toJSON(), allow: i.getAttribute('allow') } : null; });
    const r1 = await p.evaluate(() => document.querySelector('.pdp-vtile').getBoundingClientRect().toJSON());
    ok(f && /youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?autoplay=1/.test(f.src), T + ' play loads the YouTube player ' + (f && f.src));
    ok(f && Math.abs(f.r.width - r0.width) < 1 && Math.abs(r1.height - r0.height) < 1, T + ' player fills the same box — no layout shift (' + Math.round(r0.width) + 'x' + Math.round(r0.height) + ' → ' + Math.round(r1.width) + 'x' + Math.round(r1.height) + ')');
    const cls1 = await p.evaluate(() => window.__cls); ok(cls1 - cls0 < 0.001, T + ' CLS added by play: ' + (cls1 - cls0).toFixed(4));
    ok(!(await p.$('.zm')), T + ' play does not open the photo viewer');
    out.push('INFO ' + T + ' YouTube requests after play: ' + yt.length + (yt.length ? ' (network reached YouTube)' : ' (blocked in this sandbox — markup checked)'));
    ok(errs.length === 0, T + ' no page errors ' + errs.join('|'));
    await ctx.close();
  }
  // a product without a video has no tile
  const c2 = await b.newContext({ viewport: { width: 1366, height: 768 } }); const q = await c2.newPage();
  await q.goto('file://' + html + '#/p/essential-pique-polo'); await q.waitForTimeout(900);
  ok(!(await q.$('.pdp-vtile')), 'product without a video link: no video tile'); await c2.close();
  await b.close(); console.log(out.join('\n')); console.log(`\nvideo test: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
