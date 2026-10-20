/* L29 · the rest: sticky bars (both directions), blog popup + slim bar + tab bar, side-canvas motion/popup,
   share + sort popovers, pull-to-refresh, swipe-back, press-and-hold steppers, rotating offer card, intro, forever timers. */
const L = require('./lib');
const SETUP = "ST.user = Object.keys(ST.accounts)[0]; if(!ST.bag.length){ DB.products.slice(0,2).forEach(function(p){ var c=p.colors[0], s=p.sizes.filter(function(z){return stockOf(p.id,c,z)>0;})[0]; if(s) bagAdd({kind:'item',product:p.id,color:c,size:s,qty:1}); }); }";
const wait = (p, ms) => p.waitForTimeout(ms);
async function scrollTo(page, y, smoothSteps){
  if(!smoothSteps){ await page.evaluate(v => window.scrollTo(0, v), y); return; }
  const y0 = await L.scrollY(page);
  for(let i = 1; i <= smoothSteps; i++){ await page.evaluate(v => window.scrollTo(0, v), Math.round(y0 + (y - y0) * i / smoothSteps)); await wait(page, 40); }
}
async function ev(page, f, a){ return page.evaluate(f, a); }

/* ---------- sticky bars ---------- */
async function stickyBars(){
  /* phone: bag bar steps aside when the real Checkout is on screen, comes back when it scrolls away */
  {
    const page = await L.newPage('phone');
    await L.open(page, '#/bag', { setup: SETUP, wait: 1200 });
    const dev = 'phone', lang = 'en', pg = 'bag';
    const has = await ev(page, () => !!document.querySelector('.bg-mbar') && !!document.querySelector('[data-testid="bag-checkout"]'));
    if(has){
      await scrollTo(page, 0); await wait(page, 400);
      const off0 = await ev(page, () => document.querySelector('.bg-mbar').classList.contains('bg-mbar-off'));
      const yBtn = await ev(page, () => { const b = document.querySelector('[data-testid="bag-checkout"]'); return Math.round(b.getBoundingClientRect().top + pageYOffset - innerHeight / 2); });
      await scrollTo(page, yBtn, 6); await wait(page, 400);
      const off1 = await ev(page, () => document.querySelector('.bg-mbar').classList.contains('bg-mbar-off'));
      await scrollTo(page, 0, 6); await wait(page, 400);
      const off2 = await ev(page, () => document.querySelector('.bg-mbar').classList.contains('bg-mbar-off'));
      L.rec({ dev, lang, page: pg, id: 'SB-01', what: 'bag buy bar: shown at top · steps aside when the summary Checkout is on screen · back when scrolled up again', measured: `top ${off0 ? 'HIDDEN' : 'shown'} · at Checkout ${off1 ? 'aside' : 'STILL SHOWN'} · back up ${off2 ? 'STILL HIDDEN' : 'shown'}`, pass: (!off0 || off1) && off1 && !off2, note: off0 ? 'Checkout already visible at the top' : '' });
    } else L.rec({ dev, lang, page: pg, id: 'SB-01', what: 'bag buy bar', measured: 'no bar / button', pass: null });
    /* WhatsApp disc steps aside over the footer and comes back */
    await L.open(page, '#/c/polos', { wait: 1000 });
    const fab = await ev(page, () => !!document.getElementById('wa-fab'));
    if(!fab) L.rec({ dev, lang, page: 'category', id: 'SB-02', what: 'WhatsApp disc vs footer', measured: 'no floating disc on this build (header WhatsApp only)', pass: null });
    if(fab){
      const max = await ev(page, () => document.documentElement.scrollHeight - innerHeight);
      await scrollTo(page, max, 8); await wait(page, 300);
      const a = await ev(page, () => document.getElementById('wa-fab').classList.contains('wa-off'));
      await scrollTo(page, 200, 8); await wait(page, 300);
      const b = await ev(page, () => document.getElementById('wa-fab').classList.contains('wa-off'));
      L.rec({ dev, lang, page: 'category', id: 'SB-02', what: 'WhatsApp disc steps aside over the footer, comes back on the way up', measured: `at footer ${a ? 'aside' : 'STILL ON'} · back up ${b ? 'STILL HIDDEN' : 'back'}`, pass: a && !b });
    }
    /* landing page buy bar */
    await L.open(page, '#/l/polo-duo', { wait: 1000 });
    const lp = await ev(page, () => !!document.getElementById('lp-mbar') && !!document.getElementById('lp-form'));
    if(lp){
      await scrollTo(page, 0); await wait(page, 300);
      const a = await ev(page, () => document.getElementById('lp-mbar').classList.contains('away'));
      const yf = await ev(page, () => Math.round(document.getElementById('lp-form').getBoundingClientRect().top + pageYOffset - 100));
      await scrollTo(page, yf, 8); await wait(page, 400);
      const b = await ev(page, () => document.getElementById('lp-mbar').classList.contains('away'));
      await scrollTo(page, 0, 8); await wait(page, 400);
      const c = await ev(page, () => document.getElementById('lp-mbar').classList.contains('away'));
      L.rec({ dev, lang, page: 'landing', id: 'SB-03', what: 'landing buy bar: away while the order form is on screen, back when it scrolls off', measured: `top ${a ? 'away' : 'shown'} · at form ${b ? 'away' : 'STILL SHOWN'} · back up ${c ? 'STILL AWAY' : 'shown'}`, pass: b && !c });
    } else L.rec({ dev, lang, page: 'landing', id: 'SB-03', what: 'landing buy bar', measured: 'not found on #/l/polo-duo', pass: null });
    /* checkout: header WhatsApp shows only when the in-page help has scrolled away */
    await L.open(page, '#/checkout', { wait: 1000 });
    const ck = await ev(page, () => !!document.querySelector('.ckh .hdr-wa-auto'));
    if(ck){
      await scrollTo(page, 0); await wait(page, 300);
      const a = await ev(page, () => document.querySelector('.ckh .hdr-wa-auto').classList.contains('on'));
      await scrollTo(page, 700, 8); await wait(page, 300);
      const b = await ev(page, () => document.querySelector('.ckh .hdr-wa-auto').classList.contains('on'));
      await scrollTo(page, 0, 8); await wait(page, 300);
      const c = await ev(page, () => document.querySelector('.ckh .hdr-wa-auto').classList.contains('on'));
      L.rec({ dev, lang, page: 'checkout', id: 'SB-04', what: 'checkout header WhatsApp: hidden while "Need help?" is on screen, shown after it scrolls away, hidden again on the way up', measured: `top ${a ? 'SHOWN' : 'hidden'} · scrolled ${b ? 'shown' : 'NOT SHOWN'} · back up ${c ? 'STILL SHOWN' : 'hidden'}`, pass: !a && b && !c });
    } else L.rec({ dev, lang, page: 'checkout', id: 'SB-04', what: 'checkout header WhatsApp', measured: 'not present', pass: null });
    await page.context().close();
  }
  /* desktop: product sticky buy bar appears when the buttons scroll under the header, goes on the way back */
  for(const dev of ['d1366', 'd1920']){
    const page = await L.newPage(dev);
    await L.open(page, '#/p/essential-pique-polo', { wait: 1200 });
    const has = await ev(page, () => !!document.querySelector('.pdp-page .dkb-bar'));
    if(has){
      await scrollTo(page, 0); await wait(page, 300);
      const a = await ev(page, () => { const b = document.querySelector('.dkb-bar'); return { on: b.classList.contains('on'), inert: b.hasAttribute('inert') }; });
      const H = await ev(page, () => document.documentElement.scrollHeight - innerHeight);
      let yOn = -1; for(let y = 0; y <= H; y += 120){ await ev(page, v => window.scrollTo(0, v), y); await wait(page, 50); if(await ev(page, () => document.querySelector('.dkb-bar').classList.contains('on'))){ yOn = y; break; } }
      const b = await ev(page, () => { const b = document.querySelector('.dkb-bar'); const c = document.querySelector('.pdp-page .pdp-b .pdp-ctas'); const h = document.querySelector('.hdr'); return { on: b.classList.contains('on'), inert: b.hasAttribute('inert'), ctaGone: c.getBoundingClientRect().bottom < h.getBoundingClientRect().bottom + 2 }; });
      await scrollTo(page, 0, 8); await wait(page, 300);
      const c = await ev(page, () => { const b = document.querySelector('.dkb-bar'); return { on: b.classList.contains('on'), inert: b.hasAttribute('inert') }; });
      L.rec({ dev, lang: 'en', page: 'product', id: 'SB-05', what: 'desktop sticky buy bar: off at top · on once the buttons pass under the header · off (and inert) again on the way up', measured: `top ${a.on ? 'ON' : 'off'} · ${yOn < 0 ? 'NEVER on' : 'on at y ' + yOn + ' (buttons under header: ' + b.ctaGone + ')'}${b.inert ? ' (INERT)' : ''} · back up ${c.on ? 'STILL ON' : 'off'}${c.inert ? ' (inert)' : ' (NOT inert)'}`, pass: !a.on && b.on && b.ctaGone && !b.inert && !c.on && c.inert });
    }
    /* WhatsApp disc + footer on desktop */
    await L.open(page, '#/c/polos', { wait: 1000 });
    if(await ev(page, () => !!document.getElementById('wa-fab'))){
      const max = await ev(page, () => document.documentElement.scrollHeight - innerHeight);
      await scrollTo(page, max, 8); await wait(page, 300);
      const a = await ev(page, () => document.getElementById('wa-fab').classList.contains('wa-off'));
      await scrollTo(page, 200, 8); await wait(page, 300);
      const b = await ev(page, () => document.getElementById('wa-fab').classList.contains('wa-off'));
      L.rec({ dev, lang: 'en', page: 'category', id: 'SB-02', what: 'WhatsApp disc steps aside over the footer, comes back on the way up', measured: `at footer ${a ? 'aside' : 'STILL ON'} · back up ${b ? 'STILL HIDDEN' : 'back'}`, pass: a && !b });
    }
    await page.context().close();
  }
}

/* ---------- journal: popup, slim bar, tab bar ---------- */
async function journal(){
  for(const dev of ['d1366', 'd1920', 'phone']){
    const page = await L.newPage(dev);
    await L.open(page, '#/', { setup: "try{ sessionStorage.clear(); }catch(e){}" });
    await L.open(page, '#/journal/how-to-wash-denim', { wait: 1200 });
    const base = { dev, lang: 'en', page: 'journal post' };
    const has = await ev(page, () => !!(BF.pop));
    if(!has){ L.rec({ ...base, id: 'BP-00', what: 'blog popup armed on how-to-wash-denim', measured: 'no popup planned', pass: null }); }
    else {
      const cfg = await ev(page, () => ({ val: BF.pop.val, trig: BF.pop.trig, delay: BF.pop.delay, sinceArrive: Date.now() - BF.pop.at }));
      const target = async (pct) => ev(page, (p) => { const a = document.getElementById('bf-article'); const r = a.getBoundingClientRect(); const top = r.top + pageYOffset; return Math.round(top + p * r.height - innerHeight); }, pct);
      const before = Math.max(0.05, cfg.val / 100 - 0.12), past = Math.min(1, cfg.val / 100 + 0.06);
      await scrollTo(page, await target(before), 6); await wait(page, 500);
      const pB = await ev(page, () => !!document.querySelector('.modal-back .bf-popc'));
      await scrollTo(page, await target(past), 4);
      const waitLeft = await ev(page, () => Math.max(0, BF.pop ? BF.pop.at + BF.pop.delay * 1000 - Date.now() : 0));
      const t0 = Date.now();
      let ms = -1; for(let i = 0; i < 320; i++){ if(await ev(page, () => !!document.querySelector('.modal-back .bf-popc'))){ ms = Date.now() - t0; break; } await wait(page, 50); }
      L.rec({ ...base, id: 'BP-01', what: `popup (owner setting: ${cfg.trig} ${cfg.val} %, wait ${cfg.delay} s from arrival): nothing before ${cfg.val} %, opens once past it and the wait is over`, measured: `${Math.round(before * 100)} %: ${pB ? 'OPEN' : 'none'} · ${Math.round(past * 100)} %: ${ms < 0 ? 'did NOT open in 16 s' : 'opened ' + ms + ' ms later (wait left was ' + waitLeft + ' ms)'}`, pass: !pB && ms >= 0 && Math.abs(ms - waitLeft) <= 700 });
      if(ms >= 0){
        const y1 = await L.scrollY(page);
        const locked = await ev(page, () => document.body.style.overflow === 'hidden');
        const vp = page.viewportSize();
        if(dev === 'phone') await L.swipe(page, vp.width / 2, vp.height * 0.8, vp.width / 2, vp.height * 0.3, 8, 16); else { await page.mouse.move(10, vp.height / 2); await page.mouse.wheel(0, 400); }
        await wait(page, 400);
        const y2 = await L.scrollY(page);
        const foc = await ev(page, () => { const a = document.activeElement; return !!(a && a.closest && a.closest('.modal-back')); });
        /* "No thanks" */
        const nb = await ev(page, () => { const b = document.querySelector('.bf-pop-no'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        if(dev === 'phone') await L.tap(page, nb.x, nb.y); else await page.mouse.click(nb.x, nb.y);
        await wait(page, 300);
        const after = await ev(page, () => ({ open: !!document.querySelector('.modal-back'), body: document.body.style.overflow, y: Math.round(pageYOffset), bar: !!(document.getElementById('bf-bar') && document.getElementById('bf-bar').classList.contains('on')) }));
        if(dev === 'phone') await L.swipe(page, vp.width / 2, vp.height * 0.7, vp.width / 2, vp.height * 0.4, 8, 16); else { await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.wheel(0, 300); }
        await wait(page, 400);
        const y3 = await L.scrollY(page);
        L.rec({ ...base, id: 'BP-02', what: 'blog popup: page locked while open, focus inside; "No thanks" → unlocked at the same spot', measured: `open: ${locked && Math.abs(y2 - y1) < 2 ? 'locked' : 'NOT locked (moved ' + (y2 - y1) + ')'} · focus inside ${foc} · closed: ${after.open ? 'STILL OPEN' : 'yes'}, y ${y1}→${after.y}, scrolls after ${y3 !== after.y ? 'yes' : 'NO'}`, pass: locked && Math.abs(y2 - y1) < 2 && foc && !after.open && Math.abs(after.y - y1) <= 2 && y3 !== after.y });
        /* once per session: scrolling on does not bring it back */
        await scrollTo(page, await target(0.9), 6); await wait(page, 500);
        const again = await ev(page, () => !!document.querySelector('.modal-back'));
        L.rec({ ...base, id: 'BP-03', what: 'popup does not come back on the same visit (cap: once per session)', measured: again ? 'OPENED AGAIN' : 'stayed closed', pass: !again });
      }
    }
    /* phone: the bottom tab bar slides away on scroll down, returns on scroll up; slim bar while tabs are away */
    if(dev === 'phone'){
      await L.open(page, '#/journal/how-to-pick-your-polo-size', { wait: 1200 });
      await scrollTo(page, 0); await wait(page, 300);
      const vp = page.viewportSize();
      const tabOff = () => ev(page, () => document.body.classList.contains('bf-tabs-off'));
      for(let i = 0; i < 3; i++){ await L.swipe(page, vp.width / 2, vp.height * 0.75, vp.width / 2, vp.height * 0.35, 8, 16); await wait(page, 250); }
      const down = await tabOff();
      await L.swipe(page, vp.width / 2, vp.height * 0.35, vp.width / 2, vp.height * 0.6, 8, 16); await wait(page, 300);
      const up = await tabOff();
      L.rec({ ...base, page: 'journal post (no popup)', id: 'BP-04', what: 'tab bar slides away while reading down, comes back on a scroll up', measured: `down ${down ? 'away' : 'STILL SHOWN'} · up ${up ? 'STILL AWAY' : 'back'}`, pass: down && !up });
      const bar = await ev(page, () => !!document.getElementById('bf-bar'));
      if(bar){
        const snap = () => ev(page, () => ({ p: bfArtProgress(), on: document.getElementById('bf-bar').classList.contains('on'), tabs: document.body.classList.contains('bf-tabs-off') }));
        await scrollTo(page, 0); await wait(page, 300);
        let stacked = 0, firstOn = null, s;
        for(let i = 0; i < 12; i++){ await L.swipe(page, vp.width / 2, vp.height * 0.62, vp.width / 2, vp.height * 0.45, 6, 16); await wait(page, 200); s = await snap(); if(s.on && !s.tabs) stacked++; if(s.on && firstOn === null) firstOn = s.p; if(s.p > 0.9) break; }
        let offAt = null;
        for(let i = 0; i < 16; i++){ await L.swipe(page, vp.width / 2, vp.height * 0.45, vp.width / 2, vp.height * 0.62, 6, 16); await wait(page, 200); s = await snap(); if(s.on && !s.tabs) stacked++; if(!s.on && offAt === null) offAt = s.p; if(s.p < 0.3) break; }
        L.rec({ ...base, page: 'journal post (no popup)', id: 'BP-05', what: 'slim bar: comes on past 60 % only while the tab bar is away; goes when the tab bar returns or below 45 %; never stacked with the tab bar', measured: `first on at ${firstOn === null ? 'NEVER' : Math.round(firstOn * 100) + ' %'} · off again at ${offAt === null ? 'NEVER' : Math.round(offAt * 100) + ' %'} · stacked frames ${stacked}`, pass: firstOn !== null && firstOn >= 0.58 && offAt !== null && stacked === 0 });
      } else L.rec({ ...base, page: 'journal post (no popup)', id: 'BP-05', what: 'slim bar', measured: 'no slim bar on this post', pass: null });
    }
    await page.context().close();
  }
}

/* ---------- side canvas (desktop gutters): motion, off-screen pause, popup ---------- */
async function sideCanvas(){
  const dev = 'd1920', page = await L.newPage(dev);
  await L.open(page, '#/', { setup: "lb_sc(); ST.sideCanvas.enabled = true; try{ sessionStorage.removeItem('lb-pop-z-pop'); }catch(e){}", wait: 2500 });
  const base = { dev, lang: 'en', page: 'home (side canvas)' };
  const ok = await ev(page, () => !!document.getElementById('lb-sc'));
  if(!ok){ L.rec({ ...base, id: 'SC-00', what: 'side canvas drawn at 1920', measured: 'not drawn', pass: null }); await page.context().close(); return; }
  const cur = () => ev(page, () => [...document.querySelectorAll('#lb-sc .lb-mt[data-n]')].map(e => e.getAttribute('data-cur') || '0').join(','));
  const c0 = await cur(); await wait(page, 3000); const c1 = await cur();
  L.rec({ ...base, id: 'SC-01', what: 'side-canvas motion frames advance on their own', measured: `${c0} → ${c1}`, pass: c0 !== c1 });
  /* hover over an anchored rotating zone */
  const z = await ev(page, () => { const e = document.querySelector('#lb-sc .lb-z[data-zid="z-offer"]') || document.querySelector('#lb-sc .lb-mt[data-n]'); if(!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if(z){
    await page.mouse.move(z.x, z.y, { steps: 3 });
    /* TA-2: SC-02 now reads ONLY the zone under the mouse. TA-1 compared every zone at once, so the
       left-gutter "z-model" zone (x 12, the mouse is not on it) turning made the check fail even
       though the hovered right-gutter "z-offer" zone held — the hover rule is per slider. */
    const zc = () => ev(page, () => { const e = document.querySelector('#lb-sc .lb-z[data-zid="z-offer"] .lb-mt[data-n]') || document.querySelector('#lb-sc .lb-mt[data-n]'); return e ? (e.getAttribute('data-cur') || '0') : null; });
    const h0 = await zc(); await wait(page, 2700); const h1 = await zc();
    /* SC-02b (added TA-2, T14): the resume half — the mouse leaves → the held zone turns within ~100 ms (a turn came due while held) */
    const zb = await zc(), tl = Date.now();
    await page.mouse.move(900, 500);
    let rms = -1; for(let i = 0; i < 80; i++){ if((await zc()) !== zb){ rms = Date.now() - tl; break; } await wait(page, 20); }
    L.rec({ ...base, id: 'SC-02b', what: 'mouse leaves the held side offer → it turns again at once (≤ 150 ms incl. measuring)', measured: rms < 0 ? 'no turn within 1.6 s' : rms + ' ms after leave', pass: rms >= 0 && rms <= 150 });
    L.rec({ ...base, id: 'SC-02', what: 'mouse resting on a rotating side offer → it holds still (same rule as the sliders)', measured: h0 === h1 ? 'held' : `kept rotating under the mouse (${h0} → ${h1})`, pass: h0 === h1, note: 'consistency with the owner\'s hover rule' });
  }
  /* anchored zone scrolled off-screen → paused; back → resumes */
  const zid = 'z-offer';
  const anch = await ev(page, (id) => !!document.querySelector('#lb-sc .lb-z[data-zid="' + id + '"]'), zid);
  if(anch){
    await scrollTo(page, 3000, 6); await wait(page, 600);
    const paused = await ev(page, (id) => document.querySelector('#lb-sc .lb-z[data-zid="' + id + '"]').classList.contains('lb-paused'), zid);
    const a = await ev(page, (id) => document.querySelector('#lb-sc .lb-z[data-zid="' + id + '"] .lb-mt').getAttribute('data-cur'), zid);
    await wait(page, 2600);
    const b = await ev(page, (id) => document.querySelector('#lb-sc .lb-z[data-zid="' + id + '"] .lb-mt').getAttribute('data-cur'), zid);
    await scrollTo(page, 0, 6);
    const t0 = Date.now(); let ms = -1;
    for(let i = 0; i < 80; i++){ const c = await ev(page, (id) => { const z = document.querySelector('#lb-sc .lb-z[data-zid="' + id + '"]'); return { p: z.classList.contains('lb-paused'), c: z.querySelector('.lb-mt').getAttribute('data-cur') }; }, zid); if(!c.p && c.c !== b){ ms = Date.now() - t0; break; } await wait(page, 50); }
    L.rec({ ...base, id: 'SC-03', what: 'rotating zone pauses while off-screen and resumes when back (next frame ≤ one cycle, 2.2 s)', measured: `off-screen: ${paused ? 'paused' : 'NOT paused'}, frame ${a}→${b} · back: ${ms < 0 ? 'did NOT resume in 4 s' : 'next frame after ' + ms + ' ms'}`, pass: paused && a === b && ms >= 0 && ms <= 2600 });
  }
  /* popup zone: opens 3 s after it is 60 % in view (fresh visit) */
  await page.context().close();
  const p2 = await L.newPage(dev);
  await p2.goto('file://' + L.BUILD + '#/');
  await p2.evaluate(() => { ST.seenIntro = true; lb_sc(); ST.sideCanvas.enabled = true; const S = lb_sc(); S.zones.r.concat(S.zones.l).forEach(z => { if(z.type === 'popup') z.active = true; }); saveState(); try{ sessionStorage.clear(); }catch(e){} });  /* the example popup zone ships switched off: switch it on to test its timing */
  await p2.reload();
  await p2.waitForTimeout(1200);
  const zoneIn = () => p2.evaluate(() => { const z = document.querySelector('#lb-sc .lb-z[data-zid="z-pop"]'); if(!z) return null; const r = z.getBoundingClientRect(); const vis = Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / r.height; return vis; });
  const bringZone = (inView) => p2.evaluate((iv) => { const z = document.querySelector('#lb-sc .lb-z[data-zid="z-pop"]'); const r = z.getBoundingClientRect(); window.scrollBy(0, iv ? r.top - innerHeight / 2 + r.height / 2 : r.bottom + 50); }, inView);
  let zHas = false; for(let i = 0; i < 60 && !zHas; i++){ zHas = await p2.evaluate(() => !!document.querySelector('#lb-sc .lb-z[data-zid="z-pop"]')); if(!zHas){ await p2.evaluate(() => window.scrollBy(0, 200)); await p2.waitForTimeout(150); } }
  if(!zHas){ const why = await p2.evaluate(() => { try{ const z = lb_sc().zones.r.concat(lb_sc().zones.l).find(x => x.id === 'z-pop'); return z ? 'zone exists in settings (active ' + z.active + ') but is not drawn on this page' : 'no popup zone in settings'; }catch(e){ return String(e); } }); L.rec({ ...base, id: 'SC-04', what: 'side popup zone', measured: why, pass: null }); await p2.context().close(); return; }
  await p2.evaluate(() => window.scrollTo(0, 0)); await p2.waitForTimeout(300);
  /* in view for 1.5 s, out, then back: the 3 s must start again */
  await bringZone(true); await p2.waitForTimeout(1500);
  await p2.evaluate(() => window.scrollTo(0, 0)); await p2.waitForTimeout(2500);
  const early = await p2.evaluate(() => !!document.querySelector('.modal-back'));
  L.rec({ ...base, id: 'SC-04a', what: 'side popup: its zone in view only 1.5 s, then scrolled away → no popup (the 3 s timer is cancelled)', measured: early ? 'OPENED anyway' : 'no popup', pass: !early });
  await bringZone(true);
  const vis = await zoneIn();
  const t0 = Date.now(); let ms = -1;
  for(let i = 0; i < 160; i++){ if(await p2.evaluate(() => !!document.querySelector('.modal-back .lb-popc'))){ ms = Date.now() - t0; break; } await p2.waitForTimeout(50); }
  L.rec({ ...base, id: 'SC-04', what: 'side popup (trigger: 3 s in view): back in view → opens after a full 3 s (2.8–3.5 s)', measured: ms < 0 ? `did NOT open in 8 s (zone ${Math.round((vis || 0) * 100)} % visible)` : ms + ' ms after the zone came into view', pass: ms >= 2800 && ms <= 3500 });
  const page2 = p2;
  if(ms >= 0){
    const locked = await ev(page2, () => document.body.style.overflow === 'hidden');
    await page2.keyboard.press('Escape'); await wait(page2, 300);
    const after = await ev(page2, () => ({ open: !!document.querySelector('.modal-back'), body: document.body.style.overflow }));
    await wait(page2, 4000);
    const again = await ev(page2, () => !!document.querySelector('.modal-back'));
    L.rec({ ...base, id: 'SC-05', what: 'side popup: locks the page; Esc closes and unlocks; does not come back', measured: `locked ${locked} · after Esc ${after.open ? 'OPEN' : 'closed'} body "${after.body}" · 4 s later ${again ? 'OPEN AGAIN' : 'closed'}`, pass: locked && !after.open && after.body === '' && !again });
  }
  await page2.context().close();
}

/* ---------- popovers: share (product) + sort (category) ---------- */
async function popovers(){
  for(const dev of ['d1366', 'phone']){
    const page = await L.newPage(dev);
    const base = { dev, lang: 'en' };
    await L.open(page, '#/p/essential-pique-polo', { wait: 1200 });
    await ev(page, () => { SHOWN.pdpIcons.panel = true; SHOWN.pdpIcons.share = true; rerender(); });
    await wait(page, 300);
    const click = async (sel) => { const p = await ev(page, s => { const e = [...document.querySelectorAll(s)].find(x => x.getClientRects().length); if(!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if(!p) return false; await wait(page, 150); const q = await ev(page, s => { const e = [...document.querySelectorAll(s)].find(x => x.getClientRects().length); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if(dev === 'phone') await L.tap(page, q.x, q.y); else await page.mouse.click(q.x, q.y); return true; };
    const isOpen = () => ev(page, () => !!document.querySelector('.shr-bar'));
    if(await click('[data-act="pdp-share"]')){
      await wait(page, 200);
      const o1 = await isOpen();
      const t0 = Date.now(); let ms = -1;
      for(let i = 0; i < 220; i++){ if(!(await isOpen())){ ms = Date.now() - t0 + 200; break; } await wait(page, 50); }
      L.rec({ ...base, page: 'product', id: 'PO-01', what: 'share row (owner switch, off by default — tested switched on) tidies itself away after 8 s if unused (7.8–8.4 s)', measured: `${o1 ? 'opened' : 'did NOT open'} · closed after ${ms} ms`, pass: o1 && ms >= 7800 && ms <= 8400 });
      /* stale timer: open, close with the same button at 1 s, re-open at 6 s → it must stay its full 8 s */
      await click('[data-act="pdp-share"]'); await wait(page, 1000);
      await click('[data-act="pdp-share"]'); await wait(page, 5000);
      await click('[data-act="pdp-share"]');
      const t1 = Date.now(); let ms2 = -1;
      for(let i = 0; i < 220; i++){ if(!(await isOpen())){ ms2 = Date.now() - t1; break; } await wait(page, 50); }
      L.rec({ ...base, page: 'product', id: 'PO-02', what: 'share row closed with its own button and opened again 5 s later → gets its own full 8 s', measured: ms2 < 0 ? 'stayed > 11 s' : `closed after ${ms2} ms`, pass: ms2 >= 7600 && ms2 <= 8600 });
      /* left-over click catcher: close with the button, then an unrelated click elsewhere → nothing redraws */
      await wait(page, 300);
      if(await isOpen()) await click('[data-act="pdp-share"]');
      await click('[data-act="pdp-share"]'); await wait(page, 300); await click('[data-act="pdp-share"]'); await wait(page, 300);
      await ev(page, () => { window.__rr = 0; const r0 = window.rerender; window.rerender = function(){ window.__rr++; return r0.apply(this, arguments); }; });
      const vp = page.viewportSize();
      if(dev === 'phone') await L.tap(page, vp.width / 2, vp.height - 200); else await page.mouse.click(30, vp.height - 150);
      await wait(page, 300);
      const rr = await ev(page, () => window.__rr);
      L.rec({ ...base, page: 'product', id: 'PO-03', what: 'after closing the share row with its own button, the next click elsewhere does not redraw the page (no left-over listener)', measured: `${rr} extra page redraw(s)`, pass: rr === 0 });
      await wait(page, 8500);
    }
    /* sort menu (category) */
    await L.open(page, '#/c/polos', { wait: 1000 });
    const sortSel = '[data-act="cat-sortopen"]';
    if(await click(sortSel)){
      await wait(page, 250);
      const o = await ev(page, () => !!CAT_SORT_OPEN);
      await page.keyboard.press('Escape'); await wait(page, 250);
      const st = await ev(page, () => ({ open: !!CAT_SORT_OPEN, focus: !!(document.activeElement && document.activeElement.getAttribute('data-act') === 'cat-sortopen') }));
      L.rec({ ...base, page: 'category', id: 'PO-04', what: 'sort menu: opens; Esc closes and focus goes back to the Sort button', measured: `${o ? 'opened' : 'did NOT open'} · Esc: ${st.open ? 'STILL OPEN' : 'closed'} · focus ${st.focus ? 'on Sort' : 'LOST (body)'}`, pass: o && !st.open && st.focus });
    }
    await page.context().close();
  }
}

/* ---------- phone gestures: pull-to-refresh, swipe-back ---------- */
async function gestures(){
  const page = await L.newPage('phone');
  const base = { dev: 'phone', lang: 'en' };
  await L.open(page, '#/c/polos', { wait: 1000 });
  await scrollTo(page, 0); await wait(page, 200);
  const ptr = () => ev(page, () => { const e = document.querySelector('.ptr'); if(!e) return { none: true }; return { op: +getComputedStyle(e).opacity, armed: e.classList.contains('armed'), t: (e.querySelector('.ptr-t') || {}).textContent }; });
  /* short pull, release → resets */
  await L.touch(page, 'touchStart', 200, 300);
  for(let i = 1; i <= 6; i++){ await L.touch(page, 'touchMove', 200, 300 + i * 12); await wait(page, 16); }
  const mid = await ptr();
  await L.touch(page, 'touchEnd'); await wait(page, 300);
  const end = await ptr();
  L.rec({ ...base, page: 'category', id: 'PTR-01', what: 'short pull (not past the line) shows the arrow; letting go hides it again (≤ 0.3 s)', measured: `pulling: opacity ${mid.op} "${mid.t}" · released: opacity ${end.op}`, pass: mid.op > 0.3 && end.op === 0 });
  /* pull, then the touch is cancelled (the phone takes the gesture) → resets */
  await L.touch(page, 'touchStart', 200, 300);
  for(let i = 1; i <= 8; i++){ await L.touch(page, 'touchMove', 200, 300 + i * 20); await wait(page, 16); }
  const mid2 = await ptr();
  await L.touch(page, 'touchCancel'); await wait(page, 400);
  const end2 = await ptr();
  L.rec({ ...base, page: 'category', id: 'PTR-02', what: 'pull, then the touch is cancelled (system gesture / call / notification) → indicator resets', measured: `pulling: opacity ${mid2.op} "${mid2.t}" · after cancel: opacity ${end2.op} "${end2.t}"${end2.op > 0 ? ' (STUCK on screen)' : ''}`, pass: end2.op === 0 });
  /* next normal touch clears it? */
  await L.tap(page, 200, 500); await wait(page, 300);
  const end3 = await ptr();
  L.rec({ ...base, page: 'category', id: 'PTR-02b', what: '…and the next ordinary tap clears it', measured: 'opacity ' + end3.op, pass: end3.op === 0 });
  /* pull past the line → "Release to refresh" → reload */
  await L.open(page, '#/c/polos', { wait: 800 }); await scrollTo(page, 0); await wait(page, 200);
  await ev(page, () => { window.__alive = 1; });
  await L.touch(page, 'touchStart', 200, 250);
  for(let i = 1; i <= 12; i++){ await L.touch(page, 'touchMove', 200, 250 + i * 18); await wait(page, 16); }
  const armed = await ptr();
  await L.touch(page, 'touchEnd');
  await wait(page, 1500);
  const reloaded = await ev(page, () => !window.__alive).catch(() => true);
  L.rec({ ...base, page: 'category', id: 'PTR-03', what: 'pull past the line → "Release to refresh" → let go → page reloads (~0.35 s)', measured: `"${armed.t}" · ${reloaded ? 'reloaded' : 'did NOT reload'}`, pass: armed.armed && reloaded });
  await wait(page, 800);
  const after = await ptr();
  L.rec({ ...base, page: 'category', id: 'PTR-04', what: 'after the reload no indicator is left on screen', measured: after.none ? 'none' : 'opacity ' + after.op, pass: after.none || after.op === 0 });
  /* swipe-back moves exactly one page */
  await L.open(page, '#/', { wait: 700 });
  await ev(page, () => { location.hash = '#/c/polos'; }); await wait(page, 700);
  await ev(page, () => { location.hash = '#/p/essential-pique-polo'; }); await wait(page, 900);
  await L.swipe(page, 6, 420, 240, 430, 10, 20);
  await wait(page, 1800);
  const where = await ev(page, () => CUR.page);
  L.rec({ ...base, page: 'product → category', id: 'SW-01', what: 'edge swipe from the left = one page back (product → category), never two', measured: 'landed on ' + where, pass: where === 'category' });
  await page.context().close();
}

/* ---------- press-and-hold steppers (size finder) ---------- */
async function steppers(){
  for(const dev of ['d1366', 'phone']){
    const page = await L.newPage(dev);
    const base = { dev, lang: 'en', page: 'product (size finder)' };
    await L.open(page, '#/p/essential-pique-polo', { wait: 1000 });
    await ev(page, () => { const c = pdp_cur(); c.u.fStep = 'ask'; pdp_openFinder(); });
    await wait(page, 400);
    const b = await ev(page, () => { const e = [...document.querySelectorAll('.modal [data-act="pdp-step"][data-d="1"]')].find(x => x.getClientRects().length); if(!e) return null; e.setAttribute('data-qa-step', '1'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, k: e.getAttribute('data-k') }; });
    if(!b){ L.rec({ ...base, id: 'ST-00', what: 'stepper in the size finder', measured: 'not found', pass: null }); await page.context().close(); continue; }
    const val = () => ev(page, () => { const c = pdp_cur(); return c.u.fH * 1000 + c.u.fW; });
    const down = async () => { if(dev === 'phone') await L.touch(page, 'touchStart', b.x, b.y); else { await page.mouse.move(b.x, b.y); await page.mouse.down(); } };
    const up = async () => { if(dev === 'phone') await L.touch(page, 'touchEnd'); else await page.mouse.up(); };
    /* hold 1.3 s → repeats; release → stops */
    const v0 = await val(); await down(); await wait(page, 1300); const v1 = await val(); await up(); await wait(page, 60); const v2 = await val(); await wait(page, 600); const v3 = await val();
    L.rec({ ...base, id: 'ST-01', what: 'press and hold "+" → starts repeating after 0.45 s; let go → stops at once', measured: `held 1.3 s: ${(v1 - v0)} steps (raw) · after release +0.6 s: ${v3 - v2} more`, pass: v1 - v0 >= 5 && v3 === v2 });
    /* hold, slide off the button, keep holding → should stop (it is no longer under the finger/mouse) */
    if(dev !== 'phone'){
      await page.mouse.move(b.x, b.y); await page.mouse.down(); await wait(page, 700);
      await page.mouse.move(b.x, b.y - 140, { steps: 3 });
      const a1 = await val(); await wait(page, 700); const a2 = await val();
      await page.mouse.up();
      L.rec({ ...base, id: 'ST-02', what: 'press "+", slide the mouse off the button while still pressed → repeating stops', measured: a2 === a1 ? 'stopped' : `kept counting off the button (${a2 - a1} raw in 0.7 s)`, pass: a2 === a1 });
    } else {
      await L.touch(page, 'touchStart', b.x, b.y); await wait(page, 700);
      await L.touch(page, 'touchCancel');
      const a1 = await val(); await wait(page, 600); const a2 = await val();
      L.rec({ ...base, id: 'ST-02', what: 'press "+", touch cancelled by the phone → repeating stops', measured: a2 === a1 ? 'stopped' : `kept counting (${a2 - a1} raw)`, pass: a2 === a1 });
    }
    await page.context().close();
  }
}

/* ---------- rotating offer card (account, phone) + intro + forever timers ---------- */
async function rotations(){
  const page = await L.newPage('phone');
  const base = { dev: 'phone', lang: 'en', page: 'account (For you)' };
  await L.open(page, '#/account/foryou', { setup: SETUP, wait: 1200 });
  const has = await ev(page, () => !!document.querySelector('.acc-po'));
  if(has){
    const cur = () => ev(page, () => { const s = [...document.querySelectorAll('.acc-po .acc-po-slide')]; return s.findIndex(x => x.classList.contains('on')); });
    await ev(page, () => document.querySelector('.acc-po').scrollIntoView({ block: 'center' })); await wait(page, 300);
    const r = await ev(page, () => { const e = document.querySelector('.acc-po'); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, ms: +e.getAttribute('data-rotate') || 4200 }; });
    /* touch and hold on it */
    const c0 = await cur();
    await L.touch(page, 'touchStart', r.x, r.y); await wait(page, r.ms + 400);
    const c1 = await cur();
    await L.touch(page, 'touchCancel');
    L.rec({ ...base, id: 'RO-01', what: `rotating offer card: a finger resting on it holds it (like the sliders' 4 s hold)`, measured: c0 === c1 ? 'held' : `turned under the finger (${c0} → ${c1}) after ${r.ms} ms`, pass: c0 === c1, note: 'consistency with the owner\'s touch-hold rule' });
    /* keyboard focus on the current slide's link */
    await ev(page, () => { const a = document.querySelector('.acc-po .acc-po-slide.on a'); if(a) a.focus(); });
    await wait(page, r.ms + 400);
    const f = await ev(page, () => { const a = document.activeElement; const s = a && a.closest && a.closest('.acc-po-slide'); return { inSlide: !!s, visible: !!(s && s.classList.contains('on')), tab: a ? a.tabIndex : null }; });
    L.rec({ ...base, id: 'RO-02', what: 'rotating offer card: keyboard focus on its link holds it (focus never left on a hidden slide)', measured: f.visible ? 'held (focused slide still shown)' : `turned away: focus left on a HIDDEN slide (tabindex ${f.tab})`, pass: f.visible });
  } else L.rec({ ...base, id: 'RO-01', what: 'rotating offer card', measured: 'not shown', pass: null });
  await page.context().close();
  /* intro popup on a first visit */
  const p2 = await L.newPage('phone');
  await p2.goto('file://' + L.BUILD + '#/');
  await p2.evaluate(() => { localStorage.clear(); });
  await p2.reload();
  const t0 = Date.now(); let ms = -1;
  for(let i = 0; i < 60; i++){ if(await p2.evaluate(() => !!document.querySelector('.modal-back'))){ ms = Date.now() - t0; break; } await p2.waitForTimeout(25); }
  const lock = await p2.evaluate(() => document.body.style.overflow);
  await p2.keyboard.press('Escape'); await p2.waitForTimeout(250);
  const after = await p2.evaluate(() => ({ open: !!document.querySelector('.modal-back'), body: document.body.style.overflow }));
  L.rec({ dev: 'phone', lang: 'en', page: 'home (first visit)', id: 'IN-01', what: 'welcome popup on a first visit: opens ~0.35 s after load, locks; Esc closes and unlocks', measured: `opened ${ms} ms after reload · body "${lock}" · after Esc ${after.open ? 'OPEN' : 'closed'} body "${after.body}"`, pass: ms >= 0 && ms <= 1200 && lock === 'hidden' && !after.open && after.body === '' });
  /* forever timers: what keeps waking the page when nothing happens */
  const ints = await p2.evaluate(() => new Promise(res => { const n = []; const si = window.setInterval; window.setInterval = function(f, ms){ n.push(ms); return si.apply(this, arguments); }; res(1); }));
  await p2.context().close();
  const p3 = await L.newPage('phone');
  await p3.addInitScript(() => { window.__iv = []; const si = window.setInterval; window.setInterval = function(f, ms){ const id = si.apply(this, arguments); window.__iv.push({ ms, id, stack: (new Error().stack || '').split('\n')[2] || '' }); return id; }; const ci = window.clearInterval; window.clearInterval = function(id){ window.__iv = window.__iv.filter(x => x.id !== id); return ci.apply(this, arguments); }; });
  await p3.goto('file://' + L.BUILD + '#/c/polos');
  await p3.evaluate(() => { ST.seenIntro = true; saveState(); });
  await p3.reload(); await p3.waitForTimeout(2500);
  const iv = await p3.evaluate(() => window.__iv.map(x => x.ms + ' ms ' + x.stack.trim().replace(/^at /, '').replace(/\(file:.*?:(\d+):\d+\)/, '(line $1)')));
  L.rec({ dev: 'phone', lang: 'en', page: 'category (idle)', id: 'TM-01', what: 'no forever timer keeps running on a shop page with nothing moving (R15 bug-20 rule)', measured: iv.length ? `${iv.length} interval(s) alive: ${iv.join(' | ')}` : 'none', pass: iv.length === 0 });
  await p3.context().close();
}

(async () => {
  await stickyBars();
  await journal();
  await sideCanvas();
  await popovers();
  await gestures();
  await steppers();
  await rotations();
  L.save('misc');
  await L.closeBrowser();
})().catch(async e => { console.error(e); L.save('misc'); await L.closeBrowser(); process.exit(1); });
