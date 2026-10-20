// node fixE-test.js <html> <shotdir>
// Owner fix E — the full back-office flow with real clicks:
// 3 storefront orders → fraud review (merge + call) → bulk confirm → bulk courier → delivered →
// money check → expense + salary + ad spend → exchange (customer) → approve → QC → stock →
// return request → declined with policy → support message → AI draft → reply → P&L vs a hand sum.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const html = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|net::/.test(m.text())) errs.push('C:' + m.text()); });
  await p.addInitScript(() => { window.print = () => {}; });
  let pass = 0, fail = 0;
  const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); c ? pass++ : fail++; };
  const go = async h => { await p.evaluate(h => { try { closeModal() } catch (e) {} location.hash = '#/x'; location.hash = h; }, h); await p.waitForTimeout(350); };
  const click = async (sel, label) => { const e = await p.$(sel); if (!e) { ok(false, 'found: ' + (label || sel)); return false; } await e.scrollIntoViewIfNeeded(); await e.click(); await p.waitForTimeout(220); return true; };
  const yes = async () => { await click('[data-testid="zy-yes"]', 'confirm button'); await p.waitForTimeout(150); };
  const shot = async n => { await p.screenshot({ path: path.join(out, n + '.png'), fullPage: true }); };
  const shotV = async n => { await p.screenshot({ path: path.join(out, n + '.png') }); };

  await p.goto('file://' + path.resolve(html) + '#/'); await p.waitForTimeout(700);
  await p.evaluate(() => { ST.seenIntro = true; ST.adminLang = 'en'; saveState(); closeModal(); });

  /* ---------- 1. three orders in the storefront (product page → bag → checkout) ---------- */
  const ADDR = 'House 9, Road 4, Dhanmondi, Dhaka';
  const placeUI = async (items, name, phone, addr, pay) => {
    await p.evaluate(() => { ST.bag = []; saveState(); });
    for (const it of items) {
      await go('#/p/' + it.p + (it.c ? '?color=' + it.c : ''));
      await click('[data-act="pdp-size"][data-s="' + it.s + '"]', it.p + ' size ' + it.s);
      await click('[data-act="pdp-add"]', 'Add to bag'); await p.evaluate(() => closeModal());
    }
    await go('#/checkout');
    await p.fill('[data-input="co-name"]', name); await p.fill('[data-input="co-phone"]', phone); await p.fill('[data-input="co-address"]', addr); await p.waitForTimeout(250);
    if (pay === 'bkash') { const m = await p.$('[data-act="co-pay"][data-v="mb"]'); if (m) { await m.click(); await p.waitForTimeout(200); } else await p.evaluate(() => { co_state().payment = 'mb'; co_state().mb = 'bkash'; rerender(); }); }
    await click('button.co-confirm:not([disabled])', 'Confirm order'); await p.waitForTimeout(500);
    const h = await p.evaluate(() => location.hash); return /thanks/.test(h) ? h.split('/').pop() : null;
  };
  const A = await placeUI([{ p: 'essential-pique-polo', c: 'navy', s: 'M' }, { p: 'essential-pique-polo', c: 'white', s: 'M' }], 'Karim Uddin', '01711000111', ADDR, 'cod');
  if (A) await shotV('01-thanks-A');
  const B = await placeUI([{ p: 'heavyweight-hoodie', s: 'L' }], 'Rashed Khan', '01811000222', ADDR, 'bkash');
  const C = await placeUI([{ p: 'classic-cotton-panjabi', s: 'L' }], 'Karim Uddin', '01711000111', ADDR, 'cod');
  ok(A && B && C, 'three orders placed through the checkout: ' + [A, B, C].join(', '));
  await p.waitForTimeout(200);
  const o0 = await p.evaluate(ids => ids.map(id => { const o = ST.orders[id]; return { id, total: o.total, pay: o.payment, flags: o.flags, notif: (o.notif || []).map(n => n.ch + ':' + n.step + ':' + n.st) }; }), [A, B, C]);
  console.log('  orders', JSON.stringify(o0));
  ok(o0[1].pay === 'bkash', 'order B paid by bKash');
  ok(o0.every(o => o.notif.length === 1 && /^SMS:placed:sent/.test(o.notif[0])), 'SMS ① logged at order placed for all three');

  /* ---------- 2. duplicate / fraud review ---------- */
  await go('#/admin/review'); await shot('02-review-queue');
  const q1 = await p.evaluate(() => zq_queue().map(o => o.id + ':' + zq_signals(o).map(s => s.k).join('+')));
  console.log('  queue', q1.join(' | '));
  ok(q1.some(x => x.startsWith(B + ':') && /addr/.test(x)), 'B flagged: same address, new phone');
  ok(q1.some(x => x.startsWith(C + ':') && /sameday/.test(x)), 'C flagged: several orders today (same phone)');
  const blk = await p.evaluate(b => zy_reviewOpen(ST.orders[b]), B);
  ok(blk === true, 'flagged order is held back from bulk actions until reviewed');
  await click('[data-act="zq-merge"][data-id="' + A + '"]', 'Merge'); await shotV('03-merge-confirm'); await yes();
  const mg = await p.evaluate(([a, c]) => ({ a: ST.orders[a].lines.length, at: ST.orders[a].total, ad: ST.orders[a].delivery, c: ST.orders[c].status, into: ST.orders[c].mergedInto }), [A, C]);
  ok(mg.a === 3 && mg.c === 'cancelled' && mg.into === A, 'C merged into A as one parcel (A has ' + mg.a + ' lines, total ' + mg.at + ', delivery ' + mg.ad + ')');
  await click('[data-act="zq-rev"][data-v="call"][data-id="' + B + '"]', 'Call B');
  await p.selectOption('#zq-r', '0'); await p.waitForTimeout(150); await click('[data-testid="zq-rev-go"]', 'save call');
  const rv = await p.evaluate(b => ({ q: zq_queue().length, d: zy_st().rev[b] && zy_st().rev[b].d, calls: (zy_st().rev[b].calls || []).length }), B);
  ok(rv.d === 'approved' && rv.calls === 1 && rv.q === 0, 'B: call logged “confirmed” → approved; queue empty');
  await go('#/admin/review?tab=done'); await shot('04-review-done');

  /* ---------- 3. bulk confirm + bulk courier ---------- */
  await go('#/admin/bulk');
  await click('[data-change="zy-bulk-all"]', 'select all');
  const nsel = await p.evaluate(() => Object.keys(ui('zy-bulk', {}).sel).length);
  await click('[data-act="zy-bulk-do"][data-v="confirm"]', 'bulk Confirm'); await shotV('05-bulk-confirm'); await yes();
  const st1 = await p.evaluate(ids => ids.map(id => ST.orders[id].status), [A, B]);
  ok(st1.every(s => s === 'packed'), 'bulk confirm: A and B → Packed (' + nsel + ' selected)');
  const msg2 = await p.evaluate(a => (ST.orders[a].notif || []).map(n => n.ch + ':' + n.step), A);
  ok(msg2.join(',') === 'SMS:placed,SMS:confirmed,WhatsApp:processing', 'messages on A follow the owner rule: ' + msg2.join(', '));
  await click('[data-act="zy-bulk-f"][data-v="nobook"]', 'filter not booked');
  await click('[data-change="zy-bulk-all"]', 'select all (not booked)');
  await click('[data-act="zy-bulk-do"][data-v="book"]', 'bulk Book courier'); await yes();
  const pc = await p.evaluate(ids => ids.map(id => { const x = zk_parcelOf(id); return x ? x.courier + ' ' + x.cid + ' ৳' + x.charge : null; }), [A, B]);
  ok(pc.every(Boolean), 'bulk book: both parcels booked — ' + pc.join(' | '));
  const msg3 = await p.evaluate(a => (ST.orders[a].notif || []).length, A);
  ok(msg3 === 3, 'booking did not send a 3rd SMS or a 2nd WhatsApp (still ' + msg3 + ' messages)');
  // the guard: a WhatsApp invoice sent by hand is now blocked and logged
  await p.evaluate(a => { ACT['zx-wa-send']({ getAttribute: k => k === 'data-id' ? a : null }); }, A);
  const blkd = await p.evaluate(a => (ST.orders[a].notif || []).filter(n => n.st === 'blocked').length, A);
  ok(blkd === 1, 'a second WhatsApp is blocked and logged');
  await click('[data-act="zy-bulk-f"][data-v="all"]', 'filter all'); await click('[data-change="zy-bulk-one"][data-id="' + A + '"]', 'tick A');
  await click('[data-act="zy-bulk-do"][data-v="stickers"]', 'bulk stickers'); await yes();
  ok(await p.evaluate(a => !!(ST.orders[a].docs && ST.orders[a].docs.sticker), A), 'bulk sticker print marks the sticker printed');
  console.log('  selection after stickers', await p.evaluate(() => JSON.stringify(ui('zy-bulk', {}).sel)), await p.$eval('[data-change="zy-bulk-all"]', e => e.checked));
  await p.check('[data-change="zy-bulk-all"]'); await p.waitForTimeout(200); console.log('  after check', await p.evaluate(() => Object.keys(ui('zy-bulk', {}).sel).length));
  await click('[data-act="zy-bulk-do"][data-v="invoices"]', 'bulk invoices'); await yes();
  await p.check('[data-change="zy-bulk-all"]'); await p.waitForTimeout(200); await click('[data-act="zy-bulk-do"][data-v="picking"]', 'bulk picking'); await yes();
  await shot('06-bulk');

  /* ---------- 4. courier → delivered ---------- */
  await go('#/admin/couriers?tab=parcels');
  for (const id of [A, B]) for (let i = 0; i < 3; i++) { await click('[data-act="zk-next"][data-id="' + id + '"]', 'next step ' + id); }
  const st2 = await p.evaluate(ids => ids.map(id => ST.orders[id].status + '/' + zk_parcelOf(id).st), [A, B]);
  ok(st2.every(s => s === 'delivered/delivered'), 'courier steps → both orders Delivered (' + st2.join(', ') + ')');

  /* ---------- 5. money check on the demo's own parcels ---------- */
  await go('#/admin/couriers?tab=money');
  const mrows = await p.evaluate(() => zy_moneyRows().map(r => r.oid + ':' + r.due));
  ok(mrows.length === 2, 'money check lists the 2 real parcels: ' + mrows.join(', '));
  const cours = await p.$$eval('[data-act="zy-settle"]', x => x.map(e => e.getAttribute('data-c')));
  for (const c of cours) { await click('[data-act="zy-settle"][data-c="' + c + '"]', 'load statement ' + c); await yes(); }
  await click('[data-act="zy-settle-one"][data-id="' + B + '"]', 'enter B payment');
  const dueB = await p.evaluate(b => zy_moneyRows().filter(r => r.oid === b)[0].due, B);
  await p.fill('#zy-s1', String(dueB - 50)); await click('#zy-s1 ~ .zs-actions button, form[data-submit="zy-settle1"] button', 'next'); await yes();
  const mm = await p.evaluate(() => zy_moneyRows().filter(r => r.flags.length).map(r => r.oid + ': ' + r.flags.join('; ')));
  ok(mm.length === 1 && mm[0].indexOf(B) === 0, 'short courier payment on B is flagged: ' + mm.join(' | '));
  await shot('07-money-check');

  /* ---------- 6. expense, salary, ad spend ---------- */
  await go('#/admin/expenses');
  await click('[data-testid="zy-exp-new"]', 'Add expense');
  await p.selectOption('#zy-e-h', 'packaging'); await p.fill('#zy-e-a', '500'); await p.fill('#zy-e-n', 'Poly bags and tape');
  await click('[data-testid="zy-exp-next"]', 'expense next'); await shotV('08-expense-confirm'); await yes();
  ok(await p.evaluate(() => zy_st().exp.length === 1 && zy_st().exp[0].amt === 500), 'expense ৳500 (Packaging) saved');
  await go('#/admin/expenses?tab=staff');
  await click('[data-testid="zy-emp-new"]', 'Add person');
  await p.fill('#zy-p-n', 'Jamal Hossain'); await p.fill('#zy-p-j', 'Rider for local drops'); await p.selectOption('#zy-p-r', 'packer'); await p.fill('#zy-p-s', '9000');
  await click('[data-testid="zy-emp-next"]', 'person next'); await yes();
  ok(await p.evaluate(() => zy_st().emp.some(e => e.name === 'Jamal Hossain' && e.salary === 9000)), 'salary ৳9,000 / month added (Jamal Hossain)');
  await shot('09-staff');
  await go('#/admin/finance?tab=ads');
  const today = await p.evaluate(() => zy_dk(Date.now()));
  await click('[data-act="zy-ads-edit"][data-k="' + today + '"]', 'enter ad spend'); await p.fill('#zy-ads-v', '1200'); await click('form[data-submit="zy-ads"] button', 'ads next'); await yes();
  ok(await p.evaluate(k => zy_st().fin.ads[k].amt === 1200, today), 'ad spend today ৳1,200 entered');

  /* ---------- 7. exchange from the customer's account → approve → QC → stock ---------- */
  await go('#/order/' + A);
  const custOk = await p.evaluate(() => !!document.querySelector('[data-testid="zq-help"]'));
  ok(custOk, 'customer order page shows “Returns & help”'); await shot('10-customer-order');
  await go('#/exchange/' + A + '?line=0');
  for (let i = 0; i < 8; i++) {
    const u = await p.evaluate(() => { const x = UI && Object.keys(UI).filter(k => /^exc/.test(k)).map(k => UI[k])[0]; return x ? { step: x.step, reason: x.reason, size: x.size, pick: !!x.pick } : {}; });
    const r1 = await p.$('[data-change="exc-reason"][value="small"]:not(:checked)'); if (r1 && await r1.isVisible()) { await r1.click().catch(() => {}); await p.waitForTimeout(250); continue; }
    const sz = await p.$('[data-act="exc-size"][data-s="L"][aria-pressed="false"]'); if (sz && await sz.isVisible()) { await sz.click(); await p.waitForTimeout(250); continue; }
    if (await p.$('[data-act="exc-confirm"]')) break;
    const next = await p.$('[data-act="exc-next"]:not([disabled])'); if (next) { await next.click(); await p.waitForTimeout(300); continue; }
    const pick = await p.$('[data-act="exc-pick"]'); if (pick) { await pick.click(); await p.waitForTimeout(250); continue; }
    console.log('  exchange step stuck', JSON.stringify(u)); break;
  }
  await click('[data-act="exc-confirm"]', 'confirm exchange'); await p.waitForTimeout(300);
  const ex = await p.evaluate(a => (ST.orders[a].exchanges || []).map(x => ({ id: x.id, st: x.status, n: x.newItem, cod: x.codDue, ch: x.charge })), A);
  ok(ex.length === 1 && ex[0].st === 'requested', 'customer exchange request created: ' + JSON.stringify(ex[0] || {}));
  const xid = ex[0] && ex[0].id, nItem = ex[0] && ex[0].n;
  const before = await p.evaluate(n => ({ neu: stockOf(n.product, n.color, n.size), old: stockOf('essential-pique-polo', 'navy', 'M') }), nItem);
  await go('#/admin/exchanges'); await shot('11-exchange-request');
  await click('[data-act="zq-ex-ok"][data-x="' + xid + '"]', 'approve exchange'); await shotV('12-exchange-approve'); await yes();
  const mid = await p.evaluate(n => stockOf(n.product, n.color, n.size), nItem);
  ok(mid === before.neu - 1, 'approve holds the new item: stock ' + before.neu + ' → ' + mid);
  await go('#/admin/exchanges?tab=recv');
  await click('[data-act="zq-recv-ex"][data-x="' + xid + '"]', 'receive old item'); await click('[data-testid="zq-qc-good"]', 'QC good'); await shotV('13-qc'); await click('[data-testid="zq-qc-go"]', 'save QC');
  const after = await p.evaluate(([a, x]) => { const e = ST.orders[a].exchanges.filter(y => y.id === x)[0]; return { st: e.status, qc: e.qc, old: stockOf('essential-pique-polo', 'navy', 'M') }; }, [A, xid]);
  ok(after.st === 'completed' && after.qc === 'good' && after.old === before.old + 1, 'QC good → exchange completed, old item back in stock ' + before.old + ' → ' + after.old);
  await go('#/admin/exchanges?tab=done'); await shot('14-exchange-done');

  /* ---------- 8. return request → declined with the policy ---------- */
  await go('#/order/' + A);
  await click('[data-testid="zq-c-ret"]', 'Request a return'); await click('[data-act="zq-cr-r"][data-v="dislike"]', 'reason did not like'); await click('[data-testid="zq-cr-go"]', 'send request');
  const rid = await p.evaluate(() => zy_st().rets[0] && zy_st().rets[0].id);
  ok(!!rid, 'customer return request ' + rid + ' reaches the admin');
  await go('#/admin/exchanges?tab=ret'); await shot('15-return-request');
  await click('[data-testid="zq-ret-no"]', 'decline with policy'); await yes();
  ok(await p.evaluate(() => zy_st().rets[0].status === 'declined'), 'return declined with the policy text (sent into the customer chat)');

  /* ---------- 9. support: customer writes, EXTAS AI drafts, a person sends ---------- */
  await go('#/order/' + A);
  await click('[data-testid="zq-c-msg"]', 'Message us'); await p.fill('#zq-cm', 'Assalamu alaikum, amar parcel ' + A + ' kobe ashbe? Ar size exchange er rule ki?'); await click('[data-testid="zq-cm-go"]', 'send customer message');
  const tid = await p.evaluate(a => { const c = zq_sup().convs.filter(x => x.orderId === a && x.ch === 'web')[0]; return c && c.id; }, A);
  ok(!!tid, 'customer message lands in the support inbox as ' + tid);
  await go('#/admin/support?t=' + tid);
  await click('[data-testid="zq-ai"]', 'Draft with EXTAS AI');
  const draft = await p.$eval('#zq-rep', e => e.value);
  ok(/exchange/i.test(draft) && /72|hours/.test(draft), 'EXTAS AI draft grounded in Smart Rules: “' + draft.slice(0, 90) + '…”');
  await shot('16-support-draft');
  await click('[data-testid="zq-send"]', 'Send'); await yes();
  const rep = await p.evaluate(t => { const c = zq_conv(t); const m = c.msgs[c.msgs.length - 1]; return { from: m.from, ai: m.ai, by: m.by, st: c.status }; }, tid);
  ok(rep.from === 'staff' && rep.ai === true && rep.st === 'pending', 'reply sent by a person (' + rep.by + '), marked “drafted by EXTAS AI”, status Waiting');
  await go('#/order/' + A);
  const seen = await p.evaluate(() => document.querySelectorAll('.zq-cm.us').length);
  ok(seen >= 2, 'the customer sees our replies on the order page (' + seen + ' replies: return policy + answer)');
  await shot('17-customer-thread');

  /* ---------- 10. P&L against an independent hand sum ---------- */
  await go('#/admin/finance');
  await p.evaluate(() => { zy_st().fin.period = 'today'; zy_st().fin.scope = 'delivered'; saveState(); }); await go('#/admin/finance');
  const hand = await p.evaluate(() => {
    // independent arithmetic straight from the stored data (no P&L engine functions)
    const z = ST.zy, F = z.fin, now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), t1 = Date.now();
    const inT = ts => ts >= t0 && ts <= t1, dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const big = String(F.bigSizes).split(/[,\s]+/).filter(Boolean).map(s => s.toUpperCase());
    const cost = (pid, size) => { const pr = DB.products.filter(x => x.id === pid)[0]; const base = z.cost[pid] != null ? +z.cost[pid] : Math.round(pr.price * 0.46 / 10) * 10; return base + (big.indexOf(String(size).toUpperCase()) >= 0 ? +F.bigExtra : 0); };
    const parcels = (ST.ops && ST.ops.cour && ST.ops.cour.parcels) || {};
    const rates = { steadfast: { in: 60, sub: 90, out: 110, pct: 1 }, pathao: { in: 65, sub: 80, out: 115, pct: 1 }, redx: { in: 70, sub: 85, out: 105, pct: 1 } };
    let rev = 0, cogs = 0, cour = 0, fee = 0, gw = 0, pack = 0, n = 0, exRev = 0, exCogs = 0;
    Object.keys(ST.orders).forEach(id => { const o = ST.orders[id]; if (o.status !== 'delivered' || !inT(o.deliveredAt)) return; n++;
      rev += o.total; o.lines.forEach(l => { cogs += (l.qty || 1) * cost(l.product, l.size); });
      const pc = parcels[id]; const band = o.zone === 'sub' ? 'sub' : o.zone;
      if (pc) { const r = (ST.ops.cour.acc[pc.courier] && ST.ops.cour.acc[pc.courier].rates) ? Object.assign({}, rates[pc.courier], ST.ops.cour.acc[pc.courier].rates) : rates[pc.courier]; cour += pc.charge; fee += Math.round(pc.cod * r.pct / 100); }
      else { const r = rates[String(o.courier).toLowerCase()]; cour += r[band]; fee += Math.round((o.payment === 'cod' ? o.total : 0) * r.pct / 100); }
      if (o.payment !== 'cod') { const paid = o.paid != null ? o.paid : o.total; const rt = o.payment === 'bkash' ? +F.gwBkash : o.payment === 'nagad' ? +F.gwNagad : +F.gwCard; gw += Math.round(paid * rt / 100); }
      pack += +F.pack; });
    Object.keys(ST.orders).forEach(id => { const o = ST.orders[id]; (o.exchanges || []).forEach(x => { if (x.status !== 'completed' || !x.zy || !inT(x.doneAt)) return; const l = o.lines[x.lineIdx];
      exRev += (x.codDue || 0) - (x.walletPosted ? x.walletCredit : 0); exCogs += cost(x.newItem.product, x.newItem.size) - Math.round(cost(l.product, l.size) * (x.qc === 'good' ? 1 : x.qc === 'b' ? F.bPct / 100 : 0)); cour += (x.swap && x.swap.charge) || 0; }); });
    let msgs = 0; Object.keys(ST.orders).forEach(id => (ST.orders[id].notif || []).forEach(m => { if (/^sent/.test(m.st) && inT(m.at)) msgs += m.ch === 'SMS' ? +F.sms : m.ch === 'WhatsApp' ? +F.wa : +F.email; }));
    const dk = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const ads = F.ads[dk] ? F.ads[dk].amt : 0;
    const exp = z.exp.filter(e => !e.void && e.date === dk).reduce((s, e) => s + e.amt, 0);
    let sal = 0; z.emp.forEach(e => { if (!e.active) return; if (new Date(e.start + 'T00:00').getTime() > t0) return; sal += e.salary / dim; }); sal = Math.round(sal);
    const revenue = rev + exRev, cogsAll = cogs + exCogs, gross = revenue - cogsAll, net = gross - cour - fee - gw - pack - Math.round(msgs) - ads - exp - sal;
    return { n, revenue, cogsAll, gross, cour, fee, gw, pack, msgs: Math.round(msgs), ads, exp, sal, net, exRev, exCogs };
  });
  const page = await p.evaluate(() => { const rows = {}; document.querySelectorAll('[data-testid="zy-pl"] tr').forEach(tr => { const td = tr.querySelectorAll('td'); if (td.length === 2) rows[td[0].childNodes[0].textContent.trim()] = Math.round(Number(td[1].textContent.replace(/[^\d]/g, '')) || 0) * (/−/.test(td[1].textContent) ? -1 : 1); }); return rows; });
  console.log('  hand', JSON.stringify(hand)); console.log('  page', JSON.stringify(page));
  const pg = k => page[Object.keys(page).filter(x => x.indexOf(k) === 0)[0]];
  const cmp = [['Total revenue', hand.revenue], ['Gross profit', Math.abs(hand.gross)], ['Courier delivery charges', -hand.cour], ['Courier COD fee', -hand.fee], ['Payment gateway fees', -hand.gw], ['Packaging', -hand.pack], ['SMS, WhatsApp and email', -hand.msgs], ['Ad spend', -hand.ads], ['Expenses', -hand.exp], ['Salaries', -hand.sal], ['Net', Math.abs(hand.net)]];
  cmp.forEach(([k, v]) => { const got = pg(k); ok(got === v || (v === 0 && (got === 0 || got === undefined)), 'P&L “' + k + '” = ' + got + ' (hand sum ' + v + ')'); });
  const kpi = await p.evaluate(() => [...document.querySelectorAll('.zs-kpis .zs-k')].map(k => k.innerText.replace(/\s+/g, ' ')));
  console.log('  kpis', kpi.join(' | '));
  await shot('18-pl');
  for (const t of ['style', 'cat', 'combo', 'day']) { await go('#/admin/finance?tab=' + t); await shot('19-pl-' + t); }
  const sumStyle = await p.evaluate(() => { const R = zy_pl('today', 'delivered'); return { st: Math.round(Object.keys(R.byStyle).reduce((s, k) => s + R.byStyle[k].net, 0)), sales: R.sales, cat: Math.round(Object.keys(R.byCat).reduce((s, k) => s + R.byCat[k].net, 0)), cmb: Math.round(Object.keys(R.byCombo).reduce((s, k) => s + R.byCombo[k].net, 0)) }; });
  ok(sumStyle.st === sumStyle.sales && sumStyle.cat === sumStyle.sales && sumStyle.cmb === sumStyle.sales, 'by style / category / combo each add up to product sales ' + sumStyle.sales);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), go('#/admin/finance').then(() => p.click('[data-testid="zy-csv"]'))]);
  if (dl) { const f = path.join(out, 'pl-export.csv'); await dl.saveAs(f); const csv = fs.readFileSync(f, 'utf8'); ok(/Net profit,/.test(csv) && /By style/.test(csv), 'CSV export downloaded (' + csv.split('\n').length + ' lines)'); } else ok(false, 'CSV download');

  /* ---------- 11. roles, permissions and the audit log ---------- */
  await go('#/admin/team?tab=people');
  await click('[data-act="zy-actas"][data-id="e3"]', 'act as accountant'); await yes();
  await go('#/admin/support');
  ok(await p.evaluate(() => !!document.querySelector('[data-testid="zy-noaccess"]')), 'accountant cannot open the support inbox (no access card)');
  await go('#/admin/orders');
  const before2 = await p.evaluate(() => zy_st().audit.length);
  await p.evaluate(() => { ACT['ao-next']({ getAttribute: k => k === 'data-id' ? 'EX-1040' : null }); });
  const blockedAct = await p.evaluate(() => ({ st: ST.orders['EX-1040'].status, last: zy_st().audit[zy_st().audit.length - 1].what }));
  ok(blockedAct.st === 'packed' && /^Blocked/.test(blockedAct.last), 'accountant pressing “next status” is refused and logged: ' + blockedAct.last.slice(0, 70));
  await click('[data-testid="zy-actor"]', 'name chip (switch person)'); await shotV('20a-switch'); await click('[data-testid="zy-actas-owner"]', 'back to owner'); await yes();
  ok(await p.evaluate(() => zy_actor().id === 'owner'), 'the name chip switches back to the owner from a page without Team access');
  await go('#/admin/team?tab=log'); await shot('20-audit-log');
  const audit = await p.evaluate(() => zy_st().audit.map(a => a.sec + ': ' + a.what));
  ok(audit.length >= 20 && ['Merged', 'Approved flagged', 'Bulk confirm', 'Bulk book', 'Added expense', 'Added Jamal', 'Approved exchange', 'Exchange EXC', 'Declined return', 'Replied on'].every(w => audit.some(a => a.indexOf(w) >= 0)), 'audit log has every step (' + audit.length + ' lines)');
  await go('#/admin/team'); await shot('21-roles');
  await go('#/admin/comms'); await shot('22-messages');

  /* ---------- 12. coupons from settings reach the bag ---------- */
  await go('#/admin/coupons'); await click('[data-testid="zq-cpn-new"]', 'Add coupon');
  await p.fill('#zq-c-c', 'EID10'); await p.fill('#zq-c-t', 'Eid 10% off'); await p.fill('#zq-c-v', '10'); await p.fill('#zq-c-m', '1000'); await click('[data-testid="zq-cpn-next"]', 'coupon next'); await yes();
  // a 4th customer uses the code in the bag → checkout; the coupon counts the use
  await p.evaluate(() => { ST.bag = []; saveState(); });
  await go('#/p/heavyweight-hoodie'); await click('[data-act="pdp-size"][data-s="M"]', 'hoodie M'); await click('[data-act="pdp-add"]', 'add'); await p.evaluate(() => closeModal());
  await go('#/bag'); await click('[data-act="bag-code-open"]', 'Have a code?'); await p.fill('#bag-code', 'eid10'); await p.press('#bag-code', 'Enter'); await p.waitForTimeout(300);
  const bagOff = await p.evaluate(() => { const t = bagTotals(); return t.offer ? t.offer.amount : 0; });
  await go('#/checkout'); await p.fill('[data-input="co-name"]', 'Sadia Akter'); await p.fill('[data-input="co-phone"]', '01911000333'); await p.fill('[data-input="co-address"]', 'Flat 2A, Lake Road, Uttara Sector 7, Dhaka'); await p.waitForTimeout(250);
  await click('button.co-confirm:not([disabled])', 'Confirm order (with code)'); await p.waitForTimeout(500);
  const D = (await p.evaluate(() => location.hash)).split('/').pop(); await p.waitForTimeout(100);
  const cp = await p.evaluate(d => { const o = ST.orders[d]; const c = zq_cpnFind('EID10'); return { off: o && o.offer, total: o && o.total, sub: o && o.subtotal, uses: c ? (c.uses || []).length : -1, coupon: o && o.coupon }; }, D);
  ok(bagOff === 165 && cp.off && cp.off.code === 'EID10' && cp.off.amount === 165 && cp.uses === 1 && cp.coupon === 'EID10', 'coupon EID10 from settings: bag −৳' + bagOff + ', order ' + D + ' total ' + cp.total + ', use counted (' + cp.uses + ')');
  await go('#/admin/coupons'); await shot('23-coupons');

  ok(errs.length === 0, 'no JS errors (' + errs.slice(0, 3).join(' | ') + ')');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, fail, hand, page, orders: [A, B, C] }, null, 1));
  await b.close(); process.exitCode = fail ? 1 : 0;
})();
