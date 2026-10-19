/* L29 · extra: hero arrow click, then the mouse leaves in one quick flick (no move event lands on the row) */
const L = require('./lib');
(async () => {
  for(const [dev, lang] of [['d1366', 'en'], ['d1366', 'bn'], ['d1920', 'en']]){
    const p = await L.newPage(dev);
    await L.open(p, '#/', { lang, wait: 1300 });
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    const g = await p.evaluate(() => { const b = document.querySelector('.hm-slnav.next').getBoundingClientRect(), s = document.querySelector('.hm-slider').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, sb: s.bottom }; });
    await p.mouse.move(g.x - 200, g.y, { steps: 4 }); await p.mouse.move(g.x, g.y, { steps: 4 });
    await p.mouse.click(g.x, g.y); await p.waitForTimeout(500);
    await L.armMoveWatch(p, 'hm-sltrack', 8000);
    await p.mouse.move(g.x, g.sb + 40);                 /* one jump: a quick flick off the arrow */
    const ms = await L.readMoveWatch(p, 9000);
    const st = await p.evaluate(() => ({ hover: SMOOTH.peek('hm-sltrack').hover, focus: document.activeElement.className }));
    L.rec({ dev, lang, page: 'home', id: 'HR-04b', what: 'click the hero › arrow, then flick the mouse straight off the slider → moving again (≤ 500 ms)', measured: ms < 0 ? `NOT moving after 8 s (hover flag ${st.hover}, focus on "${st.focus}")` : ms + ' ms', pass: ms >= 0 && ms <= 500 });
    await p.context().close();
  }
  L.save('extra');
  await L.closeBrowser();
})().catch(async e => { console.error(e); L.save('extra'); await L.closeBrowser(); process.exit(1); });
