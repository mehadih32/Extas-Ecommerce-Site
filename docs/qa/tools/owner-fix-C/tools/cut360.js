const { chromium, SETUPS, open, nav } = require('./lib');
(async () => { const b = await chromium.launch(); for (const h of process.argv.slice(2)) { const { ctx, pg } = await open(b, h, 360, 800, 1);
  await pg.evaluate(SETUPS.items(5)); await nav(pg, '#/bag');
  console.log(h.split('/').pop(), await pg.evaluate(() => [...document.querySelectorAll('.bg-sr-item span')].filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.textContent + ' ' + e.scrollWidth + '/' + e.clientWidth + ' ' + getComputedStyle(e).textOverflow)));
  const el = await pg.$('[data-testid=bag-summary]'); await el.screenshot({ path: '/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/owner-fix/C/shots/cut360-' + h.split('/').pop() + '.png' }); await ctx.close(); } await b.close(); })();
