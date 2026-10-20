const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1366, height: 768 });
  await L.open(page, '#/'); await L.go(page, '#/p/classic-cotton-panjabi', 900);
  console.log(await page.evaluate(() => [...document.querySelectorAll('.pdp-b .pdp-lblrow, .pdp-b .pdp-lblrow > *, .pdp-b .pdp-lblrow > * > *')].map(e => e.tagName + '.' + e.className + ' "' + e.textContent.trim().slice(0, 25) + '" x=' + Math.round(e.getBoundingClientRect().x) + ' pl=' + getComputedStyle(e).paddingLeft + ' ml=' + getComputedStyle(e).marginLeft + ' ti=' + getComputedStyle(e).textIndent).join('\n')));
  await browser.close();
})();
