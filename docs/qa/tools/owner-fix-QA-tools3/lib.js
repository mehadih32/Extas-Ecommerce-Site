/* QA V12b reviewer 3 — tiny shared helpers. ONE browser, ONE page. */
const path = require('path'), fs = require('fs');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const S = '/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad';
const BUILD = process.env.BUILD || S + '/proto/dist/v12b.html';
const OUT = S + '/owner-fix/QA/r3';
fs.mkdirSync(OUT, { recursive: true });
let res = { pass: 0, fail: 0, info: 0, lines: [] };
function rec(ok, name, detail){
  const tag = ok === 'info' ? 'INFO' : ok ? 'PASS' : 'FAIL';
  if(ok === 'info') res.info++; else if(ok) res.pass++; else res.fail++;
  const l = tag + ' ' + name + (detail !== undefined ? ' ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '');
  res.lines.push(l); console.log(l);
}
async function start(vp, opts){
  opts = opts || {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, opts.ctx || {}));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  page._errs = [];
  page.on('pageerror', e => page._errs.push(String(e && e.message || e)));
  page.on('console', m => { if(m.type() === 'error' && !/fonts|ERR_FAILED|net::/.test(m.text())) page._errs.push('console: ' + m.text().slice(0, 200)); });
  return { browser, ctx, page };
}
async function open(page, hash, setup){
  await page.goto('file://' + BUILD + (hash || '#/'));
  await page.evaluate((s) => { ST.seenIntro = true; if(s) (new Function(s))(); saveState(); }, setup || '');
  await page.waitForTimeout(150);
}
async function go(page, hash, wait){
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(wait || 450);
}
function done(name){
  const s = name + ': ' + res.pass + ' pass, ' + res.fail + ' fail, ' + res.info + ' info';
  console.log('\n' + s);
  fs.appendFileSync(OUT + '/summary.log', new Date().toTimeString().slice(0, 8) + ' ' + s + '\n');
}
module.exports = { S, BUILD, OUT, rec, start, open, go, done, res };
/* visible text cut: ellipsis/clip overflow or a line-clamp that hides text; also page h-scroll */
async function cutScan(page, root){
  return page.evaluate((root) => {
    const out = [], R = document.querySelector(root || 'body') || document.body;
    R.querySelectorAll('*').forEach(el => {
      if(!el.childNodes.length) return;
      let txt = ''; el.childNodes.forEach(n => { if(n.nodeType === 3) txt += n.textContent; });
      txt = txt.trim(); if(!txt) return;
      const cs = getComputedStyle(el); if(cs.visibility === 'hidden' || cs.display === 'none') return;
      const r = el.getBoundingClientRect(); if(r.width < 2 || r.height < 2) return;
      if(el.closest('.sr,.sr-only,.visually-hidden,[aria-hidden="true"]')) return;
      const clipX = (cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1;
      let clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 2;
      if(clamp){ const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()]; const cr = el.getBoundingClientRect(); clamp = rs.some(x => x.height && x.bottom > cr.bottom + 1 && x.width > 0 && !(x.height > 30)); }
      let textOut = false;
      if(clipX){ const rg = document.createRange(); el.childNodes.forEach(n => { if(n.nodeType === 3 && n.textContent.trim()){ rg.selectNodeContents(n); const b = rg.getBoundingClientRect(); const cr = el.getBoundingClientRect(); if(b.right > cr.right + 1 || b.left < cr.left - 1) textOut = true; } }); }
      if((clipX && textOut && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') || clamp) out.push(el.tagName + '.' + String(el.className).split(' ')[0] + ': ' + txt.slice(0, 50));
    });
    const hs = document.documentElement.scrollWidth - window.innerWidth;
    return { cut: out.slice(0, 15), n: out.length, hscroll: hs };
  }, root);
}
module.exports.cutScan = cutScan;
