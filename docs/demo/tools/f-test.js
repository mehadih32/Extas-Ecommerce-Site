// usage: node tools/f-test.js dist/f.html shots/f
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const fs = require('fs');
const [html, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let fails = 0;
function check(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; }
(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ name: 'desk', width: 1366, height: 900 }, { name: 'phone', width: 390, height: 844, isMobile: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile });
    const page = await ctx.newPage();
    page.on('pageerror', e => { fails++; console.log(`[${vp.name}] PAGEERROR ${e.message}`); });
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) { fails++; console.log(`[${vp.name}] CONSOLE ${m.text()}`); } });
    const shot = async (n, full) => page.screenshot({ path: path.join(out, `t_${vp.name}_${n}.png`), fullPage: !!full });
    const goto = async (h) => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(250); };
    await page.goto('file://' + path.resolve(html) + '#/');
    await page.evaluate(() => { localStorage.clear(); ST = seedState(); saveState(); });
    await page.waitForTimeout(200);

    /* ---- landing: polo duo ---- */
    await page.evaluate(() => { bagAdd({ kind: 'item', product: 'everyday-crew-tee', color: 'white', size: 'M', qty: 1 }); });
    await goto('#/l/polo-duo');
    await shot('lp_top');
    if (vp.name === 'desk') {
      await page.mouse.wheel(0, 1400); await page.waitForTimeout(300); await shot('lp_scrolled');
      const box = await page.locator('#lp-form').boundingBox();
      check(box && box.y + box.height <= 900 + 2, 'desk: order card fully reachable while scrolled (bottom ' + (box && Math.round(box.y + box.height)) + ')');
      await page.mouse.wheel(0, -3000); await page.waitForTimeout(200);
    } else {
      const barVisible = await page.locator('#lp-mbar').isVisible();
      check(barVisible, 'phone: sticky Order Now bar visible');
      await page.mouse.wheel(0, 700); await page.waitForTimeout(300); await shot('lp_p2');
    }
    // pick L in the form
    await page.locator('#lp-form .lp-sizes [data-s="L"]').click();
    await page.fill('#lp-name', 'Karim Uddin');
    await page.fill('#lp-phone', '0181234567');
    const warn = await page.locator('#lp-phone-hint').innerText();
    check(/digit/i.test(warn), 'phone hint warns on 10 digits: ' + warn.slice(0, 60));
    await page.fill('#lp-phone', '01812345678');
    const ok = await page.locator('#lp-phone-hint').innerText();
    check(/01812-345678/.test(ok), 'phone hint ok: ' + ok);
    await page.fill('#lp-addr', 'House 3, Road 2, Dhanmondi, Dhaka');
    const del = await page.locator('#lp-del').innerText();
    check(/Free|Inside Dhaka/.test(del), 'delivery line: ' + del);
    const btn = await page.locator('[data-testid=lp-confirm]').innerText();
    check(/1,500/.test(btn), 'confirm button total: ' + btn);
    await page.locator('#lp-form').scrollIntoViewIfNeeded();
    await shot('lp_form_filled');
    await page.locator('[data-testid=lp-confirm]').click();
    await page.waitForTimeout(300);
    const res = await page.evaluate(() => {
      const ids = Object.keys(ST.orders).filter(k => (ST.orders[k].source || '') === 'landing:polo-duo' && ST.orders[k].name === 'Karim Uddin');
      const o = ids.length ? ST.orders[ids[0]] : null;
      return { hash: location.hash, o, bag: ST.bag.map(l => l.product + ':' + l.size) };
    });
    check(/^#\/thanks\/EX-\d+/.test(res.hash), 'landed on ' + res.hash);
    check(res.o && res.o.lines.length === 2 && res.o.total === 1500 && res.o.zone === 'in', 'order saved: ' + (res.o && JSON.stringify({ lines: res.o.lines.map(l => l.color + ' ' + l.size + ' ' + l.setLabel), total: res.o.total, zone: res.o.zone, pay: res.o.payment })));
    check(res.bag.length === 1 && res.bag[0] === 'everyday-crew-tee:M', 'previous bag restored: ' + res.bag.join(','));

    /* ---- landing: hoodie, single ---- */
    await goto('#/l/winter-hoodie');
    await shot('lp_hoodie_top');
    await page.fill('#lp-kg', '70');
    await page.locator('[data-act=lp-find]').click(); await page.waitForTimeout(150);
    const rec = await page.locator('.lp-rec').innerText().catch(() => '');
    check(/Your size/.test(rec), 'find my size result: ' + rec.replace(/\s+/g, ' ').slice(0, 60));
    await page.locator('[data-act=lp-userec]').click(); await page.waitForTimeout(150);
    const sel = await page.locator('#lp-form .size-pill.on').innerText().catch(() => '');
    check(!!sel, 'recommended size selected in form: ' + sel);
    await page.fill('#lp-addr', 'Agrabad, Chattogram');
    const del2 = await page.locator('#lp-del').innerText();
    check(/Free/.test(del2), 'hoodie ৳1,650 is over free-delivery limit: ' + del2);
    await goto('#/l/polo-duo');
    await page.locator('#lp-form [data-act=lp-pack][data-v="one"]').click(); await page.waitForTimeout(100);
    await page.fill('#lp-addr', 'Agrabad, Chattogram');
    const del3 = await page.locator('#lp-del').innerText();
    check(/Outside Dhaka/.test(del3) && /120/.test(del3), 'single polo outside Dhaka charge: ' + del3);
    const tot3 = await page.locator('#lp-btn-total').innerText();
    check(tot3 === '৳970', 'single polo + outside delivery total: ' + tot3);
    await page.fill('#lp-addr', 'Flat 2, near the old bridge');
    const del4 = await page.locator('#lp-del').innerText();
    check(/confirm your area/.test(del4), 'unsure area note: ' + del4);

    /* ---- admin orders ---- */
    await goto('#/admin/orders');
    await shot('ao');
    const kpi = await page.locator('.ao-kpis').innerText();
    check(/Flagged/.test(kpi), 'KPIs: ' + kpi.replace(/\s+/g, ' ').slice(0, 120));
    await page.locator(vp.name === 'desk' ? '.ao-tbl [data-id="EX-1041"]' : '.ao-card[data-id="EX-1041"]').first().click();
    await page.waitForTimeout(200);
    await shot('ao_modal');
    const mtxt = await page.locator('.modal').innerText();
    check(/keep both, or only one/.test(mtxt), 'modal call script present');
    await page.locator('.modal [data-act=ao-keep][data-v="L"]').click(); await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ n: ST.orders['EX-1041'].lines.length, t: ST.orders['EX-1041'].total, f: ST.orders['EX-1041'].flags }));
    check(after.n === 1 && after.f.indexOf('2 sizes — check') < 0, 'Only L: ' + JSON.stringify(after));
    await page.locator('.modal [data-act=ao-next]').click(); await page.waitForTimeout(150);
    const st = await page.evaluate(() => ST.orders['EX-1041'].status);
    check(st === 'packed', 'moved to next status: ' + st);
    await page.locator('.modal [data-act=close-modal]').click();
    await page.locator(vp.name === 'desk' ? '.ao-tbl [data-id="EX-1042"]' : '.ao-card[data-id="EX-1042"]').first().click();
    await page.waitForTimeout(200);
    await shot('ao_modal_addr');
    await page.locator('.modal [data-act=close-modal]').click();

    /* ---- admin rules ---- */
    await goto('#/admin/rules');
    await shot('rl');
    let scope = '.rl-ed-d';
    if (vp.name === 'phone') {
      await page.locator('#rl-card-exchange .rl-cardbtn').click(); await page.waitForTimeout(300);
      scope = '.rl-ed-m';
    }
    await page.locator(scope + ' [data-k="windowHours"]').fill('48');
    const live = await page.locator(scope + ' .rl-hint').innerText();
    check(/48 hours/.test(live), 'live hint updates: ' + live.replace(/\s+/g, ' ').slice(0, 140));
    await shot('rl_edit');
    await page.locator(scope + ' [data-act=rl-preview]').click(); await page.waitForTimeout(150);
    const prev = await page.locator('.modal').innerText();
    check(/Product pages \(17\)/.test(prev) && /Footer/.test(prev), 'preview places: ' + prev.replace(/\s+/g, ' ').slice(0, 160));
    await shot('rl_preview');
    await page.locator('.modal [data-act=close-modal]').first().click();
    await page.locator(scope + ' [data-testid=rl-publish]').click(); await page.waitForTimeout(200);
    const rt = await page.evaluate(() => ({ s: ruleText('exchange', 'short'), v: RULE('exchange').version, foot: SET('exchange', 'windowHours') }));
    check(/48/.test(rt.s) && rt.v === 4, 'ruleText after publish: ' + JSON.stringify(rt));
    await page.locator('[data-act=rl-fix]').click(); await page.waitForTimeout(100);
    check(await page.locator('.rl-conflict').count() === 0, 'conflict card hidden after Fix everywhere');
    await page.locator('[data-act=rl-new]').click(); await page.waitForTimeout(100);
    await page.fill('#rl-n-title', 'Puja delivery cutoff');
    await page.locator('.modal form button.btn-primary').click(); await page.waitForTimeout(150);
    check((await page.locator('.rl-list').innerText()).includes('Puja delivery cutoff'), 'new draft rule listed');

    /* ---- size charts ---- */
    await goto('#/admin/size-charts');
    await shot('sc');
    await page.locator('#sc-editor input[data-size="M"][data-i="0"]').fill('40.5');
    await page.locator('#sc-editor [data-act=sc-rmrow][data-size="XXL"]').click(); await page.waitForTimeout(150);
    const cov = await page.locator('.sc-cov').innerText();
    check(/XXL in ERP/.test(cov), 'coverage warning: ' + cov.replace(/\s+/g, ' ').slice(0, 100));
    await shot('sc_cov');
    await page.locator('#sc-editor [data-act=sc-addrow][data-size="XXL"]').click(); await page.waitForTimeout(150);
    const xxl = await page.evaluate(() => UI['admin-sizecharts'].drafts['polo-regular'].rows.XXL);
    check(JSON.stringify(xxl) === JSON.stringify([46, 31, 20, 8.75]), 'added XXL row = last + step: ' + JSON.stringify(xxl));
    await page.locator('#sc-editor [data-testid=sc-save]').click(); await page.waitForTimeout(150);
    const ov = await page.evaluate(() => ST.chartsOverride['polo-regular'] && ST.chartsOverride['polo-regular'].rows.M[0]);
    check(ov === 40.5, 'chart saved: M chest = ' + ov);
    const ch = await page.evaluate(() => chartFor(P('essential-pique-polo')).rows.M[0]);
    check(ch === 40.5, 'chartFor(product) uses saved chart: ' + ch);
    // paste from excel
    await page.locator('#sc-editor [data-act=sc-paste]').click(); await page.waitForTimeout(100);
    await page.fill('.modal textarea', 'Size Chest Length Shoulder Sleeve\nS 38 27 16.5 7.5\nM 40 28 17 8\nL 42 29 18 8.25\nXL 44 30 19 8.5\nXXL 46 31 20 8.75\n3XL 48 32 21 9');
    await page.locator('.modal form button.btn-primary').click(); await page.waitForTimeout(150);
    const pasted = await page.evaluate(() => Object.keys(UI['admin-sizecharts'].drafts['polo-regular'].rows).join(','));
    check(pasted === 'S,M,L,XL,XXL,3XL', 'pasted rows: ' + pasted);
    await shot('sc_pasted');
    await page.locator('#sc-editor [data-act=sc-discard]').click();
    await page.selectOption('#sc-fit', 'Slim'); await page.waitForTimeout(100);
    const auto = await page.locator('.sc-auto').innerText();
    check(/Slim fit/.test(auto), 'auto chart for Polos + Slim: ' + auto);

    /* ---- product page reflects saved rule & chart (only if product module exists) ---- */
    await goto('#/l/polo-duo');
    const lpTxt = await page.locator('#app').innerText();
    check(/48 hours/.test(lpTxt), 'landing page shows 48-hour exchange after publish');
    check(/40\.5/.test(lpTxt), 'landing size chart shows edited 40.5');
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `DONE with ${fails} failure(s)` : 'DONE, all passed');
})();
