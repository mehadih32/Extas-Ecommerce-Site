const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1366, height: 768 });
  await L.open(page, '#/');
  const out = [];
  for(let s = 0; s <= 10; s++){
    out.push(await page.evaluate((s) => { window.SB_INJECT = { areas: { header: { logo: { text: 'EXTAS', style: s } } } }; rerender();
      const l = document.querySelector('.hdr .logo'); const k = l.querySelector('*'); const c = getComputedStyle(k || l);
      return s + ' ' + (k ? k.className : '-') + ' ' + c.fontFamily.slice(0, 20) + ' ' + c.fontSize + ' ' + c.fontWeight + ' ' + c.letterSpacing + ' html' + l.innerHTML.length; }, s));
    if(s === 9) await page.screenshot({ path: L.OUT + '/h5-logo9.png', clip: { x: 0, y: 30, width: 400, height: 75 } });
  }
  console.log(out.join('\n'));
  await browser.close();
})();
