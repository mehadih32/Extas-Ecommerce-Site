const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1366, height: 768 });
  await L.open(page, '#/'); await L.go(page, '#/p/classic-cotton-panjabi', 900);
  console.log(await page.evaluate(() => {
    const find = re => [...document.querySelectorAll(".pdp-page *")].filter(e => re.test(e.textContent.trim()) && e.getClientRects().length).sort((a,b)=>a.textContent.length-b.textContent.length)[0];
    const out = [];
    for(const re of [/^Colour/, /^Size\s*[–-]/]){ let e = find(re); while(e){ const cs = getComputedStyle(e); out.push(re + ' ' + e.tagName + '.' + e.className + ' x=' + Math.round(e.getBoundingClientRect().x) + ' pl=' + cs.paddingLeft + ' ml=' + cs.marginLeft); if(/pdp-buy|pdp-info|pdp-r/.test(e.className) || out.length > 14) break; e = e.parentElement; } }
    return out.join('\n');
  }));
  await browser.close();
})();
