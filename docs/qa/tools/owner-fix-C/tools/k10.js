// K10 — the owner's phone rule (one helper, every phone box). node k10.js <html>
const { chromium, SETUPS, open, nav } = require('./lib');
const html = process.argv[2]; let bad = 0, n = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const VALID = ['01712345678', '+8801712345678', '8801712345678', '+88 01712-345678', '+880 1712 345678', '0088 01712345678', '001712345678', '1712345678', '০১৭১২৩৪৫৬৭৮', '০১৭12-৩৪৫678', '017-1234-5678'];
const INVALID = ['', '1', '0171234567', '01212345678', '012345678901'];
const MSG = 'Enter an 11-digit mobile number, like 01712345678';
(async () => {
  const b = await chromium.launch();
  for (const [w, h, mob] of [[393, 852, 1], [1366, 768, 0]]) {
    const { ctx, pg } = await open(b, html, w, h, mob);
    // 1. the one helper + checkPhone (which every screen calls)
    const r = await pg.evaluate(([V, I]) => ({ v: V.map(x => [phoneNormalizeBD(x), checkPhone(x)]), i: I.map(x => [phoneNormalizeBD(x), checkPhone(x)]) }), [VALID, INVALID]);
    r.v.forEach(([a, c], k) => { ok(a.ok && a.digits === '01712345678' && a.e164 === '+8801712345678' && c.state === 'ok' && c.e164 === '+8801712345678', `${w} valid "${VALID[k]}" -> ${JSON.stringify(a)}`); });
    r.i.forEach(([a, c], k) => { ok(!a.ok && c.state !== 'ok', `${w} invalid "${INVALID[k]}" passed`); if (INVALID[k]) ok(a.msg.indexOf(MSG) >= 0, `${w} message for "${INVALID[k]}": ${a.msg}`); });
    // 2. checkout — every entry path; invalid blocked with the line, valid placed and stored 01… + +880…
    const paths = mob ? ['direct', 'bag'] : ['direct', 'bag', 'drawer'];
    for (const path of paths) for (const [v, want] of VALID.map(x => [x, 'ok']).concat(INVALID.map(x => [x, 'bad']))) {
      // orders hold stock (admin audit): forget the test's own orders so the bag can refill
      await pg.evaluate(() => { Object.keys(ST.orders).forEach(id => { if (ST.orders[id].name === 'Test Buyer' || ST.orders[id].name === 'Test') { delete ST.orders[id]; Object.values(ST.accounts).forEach(a => { if (a.orders) a.orders = a.orders.filter(x => x !== id); }); } }); saveState(); });
      await pg.evaluate(SETUPS.items(2));
      if (path === 'bag') { await nav(pg, '#/bag'); await pg.click('[data-testid=bag-checkout]'); await pg.waitForTimeout(450); }
      else if (path === 'drawer') { await nav(pg, '#/p/heavyweight-hoodie'); await pg.evaluate(() => { const c = pdp_cur(); c.u.size = 'L'; ACT['pdp-add'](); }); await pg.waitForTimeout(350); await pg.click('.modal.atb-d a[href="#/checkout"]'); await pg.waitForTimeout(450); }
      else await nav(pg, '#/checkout');
      const before = await pg.evaluate(() => Object.keys(ST.orders).length);
      await pg.fill('#co-name', 'Test Buyer'); await pg.fill('#co-address', 'House 12, Road 5, Mirpur 10, Dhaka');
      await pg.fill('#co-phone', v); await pg.click('#co-name'); await pg.waitForTimeout(80);
      const hint = await pg.textContent('#co-phone-hint');
      if (want === 'ok') ok(/We'll call 01712-345678/.test(hint), `${w} ${path} "${v}" hint: "${hint}"`);
      else if (v) ok(hint.indexOf(MSG) >= 0, `${w} ${path} "${v}" blur hint: "${hint}"`);
      await pg.click('[data-testid=co-confirm]:visible'); await pg.waitForTimeout(450);
      const res = await pg.evaluate(() => ({ hash: location.hash, n: Object.keys(ST.orders).length, val: (document.getElementById('co-phone') || {}).value, ask: (document.querySelector('[data-testid=co-ask-co-phone]') || {}).textContent || '' }));
      if (want === 'ok') {
        ok(res.hash.indexOf('#/thanks/') === 0 && res.n === before + 1, `${w} ${path} valid "${v}" not placed (${res.hash})`);
        const o = await pg.evaluate((v) => { const ids = Object.keys(ST.orders); const o = ST.orders[ids[ids.length - 1]]; return { p: o.phone, e: o.phoneE164, t: o.phoneTyped, want: bnDigits(v) }; }, v);
        // the box keeps what was typed (Bengali digits show as 0-9 — R15 bug 8)
        ok(o.p === '01712345678' && o.e === '+8801712345678' && o.t === o.want, `${w} ${path} stored ${JSON.stringify(o)}`);
      } else {
        ok(res.hash === '#/checkout' && res.n === before, `${w} ${path} "${v}" was PLACED`);
        ok(res.val === (await pg.evaluate((v) => bnDigits(v), v)), `${w} ${path} typed value changed: "${res.val}" vs "${v}"`);
        ok(v ? res.ask.indexOf(MSG) >= 0 : /mobile number/.test(res.ask), `${w} ${path} ask line for "${v}": "${res.ask}"`);
      }
    }
    // 3. ad landing order form
    const slug = await pg.evaluate(() => (ST.landingPages || DB.landingPages || [])[0] && (ST.landingPages || DB.landingPages)[0].slug);
    if (slug) for (const [v, want] of [['0171', 'bad'], ['+880 1712 345678', 'ok']]) {
      await nav(pg, '#/l/' + slug);
      const lr = await pg.evaluate((v) => { const f = document.querySelector('form[data-submit=lp-order]'); if (!f) return 'noform'; const x = lp_ctx(f); x.u.size = x.p.sizes[1]; f.querySelector('[name=name]').value = 'Test'; f.querySelector('[name=phone]').value = v; f.querySelector('[name=address]').value = 'House 12, Road 5, Mirpur 10, Dhaka'; const n = Object.keys(ST.orders).length; SUBMIT['lp-order'](f); return { placed: Object.keys(ST.orders).length > n, err: (document.getElementById('lp-err') || {}).textContent }; }, v);
      ok(lr !== 'noform' && (want === 'ok' ? lr.placed : (!lr.placed && lr.err.indexOf(MSG) >= 0)), `${w} landing "${v}": ${JSON.stringify(lr)}`);
    } else console.log('no landing page in data');
    // 4. login / track my order (account)
    await pg.evaluate(() => { logout && logout(); }); await nav(pg, '#/login');
    const lg = await pg.evaluate(() => { const f = document.querySelector('form[data-submit=login-form]'); f.querySelector('[name=phone]').value = '01234'; f.querySelector('[name=password]').value = 'x'; SUBMIT['login-form'](f); return (document.getElementById('lg-err') || {}).textContent; });
    ok(lg.indexOf(MSG) >= 0, `${w} login bad number message: ${lg}`);
    const lg2 = await pg.evaluate(() => { const a = Object.values(ST.accounts)[0]; return { key: Object.keys(ST.accounts)[0], ok: login('+88 ' + Object.keys(ST.accounts)[0].replace(/^(\d{5})/, '$1-'), a.password) }; });
    ok(lg2.ok, `${w} login with +88 and dash formatting failed for ${lg2.key}`);
    // 5. footer Join (shared helper, if the footer form is on the page)
    await pg.evaluate(() => { logout && logout(); }); await nav(pg, '#/');
    const ft = await pg.evaluate(() => { const f = document.querySelector('form[data-submit=join]'); if (!f) return 'none'; const i = f.querySelector('input'); i.value = '1'; let msg = ''; const t0 = window.toast; window.toast = (m) => { msg = m; }; try { SUBMIT['join'](f); } finally { window.toast = t0; } return msg + ' | ' + ((f.querySelector('.ft-msg, [role=alert], .join-msg') || {}).textContent || ''); });
    console.log(w, 'footer join with "1":', ft);
    ok(!pg._errs.length, `${w} page errors ${pg._errs}`);
    await ctx.close();
  }
  console.log(bad ? `K10 FAIL (${bad} of ${n})` : `K10 ALL PASSED (${n} checks)`); await b.close();
})();
