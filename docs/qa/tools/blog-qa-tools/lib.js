/* EXTAS blog QA harness — shared helpers. Read-only against the build. */
const pw = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
const ROOT = '/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/blog-qa';
const HTML = process.env.QA_HTML || '/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/proto/dist/blogqa.html';
const F = 'file://' + HTML;
const OUT = process.env.QA_OUT || path.join(ROOT, 'out');
const SHOTS = process.env.QA_SHOTS || path.join(ROOT, 'shots');
[OUT, SHOTS].forEach(d => fs.mkdirSync(d, {recursive: true}));

const PH = [[320,640],[360,800],[375,667],[390,844],[393,852],[412,915],[430,932],[440,956]];
const TB = [[768,1024],[820,1180],[834,1194],[1024,1366],[800,1280]];
const DEVICES = [];
PH.forEach(([w,h]) => DEVICES.push({name:'p'+w+'x'+h, w, h, group:'phone', touch:true}));
TB.forEach(([w,h]) => { DEVICES.push({name:'t'+w+'x'+h+'p', w, h, group:'tablet-p', touch:true}); DEVICES.push({name:'t'+h+'x'+w+'l', w:h, h:w, group:'tablet-l', touch:true}); });
[[1280,800],[1440,900]].forEach(([w,h]) => DEVICES.push({name:'d'+w+'x'+h, w, h, group:'desktop', touch:false}));
const dev = n => DEVICES.find(d => d.name === n) || (() => { throw new Error('no device ' + n); })();

/* results */
function Rec(module, devName){
  const r = {module, dev: devName, at: new Date().toISOString(), items: []};
  const file = path.join(OUT, module + '-' + devName + '.json');
  r.add = (id, name, pass, o = {}) => { const it = Object.assign({id, name, pass}, o); r.items.push(it); console.log((pass === true ? '  ok   ' : pass === false ? '  FAIL ' : '  info ') + id + ' ' + name + (o.measured !== undefined ? ' — ' + String(typeof o.measured === 'string' ? o.measured : JSON.stringify(o.measured)).slice(0, 220) : '')); r.save(); return pass; };
  r.save = () => fs.writeFileSync(file, JSON.stringify({module: r.module, dev: r.dev, at: r.at, items: r.items}, null, 1));
  return r;
}

async function open(d, opts = {}){
  const b = opts.browser || await pw.chromium.launch();
  const ctx = await b.newContext({viewport: {width: d.w, height: d.h}, deviceScaleFactor: opts.dpr || 1, isMobile: !!d.touch, hasTouch: !!d.touch,
    locale: opts.locale || 'en-US', timezoneId: 'Asia/Dhaka', permissions: ['clipboard-read', 'clipboard-write']});
  if(opts.init) for(const s of [].concat(opts.init)) await ctx.addInitScript(s);
  await ctx.addInitScript(() => { window.__ERR = []; window.addEventListener('error', e => window.__ERR.push(String(e.message))); });
  const p = await ctx.newPage(); const errs = [];
  if(opts.clock) await p.clock.install({time: new Date(opts.clock)});
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if(m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  const cdp = await ctx.newCDPSession(p);
  return {b, ctx, p, errs, cdp, d, own: !opts.browser};
}
async function close(T){ try{ await T.ctx.close(); }catch(e){} if(T.own) try{ await T.b.close(); }catch(e){} }
/* fresh demo data, intro closed */
async function prep(T, hash = '#/journal', keep){
  await T.p.goto(F + '#/'); await T.p.waitForTimeout(500);
  if(!keep) await T.p.evaluate(() => { try{ localStorage.clear(); sessionStorage.clear(); }catch(e){} resetState(); });
  await T.p.evaluate(() => { ST.seenIntro = true; saveState(); closeModal(); var t = document.querySelector('.toast'); if(t) t.remove(); });
  await go(T, hash);
}
async function go(T, hash, ms = 450){ await T.p.evaluate(h => { if(location.hash === h){ try{ closeModal(); }catch(e){} rerender(); scrollTo(0, 0); } else location.hash = h; }, hash); await T.p.waitForTimeout(ms); await T.p.evaluate(() => { var t = document.querySelector('.toast'); if(t) t.remove(); }); }
const ev = (T, f, a) => T.p.evaluate(f, a);
const wait = (T, ms) => T.p.waitForTimeout(ms);
async function tap(T, sel, i = 0){
  const loc = typeof sel === 'string' ? T.p.locator(sel).filter({visible: true}).nth(i) : sel;
  await loc.scrollIntoViewIfNeeded({timeout: 4000});
  if(T.d.touch) await loc.tap({timeout: 4000}); else await loc.click({timeout: 4000});
  await T.p.waitForTimeout(350);
}
async function shot(T, name, full = false){ const f = path.join(SHOTS, name + '.png'); await T.p.screenshot({path: f, fullPage: full}); return f; }
/* touch gestures through CDP */
async function touchPath(T, pts, stepMs = 16, holdMs = 40){
  await T.cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: pts[0][0], y: pts[0][1]}]});
  for(let i = 1; i < pts.length; i++){ await T.p.waitForTimeout(stepMs); await T.cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: pts[i][0], y: pts[i][1]}]}); }
  await T.p.waitForTimeout(holdMs);
  await T.cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
}
async function pullDown(T, dist = 260){
  const x = Math.round(T.d.w / 2), y0 = 170, pts = [];
  for(let i = 0; i <= 14; i++) pts.push([x, y0 + Math.round(dist * i / 14)]);
  await T.cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: pts[0][0], y: pts[0][1]}]});
  for(let i = 1; i < pts.length; i++){ await T.p.waitForTimeout(16); await T.cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: pts[i][0], y: pts[i][1]}]}); }
  await T.p.waitForTimeout(60);
  const ind = await T.p.evaluate(() => { const e = document.querySelector('.ptr'); if(!e) return null; const r = e.getBoundingClientRect(); return {txt: e.innerText.trim(), op: getComputedStyle(e).opacity, top: Math.round(r.top), armed: e.classList.contains('armed'), visible: r.bottom > 0 && +getComputedStyle(e).opacity > 0.3}; });
  await T.cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  return ind;
}
async function swipeX(T, y, x0, x1){ const pts = []; for(let i = 0; i <= 10; i++) pts.push([Math.round(x0 + (x1 - x0) * i / 10), y]); await touchPath(T, pts, 16, 30); }
const iso = d => new Date(d).toISOString().slice(0, 10);
module.exports = {pw, fs, path, ROOT, HTML, F, OUT, SHOTS, DEVICES, dev, Rec, open, close, prep, go, ev, wait, tap, shot, touchPath, pullDown, swipeX, iso};
