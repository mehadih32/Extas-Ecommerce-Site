/* EXTAS admin prototype — AI Center (own menu): Approvals, AI agents, Costs & limits, Training.
   Agents, the master switch and the AI cap are shared with Settings (A.D.set); queue, limits and training live in A.D.ai. */
(function () {
  'use strict';
  const t = (en, bn) => A.t(en, bn);
  const U = () => A.ui;
  const F = () => A.fmt;
  const I = (n, s) => A.icon(n, s);
  const DAY = 864e5;
  const MODELS = { Claude: ['Haiku', 'Sonnet', 'Opus'], OpenAI: ['GPT mini', 'GPT'], Gemini: ['Flash', 'Pro'] };
  const SCHED = [['always', ['All the time', 'সবসময়']], ['hourly', ['Every hour', 'প্রতি ঘণ্টায়']], ['daily', ['Once a day', 'দিনে একবার']], ['weekly', ['Once a week', 'সপ্তাহে একবার']]];

  A.css('ai', `
  .ai-strip{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:14px 16px;border-radius:16px;background:var(--card2);border:1px solid var(--line);margin-bottom:14px}
  .ai-strip .big{font:700 18px var(--f-head)}
  .ai-dot{width:14px;height:14px;border-radius:50%;flex:none;background:var(--good);box-shadow:0 0 0 6px var(--good-soft)}
  .ai-dot.off{background:var(--muted);box-shadow:0 0 0 6px var(--card)}
  .ai-fb{flex:1 1 280px;min-width:0;font-size:12.5px;color:var(--muted)}
  .ai-q{display:flex;flex-direction:column;gap:10px}
  .ai-item{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--card);display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:start}
  .ai-item .ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--card2);color:var(--accent)}
  .ai-item h4{margin:0 0 3px;font-size:14.5px;font-weight:600}
  .ai-item .why{font-size:12.5px;color:var(--ink2);margin-top:4px}
  .ai-item .imp{font-size:12.5px;margin-top:3px}
  .ai-item .acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
  .ai-item.done{opacity:.75}
  .ai-agents{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
  .ai-ag{border:1px solid var(--line);border-radius:16px;padding:14px;background:var(--card);display:flex;flex-direction:column;gap:10px}
  .ai-ag .av{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--card2);font:700 16px var(--f-head);flex:none}
  .ai-ag .now{font-size:12.5px;padding:8px 10px;border-radius:10px;background:var(--card2)}
  .ai-ag .nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;font-size:12px;color:var(--muted)}
  .ai-ag .nums b{display:block;font-size:15px;color:var(--ink);font-variant-numeric:tabular-nums}
  .ai-ag .sel{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
  .ai-ag .sel select{width:100%;min-width:0}
  .ai-meter{display:flex;flex-direction:column;gap:6px}
  .ai-meter .row b{font-variant-numeric:tabular-nums}
  .ai-tr .li{align-items:flex-start}
  .ai-chipx{display:inline-flex;gap:6px;align-items:center}
  .ai-sb{border-radius:12px;padding:12px;background:var(--card2);font-size:13.5px;line-height:1.6;white-space:pre-wrap}
  .ai-ver .li .grow{min-width:0}
  @media (max-width:640px){.ai-item{grid-template-columns:auto minmax(0,1fr)}.ai-item .acts{grid-column:1/-1;justify-content:flex-start}.ai-ag .sel{grid-template-columns:1fr}.ai-agents{grid-template-columns:1fr}}
  `);

  /* ---------------- data ---------------- */
  const SD = () => (A.setData ? A.setData() : A.D.set || {});
  function D() {
    const set = SD();
    if (A.D.ai && A.D.ai.v === 1) return A.D.ai;
    const ago = (m) => new Date(A.TODAY - m * 6e4).toISOString();
    const O = A.D.orders; const risky = O.filter((o) => o.status === 'new' && o.risk === 'high').concat(O.filter((o) => o.status === 'new' && o.risk === 'medium')).slice(0, 2);
    const refuser = A.D.customers.filter((c) => c.refused >= 2).sort((a, b) => b.refused - a.refused)[0];
    const slow = A.D.products.filter((p) => p.status === 'live' && p.sold30 <= 2).sort((a, b) => b.views30 - a.views30)[0];
    const conv = (A.D.conversations || [])[0];
    const q = [
      { id: 'Q1', kind: 'ads', by: 'tirondaj', money: true, at: ago(40), en: 'Raise “Polo Winter” Facebook budget from ৳1,500 to ৳2,000 a day', bn: '“Polo Winter” ফেসবুক বাজেট দিনে ৳1,500 থেকে ৳2,000 করা', why: ['Earned ৳4.6 per ৳1 on delivered orders for 14 days; cost per order is falling.', '14 দিন ধরে ডেলিভারি অর্ডারে ৳1-এ ৳4.6 এসেছে; প্রতি অর্ডারের খরচ কমছে।'], imp: ['About +9 delivered orders a week, ~৳6,800 more profit after ads. Extra spend ৳3,500 a week.', 'সপ্তাহে প্রায় +9টি ডেলিভারি অর্ডার, বিজ্ঞাপনের পরে ~৳6,800 বেশি লাভ। সপ্তাহে বাড়তি খরচ ৳3,500।'], go: ['marketing', 'campaigns'] },
      { id: 'Q2', kind: 'ads', by: 'tirondaj', money: true, at: ago(95), en: 'Stop “Hoodie TikTok test”', bn: '“Hoodie TikTok test” বন্ধ করা', why: ['Only ৳1.1 back per ৳1 for 9 days; 4 of 11 orders refused at the door.', '9 দিন ধরে ৳1-এ মাত্র ৳1.1 ফেরত; 11টির মধ্যে 4টি অর্ডার দরজায় ফেরত।'], imp: ['Saves about ৳700 a day. The budget can go to the Polo campaign.', 'দিনে প্রায় ৳700 বাঁচবে। এই টাকা পোলো ক্যাম্পেইনে যেতে পারে।'], go: ['marketing', 'campaigns'] },
    ];
    risky.forEach((o, i) => q.push({ id: 'Q' + (3 + i), kind: 'decline', by: 'sawdagor', money: false, at: ago(25 + i * 30), en: `Decline order ${o.id} (${o.name}, ${o.district})`, bn: `অর্ডার ${o.id} বাতিল (${o.name}, ${o.district})`, why: ['Courier score 2.1/10: refused 3 parcels at 2 couriers; phone off at both calls.', 'কুরিয়ার স্কোর 2.1/10: 2টি কুরিয়ারে 3টি পার্সেল ফেরত; দুবারই ফোন বন্ধ।'], imp: [`Avoids a likely return cost of about ৳${o.zone === 'outside' ? 260 : 160}. Option: ask the delivery charge first instead.`, `সম্ভাব্য প্রায় ৳${o.zone === 'outside' ? 260 : 160} রিটার্ন খরচ বাঁচবে। বিকল্প: আগে ডেলিভারি চার্জ চাওয়া।`], go: ['orders', 'all', o.id], ref: o.id }));
    if (refuser) q.push({ id: 'Q5', kind: 'block', by: 'sawdagor', money: false, at: ago(130), en: `Ask ${refuser.name} for the delivery charge first on every order`, bn: `${refuser.name}-এর প্রতিটা অর্ডারে আগে ডেলিভারি চার্জ নেওয়া`, why: [`Refused ${refuser.refused} parcels out of ${refuser.orders} orders.`, `${refuser.orders}টি অর্ডারের ${refuser.refused}টি পার্সেল ফেরত দিয়েছেন।`], imp: ['Nobody is blocked by itself; the customer can still order with the charge paid first.', 'কাউকে নিজে থেকে ব্লক করা হয় না; চার্জ আগে দিলে কাস্টমার অর্ডার করতে পারবেন।'], go: ['customers', 'all', refuser.id], ref: refuser.id });
    q.push({ id: 'Q6', kind: 'reply', by: 'doot', money: false, at: ago(18), en: `Reply drafted for ${conv ? conv.name || 'a customer' : 'a customer'} on Messenger`, bn: `${conv ? conv.name || 'কাস্টমার' : 'কাস্টমার'}-এর জন্য Messenger-এ উত্তর তৈরি`, why: ['Asked if the navy polo comes in XL and when it reaches Sylhet.', 'নেভি পোলো XL আছে কিনা আর সিলেটে কবে পৌঁছাবে জানতে চেয়েছেন।'], imp: ['Waiting 22 minutes. Answered chats buy 3× more often.', '22 মিনিট ধরে অপেক্ষা। উত্তর পাওয়া চ্যাট 3 গুণ বেশি কেনে।'], draft: 'জি, নেভি পোলো XL সাইজে আছে। সিলেটে 3–5 দিনে পৌঁছাবে, ডেলিভারি চার্জ ৳130। অর্ডার করতে চাইলে নাম, ঠিকানা ও ফোন নম্বর দিন।', go: ['inbox', 'chats'] });
    if (slow) q.push({ id: 'Q7', kind: 'price', by: 'sawdagor', money: true, at: ago(300), en: `Put ${slow.name} in a 2-piece combo at ${F().tk(Math.round(slow.price * 2 * 0.9 / 10) * 10)}`, bn: `${slow.name} 2 পিসের কম্বোতে ${F().tk(Math.round(slow.price * 2 * 0.9 / 10) * 10)}-এ দেওয়া`, why: [`${F().num(slow.views30)} views in 30 days but only ${slow.sold30} sold — people look but do not buy.`, `30 দিনে ${F().num(slow.views30)} বার দেখা, কিন্তু বিক্রি মাত্র ${slow.sold30} — দেখে কিন্তু কেনে না।`], imp: ['Profit per combo stays above your minimum margin. Stock moves before winter ends.', 'প্রতি কম্বোতে লাভ আপনার ন্যূনতম মার্জিনের উপরে থাকে। শীত শেষের আগেই স্টক বের হবে।'], go: ['products', 'combos'] });
    q.push({ id: 'Q8', kind: 'blog', by: 'doot', money: false, at: ago(220), en: 'Publish blog post “How to pick your polo size”', bn: 'ব্লগ পাবলিশ: “কীভাবে পোলোর সাইজ বাছবেন”', why: ['“polo size chart bd” is searched about 1,900 times a month; we are not on page 1.', '“polo size chart bd” মাসে প্রায় 1,900 বার খোঁজা হয়; আমরা প্রথম পেজে নেই।'], imp: ['SEO score 86. Links to 4 polo products and the size chart.', 'SEO স্কোর 86। 4টি পোলো প্রোডাক্ট ও সাইজ চার্টে লিংক।'], draft: 'Polo size guide: measure your chest, compare with our chart, and pick your usual size. Between two sizes? Take the bigger one for a relaxed fit…', go: ['website', 'blog'] });
    q.push({ id: 'Q9', kind: 'reply', by: 'doot', money: false, status: 'approved', done: ago(600), at: ago(700), en: 'Reply to a review about late delivery', bn: 'দেরিতে ডেলিভারি নিয়ে রিভিউয়ের উত্তর', why: ['3-star review from Rajshahi.', 'রাজশাহী থেকে 3 স্টার রিভিউ।'], imp: ['Published.', 'পাবলিশ হয়েছে।'], go: ['products', 'reviews'] });
    q.forEach((x) => { if (!x.status) x.status = 'open'; });
    const days = Math.round((A.TODAY - new Date('2026-11-01T00:00:00+06:00')) / DAY) + 1;
    A.D.ai = {
      v: 1, queue: q,
      digest: { on: true, time: '09:00', tg: true, email: false },
      caps: { sms: 6000, wa: 4000 }, used: { sms: 3920, wa: 3380 }, agentCap: { gyani: 3000, prohori: 600, bhandari: 1500, sawdagor: 2000, shilpi: 800, doot: 3000, tirondaj: 1500 },
      saver: false, warned: false, days,
      fallback: { en: 'AI is resting. Orders, rules, templates and alerts keep working; drafts and ideas wait until AI is back.', bn: 'AI এখন বন্ধ। অর্ডার, নিয়ম, টেমপ্লেট ও অ্যালার্ট চলতে থাকবে; খসড়া ও আইডিয়া AI ফিরলে আসবে।' },
      keepFeat: { health: true, backup: true, score: true, stuck: true, digest: false, replies: false },
      instr: (set.training || []).map((x, i) => ({ id: 'IN' + i, t: x.t, text: x.text, on: true })),
      examples: [
        { id: 'EX1', t: ago(2 * 1440), by: 'doot', was: 'Dear valued customer, we regret to inform you…', now: 'ভাই, দুঃখিত! আপনার পার্সেল কাল সকালে পৌঁছাবে।', note: ['Write short and friendly, like we talk', 'ছোট আর আন্তরিকভাবে লিখুন, যেমন আমরা কথা বলি'], on: true },
        { id: 'EX2', t: ago(6 * 1440), by: 'sawdagor', was: 'Decline: phone unreachable once', now: 'Call list: try 2 more times before any decline', note: ['One missed call is not a reason to decline', 'একবার ফোন না ধরা বাতিলের কারণ নয়'], on: true },
      ],
      docs: [{ id: 'DC1', name: 'Fabric guide (GSM, cotton types).pdf', size: '1.2 MB', t: ago(20 * 1440), on: true }, { id: 'DC2', name: 'Winter 2026 price list.xlsx', size: '84 KB', t: ago(9 * 1440), on: true }],
      forbidden: ['Politics', 'Religion debates', 'Other brands’ prices', 'Promising a delivery date we cannot keep'],
      versions: [{ no: 3, t: ago(3 * 1440), en: 'Added rule: max 10% discount in chats', bn: 'নিয়ম যোগ: চ্যাটে সর্বোচ্চ 10% ছাড়', cur: true }, { no: 2, t: ago(9 * 1440), en: 'Added rule: delivery charge first for refusers outside Dhaka', bn: 'নিয়ম যোগ: ঢাকার বাইরে ফেরতদাতাদের আগে ডেলিভারি চার্জ' }, { no: 1, t: ago(30 * 1440), en: 'First setup', bn: 'প্রথম সেটআপ' }],
      asks: [{ t: ago(2 * 1440), text: 'চট্টগ্রামে এই সপ্তাহে রিটার্ন এত বেশি কেন?', reply: ['Gyani: 7 of 11 returns there were size L polos from one batch that runs small. Suggest adding “runs small, take one size up” to that size chart.', 'জ্ঞানী: সেখানে 11টির 7টি রিটার্ন একই ব্যাচের L সাইজের পোলো, যেটা ছোট মাপের। ওই সাইজ চার্টে “মাপ ছোট, এক সাইজ বড় নিন” লেখার পরামর্শ।'], st: 'answered' }],
    };
    set.proposals = [];
    return A.D.ai;
  }
  const KIND = {
    ads: ['Ad budget', 'বিজ্ঞাপন বাজেট', 'marketing'], decline: ['Order decline', 'অর্ডার বাতিল', 'orders'], block: ['Customer limit', 'কাস্টমার সীমা', 'customers'],
    reply: ['Reply to customer', 'কাস্টমারকে উত্তর', 'inbox'], price: ['Price / offer idea', 'দাম / অফার আইডিয়া', 'products'], blog: ['Blog draft', 'ব্লগ খসড়া', 'website'],
  };
  const agentOf = (id) => (SD().agents || []).find((a) => a.id === id) || { n: ['AI', 'AI'] };
  const agName = (id) => { const a = agentOf(id); return t(a.n[0], a.n[1]); };
  const running = (a) => a.on && (SD().aiOn || a.keep);
  const done = (msg, en, bn, tone) => { A.commit(msg); A.toast(t(en, bn), tone || 'good'); A.render(); };
  const saveVer = (en, bn) => { const d = D(); d.versions.forEach((v) => (v.cur = false)); d.versions.unshift({ no: (d.versions[0] ? d.versions[0].no : 0) + 1, t: A.TODAY.toISOString(), en, bn, cur: true }); };

  function pinAsk(title, html, okLabel, onOk) {
    const m = U().modal(title, `<div class="stack">${html}${U().field(t('Owner PIN', 'মালিকের PIN'), '<input class="inp" id="ai-pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="off">')}<div class="small" id="ai-pin-e" style="color:var(--bad)"></div></div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ai-pin-ok">${okLabel}</button>` });
    const go = () => { const v = m.querySelector('#ai-pin').value.trim(); if (!/^\d{4,8}$/.test(v)) { m.querySelector('#ai-pin-e').textContent = t('Enter your 4-digit PIN.', 'আপনার 4 সংখ্যার PIN দিন।'); return; } const keep = onOk(m); if (keep !== false) U().close(); };
    m.querySelector('#ai-pin-ok').onclick = go; m.querySelector('#ai-pin').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    setTimeout(() => m.querySelector('#ai-pin').focus(), 30);
  }

  /* ---------------- master switch strip (every tab) ---------------- */
  function strip() {
    const set = SD(); const d = D();
    return `<div class="ai-strip"><span class="ai-dot ${set.aiOn ? '' : 'off'}"></span><div><div class="big">${set.aiOn ? t('AI is on', 'AI চালু') : t('AI is off', 'AI বন্ধ')}</div><div class="muted small">${set.aiOn ? t('Agents suggest and draft. Money, prices, budgets and blocking wait for you.', 'এজেন্ট পরামর্শ ও খসড়া দেয়। টাকা, দাম, বাজেট ও ব্লক আপনার অপেক্ষায় থাকে।') : t('Only “keep on” agents run.', 'শুধু “চালু রাখুন” এজেন্ট চলে।')}</div></div>
      <div class="ai-fb"><b>${t('When AI is off, staff and the shop see:', 'AI বন্ধ থাকলে স্টাফ ও দোকান দেখে:')}</b> “${A.esc(t(d.fallback.en, d.fallback.bn))}” <a class="linkbtn" href="#" id="ai-fbe">${t('Edit', 'এডিট')}</a></div>
      ${U().switch('ai-master', set.aiOn, `aria-label="${t('AI master switch', 'AI মূল সুইচ')}"`)}</div>`;
  }
  function wireStrip(el) {
    const set = SD(); const d = D();
    el.querySelector('#ai-master').onchange = (e) => {
      if (e.target.checked) { e.target.checked = false; pinAsk(t('Turn AI on?', 'AI চালু করবেন?'), `<p style="margin:0">${t('Agents start suggesting and drafting. They never send to customers, change prices or move money without you.', 'এজেন্ট পরামর্শ ও খসড়া শুরু করবে। আপনাকে ছাড়া কাস্টমারকে পাঠায় না, দাম বদলায় না, টাকা নাড়ায় না।')}</p>`, t('Turn on', 'চালু করুন'), () => { set.aiOn = true; done('AI turned on', 'AI is on', 'AI চালু হলো'); }); return; }
      U().confirm(t('Turn AI off?', 'AI বন্ধ করবেন?'), t('Agents stop at once (except the ones you keep on). The shop keeps running on rules and templates.', 'এজেন্ট এখনই থামবে (যেগুলো চালু রাখতে বলেছেন সেগুলো ছাড়া)। দোকান নিয়ম ও টেমপ্লেটে চলতে থাকবে।'), t('Turn off', 'বন্ধ করুন'), () => { set.aiOn = false; done('AI turned off', 'AI is off — the shop keeps running', 'AI বন্ধ — দোকান চলছে'); }, true);
      e.target.checked = true;
    };
    el.querySelector('#ai-fbe').onclick = (e) => {
      e.preventDefault();
      const m = U().modal(t('Text shown when AI is off', 'AI বন্ধ থাকলে যে লেখা দেখাবে'), `<div class="stack">${U().field('English', `<textarea class="inp" id="fb-en" rows="3">${A.esc(d.fallback.en)}</textarea>`)}${U().field('বাংলা', `<textarea class="inp" id="fb-bn" rows="3">${A.esc(d.fallback.bn)}</textarea>`, t('Shown on the chat box, the helper and staff screens.', 'চ্যাট বক্স, সহকারী ও স্টাফের স্ক্রিনে দেখায়।'))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="fb-ok">${t('Save', 'সেভ')}</button>` });
      m.querySelector('#fb-ok').onclick = () => { d.fallback.en = m.querySelector('#fb-en').value.trim() || d.fallback.en; d.fallback.bn = m.querySelector('#fb-bn').value.trim() || d.fallback.bn; U().close(); done('AI-off text changed', 'Saved', 'সেভ হয়েছে'); };
    };
  }
  const head = (tab, title, sub, acts) => A.pageHead(t('AI Center', 'AI সেন্টার'), sub, acts) + A.tabsBar('ai', tab) + strip();

  /* ================= Approvals ================= */
  const qs = { kind: 'all', view: 'open' };
  function renderApprovals(el) {
    const d = D(); const Q = d.queue; const open = Q.filter((x) => x.status === 'open');
    const today = Q.filter((x) => x.done && A.TODAY - new Date(x.done) < DAY);
    const money = open.filter((x) => x.money).length;
    const oldest = open.slice().sort((a, b) => new Date(a.at) - new Date(b.at))[0];
    const list = Q.filter((x) => (qs.view === 'open' ? x.status === 'open' : x.status !== 'open') && (qs.kind === 'all' || x.kind === qs.kind)).sort((a, b) => new Date(b.done || b.at) - new Date(a.done || a.at));
    el.innerHTML = head('approvals', '', t('One queue of everything the AI wants to do. Nothing happens until you approve it.', 'AI যা করতে চায় সব এক তালিকায়। আপনি অনুমোদন না দিলে কিছুই হয় না।'), `<button class="btn" id="ap-dig">${I('send')}${t('Preview digest', 'ডাইজেস্ট প্রিভিউ')}</button>`) +
      `<div class="grid g4" style="margin-bottom:14px">${U().kpi({ label: t('Waiting for you', 'আপনার অপেক্ষায়'), value: open.length, sub: oldest ? t(`oldest ${F().ago(oldest.at)}`, `সবচেয়ে পুরোনো ${F().ago(oldest.at)}`) : t('all clear', 'সব শেষ') })}${U().kpi({ label: t('Need PIN (money)', 'PIN লাগবে (টাকা)'), value: money, sub: t('budgets, prices, offers', 'বাজেট, দাম, অফার') })}${U().kpi({ label: t('Decided today', 'আজ সিদ্ধান্ত'), value: today.length })}${U().kpi({ label: t('Approval rate', 'অনুমোদনের হার'), value: F().pct(Q.filter((x) => x.status === 'approved').length / Math.max(1, Q.filter((x) => x.status !== 'open').length) * 100, 0), sub: t('agents learn from every “no”', 'প্রতিটা “না” থেকে এজেন্ট শেখে') })}</div>` +
      (open.length ? U().callout(t(`<b>${open.length} waiting.</b> ${money ? `${money} touch money and need your PIN. ` : ''}Approve the ones you agree with; a rejected idea is never done.`, `<b>${open.length}টি অপেক্ষায়।</b> ${money ? `${money}টিতে টাকা জড়িত, PIN লাগবে। ` : ''}যেগুলোতে রাজি সেগুলো অনুমোদন দিন; না বললে কখনো করা হয় না।`), 'info', 'info') : '') +
      `<div class="card" style="margin-top:14px"><div class="row between" style="margin-bottom:10px;gap:8px">${U().seg('ap-view', [['open', t('Waiting', 'অপেক্ষায়') + ` (${open.length})`], ['done', t('Decided', 'সিদ্ধান্ত হয়েছে')]], qs.view)}<div class="chips">${[['all', t('All', 'সব')]].concat(Object.keys(KIND).map((k) => [k, t(KIND[k][0], KIND[k][1])])).map((c) => `<button class="chip ${qs.kind === c[0] ? 'on' : ''}" data-kd="${c[0]}">${c[1]}<span class="c">${(c[0] === 'all' ? Q : Q.filter((x) => x.kind === c[0])).filter((x) => (qs.view === 'open' ? x.status === 'open' : x.status !== 'open')).length}</span></button>`).join('')}</div></div>
      <div class="ai-q">${list.map(item).join('') || U().empty(qs.view === 'open' ? t('Nothing waiting — the agents will add ideas here.', 'কিছু অপেক্ষায় নেই — এজেন্টরা এখানে আইডিয়া দেবে।') : t('No decisions yet', 'এখনো কোনো সিদ্ধান্ত নেই'))}</div></div>` +
      `<div class="grid g2" style="margin-top:14px">${U().card(t('Daily digest', 'দৈনিক ডাইজেস্ট'), `<div class="stack"><div class="row between" style="flex-wrap:nowrap;gap:12px"><div><b>${t('Send me one summary a day', 'দিনে একবার সারাংশ পাঠান')}</b><div class="muted small">${t('What waits, what was done by itself, money at stake', 'কী অপেক্ষায়, কী নিজে হয়েছে, কত টাকা জড়িত')}</div></div>${U().switch('dg-on', d.digest.on)}</div><div class="formgrid">${U().field(t('Time', 'সময়'), `<input class="inp" type="time" id="dg-time" value="${d.digest.time}">`)}<div class="field"><label>${t('Send to', 'যেখানে যাবে')}</label><label class="row small" style="gap:6px"><input type="checkbox" id="dg-tg" ${d.digest.tg ? 'checked' : ''}> Telegram</label><label class="row small" style="gap:6px"><input type="checkbox" id="dg-em" ${d.digest.email ? 'checked' : ''}> ${t('Email', 'ইমেইল')}</label></div></div></div>`)}
        ${U().card(t('What the AI may never do alone', 'AI নিজে যা কখনো করে না'), `<div class="list small">${[['Move money, refund or change a price', 'টাকা নাড়ানো, রিফান্ড বা দাম বদলানো'], ['Raise an ad budget', 'বিজ্ঞাপনের বাজেট বাড়ানো'], ['Send a message to a customer', 'কাস্টমারকে মেসেজ পাঠানো'], ['Block anyone or decline an order', 'কাউকে ব্লক বা অর্ডার বাতিল'], ['Delete anything', 'কিছু মুছে ফেলা']].map((x) => `<div class="li">${I('check', 15)}<span class="grow">${t(x[0], x[1])}</span>${U().badge(t('Waits for you', 'আপনার অপেক্ষায়'), 'dark')}</div>`).join('')}</div>`)}</div>`;
    wireStrip(el);
    A.on(el, '#ap-view button', 'click', (e, b) => { qs.view = b.dataset.v; A.render(); });
    A.on(el, '[data-kd]', 'click', (e, b) => { qs.kind = b.dataset.kd; A.render(); });
    A.on(el, '[data-apok]', 'click', (e, b) => approve(b.dataset.apok));
    A.on(el, '[data-apno]', 'click', (e, b) => reject(b.dataset.apno));
    A.on(el, '[data-apsee]', 'click', (e, b) => seeDraft(b.dataset.apsee));
    el.querySelector('#dg-on').onchange = (e) => { d.digest.on = e.target.checked; done('AI digest ' + (d.digest.on ? 'on' : 'off'), 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#dg-time').onchange = (e) => { d.digest.time = e.target.value; done('AI digest time ' + d.digest.time, `Digest comes at ${d.digest.time}`, `ডাইজেস্ট আসবে ${d.digest.time}-এ`); };
    el.querySelector('#dg-tg').onchange = (e) => { d.digest.tg = e.target.checked; done('AI digest Telegram ' + d.digest.tg, 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#dg-em').onchange = (e) => { d.digest.email = e.target.checked; done('AI digest email ' + d.digest.email, 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#ap-dig').onclick = () => U().modal(t('Tomorrow’s digest', 'আগামীকালের ডাইজেস্ট'), `<div class="ai-sb">EXTAS · AI ${t('digest', 'ডাইজেস্ট')} · ${d.digest.time}\n\n${t('Waiting for you', 'আপনার অপেক্ষায়')}: ${open.length}\n${open.slice(0, 6).map((x) => '• ' + t(x.en, x.bn) + (x.money ? ' (PIN)' : '')).join('\n')}\n\n${t('Done by the agents yesterday', 'গতকাল এজেন্টরা যা করেছে')}: ${t('scored 41 orders, checked 142 pages, drafted 6 replies', '41টি অর্ডার স্কোর, 142টি পেজ চেক, 6টি উত্তর খসড়া')}\n${t('AI spend this month', 'এই মাসে AI খরচ')}: ${F().tk(A.sum(SD().agents, (a) => a.month))}</div>`, { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>` });
  }
  function item(x) {
    const k = KIND[x.kind]; const ic = { ads: 'marketing', decline: 'orders', block: 'customers', reply: 'inbox', price: 'products', blog: 'website' }[x.kind];
    const st = x.status === 'approved' ? U().badge(t('Approved', 'অনুমোদিত'), 'good') : x.status === 'rejected' ? U().badge(t('Rejected', 'না করা হয়েছে'), 'bad') : '';
    return `<div class="ai-item ${x.status !== 'open' ? 'done' : ''}"><span class="ic">${I(ic)}</span><div style="min-width:0"><h4>${t(x.en, x.bn)}</h4><div class="row small muted" style="gap:6px">${U().badge(t(k[0], k[1]), x.money ? 'warn' : 'info')}<span>${agName(x.by)} · ${F().ago(x.done || x.at)}</span>${x.money ? U().badge('PIN', 'dark') : ''}${st}</div>
      <div class="why"><b>${t('Why', 'কেন')}:</b> ${t(x.why[0], x.why[1])}</div><div class="imp"><b>${t('Effect', 'প্রভাব')}:</b> ${t(x.imp[0], x.imp[1])}</div>${x.note ? `<div class="muted small">${A.esc(x.note)}</div>` : ''}</div>
      <div class="acts">${x.status === 'open' ? `${x.draft ? `<button class="btn sm" data-apsee="${x.id}">${t('Read draft', 'খসড়া পড়ুন')}</button>` : ''}<a class="btn sm ghost" href="${A.href(...x.go)}">${t('Open', 'খুলুন')}</a><button class="btn sm" data-apno="${x.id}">${t('Reject', 'না')}</button><button class="btn sm primary" data-apok="${x.id}">${t('Approve', 'অনুমোদন')}</button>` : `<a class="btn sm ghost" href="${A.href(...x.go)}">${t('Open', 'খুলুন')}</a>`}</div></div>`;
  }
  function apply(x) {
    if (x.kind === 'decline' && x.ref) { const o = A.D.orders.find((y) => y.id === x.ref); if (o && ['new', 'confirmed'].includes(o.status)) { o.status = 'cancelled'; (o.timeline = o.timeline || []).push({ t: A.TODAY.toISOString(), text: 'Cancelled — AI suggestion approved by owner', by: 'You' }); } }
    if (x.kind === 'block' && x.ref) { const c = A.D.customers.find((y) => y.id === x.ref); if (c) { c.tags = c.tags || []; if (!c.tags.includes('Charge first')) c.tags.push('Charge first'); } }
    if (x.kind === 'blog') { const b = (A.D.blog || []).find((y) => /polo size/i.test(y.title || '')); if (b) b.status = 'published'; }
  }
  function approve(id) {
    const x = D().queue.find((y) => y.id === id); if (!x) return;
    const go = () => { apply(x); x.status = 'approved'; x.done = A.TODAY.toISOString(); done('AI suggestion approved: ' + x.en, x.kind === 'reply' ? 'Approved — the reply is sent' : 'Approved — the agent does it now', x.kind === 'reply' ? 'অনুমোদিত — উত্তর পাঠানো হলো' : 'অনুমোদিত — এজেন্ট এখন করবে'); };
    if (x.money) pinAsk(t('Approve a money change?', 'টাকার পরিবর্তন অনুমোদন করবেন?'), `<div class="guide-note">${t(x.en, x.bn)}</div><div class="small">${t(x.imp[0], x.imp[1])}</div>`, t('Approve', 'অনুমোদন'), go);
    else U().confirm(t('Approve?', 'অনুমোদন দেবেন?'), t(x.en, x.bn), t('Approve', 'অনুমোদন'), go);
  }
  function reject(id) {
    const x = D().queue.find((y) => y.id === id); if (!x) return;
    const m = U().modal(t('Reject this idea?', 'এই আইডিয়া না করবেন?'), `<div class="stack"><div class="guide-note">${t(x.en, x.bn)}</div>${U().field(t('Why not? (optional — the agent learns from it)', 'কেন না? (ঐচ্ছিক — এজেন্ট এখান থেকে শেখে)'), `<input class="inp" id="rj-why" placeholder="${t('e.g. Too early, wait for the weekend', 'যেমন: এখনই না, উইকেন্ড পর্যন্ত দেখি')}">`)}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn dark" id="rj-ok">${t('Reject', 'না করুন')}</button>` });
    m.querySelector('#rj-ok').onclick = () => { const w = m.querySelector('#rj-why').value.trim(); x.status = 'rejected'; x.done = A.TODAY.toISOString(); if (w) { x.note = w; D().examples.unshift({ id: A.uid('EX'), t: A.TODAY.toISOString(), by: x.by, was: x.en, now: 'Rejected: ' + w, note: [w, w], on: true }); } U().close(); done('AI suggestion rejected: ' + x.en, 'Rejected — the agent will not do it', 'না করা হলো — এজেন্ট এটা করবে না'); };
  }
  function seeDraft(id) {
    const x = D().queue.find((y) => y.id === id);
    const m = U().modal(t('Draft', 'খসড়া'), `<div class="stack"><div class="muted small">${agName(x.by)} · ${t(x.en, x.bn)}</div><textarea class="inp" id="dr-x" rows="6">${A.esc(x.draft)}</textarea><div class="hint">${t('Edit if you like. Your edit is saved as an example so the agent writes like this next time.', 'চাইলে এডিট করুন। আপনার এডিট উদাহরণ হিসেবে সেভ হয়, পরের বার এজেন্ট এভাবে লিখবে।')}</div></div>`, { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><button class="btn primary" id="dr-ok">${t('Approve this text', 'এই লেখা অনুমোদন')}</button>` });
    m.querySelector('#dr-ok').onclick = () => { const v = m.querySelector('#dr-x').value.trim(); if (v !== x.draft) D().examples.unshift({ id: A.uid('EX'), t: A.TODAY.toISOString(), by: x.by, was: x.draft.slice(0, 80), now: v.slice(0, 80), note: ['Owner edited the draft', 'মালিক খসড়া এডিট করেছেন'], on: true }); x.draft = v; U().close(); apply(x); x.status = 'approved'; x.done = A.TODAY.toISOString(); done('AI draft approved: ' + x.en, 'Approved and sent', 'অনুমোদিত ও পাঠানো হলো'); };
  }

  /* ================= AI agents ================= */
  function renderAgents(el) {
    const set = SD(); const d = D(); const G = set.agents;
    const on = G.filter(running).length; const today = A.sum(G, (a) => a.today); const month = A.sum(G, (a) => a.month);
    const KF = [['health', 'Site health and nightly page check', 'সাইটের অবস্থা ও রাতের পেজ চেক'], ['backup', 'Backup check and alarm', 'ব্যাকআপ চেক ও অ্যালার্ম'], ['score', 'Courier score on new orders', 'নতুন অর্ডারে কুরিয়ার স্কোর'], ['stuck', 'Stuck-parcel alert', 'আটকে থাকা পার্সেলের অ্যালার্ট'], ['digest', 'Daily digest', 'দৈনিক ডাইজেস্ট'], ['replies', 'Reply drafts in Inbox', 'ইনবক্সে উত্তরের খসড়া']];
    el.innerHTML = head('agents', '', t('Seven helpers, each with one job. See what each is doing now, what it costs, and pause it with one tap.', 'সাতজন সহকারী, প্রত্যেকের একটা কাজ। কে এখন কী করছে, কত খরচ, আর এক চাপে পজ।')) +
      `<div class="grid g4" style="margin-bottom:14px">${U().kpi({ label: t('Running now', 'এখন চলছে'), value: `${on} / ${G.length}` })}${U().kpi({ label: t('Spent today', 'আজ খরচ'), value: F().tk(today) })}${U().kpi({ label: t('This month', 'এই মাসে'), value: F().tk(month), sub: t(`of ${F().tk(set.aiCap)} ceiling`, `${F().tk(set.aiCap)} সীমার মধ্যে`) })}${U().kpi({ label: t('Waiting for you', 'আপনার অপেক্ষায়'), value: d.queue.filter((x) => x.status === 'open').length, sub: `<a href="${A.href('ai', 'approvals')}">${t('Approvals', 'অনুমোদন')} →</a>` })}</div>` +
      `<div class="ai-agents">${G.map((a) => { const cap = d.agentCap[a.id] || 1000; const pc = a.month / cap * 100; return `<div class="ai-ag"><div class="row" style="flex-wrap:nowrap;gap:10px"><span class="av">${t(a.n[0], a.n[1])[0]}</span><div class="grow" style="min-width:0"><b>${t(a.n[0], a.n[1])}</b> ${running(a) ? U().badge(t('Running', 'চলছে'), 'good') : U().badge(t('Paused', 'পজ'), '')}<div class="muted small">${t(a.job[0], a.job[1])}</div></div>${U().switch('ag-' + a.id, a.on, `data-ag="${a.id}" aria-label="${t('Pause or run', 'পজ বা চালু')}"`)}</div>
        <div class="now">${I('sparkle', 14)} ${running(a) ? t(a.now[0], a.now[1]) : a.on && !set.aiOn ? t('Waiting — AI is off', 'অপেক্ষায় — AI বন্ধ') : t('Paused', 'পজ করা')}</div>
        <div class="nums"><div>${t('Today', 'আজ')}<b>${F().tk(a.today)}</b></div><div>${t('Month', 'মাস')}<b>${F().tk(a.month)}</b></div><div>${t('Cap', 'সীমা')}<b>${F().tk(cap)}</b></div></div>${U().bar(pc, pc >= 80 ? 'var(--warn)' : 'var(--good)')}
        <div class="sel">${U().select('pv-' + a.id, Object.keys(MODELS).map((p) => [p, p]), a.prov, `data-prov="${a.id}" aria-label="${t('Company', 'কোম্পানি')}"`)}${U().select('md-' + a.id, MODELS[a.prov].map((m) => [m, m]), a.model, `data-model="${a.id}" aria-label="${t('Model', 'মডেল')}"`)}${U().select('sc-' + a.id, SCHED.map((s) => [s[0], t(s[1][0], s[1][1])]), a.sched, `data-sched="${a.id}" aria-label="${t('When it runs', 'কখন চলে')}"`)}</div>
        <label class="row small" style="gap:6px"><input type="checkbox" data-keep="${a.id}" ${a.keep ? 'checked' : ''}> ${t('Keep on when AI is off', 'AI বন্ধ থাকলেও চালু রাখুন')}</label></div>`; }).join('')}</div>` +
      U().card(t('Keep on when AI is off', 'AI বন্ধ থাকলেও যা চলবে'), `<div class="grid g2" style="gap:8px">${KF.map((k) => `<div class="row between" style="flex-wrap:nowrap;gap:10px"><span class="small">${t(k[1], k[2])}</span>${U().switch('kf-' + k[0], d.keepFeat[k[0]], `data-kf="${k[0]}"`)}</div>`).join('')}</div><div class="hint" style="margin-top:8px">${t('These are cheap checks that protect money and orders. Everything else stops when you switch AI off.', 'এগুলো কম খরচের চেক, টাকা ও অর্ডার রক্ষা করে। AI বন্ধ করলে বাকি সব থামে।')}</div>`, { cls: '', sub: t('Pick the few things that must never stop', 'যেগুলো কখনো থামা চলবে না সেগুলো বাছুন') });
    wireStrip(el);
    const G1 = (id) => G.find((g) => g.id === id);
    A.on(el, '[data-ag]', 'change', (e, i) => { const a = G1(i.dataset.ag); a.on = i.checked; done(`Agent ${a.n[0]} ${a.on ? 'on' : 'paused'}`, a.on ? `${a.n[0]} is on` : `${a.n[0]} paused`, a.on ? `${a.n[1]} চালু` : `${a.n[1]} পজ`); });
    A.on(el, '[data-keep]', 'change', (e, i) => { const a = G1(i.dataset.keep); a.keep = i.checked; done(`Agent ${a.n[0]} keep-on ${a.keep}`, 'Saved', 'সেভ হয়েছে'); });
    A.on(el, '[data-prov]', 'change', (e, i) => { const a = G1(i.dataset.prov); a.prov = i.value; a.model = MODELS[a.prov][0]; done(`Agent ${a.n[0]} provider ${a.prov}`, `${a.n[0]} now uses ${a.prov} ${a.model}`, `${a.n[1]} এখন ${a.prov} ${a.model} ব্যবহার করবে`); });
    A.on(el, '[data-model]', 'change', (e, i) => { const a = G1(i.dataset.model); a.model = i.value; done(`Agent ${a.n[0]} model ${a.model}`, 'Model saved', 'মডেল সেভ হয়েছে'); });
    A.on(el, '[data-sched]', 'change', (e, i) => { const a = G1(i.dataset.sched); a.sched = i.value; done(`Agent ${a.n[0]} schedule ${a.sched}`, 'Schedule saved', 'সময় সেভ হয়েছে'); });
    A.on(el, '[data-kf]', 'change', (e, i) => { d.keepFeat[i.dataset.kf] = i.checked; done('AI keep-on feature ' + i.dataset.kf, 'Saved', 'সেভ হয়েছে'); });
  }

  /* ================= Costs & limits ================= */
  function renderCosts(el) {
    const set = SD(); const d = D(); const G = set.agents;
    const days = d.days; const mdays = 30;
    const aiUsed = A.sum(G, (a) => a.month);
    const M = [['ai', 'AI', 'AI', aiUsed, set.aiCap], ['sms', 'SMS', 'SMS', d.used.sms, d.caps.sms], ['wa', 'WhatsApp', 'WhatsApp', d.used.wa, d.caps.wa]];
    const spread = (tot, seed) => { const w = Array.from({ length: days }, (_, i) => 0.7 + ((i * 37 + seed) % 11) / 18); const s = A.sum(w); return w.map((x) => Math.round(tot * x / s)); };
    const cum = (arr) => { let c = 0; return arr.map((x) => (c += x)); };
    const labels = Array.from({ length: days }, (_, i) => String(i + 1));
    const saverCut = Math.round(aiUsed / days * (mdays - days) * 0.35);
    el.innerHTML = head('costs', '', t('A ceiling for each kind of spend, a warning at 80%, and a cheaper mode when money is tight.', 'প্রতিটা খরচের একটা সীমা, 80%-এ সতর্কতা, আর টাকা কম থাকলে কম খরচের মোড।')) +
      M.filter((m) => m[3] / m[4] >= 0.8).map((m) => U().callout(t(`<b>${m[1]}: ${Math.round(m[3] / m[4] * 100)}% of this month’s ceiling used</b> (${F().tk(m[3])} of ${F().tk(m[4])}) with ${mdays - days} days left. At 100% it pauses by itself; order messages switch to the cheapest channel.`, `<b>${m[2]}: এই মাসের সীমার ${Math.round(m[3] / m[4] * 100)}% শেষ</b> (${F().tk(m[4])}-এর ${F().tk(m[3])}), মাসের ${mdays - days} দিন বাকি। 100% হলে নিজে থেমে যায়; অর্ডারের মেসেজ সবচেয়ে কম খরচের চ্যানেলে যায়।`), 'warn', 'warn')).join('') +
      `<div class="grid g3" style="margin:14px 0">${M.map((m) => { const pc = m[3] / m[4] * 100; const proj = Math.round(m[3] / days * mdays); return U().card('', `<div class="ai-meter"><div class="row between"><b>${t(m[1], m[2])}</b><button class="btn sm" data-cap="${m[0]}">${t('Change ceiling', 'সীমা বদলান')}</button></div><div class="kpi-v" style="font-size:24px">${F().tk(m[3])} <span class="muted small">/ ${F().tk(m[4])}</span></div>${U().bar(pc, pc >= 80 ? 'var(--warn)' : 'var(--good)')}<div class="muted small">${t(`${Math.round(pc)}% used · month end at this pace ${F().tk(proj)}`, `${Math.round(pc)}% শেষ · এই গতিতে মাস শেষে ${F().tk(proj)}`)} ${proj > m[4] ? U().badge(t('Will cross', 'পার হবে'), 'bad') : U().badge(t('Within limit', 'সীমার মধ্যে'), 'good')}</div></div>`); }).join('')}</div>` +
      U().card(t('Spend so far this month', 'এই মাসে এ পর্যন্ত খরচ'), A.chart.line({ labels, series: [{ name: 'AI', color: 'var(--c1)', values: cum(spread(aiUsed, 3)) }, { name: 'SMS', color: 'var(--c2)', values: cum(spread(d.used.sms, 5)) }, { name: 'WhatsApp', color: 'var(--c3)', values: cum(spread(d.used.wa, 8)) }], height: 220 }), { sub: t('Running total by day, November', 'দিন ধরে মোট, নভেম্বর') }) +
      `<div class="grid g2" style="margin-top:14px">${U().card(t('Cap per agent', 'এজেন্ট ধরে সীমা'), U().table([
        { h: t('Agent', 'এজেন্ট'), f: (a) => `<b>${t(a.n[0], a.n[1])}</b><div class="muted small">${a.prov} ${a.model}</div>` },
        { h: t('This month', 'এই মাসে'), r: 1, f: (a) => `${F().tk(a.month)}<div style="width:90px;margin-left:auto">${U().bar(a.month / (d.agentCap[a.id] || 1) * 100, a.month / (d.agentCap[a.id] || 1) >= 0.8 ? 'var(--warn)' : 'var(--good)')}</div>` },
        { h: t('Cap', 'সীমা'), r: 1, f: (a) => `<input class="inp" style="width:96px;text-align:right" type="number" min="0" step="100" data-acap="${a.id}" value="${d.agentCap[a.id] || 0}" aria-label="${t('Cap', 'সীমা')}">` },
      ], G.map((a) => ({ ...a, _id: a.id }))) + `<div class="hint" style="margin-top:8px">${t('An agent that reaches its cap pauses until the 1st; the others keep going.', 'সীমায় পৌঁছালে সেই এজেন্ট মাসের 1 তারিখ পর্যন্ত থামে; বাকিরা চলতে থাকে।')}</div>`)}
        ${U().card(t('Cost-saver mode', 'খরচ বাঁচানোর মোড'), `<div class="stack"><div class="row between" style="flex-wrap:nowrap;gap:12px"><div><b>${d.saver ? t('On', 'চালু') : t('Off', 'বন্ধ')}</b><div class="muted small">${t('Smaller models, hourly agents run every 3 hours, no nice-to-have drafts. Order checks and alarms stay as they are.', 'ছোট মডেল, প্রতি ঘণ্টার এজেন্ট 3 ঘণ্টায় একবার, দরকারি নয় এমন খসড়া বন্ধ। অর্ডার চেক ও অ্যালার্ম আগের মতো।')}</div></div>${U().switch('ai-saver', d.saver)}</div><div class="guide-note">${t(`Saves about <b>${F().tk(saverCut)}</b> for the rest of this month.`, `এই মাসের বাকি সময়ে প্রায় <b>${F().tk(saverCut)}</b> বাঁচবে।`)}</div><label class="row small" style="gap:6px"><input type="checkbox" id="ai-autosaver" ${d.autoSaver !== false ? 'checked' : ''}> ${t('Turn on by itself at 80% of the AI ceiling', 'AI সীমার 80%-এ নিজে চালু হবে')}</label></div>`)}</div>`;
    wireStrip(el);
    A.on(el, '[data-cap]', 'click', (e, b) => {
      const k = b.dataset.cap; const m = M.find((x) => x[0] === k); const cur = m[4];
      pinAsk(t(`${m[1]} monthly ceiling`, `${m[2]} মাসিক সীমা`), U().field(t('Ceiling per month (৳)', 'মাসে সর্বোচ্চ (৳)'), `<input class="inp" id="cap-v" type="number" min="0" step="500" value="${cur}">`, t('Warning at 80%. At 100% it pauses by itself.', '80%-এ সতর্কতা। 100%-এ নিজে থামে।')), t('Save', 'সেভ'), (md) => { const v = Math.max(0, +md.querySelector('#cap-v').value || cur); if (k === 'ai') set.aiCap = v; else d.caps[k] = v; done(`${m[1]} ceiling ${cur} → ${v}`, `${m[1]} ceiling is now ${F().tk(v)}`, `${m[2]} সীমা এখন ${F().tk(v)}`); });
    });
    A.on(el, '[data-acap]', 'change', (e, i) => { d.agentCap[i.dataset.acap] = Math.max(0, +i.value || 0); done(`Agent cap ${i.dataset.acap} ${i.value}`, 'Cap saved', 'সীমা সেভ হয়েছে'); });
    el.querySelector('#ai-saver').onchange = (e) => { d.saver = e.target.checked; done('Cost-saver ' + (d.saver ? 'on' : 'off'), d.saver ? 'Cost-saver is on' : 'Cost-saver is off', d.saver ? 'খরচ বাঁচানোর মোড চালু' : 'খরচ বাঁচানোর মোড বন্ধ'); };
    el.querySelector('#ai-autosaver').onchange = (e) => { d.autoSaver = e.target.checked; done('Auto cost-saver ' + d.autoSaver, 'Saved', 'সেভ হয়েছে'); };
  }

  /* ================= Training ================= */
  function sandboxAnswer(msg, ag) {
    const d = D(); const R = A.D.rules; const m = msg.toLowerCase(); const fee = R.delivery;
    const forb = d.forbidden.find((f) => m.includes(f.toLowerCase().split(' ')[0]));
    if (forb) return t(`(Stays away: “${forb}” is a forbidden topic.) Sorry, we can only help with your order and our products.`, `(এড়িয়ে যায়: “${forb}” নিষিদ্ধ বিষয়।) দুঃখিত, আমরা শুধু আপনার অর্ডার ও আমাদের প্রোডাক্ট নিয়ে সাহায্য করতে পারি।`);
    if (/size|সাইজ|মাপ/.test(m)) return 'আপনার বুকের মাপ কত বলবেন? সাধারণত 38–40 ইঞ্চি হলে L, 40–42 হলে XL। সাইজ না মিললে ডেলিভারির 72 ঘণ্টার মধ্যে এক্সচেঞ্জ করতে পারবেন।';
    if (/deliver|ডেলিভারি|charge|চার্জ|কবে/.test(m)) return `ঢাকার ভিতরে ${fee.inside.days} দিনে, চার্জ ৳${fee.inside.fee}; ঢাকার বাইরে ${fee.outside.days} দিনে, চার্জ ৳${fee.outside.fee}।${R.freeDelivery.on ? ` ৳${F().num(R.freeDelivery.over)}-এর বেশি অর্ডারে ডেলিভারি ফ্রি।` : ''}`;
    if (/discount|ছাড়|offer|অফার|কম/.test(m)) return 'এখন চলা অফার: 2 পিসে 5%, 3 পিসে 10% ছাড়। এর বেশি ছাড় চ্যাটে দেওয়া যায় না।';
    if (/defect|ছেঁড়া|ভুল|wrong|damage/.test(m)) return 'দুঃখিত! পণ্যটা ফেরত পাঠান, আমরা ফ্রিতে সঠিক পণ্যটা আবার পাঠিয়ে দেব। অর্ডার নম্বরটা দিন।';
    return `${agName(ag)}: ধন্যবাদ! আপনার প্রশ্নটা আমাদের টিমের কাছে পাঠালাম, একটু পরেই উত্তর দিচ্ছি।`;
  }
  let sbOut = '';
  function renderTrain(el) {
    const set = SD(); const d = D(); const G = set.agents;
    const cur = d.versions.find((v) => v.cur) || d.versions[0];
    el.innerHTML = head('train', '', t('Teach the agents how EXTAS talks and decides. Every change is a new version you can roll back.', 'EXTAS কীভাবে কথা বলে ও সিদ্ধান্ত নেয় তা এজেন্টদের শেখান। প্রতিটা পরিবর্তন নতুন ভার্সন, চাইলে আগেরটায় ফেরা যায়।'), `<span class="muted small">${t('Version', 'ভার্সন')} ${cur ? cur.no : 1}</span>`) +
      U().card(t('Describe a problem in Bengali', 'বাংলায় সমস্যাটা লিখুন'), `<textarea class="inp" id="tq-x" rows="2" placeholder="${t('e.g. Why did returns go up in Chattogram this week?', 'যেমন: এই সপ্তাহে চট্টগ্রামে রিটার্ন বাড়ল কেন?')}"></textarea><div class="row between" style="margin-top:8px">${U().seg('tq-k', [['q', t('Question', 'প্রশ্ন')], ['bug', t('Something is wrong', 'কিছু ভুল')], ['idea', t('Idea', 'আইডিয়া')]], 'q')}<button class="btn primary" id="tq-go">${I('send')}${t('Send to Gyani', 'জ্ঞানীকে পাঠান')}</button></div>
        <div class="list" style="margin-top:10px">${d.asks.slice(0, 4).map((a) => `<div class="li" style="align-items:flex-start"><div class="grow"><b class="small">${A.esc(a.text)}</b><div class="small" style="margin-top:3px">${t(a.reply[0], a.reply[1])}</div></div><span class="muted small">${F().ago(a.t)}</span></div>`).join('')}</div>`, { sub: t('Write the way you speak — the answer comes here and on Telegram', 'যেভাবে কথা বলেন সেভাবে লিখুন — উত্তর এখানে ও Telegram-এ আসবে') }) +
      `<div class="grid g2" style="margin-top:14px">
        ${U().card(t('Your instructions', 'আপনার নির্দেশনা'), `<div class="list ai-tr">${d.instr.filter((x) => !x.archived).map((x) => `<div class="li"><span class="grow small">${A.esc(x.text)}<span class="muted" style="display:block">${F().ago(x.t)}</span></span><button class="btn sm ghost" data-inar="${x.id}">${t('Archive', 'আর্কাইভ')}</button></div>`).join('') || U().empty(t('No instructions yet', 'এখনো কোনো নির্দেশনা নেই'))}</div><div class="row" style="margin-top:8px;flex-wrap:nowrap"><input class="inp" id="in-x" placeholder="${t('Teach all agents a rule…', 'সব এজেন্টকে একটা নিয়ম শেখান…')}"><button class="btn sm primary" id="in-add">${t('Add', 'যোগ')}</button></div>`, { sub: t('All agents follow these every time', 'সব এজেন্ট প্রতিবার এগুলো মানে') })}
        ${U().card(t('Corrections that became examples', 'যে সংশোধন উদাহরণ হয়েছে'), `<div class="list ai-tr">${d.examples.slice(0, 6).map((x) => `<div class="li"><div class="grow small"><div class="muted"><s>${A.esc(x.was)}</s></div><div>→ ${A.esc(x.now)}</div><div class="muted">${agName(x.by)} · ${t(x.note[0], x.note[1])}</div></div>${U().switch('ex-' + x.id, x.on, `data-ex="${x.id}" aria-label="${t('Use', 'ব্যবহার')}"`)}</div>`).join('')}</div>`, { sub: t('Made when you edit a draft or say no with a reason', 'খসড়া এডিট করলে বা কারণসহ “না” বললে তৈরি হয়') })}
      </div>
      <div class="grid g2" style="margin-top:14px">
        ${U().card(t('Extra documents', 'বাড়তি ডকুমেন্ট'), `<div class="list">${d.docs.filter((x) => !x.archived).map((x) => `<div class="li"><span class="grow small"><b>${A.esc(x.name)}</b><span class="muted" style="display:block">${x.size} · ${F().ago(x.t)}</span></span>${U().switch('dc-' + x.id, x.on, `data-dc="${x.id}" aria-label="${t('Use', 'ব্যবহার')}"`)}<button class="btn sm ghost" data-dcar="${x.id}">${t('Archive', 'আর্কাইভ')}</button></div>`).join('')}</div><button class="btn sm" id="dc-add" style="margin-top:8px">${I('plus')}${t('Add document', 'ডকুমেন্ট যোগ')}</button>`, { sub: t('Price lists, fabric guides, policies the agents may read', 'দামের তালিকা, ফেব্রিক গাইড, পলিসি যা এজেন্ট পড়তে পারে') })}
        ${U().card(t('Forbidden topics', 'নিষিদ্ধ বিষয়'), `<div class="chips">${d.forbidden.map((f, i) => `<span class="chip on ai-chipx">${A.esc(f)}<button class="iconbtn" data-fbx="${i}" aria-label="${t('Remove', 'সরান')}" style="width:20px;height:20px">${I('x', 12)}</button></span>`).join('')}</div><div class="row" style="margin-top:8px;flex-wrap:nowrap"><input class="inp" id="fb-x" placeholder="${t('Add a topic to avoid…', 'এড়িয়ে চলার বিষয় যোগ করুন…')}"><button class="btn sm" id="fb-add">${t('Add', 'যোগ')}</button></div>`, { sub: t('Agents politely refuse these in chats and posts', 'চ্যাট ও পোস্টে এজেন্ট ভদ্রভাবে এগুলো এড়ায়') })}
      </div>
      <div class="grid g2" style="margin-top:14px">
        ${U().card(t('Try it safely (sandbox)', 'নিরাপদে চেষ্টা (স্যান্ডবক্স)'), `<div class="stack"><div class="formgrid">${U().field(t('Agent', 'এজেন্ট'), U().select('sb-ag', G.map((a) => [a.id, t(a.n[0], a.n[1])]), 'doot'))}</div>${U().field(t('Customer message', 'কাস্টমারের মেসেজ'), `<input class="inp" id="sb-x" placeholder="ভাই XL সাইজ হবে? সিলেটে ডেলিভারি চার্জ কত?">`)}<div class="row"><button class="btn primary" id="sb-go">${t('Test answer', 'উত্তর দেখুন')}</button><span class="muted small">${t('Nothing is sent. Uses version', 'কিছু পাঠানো হয় না। ভার্সন')} ${cur ? cur.no : 1}</span></div>${sbOut ? `<div class="ai-sb">${A.esc(sbOut)}</div>` : ''}</div>`)}
        ${U().card(t('Version history', 'ভার্সনের ইতিহাস'), `<div class="list ai-ver">${d.versions.map((v) => `<div class="li"><div class="grow"><b class="small">v${v.no}</b> ${v.cur ? U().badge(t('In use', 'চলছে'), 'good') : ''}<div class="small">${t(v.en, v.bn)}</div><div class="muted small">${F().ago(v.t)}</div></div>${v.cur ? '' : `<button class="btn sm" data-rb="${v.no}">${t('Roll back', 'এটায় ফিরুন')}</button>`}</div>`).join('')}</div>`)}
      </div>`;
    wireStrip(el);
    let kind = 'q'; A.on(el, '#tq-k button', 'click', (e, b) => { kind = b.dataset.v; el.querySelectorAll('#tq-k button').forEach((x) => x.classList.toggle('on', x === b)); });
    el.querySelector('#tq-go').onclick = () => { const v = el.querySelector('#tq-x').value.trim(); if (!v) { A.toast(t('Write your question first', 'আগে প্রশ্নটা লিখুন'), 'bad'); return; } d.asks.unshift({ t: A.TODAY.toISOString(), text: v, kind, st: 'open', reply: set.aiOn ? ['Gyani: looking into it — the answer comes here and on Telegram within the hour.', 'জ্ঞানী: দেখছি — এক ঘণ্টার মধ্যে উত্তর এখানে ও Telegram-এ আসবে।'] : ['Saved. AI is off, so Gyani answers when you turn it on.', 'সেভ হলো। AI বন্ধ, চালু করলে জ্ঞানী উত্তর দেবে।'] }); done('Owner question sent to AI', 'Sent to Gyani', 'জ্ঞানীকে পাঠানো হলো'); };
    el.querySelector('#in-add').onclick = () => { const v = el.querySelector('#in-x').value.trim(); if (!v) return; d.instr.unshift({ id: A.uid('IN'), t: A.TODAY.toISOString(), text: v, on: true }); (set.training = set.training || []).unshift({ t: A.TODAY.toISOString(), text: v }); saveVer('Added instruction: ' + v.slice(0, 50), 'নির্দেশনা যোগ: ' + v.slice(0, 50)); done('AI instruction added', 'All agents will follow this', 'সব এজেন্ট এটা মানবে'); };
    A.on(el, '[data-inar]', 'click', (e, b) => { const x = d.instr.find((y) => y.id === b.dataset.inar); x.archived = true; saveVer('Archived instruction', 'নির্দেশনা আর্কাইভ'); done('AI instruction archived', 'Archived — you can roll back in Version history', 'আর্কাইভ হলো — ভার্সনের ইতিহাস থেকে ফেরানো যায়'); });
    A.on(el, '[data-ex]', 'change', (e, i) => { d.examples.find((y) => y.id === i.dataset.ex).on = i.checked; done('AI example ' + i.dataset.ex + ' ' + i.checked, 'Saved', 'সেভ হয়েছে'); });
    A.on(el, '[data-dc]', 'change', (e, i) => { d.docs.find((y) => y.id === i.dataset.dc).on = i.checked; done('AI document use ' + i.checked, 'Saved', 'সেভ হয়েছে'); });
    A.on(el, '[data-dcar]', 'click', (e, b) => { d.docs.find((y) => y.id === b.dataset.dcar).archived = true; done('AI document archived', 'Archived', 'আর্কাইভ হলো'); });
    el.querySelector('#dc-add').onclick = () => { const m = U().modal(t('Add document', 'ডকুমেন্ট যোগ'), `<div class="stack">${U().field(t('File', 'ফাইল'), '<input class="inp" type="file" id="dc-f">', t('PDF, Word, Excel or a photo. Agents read it; customers never see it.', 'PDF, Word, Excel বা ছবি। এজেন্ট পড়ে; কাস্টমার কখনো দেখে না।'))}${U().field(t('Or name it', 'অথবা নাম দিন'), U().input('dc-n', '', `placeholder="${t('e.g. Eid 2027 offer plan', 'যেমন: ঈদ 2027 অফার প্ল্যান')}"`))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="dc-ok">${t('Add', 'যোগ')}</button>` }); m.querySelector('#dc-ok').onclick = () => { const f = m.querySelector('#dc-f').files[0]; const n = (f && f.name) || m.querySelector('#dc-n').value.trim(); if (!n) { A.toast(t('Choose a file or type a name', 'ফাইল বাছুন বা নাম লিখুন'), 'bad'); return; } d.docs.unshift({ id: A.uid('DC'), name: n, size: f ? Math.max(1, Math.round(f.size / 1024)) + ' KB' : '—', t: A.TODAY.toISOString(), on: true }); saveVer('Added document: ' + n, 'ডকুমেন্ট যোগ: ' + n); U().close(); done('AI document added', 'Document added', 'ডকুমেন্ট যোগ হলো'); }; };
    A.on(el, '[data-fbx]', 'click', (e, b) => { const f = d.forbidden.splice(+b.dataset.fbx, 1)[0]; saveVer('Removed forbidden topic: ' + f, 'নিষিদ্ধ বিষয় সরানো: ' + f); done('Forbidden topic removed', 'Removed', 'সরানো হলো'); });
    el.querySelector('#fb-add').onclick = () => { const v = el.querySelector('#fb-x').value.trim(); if (!v) return; d.forbidden.push(v); saveVer('Added forbidden topic: ' + v, 'নিষিদ্ধ বিষয় যোগ: ' + v); done('Forbidden topic added', 'Agents will stay away from it', 'এজেন্টরা এটা এড়িয়ে চলবে'); };
    el.querySelector('#sb-go').onclick = () => { const v = el.querySelector('#sb-x').value.trim() || el.querySelector('#sb-x').placeholder; sbOut = `${t('Customer', 'কাস্টমার')}: ${v}\n\n${agName(el.querySelector('#sb-ag').value)}: ${sandboxAnswer(v, el.querySelector('#sb-ag').value)}`; A.render(); };
    A.on(el, '[data-rb]', 'click', (e, b) => U().confirm(t(`Roll back to v${b.dataset.rb}?`, `v${b.dataset.rb}-এ ফিরবেন?`), t('Agents use that version from the next task. Newer versions stay in the list.', 'পরের কাজ থেকে এজেন্ট ওই ভার্সন ব্যবহার করবে। নতুন ভার্সনগুলো তালিকায় থেকে যাবে।'), t('Roll back', 'ফিরুন'), () => { d.versions.forEach((v) => (v.cur = String(v.no) === b.dataset.rb)); done('AI training rolled back to v' + b.dataset.rb, `Now using v${b.dataset.rb}`, `এখন v${b.dataset.rb} চলছে`); }));
  }

  /* ================= register ================= */
  const G = (en, bn) => ({ en, bn });
  // make the queue (and the menu count) exist from the first page load
  setTimeout(() => { try { if (A.D && !A.D.ai) { D(); A.save(); if (A.ready) A.render(); } } catch (e) {} }, 0);
  A.aiCounts = () => (A.D.ai ? A.D.ai.queue.filter((x) => x.status === 'open').length : 0);
  A.mod('ai', {
    approvals: { render: renderApprovals, guide: G(
      '<p><b>What:</b> one list of everything the AI wants to do — ad budget changes, order declines, customer limits, replies to customers, price and offer ideas, blog drafts — each with why and what it changes.</p><p><b>Why:</b> the AI saves you time but never decides alone. Example: Tirondaj sees the polo ad earning ৳4.6 per ৳1 and asks to raise the budget; it waits for your Approve and PIN.</p><p><b>How:</b> read “Why” and “Effect”, tap Approve or Reject. Money items ask for your PIN. Turn on the daily digest to get the list on Telegram each morning.</p><p><b>Common mistakes:</b> rejecting without a reason — one short line teaches the agent.</p>',
      '<p><b>কী:</b> AI যা করতে চায় সব এক তালিকায় — বিজ্ঞাপন বাজেট, অর্ডার বাতিল, কাস্টমার সীমা, কাস্টমারকে উত্তর, দাম ও অফার আইডিয়া, ব্লগ খসড়া — প্রতিটার কারণ ও প্রভাবসহ।</p><p><b>কেন:</b> AI সময় বাঁচায় কিন্তু নিজে সিদ্ধান্ত নেয় না। যেমন: তীরন্দাজ দেখল পোলোর বিজ্ঞাপনে ৳1-এ ৳4.6 আসছে, বাজেট বাড়াতে চায়; আপনার অনুমোদন ও PIN-এর অপেক্ষায় থাকে।</p><p><b>কীভাবে:</b> “কেন” ও “প্রভাব” পড়ুন, অনুমোদন বা না চাপুন। টাকার বিষয়ে PIN লাগে। প্রতিদিন সকালে Telegram-এ তালিকা পেতে দৈনিক ডাইজেস্ট চালু করুন।</p><p><b>সাধারণ ভুল:</b> কারণ ছাড়া “না” বলা — এক লাইন লিখলেই এজেন্ট শেখে।</p>') },
    agents: { render: renderAgents, guide: G(
      '<p><b>What:</b> the 7 agents, what each is doing now, today’s and this month’s spend, company and model, when it runs, and a pause switch.</p><p><b>Why:</b> you stay in charge of every helper. Example: during Eid you pause Shilpi (design checks) and keep Sawdagor (order scoring) running.</p><p><b>How:</b> flip the switch to pause; change the model or schedule from the three boxes; tick “Keep on when AI is off” for checks that must never stop.</p><p><b>Common mistakes:</b> picking the biggest model for every agent — cost goes up with little gain.</p>',
      '<p><b>কী:</b> 7টি এজেন্ট, কে এখন কী করছে, আজ ও এই মাসের খরচ, কোম্পানি ও মডেল, কখন চলে, আর পজ সুইচ।</p><p><b>কেন:</b> প্রতিটা সহকারী আপনার নিয়ন্ত্রণে থাকে। যেমন: ঈদের সময় শিল্পী (ডিজাইন চেক) পজ করে সওদাগর (অর্ডার স্কোর) চালু রাখুন।</p><p><b>কীভাবে:</b> সুইচ দিয়ে পজ করুন; তিনটা বক্স থেকে মডেল বা সময় বদলান; যে চেক কখনো থামা চলবে না সেখানে “AI বন্ধ থাকলেও চালু রাখুন” টিক দিন।</p><p><b>সাধারণ ভুল:</b> সব এজেন্টে সবচেয়ে বড় মডেল দেওয়া — খরচ বাড়ে, লাভ কম।</p>') },
    costs: { render: renderCosts, guide: G(
      '<p><b>What:</b> a monthly ceiling for AI, SMS and WhatsApp, a running chart, a cap per agent and cost-saver mode.</p><p><b>Why:</b> a busy sale month can double message costs. Example: at 80% of the WhatsApp ceiling you get a warning, and order messages move to SMS at 100%.</p><p><b>How:</b> press “Change ceiling” (PIN), type caps per agent, turn on cost-saver when money is tight.</p><p><b>Common mistakes:</b> setting the ceiling below what order messages need — keep room for confirmations.</p>',
      '<p><b>কী:</b> AI, SMS ও WhatsApp-এর মাসিক সীমা, খরচের চার্ট, এজেন্ট ধরে সীমা আর খরচ বাঁচানোর মোড।</p><p><b>কেন:</b> সেলের মাসে মেসেজের খরচ দ্বিগুণ হতে পারে। যেমন: WhatsApp সীমার 80%-এ সতর্কতা আসে, 100%-এ অর্ডারের মেসেজ SMS-এ যায়।</p><p><b>কীভাবে:</b> “সীমা বদলান” চাপুন (PIN), এজেন্টের সীমা লিখুন, টাকা কম থাকলে খরচ বাঁচানোর মোড চালু করুন।</p><p><b>সাধারণ ভুল:</b> অর্ডারের মেসেজের দরকারের চেয়ে কম সীমা দেওয়া — কনফার্মেশনের জন্য জায়গা রাখুন।</p>') },
    train: { render: renderTrain, guide: G(
      '<p><b>What:</b> your instructions, corrections that became examples, extra documents, forbidden topics, a safe test box, version history and a box to describe a problem in Bengali.</p><p><b>Why:</b> the agents should talk like EXTAS. Example: you edit a stiff reply to “ভাই, দুঃখিত!” — next time the agent writes that way.</p><p><b>How:</b> add a rule, try a customer message in the sandbox, roll back if a change made answers worse.</p><p><b>Common mistakes:</b> long rules with many ideas — one rule per line works best.</p>',
      '<p><b>কী:</b> আপনার নির্দেশনা, উদাহরণ হয়ে যাওয়া সংশোধন, বাড়তি ডকুমেন্ট, নিষিদ্ধ বিষয়, নিরাপদ টেস্ট বক্স, ভার্সনের ইতিহাস আর বাংলায় সমস্যা লেখার বক্স।</p><p><b>কেন:</b> এজেন্ট যেন EXTAS-এর মতো কথা বলে। যেমন: শক্ত একটা উত্তর এডিট করে “ভাই, দুঃখিত!” লিখলেন — পরের বার এজেন্ট এভাবেই লিখবে।</p><p><b>কীভাবে:</b> নিয়ম যোগ করুন, স্যান্ডবক্সে কাস্টমারের মেসেজ দিয়ে দেখুন, উত্তর খারাপ হলে আগের ভার্সনে ফিরুন।</p><p><b>সাধারণ ভুল:</b> এক নিয়মে অনেক কথা — এক লাইনে একটা নিয়ম সবচেয়ে ভালো কাজ করে।</p>') },
  });
})();
