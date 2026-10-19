/* Popup rules on how-to-wash-denim.  usage: node popup.js <device> [full] */
const L = require('./lib');
const D = L.dev(process.argv[2]); const FULLDELAY = process.argv[3] === 'full';
const R = L.Rec('popup', D.name);
const POST = '#/journal/how-to-wash-denim';
const isOpen = T => L.ev(T, () => !!document.querySelector('.modal-back .bf-pop, .modal-back .bf-popc'));
const popAd = T => L.ev(T, () => ST.blogAds.find(a => (a.slots || []).includes('post-popup') && (a.posts || []).includes('how-to-wash-denim')));
async function setPop(T, o, set){ await L.ev(T, ([o, set]) => { const a = ST.blogAds.find(a => (a.slots || []).includes('post-popup') && (a.posts || []).includes('how-to-wash-denim')); a.popup = Object.assign({}, a.popup, o); if(set) Object.assign(ST.blogAdSettings, set); saveState(); }, [o, set || null]); }
async function resetCap(T){ await L.ev(T, () => { try{ Object.keys(localStorage).filter(k => /^bf-pop-/.test(k)).forEach(k => localStorage.removeItem(k)); sessionStorage.clear(); }catch(e){} BF.popShown = {}; closeModal(); }); }
/* scroll the article to a progress fraction (same measure the popup rule names: % of the article read) */
async function scrollTo(T, frac){ await L.ev(T, f => { const a = document.getElementById('bf-article'); const top = a.getBoundingClientRect().top + scrollY; const y = top + f * a.offsetHeight - innerHeight; window.scrollTo(0, Math.max(0, y)); }, frac); await L.wait(T, 250); return L.ev(T, () => Math.round(bfArtProgress() * 100)); }
async function trigger(T){ /* fresh visit, scroll past the threshold, wait out the delay */
  await L.go(T, '#/journal', 300); await L.go(T, POST, 600);
  const ad = await popAd(T); const v = (ad.popup || {}).value || 50;
  await scrollTo(T, Math.min(0.99, v / 100 + 0.08)); await L.wait(T, ((ad.popup || {}).delay || 0) * 1000 + 700);
  return isOpen(T);
}

(async () => {
  const T = await L.open(D);
  await L.prep(T, '#/admin/blog?tab=ads'); await L.wait(T, 500);
  const ad0 = await popAd(T);
  R.add('P00-config', 'popup ad set for how-to-wash-denim (info)', null, {measured: ad0 ? ad0.id + ' ' + JSON.stringify(ad0.popup) + ' type ' + ad0.type + ' → ' + ad0.link : 'none'});
  if(!ad0){ R.add('P00-none', 'popup ad exists in the back end', false); await L.close(T); return; }

  /* P1 + P2 trigger and timing with the back-end seed settings */
  await L.go(T, POST, 600);
  const tEnter = Date.now();
  await L.wait(T, 2500);
  R.add('P1-notonload', 'no popup when the post opens', !(await isOpen(T)), {measured: 'open after 2.5 s: ' + await isOpen(T)});
  const v = ad0.popup.value, dl = ad0.popup.delay || 0;
  if(!FULLDELAY && dl){ await setPop(T, {delay: 0}); await L.go(T, '#/journal', 300); await L.go(T, POST, 600); }
  const below = await scrollTo(T, (v - 12) / 100); await L.wait(T, 800);
  const openBelow = await isOpen(T);
  if(FULLDELAY) await L.wait(T, Math.max(0, 12000 - (Date.now() - tEnter)));   /* stay on the page longer than the "wait at least" seconds */
  const above = await scrollTo(T, Math.min(0.99, (v + 8) / 100)); const tCross = Date.now();
  let tShow = 0; for(let i = 0; i < 30; i++){ if(await isOpen(T)){ tShow = Date.now(); break; } await L.wait(T, 500); }
  R.add('P2a-trigger', 'opens only after ' + v + '% of the article is read', !openBelow && tShow > 0, {measured: 'at ' + below + '%: ' + openBelow + ', at ' + above + '%: opened after ' + (tShow ? ((tShow - tCross) / 1000).toFixed(1) + ' s' : 'never')});
  if(FULLDELAY) R.add('P2b-delay', 'the "wait at least ' + dl + ' s after arriving" setting: already ' + Math.round((tCross - tEnter) / 1000) + ' s on the page, so it should open on reaching ' + v + '%', tShow > 0 && (tShow - tCross) < 2500, {measured: 'opened ' + (tShow ? ((tShow - tCross) / 1000).toFixed(1) : '—') + ' s after reaching ' + v + '%', expected: '≈0 s (back-end label: ঢোকার পর অন্তত কত সেকেন্ড অপেক্ষা)'});
  if(tShow){
    await L.shot(T, D.name + '-popup-open');
    const a11y = await L.ev(T, () => { const m = document.querySelector('.modal-back .modal'); return {role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), label: m.getAttribute('aria-label'), focusInside: m.contains(document.activeElement), lab: /EXTAS/.test(m.textContent), cta: (m.querySelector('.bf-popc a.btn, .bf-popc button[data-act="bf-add"]') || {}).outerHTML ? (m.querySelector('.bf-popc a.btn') || {}).getAttribute ? m.querySelector('.bf-popc a.btn').getAttribute('href') : 'add-button' : null}; });
    R.add('P9-a11y', 'popup is a labelled dialog and takes keyboard focus', a11y.role === 'dialog' && a11y.modal === 'true' && a11y.lab && a11y.focusInside, {measured: JSON.stringify(a11y)});
    /* P3 close by ✕ */
    await L.tap(T, '.modal-back .modal-hd [data-act="close-modal"]');
    R.add('P3a-close-x', 'closes with ✕', !(await isOpen(T)));
    /* frequency cap: same post again in this visit, then reload */
    await L.go(T, '#/journal', 300); await L.go(T, POST, 500); await scrollTo(T, 0.95); await L.wait(T, 1500 + (FULLDELAY ? dl * 1000 : 0));
    const again = await isOpen(T);
    await T.p.reload(); await L.wait(T, 900); await L.go(T, POST, 500); await scrollTo(T, 0.95); await L.wait(T, 1500 + (FULLDELAY ? dl * 1000 : 0));
    const afterReload = await isOpen(T);
    R.add('P3b-cap', 'frequency cap (' + ad0.popup.freq + '): not again on return or reload', !again && !afterReload, {measured: 'return: ' + again + ', reload: ' + afterReload});
  }
  await setPop(T, {delay: 0, trigger: 'scroll', value: 50, freq: 'session'});

  /* P4 tap outside */
  await resetCap(T);
  if(await trigger(T)){
    const pt = await L.ev(T, () => { const r = document.querySelector('.modal-back .modal').getBoundingClientRect(); if(r.top > 30) return [Math.round(innerWidth / 2), Math.round(r.top / 2)]; if(r.left > 30) return [Math.round(r.left / 2), Math.round(innerHeight / 2)]; return [Math.round(innerWidth / 2), Math.round((r.bottom + innerHeight) / 2)]; });
    if(D.touch) await T.p.touchscreen.tap(pt[0], pt[1]); else await T.p.mouse.click(pt[0], pt[1]);
    await L.wait(T, 300);
    R.add('P4-outside', 'closes by tapping outside', !(await isOpen(T)), {measured: 'tapped at ' + pt.join(',')});
  } else R.add('P4-outside', 'closes by tapping outside (popup did not open)', false);
  /* P5 Esc */
  await resetCap(T);
  if(await trigger(T)){ await T.p.keyboard.press('Escape'); await L.wait(T, 250); R.add('P5-esc', 'closes with Esc', !(await isOpen(T))); }
  else R.add('P5-esc', 'closes with Esc (popup did not open)', false);
  /* P8 CTA */
  await resetCap(T);
  if(await trigger(T)){
    const want = (await popAd(T)).link || ('#/p/' + (await popAd(T)).productId);
    const btn = T.p.locator('.modal-back .bf-popc a.btn-primary, .modal-back .bf-popc button[data-act="bf-add"]').first();
    const kind = await btn.evaluate(e => e.tagName);
    if(kind === 'A'){ if(D.touch) await btn.tap(); else await btn.click(); await L.wait(T, 500); const h = await L.ev(T, () => location.hash); R.add('P8-cta', 'popup button opens the advertised product', h === want, {measured: h, expected: want}); }
    else { if(D.touch) await btn.tap(); else await btn.click(); await L.wait(T, 300); R.add('P8-cta', 'popup "Add to bag" opens the size sheet', await L.ev(T, () => !!document.querySelector('.modal-back .bf-addm'))); }
    await L.ev(T, () => closeModal());
  }
  /* other posts never get this popup */
  await resetCap(T); await L.go(T, '#/journal/what-gsm-means', 500); await scrollTo(T, 0.95); await L.wait(T, 1200);
  R.add('P10-onlypost', 'popup does not open on other posts', !(await isOpen(T)));

  /* P6 phone visitor from Google: never on the first screen */
  for(const via of ['referrer', 'query']){
    const T2 = await L.open(D, {browser: T.b, init: via === 'referrer' ? (() => { Object.defineProperty(Document.prototype, 'referrer', {get(){ return 'https://www.google.com/'; }}); }) : undefined});
    await L.prep(T2, '#/admin/blog?tab=ads'); await L.wait(T2, 300);
    await setPop(T2, {trigger: 'time', value: 2, delay: 0, freq: 'session'});
    const url = via === 'query' ? POST + '?from=google' : POST;
    await L.go(T2, '#/journal', 300); await L.go(T2, url, 400); await L.wait(T2, 3200);
    const atTop = await isOpen(T2);
    const phone = D.w < 768;
    if(phone){
      await L.ev(T2, () => window.scrollTo(0, innerHeight * 1.6)); await L.wait(T2, 900);
      const later = await isOpen(T2);
      R.add('P6-google-' + via, 'phone from Google (' + via + '): no popup on the first screen; may open after scrolling on', !atTop && later, {measured: 'at top after 3 s: ' + atTop + ', after scrolling past the first screen: ' + later});
      if(atTop || later) await L.shot(T2, D.name + '-popup-google-' + via);
      /* owner switches the setting on */
      if(via === 'referrer'){
        await L.ev(T2, () => closeModal()); await resetCap(T2); await setPop(T2, {}, {popupOnMobileFromSearch: true});
        await L.go(T2, '#/journal', 300); await L.go(T2, url, 400); await L.wait(T2, 3200);
        R.add('P6b-google-on', 'setting "popup for phone visitors from Google" ON → it may open on the first screen', await isOpen(T2), {measured: 'open at top: ' + await isOpen(T2)});
      }
    } else R.add('P6-google-' + via, 'tablet/desktop from Google (' + via + '): time trigger works as set (rule is for phones)', atTop, {measured: 'open after 3 s: ' + atTop});
    await L.close(T2);
  }

  /* P7 exit intent */
  await resetCap(T); await setPop(T, {trigger: 'exit', delay: 0});
  await L.go(T, '#/journal', 300); await L.go(T, POST, 500); await L.ev(T, () => scrollTo(0, 600)); await L.wait(T, 300);
  if(!D.touch){ await T.p.mouse.move(400, 300); await T.p.mouse.move(400, 5, {steps: 5}); await T.p.mouse.move(400, -10, {steps: 2}); await L.wait(T, 300);
    let o = await isOpen(T); if(!o){ await L.ev(T, () => document.dispatchEvent(new MouseEvent('mouseout', {clientY: -2, clientX: 400, relatedTarget: null, bubbles: true}))); await L.wait(T, 400); o = await isOpen(T); }
    R.add('P7-exit', 'exit trigger: opens when the mouse leaves the page (desktop)', o); }
  else { await L.wait(T, 1500); R.add('P7-exit', 'exit trigger never opens on touch devices', !(await isOpen(T))); }
  await L.ev(T, () => closeModal());

  R.add('P99-errors', 'JS errors during popup checks', T.errs.length === 0, {measured: T.errs.slice(0, 5).join(' | ') || 'none'});
  await L.close(T);
})().catch(e => { console.error('CRASH', e); R.add('P00-crash', 'popup crashed', false, {measured: String(e).slice(0, 300)}); process.exit(1); });
