// usage: node tools/g-test.js dist/g.html shots/g
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const fs = require('fs');
const [html, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let fails = 0;
function check(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; }

async function flow(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(out, `t_${vp.name}_${n}.png`), fullPage: true });
  const status = id => page.locator(`[data-testid="aai-status-${id}"]`).innerText();
  await page.goto('file://' + path.resolve(html) + '#/');
  await page.evaluate(() => { localStorage.clear(); });
  await page.goto('file://' + path.resolve(html) + '#/admin/ai');
  await page.reload();
  await page.waitForTimeout(200);

  /* ---- AI: master off, Blog Writer keep-on ---- */
  console.log(`--- ${vp.name}: AI & agents`);
  check((await status('blog')) === 'Paused', 'blog paused with master on (agent off)');
  await page.click('[data-testid="aai-master"]');
  await page.waitForTimeout(100);
  const msg = await page.locator('[data-testid="aai-master-msg"]').innerText();
  check(/AI is paused — except the agents you chose to keep on/.test(msg), 'master OFF message');
  check(/Turning AI off never stops your shop/.test(await page.innerText('#app')), 'reassurance visible');
  check((await status('blog')) === 'Paused', 'blog still Paused after master off (agent switch off)');
  check((await status('notes')) === 'Running while AI is off', 'notes (on+keepOn) runs while AI off');
  check((await status('support')) === 'Paused', 'support (not kept on) paused when AI off');
  await page.click('[data-testid="aai-on-blog"]');
  await page.waitForTimeout(100);
  check((await status('blog')) === 'Running while AI is off', 'blog Running while AI is off after enabling (on + keepOn)');
  const sum = await page.locator('[data-testid="aai-summary"]').innerText();
  check(sum === '2 of 12 agents running', 'summary line: ' + sum);
  await page.click('[data-testid="aai-keep-blog"]');
  await page.waitForTimeout(100);
  check((await status('blog')) === 'Paused', 'blog pauses when keep-on switched off');
  await page.click('[data-testid="aai-keep-blog"]');
  await page.waitForTimeout(100);
  await shot('ai_master_off');

  /* run now */
  await page.click('[data-testid="aai-run-blog"]');
  await page.waitForTimeout(150);
  check(/How to choose a polo size/.test(await page.inputValue('#aai-topic')), 'run modal topic prefilled');
  await page.selectOption('#aai-rp', 'openai');
  await page.waitForTimeout(100);
  check(await page.locator('[data-testid="aai-run-start"]').isDisabled(), 'Start disabled for unconnected company');
  await page.selectOption('#aai-rp', 'anthropic');
  await page.selectOption('#aai-rm', 'Claude Sonnet 5.5');
  await page.click('[data-testid="aai-run-start"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, `t_${vp.name}_ai_run_progress.png`) });
  await page.waitForTimeout(1700);
  const done = await page.locator('[data-testid="aai-run-done"]').innerText().catch(() => '');
  check(/Draft saved/.test(done) && /Blog → Drafts/.test(done), 'run finished: Draft saved to Blog → Drafts');
  await page.screenshot({ path: path.join(out, `t_${vp.name}_ai_run_done.png`) });
  await page.click('.modal [data-act="close-modal"]');

  /* connect a company */
  await page.click('[data-testid="aai-connect-openai"]');
  await page.click('[data-testid="aai-connect-save"]');
  await page.waitForTimeout(100);
  check(/Paste the API key/.test(await page.locator('.modal').innerText()), 'empty key shows message');
  await page.fill('#aai-key', 'sk-demo');
  await page.click('[data-testid="aai-connect-save"]');
  await page.waitForTimeout(100);
  check(await page.evaluate(() => ST.ai.providers.find(p => p.id === 'openai').connected), 'OpenAI connected');

  /* ---- Landing wizard ---- */
  console.log(`--- ${vp.name}: Landing wizard`);
  await page.evaluate(() => { location.hash = '#/admin/landing'; });
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => ST.landingPages.length);
  await page.click('[data-testid="alp-create"]');
  await page.waitForTimeout(150);
  check(await page.locator('[data-testid="alp-next"]').isDisabled(), 'Next disabled before category');
  check(await page.locator('[data-testid="alp-cat-denim"]').isDisabled(), 'Denim (soon) disabled');
  await page.click('[data-testid="alp-cat-polos"]');
  await page.click('[data-testid="alp-next"]');
  await page.waitForTimeout(100);
  await page.click('[data-testid="alp-prod-essential-pique-polo"]');
  await shot('lp_step2');
  await page.click('[data-testid="alp-next"]');
  await page.waitForTimeout(100);
  await page.click('[data-testid="alp-tpl-combo-push"]');
  await shot('lp_step3');
  await page.click('[data-testid="alp-next"]');
  await page.waitForTimeout(100);
  check(await page.locator('[data-testid="alp-ai-off"]').count() === 1, 'AI-off note shown (master off, builder not kept on)');
  const offerTxt = await page.locator('#alp-offer option:checked').innerText();
  check(/Polo Duo — 2 for ৳1,500/.test(offerTxt), 'offer defaults to Polo Duo: ' + offerTxt);
  check((await page.inputValue('#alp-h')).length > 5, 'headline prefilled: ' + await page.inputValue('#alp-h'));
  await shot('lp_step4');
  await page.click('[data-testid="alp-next"]');
  await page.waitForTimeout(100);
  const auto = await page.inputValue('[data-testid="alp-slug"]');
  check(/^[a-z0-9-]{3,40}$/.test(auto), 'auto slug: ' + auto);
  await page.fill('[data-testid="alp-slug"]', 'polo-duo');
  await page.waitForTimeout(50);
  check(await page.locator('[data-testid="alp-dup"]').count() === 1, 'duplicate slug warning');
  check(await page.locator('[data-testid="alp-publish"]').isDisabled(), 'publish disabled for duplicate');
  await page.fill('[data-testid="alp-slug"]', 'Polo Duo Navy');
  await page.locator('[data-testid="alp-slug"]').blur();
  await page.waitForTimeout(50);
  check((await page.inputValue('[data-testid="alp-slug"]')) === 'polo-duo-navy', 'slug cleaned to polo-duo-navy');
  await page.selectOption('[data-testid="alp-campaign"]', 'Meta · Polo Duo · Oct');
  await page.waitForTimeout(50);
  const utm = await page.locator('[data-testid="alp-utm"]').innerText();
  check(/utm_source=facebook&utm_medium=paid_social&utm_campaign=meta-polo-duo-oct/.test(utm), 'UTM link: ' + utm);
  await shot('lp_step5');
  await page.click('[data-testid="alp-publish"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, `t_${vp.name}_lp_progress.png`) });
  await page.waitForTimeout(2200);
  const after = await page.evaluate(() => ST.landingPages.length);
  check(after === before + 1, `ST.landingPages grew ${before} → ${after}`);
  const last = await page.evaluate(() => ST.landingPages[ST.landingPages.length - 1]);
  check(last.slug === 'polo-duo-navy' && last.status === 'Live' && last.campaign === 'Meta · Polo Duo · Oct' && last.visits === 0, 'new page fields ok');
  check(await page.locator('[data-testid="alp-success"]').count() === 1, 'success card shown');
  await shot('lp_success');
  check((await page.getAttribute('[data-testid="alp-open"]', 'href')) === '#/l/polo-duo-navy', 'Open landing page link');
  await page.click('[data-testid="alp-back"]');
  await page.waitForTimeout(150);
  check(page.url().endsWith('#/admin/landing') && /polo-duo-navy/.test(await page.innerText('#app')), 'back to list shows new page');
  await shot('lp_list_after');
  await page.evaluate(() => { location.hash = '#/l/polo-duo-navy'; });
  await page.waitForTimeout(200);
  const lpBody = await page.innerText('#app');
  check(!/Something went wrong|Page not found/.test(lpBody), 'new landing page #/l/polo-duo-navy renders');
  await shot('lp_open_new');

  /* ---- Combos ---- */
  console.log(`--- ${vp.name}: Combos`);
  await page.evaluate(() => { location.hash = '#/admin/combos'; });
  await page.waitForTimeout(150);
  await page.fill('[data-testid="acb-price-polo-duo"]', '1400');
  await page.waitForTimeout(50);
  check(/saves ৳300/.test(await page.locator('#acb-save-polo-duo').innerText()), 'savings text updates');
  const t = await page.evaluate(() => { ST.bag = []; bagAdd({kind:'item', product:'essential-pique-polo', color:'navy', size:'M', qty:1}); bagAdd({kind:'item', product:'essential-pique-polo', color:'white', size:'M', qty:1}); return bagTotals(); });
  check(t.subtotal === 1700 && t.discount === 300 && t.total === 1400, `bagTotals uses new combo price (subtotal ${t.subtotal}, discount ${t.discount}, total ${t.total})`);
  await page.reload(); await page.waitForTimeout(150);
  check((await page.inputValue('[data-testid="acb-price-polo-duo"]')) === '1400', 'combo price persisted after reload');
  await page.fill('#acb-t3-office-skus', '3300');
  check(await page.evaluate(() => setRules().find(r => r.id === 'office-skus').tiers[3] === 3300), 'set rule tier saved');
  await shot('combos');

  check(errs.length === 0, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await flow(browser, { name: 'desk', width: 1366, height: 900 });
  await flow(browser, { name: 'phone', width: 390, height: 844, mobile: true });
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
