// node test.js <html> <outdir>  — owner answers (R15 note 23) + 11:48 CRM + 11:51 combo lifecycle
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const HTML = path.resolve(process.argv[2]), OUT = process.argv[3]; fs.mkdirSync(OUT, {recursive:true});
let fails = 0; const log = (ok, m) => { if(!ok) fails++; console.log((ok ? '  ok   ' : '  FAIL ') + m); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:393, height:852}, isMobile:true, hasTouch:true, deviceScaleFactor:2});
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if(m.type()==='error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
  await pg.goto('file://'+HTML+'#/'); await pg.waitForTimeout(400);
  const ev = (f, a) => pg.evaluate(f, a);
  const go = async h => { await ev(x => { if(location.hash===x) rerender(); else location.hash = x; }, h); await pg.waitForTimeout(350); };
  await ev(() => { localStorage.clear(); resetState(); ST.seenIntro = true; saveState(); closeModal(true); });
  const shot = async n => pg.screenshot({path:path.join(OUT, n+'.png')});

  /* ---- 1. consent ticks ---- */
  await ev(() => { ST.bag = []; bagAdd({kind:'item', product:'essential-pique-polo', color:'navy', size:'M', qty:1}, {force:true}); delete UI.checkout; saveState(); });
  await go('#/checkout');
  const t = await ev(() => [...document.querySelectorAll('[data-change=co-consent]')].map(i => [i.getAttribute('data-k'), i.checked, i.parentElement.innerText]));
  log(t.length===2 && t[0][0]==='sms' && t[0][1]===true && t[1][0]==='wa' && t[1][1]===false, 'checkout: SMS ticked, WhatsApp empty '+JSON.stringify(t));
  await ev(() => { ST.lang = 'bn'; saveState(); rerender(); });
  const tb = await ev(() => [...document.querySelectorAll('[data-change=co-consent]')].map(i => i.parentElement.innerText));
  log(/SMS-এ অফার/.test(tb[0]) && /WhatsApp-এও/.test(tb[1]), 'checkout ticks in Bengali');
  await ev(() => { ST.lang = 'en'; saveState(); rerender(); });
  await ev(() => { ST.shopOpt = {'consent.wa':'WA offers please'}; saveState(); rerender(); });
  log(await ev(() => /WA offers please/.test(document.querySelector('[data-testid=co-consent-wa]').innerText)), 'tick words come from the setting');
  await ev(() => { delete ST.shopOpt; saveState(); rerender(); });
  /* place an order with WA ticked, SMS unticked */
  await pg.locator('[data-testid=co-consent-wa] input').check(); await pg.locator('[data-testid=co-consent-sms] input').uncheck();
  await ev(() => { var u = co_state(); u.name = 'Test Kabir'; u.phone = '01811223344'; u.address = 'House 3, Road 2, Dhanmondi, Dhaka'; u.addrRead = u.address; rerender(); });
  await pg.waitForTimeout(1100);
  await ev(() => { document.querySelector('.co-confirm').click(); });
  await pg.waitForTimeout(500);
  const oc = await ev(() => { var id = Object.keys(ST.orders).filter(k => ST.orders[k].phone==='01811223344')[0]; var o = ST.orders[id]; return o ? [o.consent, ST.accounts['01811223344'].consent, o.offersOptIn] : null; });
  log(oc && oc[0].sms===false && oc[0].wa===true && oc[1].sms===false && oc[1].wa===true, 'order + customer store two consents apart '+JSON.stringify(oc && [oc[0].sms, oc[0].wa, oc[1].sms, oc[1].wa]));
  await go('#/admin/customers/01811223344');
  const crm = await ev(() => [document.querySelector('[data-testid=zr-cons-sms]').innerText, document.querySelector('[data-testid=zr-cons-wa]').innerText]);
  log(/No/.test(crm[0]) && /Yes/.test(crm[1]) && /checkout/i.test(crm[1]), 'CRM shows both consents: '+crm.map(x => x.replace(/\s+/g,' ')).join(' | '));
  await pg.locator('[data-testid=zr-cons-sms] [data-act=zr-opt]').click(); await pg.waitForTimeout(200);
  log(await ev(() => ST.accounts['01811223344'].consent.sms===true && ST.accounts['01811223344'].consent.wa===true), 'CRM switch writes the customer record');
  await pg.locator('[data-testid=zr-viewlog]').scrollIntoViewIfNeeded(); await shot('crm-consent-393');

  /* ---- 1b. CRM: full numbers, logged opens and copies ---- */
  await go('#/admin/customers');
  log(await ev(() => /01712-345678/.test(document.getElementById('zr-rows').innerText) && !/•••/.test(document.getElementById('zr-rows').innerText)), 'list shows full phone numbers');
  await go('#/admin/customers/01712345678');
  log(await ev(() => /01712-345678/.test(document.querySelector('[data-testid=zr-phone]').innerText)), 'profile shows the full number');
  log(await ev(() => !document.querySelector('[data-act=zr-phone]')), 'no "Show number" button');
  await pg.locator('[data-testid=zr-copy]').click(); await pg.waitForTimeout(200);
  const lg = await ev(() => ST.ops.crm.reveals.filter(r => r.c==='01712345678').map(r => r.k+':'+r.who));
  log(lg.indexOf('open:Owner')>=0 && lg.indexOf('copy:Owner')>=0, 'profile open + copy logged with who/when '+JSON.stringify(lg));
  log(await ev(() => /opened the profile/.test(document.querySelector('[data-testid=zr-viewlog]').innerText) && /copied/.test(document.querySelector('[data-testid=zr-viewlog]').innerText)), 'log shown on the profile');
  log(!(await ev(() => /Mirpur|Road 5/.test(document.getElementById('app').innerText))), 'address still never on the profile');
  await pg.locator('[data-testid=zr-viewlog]').scrollIntoViewIfNeeded(); await shot('crm-log-393');
  await pg.evaluate(() => window.scrollTo(0,0)); await shot('crm-profile-top-393');

  /* ---- 2. trial at the door ---- */
  await go('#/p/essential-pique-polo');
  log(await ev(() => !!document.querySelector('[data-testid=pdp-trial]')), 'PDP trial line');
  await pg.locator('[data-testid=pdp-rules]').scrollIntoViewIfNeeded(); await pg.evaluate(() => window.scrollBy(0, -200)); await shot('pdp-trial-393');
  await ev(() => { ST.bag = []; bagAdd({kind:'item', product:'essential-pique-polo', color:'navy', size:'M', qty:1}, {force:true}); delete UI.checkout; saveState(); });
  await go('#/checkout');
  log(await ev(() => !!document.querySelector('[data-testid=co-trial]')), 'checkout trial line near the promise');
  await go('#/page/delivery'); log(await ev(() => !!document.querySelector('[data-testid=trial-help]')), 'delivery help page trial');
  await shot('help-delivery-393');
  await go('#/page/exchange'); log(await ev(() => !!document.querySelector('[data-testid=trial-help]')), 'exchange help page trial');
  await ev(() => { ST.shopOpt = {'trial.on':false}; saveState(); });
  await go('#/p/essential-pique-polo'); const off1 = await ev(() => !document.querySelector('[data-testid=pdp-trial]'));
  await go('#/page/delivery'); const off2 = await ev(() => !document.querySelector('[data-testid=trial-help]'));
  log(off1 && off2, 'switch off → no trial line anywhere');
  await ev(() => { ST.shopOpt = {'trial.line':'Try first, pay later'}; ST.lang = 'en'; saveState(); });
  await go('#/p/essential-pique-polo'); log(await ev(() => /Try first, pay later/.test(document.querySelector('[data-testid=pdp-trial]').innerText)), 'trial words from the setting');
  await ev(() => { delete ST.shopOpt; ST.lang = 'bn'; saveState(); });
  await go('#/p/essential-pique-polo'); log(await ev(() => /রাইডারের সামনে/.test(document.querySelector('[data-testid=pdp-trial]').innerText)), 'trial line in Bengali');
  await ev(() => { ST.lang = 'en'; saveState(); });

  /* ---- 3. same size twice ---- */
  const addTwice = async () => { await go('#/p/essential-pique-polo'); await ev(() => { ST.bag = []; saveState(); var c = pdp_cur(); c.u.size = 'M'; c.u.color = 'navy'; LAST_ADD = {k:'',t:0}; ACT['pdp-add'](); closeModal(true); LAST_ADD = {k:'',t:0}; ACT['pdp-add'](); }); await pg.waitForTimeout(150); return ev(() => [ST.bag.length, ST.bag[0] && ST.bag[0].qty, (document.querySelector('.toast')||{}).innerText]); };
  let r = await addTwice(); log(r[1]===1 && /Already in your bag/.test(r[2]), 'default block: '+JSON.stringify(r));
  await ev(() => { ST.shopOpt = {'bag.duplicateAdd':'qty'}; saveState(); });
  r = await addTwice(); log(r[1]===2 && /now 2 in your bag/.test(r[2]), 'qty mode: +1 with toast '+JSON.stringify(r));
  await shot('pdp-qty-toast-393');
  const lim = await ev(() => { var p = P('essential-pique-polo'), st = p.stock.navy.M; ST.bag = []; bagAdd({kind:'item', product:p.id, color:'navy', size:'M', qty:st}, {force:true}); LAST_ADD = {k:'',t:0}; var res = bagAdd({kind:'item', product:p.id, color:'navy', size:'M', qty:1}, {dupQty:true}); return [st, ST.bag[0].qty, res.reason]; });
  log(lim[1]===lim[0] && lim[2]==='stock', 'qty mode never passes stock '+JSON.stringify(lim));
  await ev(() => { delete ST.shopOpt; ST.bag = []; saveState(); });

  /* ---- 4. Admin settings rows ---- */
  await ev(() => { document.body.style.zoom = ''; }); await go('#/admin/settings');
  const rows = await ev(() => ['opt.consent.smsOn','opt.consent.waOn','opt.trial.on','opt.bag.duplicateAdd','opt.consent.smsBn','opt.trial.lineBn'].map(id => !!document.getElementById('zs-row-'+id.replace(/\W/g,'-'))));
  log(rows.every(Boolean), 'settings rows registered '+JSON.stringify(rows));
  await pg.selectOption('[data-id="opt.bag.duplicateAdd"]', 'qty'); await pg.waitForTimeout(150);
  log(await ev(() => OPT('bag.duplicateAdd')==='qty'), 'settings select writes the option');
  await pg.locator('#zs-g-consent').scrollIntoViewIfNeeded(); await shot('settings-consent-393');
  await pg.locator('#zs-g-trial').scrollIntoViewIfNeeded(); await shot('settings-trial-393');
  await pg.locator('#zs-g-bagopt').scrollIntoViewIfNeeded(); await shot('settings-bag-393');
  await ev(() => { delete ST.shopOpt; if(ST.sys) ST.sys.store = {}; saveState(); });

  /* ---- 5. combo lifecycle ---- */
  await go('#/admin/combos');
  /* the admin is English by default (owner, 19 Oct 19:53) with a Bengali switch: check the English label, then the Bengali one */
  const stTxt = () => ev(() => document.querySelector('[data-testid=acw-rule-solid-polo-2] [data-testid=acw-state]').innerText.trim());
  const setAL = async l => { await ev(l => { ST.adminLang = l; saveState(); rerender(); }, l); await pg.waitForTimeout(250); };
  const bothLangs = async (en, bn, what) => {
    log(await ev(() => (ST.adminLang || 'en') === 'en'), what + ': admin starts in English');
    const e = await stTxt(); log(en.test(e), what + ' — English: "' + e + '"');
    await setAL('bn'); const b = await stTxt(); log(bn.test(b), what + ' — Bengali after the switch: "' + b + '"');
    await setAL('en');
  };
  await bothLangs(/^Running$/, /^চলছে$/, 'rule card state');
  await pg.locator('[data-testid=acw-rule-solid-polo-2] [data-act=acw-active]').click(); await pg.waitForTimeout(200);
  log(await ev(() => !document.querySelector('[data-testid=acw-rule-solid-polo-2]')), 'switched off → leaves the main list');
  await go('#/admin/combos?tab=archive');
  await bothLangs(/^Off$/, /^বন্ধ$/, 'in Archive, switched off');
  await shot('admin-archive-393');
  await go('#/combos/solid-polo-2');
  const en1 = await ev(() => [!!document.querySelector('[data-testid=ca-ended]'), document.querySelectorAll('[data-testid=ca-alt] [data-testid=ca-card]').length, /এই অফার শেষ/.test(document.body.innerText), document.querySelectorAll('.ca-page [data-act=ca-add],.ca-page [data-act=ca-size]').length]);
  log(en1[0] && en1[1]>0 && en1[2] && en1[3]===0, 'off rule page opens ended, alternatives, no buy '+JSON.stringify(en1));
  await shot('combo-ended-list-393');
  const pid = await ev(() => ca_generate(ca_rule('solid-polo-2')).all[0].id);
  await go('#/combo-pair/'+pid);
  const en2 = await ev(() => [!!document.querySelector('[data-testid=ca-ended]'), document.querySelectorAll('[data-testid=ca-alt] [data-testid=ca-card]').length, document.querySelectorAll('.ca-page button').length]);
  log(en2[0] && en2[1]>0 && en2[2]===0, 'off pair page opens ended, alternatives, no buttons '+JSON.stringify(en2));
  await shot('combo-ended-pair-393');
  log(await ev(() => !ca_activeRules().some(r => r.id==='solid-polo-2')), 'ended rule not listed');
  await go('#/admin/combos?tab=archive'); await pg.locator('[data-testid=acw-rule-solid-polo-2] [data-testid=acw-revive]').click(); await pg.waitForTimeout(200);
  log(await ev(() => ca_rule('solid-polo-2').state==='live'), 'Turn on again → live, same URL');
  /* dates */
  await ev(() => { acw_patch('solid-polo-2', {end:'2020-01-01'}); });
  log(await ev(() => ca_rule('solid-polo-2').state==='ended'), 'end date passed → ended automatically');
  await go('#/admin/combos?tab=archive'); await bothLangs(/^Ended\b/, /^শেষ হয়েছে/, 'Archive label after the end date');
  await ev(() => { acw_patch('solid-polo-2', {end:'2099-12-31'}); });
  log(await ev(() => ca_rule('solid-polo-2').state==='live'), 'end date extended → live again');
  await ev(() => { acw_patch('solid-polo-2', {start:'2099-01-01', end:''}); });
  await go('#/admin/combos');
  await bothLangs(/^Starts \d/, /^শুরু হবে/, 'future start');
  log(await ev(() => !ca_activeRules().some(r => r.id==='solid-polo-2')), 'future start → not listed');
  await pg.locator('[data-testid=acw-rule-solid-polo-2]').scrollIntoViewIfNeeded(); await shot('admin-rule-dates-393');
  await go('#/combos/solid-polo-2'); log(await ev(() => document.querySelector('[data-testid=ca-ended]').getAttribute('data-state')==='soon'), 'before start: page opens, no buy');
  await ev(() => { acw_patch('solid-polo-2', {start:'', end:''}); });

  /* ---- 6. slider snap after a hand swipe ---- */
  await pg.mouse.move(2, 2); await go('#/'); await pg.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(pg);
  const trk = await ev(() => { var t = ['hm-settrack','hm-revtrack','hm-jtrack'].map(id => document.getElementById(id)).filter(el => el && el.getAttribute('data-sm'))[0]; t.scrollIntoView({block:'center'}); var r = t.getBoundingClientRect(); return {id:t.id, x:r.left + r.width*0.7, y:r.top + r.height/2}; });
  await pg.waitForTimeout(300);
  console.log('   track', trk.id, JSON.stringify(await ev(a => { var e = document.getElementById(a.id), s = SMOOTH.peek(a.id), h = document.elementFromPoint(a.x, a.y); return [e.scrollLeft, JSON.stringify(s), h && (h.className||h.tagName).toString().slice(0,40), e.contains(h), document.querySelector('.modal-back') ? 'modal' : '']; }, trk)));
  const off = async id => ev(id => { var el = document.getElementById(id), cs = getComputedStyle(el), edge = el.getBoundingClientRect().left + parseFloat(cs.paddingLeft); var best = 1e9; [...el.children].forEach(c => { var d = c.getBoundingClientRect().left - edge; if(Math.abs(d) < Math.abs(best)) best = d; }); return Math.round(best*10)/10; }, id);
  const X = Math.round(trk.x), Y = Math.round(trk.y), sw0 = await ev(id => document.getElementById(id).scrollLeft, trk.id);
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:X, y:Y}]});
  for (let i=1;i<=10;i++){ await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:X - i*11, y:Y}]}); await pg.waitForTimeout(16); }
  const mid = await ev(id => document.getElementById(id).scrollLeft, trk.id);
  await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
  await pg.waitForTimeout(1100);
  log(Math.abs(mid - sw0) > 30, 'the hand swipe moved the row ('+Math.round(sw0)+' → '+Math.round(mid)+' under the finger → '+Math.round(await ev(id => document.getElementById(id).scrollLeft, trk.id))+' after the snap)');
  const o1 = await off(trk.id);
  log(Math.abs(o1) <= 1.5, trk.id+': after a hand swipe the row sits on a card edge (offset '+o1+'px)');
  const s0 = await ev(id => document.getElementById(id).scrollLeft, trk.id); await pg.waitForTimeout(1500);
  const s1 = await ev(id => document.getElementById(id).scrollLeft, trk.id);
  log(Math.abs(s1 - s0) < 1, 'drift stays paused during the hold ('+s0+' → '+s1+')');
  await pg.waitForTimeout(4200);
  const s2 = await ev(id => document.getElementById(id).scrollLeft, trk.id);
  log(Math.abs(s2 - s1) >= 1, 'auto-drift resumes after the pause ('+s1+' → '+s2+')');
  /* jitter: during drift the position only moves one way */
  const mono = await ev(async id => { var el = document.getElementById(id), a = [], dir = 0, bad = 0; for(let i=0;i<40;i++){ a.push(el.scrollLeft); await new Promise(r => setTimeout(r, 50)); } for(let i=1;i<a.length;i++){ var d = a[i]-a[i-1]; if(Math.abs(d) > 200) continue; if(d && !dir) dir = Math.sign(d); if(d && Math.sign(d)!==dir) bad++; } return bad; }, trk.id);
  log(mono===0, 'no jitter during drift (direction changes: '+mono+')');
  /* resize: no jump back to the start, still on a card edge */
  const before = await ev(id => document.getElementById(id).scrollLeft, trk.id);
  await pg.setViewportSize({width:375, height:852}); await pg.waitForTimeout(500);
  const after = await ev(id => document.getElementById(id).scrollLeft, trk.id);
  log(after > 20 || before < 40, 'resize keeps the place ('+before+' → '+after+')');
  await pg.setViewportSize({width:393, height:852});

  log(errs.length===0, 'no JS errors '+JSON.stringify(errs.slice(0,3)));
  console.log(fails ? 'FAILS: '+fails : 'ALL PASSED');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
