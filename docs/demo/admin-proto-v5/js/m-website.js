/* EXTAS admin prototype — Website: page layouts, shop text, policies, blog, SEO & Google ranking. */
(function () {
  'use strict';
  const t = (en, bn) => A.t(en, bn);
  const U = () => A.ui;
  const F = () => A.fmt;

  A.css('web', `
  .web-lay{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}
  .web-sec{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card);margin-bottom:8px}
  .web-sec.off{opacity:.55;background:var(--card2)}
  @media (max-width:560px){.web-sec{flex-wrap:wrap;gap:8px}.web-sec .grow{flex-basis:calc(100% - 40px)}.web-sec .ud{margin-left:auto}}
  .web-sec .n{width:24px;height:24px;border-radius:50%;background:var(--card2);display:grid;place-items:center;font-size:11.5px;font-weight:700;flex:none}
  .web-sec .ud{display:flex;gap:4px}
  .web-sec .ud button{width:30px;height:30px;border-radius:8px;border:1px solid var(--line2);background:var(--card);cursor:pointer;font-weight:700}
  .web-sec .ud button[disabled]{opacity:.35;cursor:default}
  .web-phone{position:sticky;top:70px;width:280px;margin:0 auto;border:8px solid var(--ink);border-radius:30px;background:var(--card);overflow:hidden;height:560px;display:flex;flex-direction:column}
  .web-phone .bar{background:var(--navy);color:#fff;font-size:10px;text-align:center;padding:4px}
  .web-phone .hdr{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;font:700 13px var(--f-head);letter-spacing:.08em;border-bottom:1px solid var(--line)}
  .web-phone .scr{overflow-y:auto;flex:1;padding:8px;display:flex;flex-direction:column;gap:10px;scrollbar-width:none}
  .web-phone .blk{border-radius:10px}
  .web-phone .ttl{font-size:11px;font-weight:700;margin-bottom:5px}
  .web-phone .hero{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;padding:18px 12px;border-radius:10px}
  .web-phone .hero b{display:block;font:700 16px var(--f-head)} .web-phone .hero small{opacity:.8;font-size:10px;display:block;margin:3px 0 8px}
  .web-phone .hero span{background:var(--accent);color:#fff;font-size:10px;padding:4px 9px;border-radius:6px;font-weight:700}
  .web-phone .row3{display:grid;grid-template-columns:repeat(3,1fr);gap:5px} .web-phone .row2{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}
  .web-phone .row3 .thumb,.web-phone .row2 .thumb{width:100%!important;height:auto!important;aspect-ratio:1}
  .web-phone .pc{font-size:9.5px;line-height:1.2} .web-phone .pc b{display:block;font-size:10px}
  .web-phone .cat{background:var(--card2);border-radius:8px;font-size:9.5px;padding:6px 4px;text-align:center}
  .web-phone .ig{aspect-ratio:1;border-radius:6px;background:color-mix(in srgb,var(--c5) 25%,var(--card2))}
  .web-txt{display:grid;grid-template-columns:160px minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:start;padding:10px 0;border-bottom:1px solid var(--line)}
  .web-txt:last-child{border-bottom:0}
  .web-txt textarea{min-height:40px;resize:vertical}
  .web-serp{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--card)}
  .web-serp .u{font-size:12px;color:var(--good)} .web-serp .h{color:var(--info);font-size:16px;margin:2px 0} .web-serp .d{font-size:12.5px;color:var(--ink2)}
  .web-score{display:flex;align-items:center;gap:16px}
  .web-score .ring{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;flex:none;font:700 26px var(--f-head)}
  .web-pos{display:inline-block;min-width:34px;text-align:center;font-weight:700;border-radius:8px;padding:2px 6px;background:var(--card2)}
  .web-pos.t3{background:var(--good-soft);color:var(--good)} .web-pos.t10{background:var(--info-soft);color:var(--info)}
  @media (max-width:1100px){.web-lay{grid-template-columns:minmax(0,1fr)}.web-phone{position:static}}
  @media (max-width:700px){.web-txt{grid-template-columns:1fr}}
  `);

  function W() {
    const D = A.D;
    if (D.web && D.web.v === 1) return D.web;
    D.web = {
      v: 1,
      page: 'home',
      sections: {
        home: [
          { id: 'hero', en: 'Hero slider', bn: 'হিরো স্লাইডার', on: true },
          { id: 'trust', en: 'Trust strip (COD, 72-hour exchange)', bn: 'ভরসার লাইন (COD, 72 ঘণ্টা এক্সচেঞ্জ)', on: true },
          { id: 'newin', en: 'New in', bn: 'নতুন এসেছে', on: true },
          { id: 'cats', en: 'Categories', bn: 'ক্যাটাগরি', on: true },
          { id: 'best', en: 'Best sellers', bn: 'বেস্ট সেলার', on: true },
          { id: 'combos', en: 'Combos & sets', bn: 'কম্বো ও সেট', on: true },
          { id: 'reviews', en: 'Customer reviews', bn: 'কাস্টমার রিভিউ', on: true },
          { id: 'insta', en: 'Instagram photos', bn: 'Instagram ছবি', on: false },
          { id: 'blog', en: 'From the blog', bn: 'ব্লগ থেকে', on: false },
        ],
        product: [
          { id: 'gallery', en: 'Photo gallery', bn: 'ছবির গ্যালারি', on: true },
          { id: 'size', en: 'Size help & chart', bn: 'সাইজ সাহায্য ও চার্ট', on: true },
          { id: 'trust', en: 'Trust strip (COD, 72-hour exchange)', bn: 'ভরসার লাইন (COD, 72 ঘণ্টা এক্সচেঞ্জ)', on: true },
          { id: 'combos', en: 'Buy together (combo)', bn: 'একসাথে কিনুন (কম্বো)', on: true },
          { id: 'reviews', en: 'Customer reviews', bn: 'কাস্টমার রিভিউ', on: true },
          { id: 'qa', en: 'Questions & answers', bn: 'প্রশ্ন ও উত্তর', on: true },
          { id: 'similar', en: 'You may also like', bn: 'আরও পছন্দ হতে পারে', on: true },
        ],
      },
      hero: { title: 'Winter Polo 2026', sub: 'Soft piqué cotton · 72-hour exchange', btn: 'Shop polos', link: '/collections/polo', slides: 3 },
      texts: [
        { k: 'search', g: 'Header', en: 'Search shirts, polos, panjabi…', bn: 'শার্ট, পোলো, পাঞ্জাবি খুঁজুন…' },
        { k: 'cart', g: 'Header', en: 'Your bag', bn: 'আপনার ব্যাগ' },
        { k: 'add', g: 'Buttons', en: 'Add to bag', bn: 'ব্যাগে যোগ করুন' },
        { k: 'buy', g: 'Buttons', en: 'Order now', bn: 'এখনই অর্ডার করুন' },
        { k: 'size', g: 'Buttons', en: 'Find my size', bn: 'আমার সাইজ খুঁজুন' },
        { k: 'notify', g: 'Buttons', en: 'Tell me when back', bn: 'স্টকে এলে জানান' },
        { k: 'cod', g: 'Checkout', en: 'Pay cash when the parcel arrives. Please keep your phone on — we call once to confirm.', bn: 'পার্সেল হাতে পেয়ে টাকা দিন। ফোন চালু রাখুন — কনফার্ম করতে একবার কল করব।' },
        { k: 'adv', g: 'Checkout', en: 'For this order please pay the delivery charge first by bKash or Nagad.', bn: 'এই অর্ডারে আগে bKash বা Nagad-এ ডেলিভারি চার্জ দিন।' },
        { k: 'thanks', g: 'Checkout', en: 'Thank you! We will call you within 2 hours to confirm.', bn: '' },
        { k: 'foot', g: 'Footer', en: 'Made in Bangladesh for Bangladeshi weather.', bn: 'বাংলাদেশের আবহাওয়ার জন্য, বাংলাদেশে তৈরি।' },
        { k: 'help', g: 'Footer', en: 'Need help? Call 09610-000000 (10 AM – 10 PM)', bn: '' },
      ],
      policies: {
        delivery: { auto: true, en: '', bn: '', updated: '2026-11-01' },
        exchange: { auto: true, en: '', bn: '', updated: '2026-11-01' },
        privacy: { auto: false, en: 'We collect your name, phone and address only to deliver your order. We never sell your data. Payment details are handled by bKash, Nagad or the card gateway and never stored by us. You can ask us to remove your account any time by calling 09610-000000.', bn: 'শুধু অর্ডার পৌঁছে দিতে আমরা আপনার নাম, ফোন ও ঠিকানা নিই। আপনার তথ্য কখনো বিক্রি করি না। পেমেন্টের তথ্য bKash, Nagad বা কার্ড গেটওয়ে দেখে, আমরা রাখি না। যেকোনো সময় 09610-000000 নম্বরে কল করে অ্যাকাউন্ট মুছতে বলতে পারেন।', updated: '2026-09-14' },
        terms: { auto: false, en: 'Prices are in Taka and include VAT. Colours may look slightly different on screen. An order is final after our confirmation call. We may cancel orders with wrong phone numbers or addresses.', bn: 'দাম টাকায়, ভ্যাট সহ। স্ক্রিনে রং সামান্য আলাদা দেখাতে পারে। আমাদের কনফার্মেশন কলের পরে অর্ডার চূড়ান্ত। ভুল ফোন নম্বর বা ঠিকানার অর্ডার বাতিল হতে পারে।', updated: '2026-09-14' },
      },
      policy: 'delivery',
      redirects: [
        { id: 'RD1', from: '/product/navy-polo-shirt/', to: '/products/essential-pique-polo', hits: 214, on: true },
        { id: 'RD2', from: '/product-category/panjabi/', to: '/collections/panjabi', hits: 388, on: true },
        { id: 'RD3', from: '/shop/', to: '/collections/all', hits: 1210, on: true },
        { id: 'RD4', from: '/my-account/orders/', to: '/account/orders', hits: 96, on: true },
      ],
      suggested: [['/product/white-oxford-shirt/', '/products/oxford-cotton-shirt'], ['/product-category/t-shirt/', '/collections/tshirt'], ['/product/black-hoodie-320gsm/', '/products/heavyweight-hoodie-320-gsm'], ['/cart/', '/cart'], ['/checkout/', '/checkout'], ['/product-category/denim/', '/collections/denim'], ['/product/chino-pant-khaki/', '/products/slim-chino-trousers'], ['/product-category/jogger/', '/collections/jogger'], ['/size-guide/', '/pages/size-chart'], ['/return-policy/', '/pages/exchange'], ['/product/katua-printed/', '/products/printed-katua'], ['/blog/polo-size/', '/blog/how-to-choose-the-right-polo-size']],
      sitemap: { sent: '2026-11-01', read: 198 },
      kwF: 'all',
      blogF: 'all',
    };
    return D.web;
  }
  const OK_BN = { S1: 'সব প্রোডাক্টের ছবিতে অল্ট টেক্সট আছে', S2: 'সব প্রোডাক্টে মেটা বিবরণ আছে', S3: 'সব কালেকশন পেজে যথেষ্ট লেখা আছে', S5: 'সব পুরনো WordPress লিংক নতুন পেজে যায়' };
  const ISSUE_BN = { S1: 'অল্ট টেক্সট ছাড়া প্রোডাক্টের ছবি', S2: 'মেটা বিবরণ ছাড়া প্রোডাক্ট', S3: 'কম লেখা আছে এমন কালেকশন পেজ (120 শব্দের কম)', S4: 'গুগলে সাইটম্যাপ পাঠানো হয়েছে · 1 নভেম্বর', S5: 'রিডাইরেক্ট ছাড়া পুরনো WordPress লিংক (404)', S6: 'ফোনে পেজ স্পিড: ভালো (LCP 1.9 সেকেন্ড)' };

  /* ================= Page layouts ================= */
  function phonePreview(list) {
    const P = A.D.products.filter((p) => p.status === 'live');
    const best = P.slice().sort((a, b) => b.sold30 - a.sold30);
    const newest = P.slice().sort((a, b) => new Date(b.created) - new Date(a.created));
    const h = W().hero; const r = A.D.rules;
    const pc = (p) => `<div class="pc">${U().thumb(p, 60)}<b class="ellip">${A.esc(p.name)}</b>${F().tk(p.price)}</div>`;
    const blk = {
      hero: () => `<div class="hero"><b>${A.esc(h.title)}</b><small>${A.esc(h.sub)}</small><span>${A.esc(h.btn)}</span><div style="margin-top:8px;display:flex;gap:3px">${Array.from({ length: h.slides }, (_, i) => `<i style="width:${i ? 6 : 14}px;height:4px;border-radius:2px;background:#fff;opacity:${i ? 0.5 : 1}"></i>`).join('')}</div></div>`,
      trust: () => `<div class="row3" style="font-size:9px;text-align:center">${[t('Cash on delivery', 'ক্যাশ অন ডেলিভারি'), r.exchange.on ? t(`${r.exchange.hours}-hour exchange`, `${r.exchange.hours} ঘণ্টায় এক্সচেঞ্জ`) : t('Quality checked', 'মান যাচাই করা'), r.freeDelivery.on ? t(`Free over ৳${F().num(r.freeDelivery.over)}`, `৳${F().num(r.freeDelivery.over)}+ ফ্রি`) : t('Fast delivery', 'দ্রুত ডেলিভারি')].map((x) => `<div class="cat">${x}</div>`).join('')}</div>`,
      newin: () => `<div><div class="ttl">${t('New in', 'নতুন এসেছে')}</div><div class="row3">${newest.slice(0, 3).map(pc).join('')}</div></div>`,
      cats: () => `<div><div class="ttl">${t('Categories', 'ক্যাটাগরি')}</div><div class="row3">${A.CATS.slice(0, 6).map((c) => `<div class="cat">${A.t(c.en, c.bn)}</div>`).join('')}</div></div>`,
      best: () => `<div><div class="ttl">${t('Best sellers', 'বেস্ট সেলার')}</div><div class="row2">${best.slice(0, 4).map(pc).join('')}</div></div>`,
      combos: () => `<div class="blk" style="background:var(--accent-soft);padding:10px;font-size:10px"><b style="font-size:11px">${t('Any 3 tees, 10% off', 'যেকোনো 3টি টি-শার্টে 10% ছাড়')}</b><div class="muted">${t('Mix colours and sizes', 'রং ও সাইজ মিলিয়ে নিন')}</div></div>`,
      reviews: () => `<div class="blk" style="background:var(--card2);padding:10px;font-size:10px"><b style="color:var(--warn)">★★★★★</b> “${A.esc((A.D.reviews.find((x) => x.rating === 5) || { text: '' }).text)}”</div>`,
      insta: () => `<div><div class="ttl">@extas.bd</div><div class="row3">${'<div class="ig"></div>'.repeat(6)}</div></div>`,
      blog: () => `<div class="blk" style="border:1px solid var(--line);padding:8px;font-size:10px"><b>${A.esc((A.D.blog.find((b) => b.status === 'published') || { title: '' }).title)}</b></div>`,
      gallery: () => `<div>${U().thumb(best[0], 240)}</div>`,
      size: () => `<div class="row3">${['M', 'L', 'XL'].map((s) => `<div class="cat"><b>${s}</b></div>`).join('')}</div>`,
      qa: () => `<div class="blk" style="background:var(--card2);padding:8px;font-size:10px"><b>Q:</b> ${A.esc(A.D.questions[0].text)}</div>`,
      similar: () => `<div><div class="ttl">${t('You may also like', 'আরও পছন্দ হতে পারে')}</div><div class="row3">${best.slice(4, 7).map(pc).join('')}</div></div>`,
    };
    return `<div class="web-phone"><div class="bar">${A.esc(r.notice.on ? r.notice.text : '')}</div><div class="hdr"><span style="width:16px;height:16px;display:inline-block">${A.icon('menu')}</span>EXTAS<span style="width:16px;height:16px;display:inline-block">${A.icon('orders')}</span></div><div class="scr">${list.filter((s) => s.on).map((s) => (blk[s.id] ? blk[s.id]() : '')).join('')}<div class="muted" style="font-size:9px;text-align:center">${t('Footer', 'ফুটার')}</div></div></div>`;
  }
  function renderLayout(el) {
    const w = W(); const list = w.sections[w.page];
    el.innerHTML = A.pageHead(t('Page layouts', 'পেজ লেআউট'), t('Choose which blocks show on the shop and in what order. The phone on the right updates as you change it.', 'দোকানে কোন অংশ কোন ক্রমে দেখাবে তা ঠিক করুন। ডানের ফোনে সাথে সাথে বদল দেখবেন।'), `<button class="btn" id="wl-view">${A.icon('ext')}${t('View on shop', 'দোকানে দেখুন')}</button>`) + A.tabsBar('website', 'layout') +
      `<div class="web-lay"><div class="stack">
        <div class="row between">${U().seg('wl-page', [['home', t('Home page', 'হোমপেজ')], ['product', t('Product page', 'প্রোডাক্ট পেজ')]], w.page)}<span class="muted small">${t(`${list.filter((s) => s.on).length} of ${list.length} blocks showing`, `${list.length}টির মধ্যে ${list.filter((s) => s.on).length}টি দেখাচ্ছে`)}</span></div>
        ${U().card('', list.map((s, i) => `<div class="web-sec ${s.on ? '' : 'off'}"><span class="n">${i + 1}</span><div class="grow" style="min-width:0"><b>${t(s.en, s.bn)}</b>${s.id === 'hero' ? `<div class="muted small ellip">${A.esc(w.hero.title)} · ${w.hero.slides} ${t('slides', 'স্লাইড')}</div>` : ''}</div>${s.id === 'hero' ? `<button class="btn sm" id="wl-hero">${A.icon('edit')}${t('Edit', 'এডিট')}</button>` : ''}<div class="ud"><button data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button data-dn="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button></div>${U().switch('ws-' + s.id, s.on, `data-sw="${i}"`)}</div>`).join(''), { cls: 'flat' })}
        ${U().callout(t('Tip: on phones most visitors never scroll past the 4th block. Keep Best sellers in the top 4.', 'টিপস: ফোনে বেশিরভাগ ভিজিটর 4র্থ অংশের পরে স্ক্রল করেন না। বেস্ট সেলার ওপরের 4টির মধ্যে রাখুন।'))}
      </div><div>${phonePreview(list)}</div></div>`;
    const mv = (i, d) => { const j = i + d; [list[i], list[j]] = [list[j], list[i]]; A.commit(`Layout: ${list[j].en} moved ${d < 0 ? 'up' : 'down'}`); A.toast(t('Order saved — live on the shop', 'ক্রম সেভ হয়েছে — দোকানে লাইভ'), 'good'); A.render(); };
    A.on(el, '[data-up]', 'click', (e, b) => mv(Number(b.dataset.up), -1));
    A.on(el, '[data-dn]', 'click', (e, b) => mv(Number(b.dataset.dn), 1));
    A.on(el, '[data-sw]', 'change', (e, i) => { const s = list[Number(i.dataset.sw)]; s.on = i.checked; A.commit(`Layout: ${s.en} ${s.on ? 'shown' : 'hidden'}`); A.toast(s.on ? t('Block shown', 'অংশ দেখানো হচ্ছে') : t('Block hidden', 'অংশ লুকানো হলো'), 'good'); A.render(); });
    A.on(el, '#wl-page button', 'click', (e, b) => { w.page = b.dataset.v; A.save(); A.render(); });
    el.querySelector('#wl-view').onclick = () => A.toast(t('Opens extas.com.bd in a new tab', 'নতুন ট্যাবে extas.com.bd খুলবে'));
    const hb = el.querySelector('#wl-hero');
    if (hb) hb.onclick = () => {
      const h = w.hero;
      const m = U().modal(t('Edit hero slider', 'হিরো স্লাইডার এডিট'), `<div class="row" style="flex-wrap:nowrap;gap:12px"><div style="width:120px;height:80px;border-radius:10px;border:2px dashed var(--line2);display:grid;place-items:center;color:var(--muted);font-size:12px;text-align:center;flex:none">${t('Photo 1600×900', 'ছবি 1600×900')}<br><button class="linkbtn" id="hr-img">${t('Change', 'বদলান')}</button></div><div class="muted small">${t('Use a bright photo with the model on the right — text sits on the left. Phone crop is shown automatically.', 'ডানে মডেল থাকা উজ্জ্বল ছবি দিন — লেখা বাঁয়ে বসে। ফোনের জন্য কাটা অংশ নিজে থেকেই দেখাবে।')}</div></div>
        <div class="formgrid">${U().field(t('Title', 'শিরোনাম'), U().input('hr-t', h.title))}${U().field(t('Small text', 'ছোট লেখা'), U().input('hr-s', h.sub))}${U().field(t('Button text', 'বাটনের লেখা'), U().input('hr-b', h.btn))}${U().field(t('Button opens', 'বাটন খুলবে'), U().select('hr-l', [['/collections/polo', t('Polo collection', 'পোলো কালেকশন')], ['/collections/panjabi', t('Panjabi collection', 'পাঞ্জাবি কালেকশন')], ['/collections/hoodie', t('Hoodies', 'হুডি')], ['/collections/new', t('New in', 'নতুন এসেছে')], ['/lp/winter-polo', 'Landing: Winter Polo']], h.link))}${U().field(t('Slides', 'স্লাইড সংখ্যা'), U().select('hr-n', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], h.slides))}</div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="hr-ok">${t('Save and publish', 'সেভ করে পাবলিশ')}</button>` });
      m.querySelector('#hr-img').onclick = () => A.toast(t('Opens your photo library — in the real admin', 'আসল অ্যাডমিনে ফটো লাইব্রেরি খুলবে'));
      m.parentElement.querySelector('#hr-ok').onclick = () => { const v = (id) => m.querySelector(id).value.trim(); if (!v('#hr-t')) { A.toast(t('Title cannot be empty', 'শিরোনাম খালি রাখা যাবে না'), 'bad'); return; } Object.assign(h, { title: v('#hr-t'), sub: v('#hr-s'), btn: v('#hr-b') || 'Shop now', link: v('#hr-l'), slides: Number(v('#hr-n')) }); U().close(); A.commit('Hero slider updated'); A.toast(t('Hero updated on the shop', 'দোকানে হিরো আপডেট হয়েছে'), 'good'); A.render(); };
    };
  }

  /* ================= Shop text ================= */
  let txtQ = '', txtMissing = false;
  function renderText(el) {
    const w = W(); const miss = w.texts.filter((x) => !x.bn.trim()).length;
    const list = w.texts.filter((x) => (!txtMissing || !x.bn.trim()) && (!txtQ || (x.en + ' ' + x.bn).toLowerCase().includes(txtQ.toLowerCase())));
    const groups = A.groupBy(list, (x) => x.g);
    const GN = { Header: ['Header', 'হেডার'], Buttons: ['Buttons', 'বাটন'], Checkout: ['Checkout notes', 'চেকআউটের নোট'], Footer: ['Footer', 'ফুটার'] };
    el.innerHTML = A.pageHead(t('Shop text', 'দোকানের লেখা'), t('Every short text customers read on the shop, in English and Bengali side by side.', 'দোকানে কাস্টমার যত ছোট লেখা পড়েন, ইংরেজি ও বাংলা পাশাপাশি।'), `<button class="btn primary" id="tx-save">${t('Save all', 'সব সেভ')}</button>`) + A.tabsBar('website', 'text') +
      (miss ? U().callout(t(`<b>${miss} texts have no Bengali.</b> Bengali visitors will see English there.`, `<b>${miss}টি লেখার বাংলা নেই।</b> বাংলা ভিজিটররা সেখানে ইংরেজি দেখবেন।`), 'warn', 'warn') : U().callout(t('Every text has both languages.', 'প্রতিটা লেখা দুই ভাষাতেই আছে।'), 'good', 'check')) +
      U().callout(t('The notice bar at the very top of the shop is set in Rules › Pop-ups & notices.', 'দোকানের একদম ওপরের নোটিশ বার নিয়ম › পপ-আপ ও নোটিশ থেকে ঠিক হয়।') + ` <a class="linkbtn" href="${A.href('rules', 'popups')}">${t('Open', 'খুলুন')} →</a>`) +
      `<div class="row"><input class="inp" id="tx-q" placeholder="${t('Search text…', 'লেখা খুঁজুন…')}" value="${A.esc(txtQ)}" style="max-width:320px"><button class="chip ${txtMissing ? 'on' : ''}" id="tx-miss">${t('Missing Bengali', 'বাংলা নেই')}<span class="c">${miss}</span></button></div>` +
      (list.length ? Object.keys(groups).map((g) => U().card(t(GN[g][0], GN[g][1]), `<div class="web-txt hide-sm" style="padding-top:0"><span class="lbl">${t('Where', 'কোথায়')}</span><span class="lbl">English</span><span class="lbl">বাংলা</span></div>` + groups[g].map((x) => `<div class="web-txt"><span class="small muted">${A.esc(x.k === 'thanks' ? t('After order is placed', 'অর্ডারের পরে') : x.k === 'help' ? t('Help line', 'হেল্প লাইন') : x.en.split(' ').slice(0, 3).join(' ') + '…')}</span><textarea class="inp" data-en="${x.k}" rows="1">${A.esc(x.en)}</textarea><textarea class="inp" data-bn="${x.k}" rows="1" placeholder="${t('Bengali missing — write it here', 'বাংলা নেই — এখানে লিখুন')}" style="${x.bn.trim() ? '' : 'border-color:var(--warn)'}">${A.esc(x.bn)}</textarea></div>`).join(''))).join('') : U().card('', U().empty(t('No text matches', 'কোনো লেখা মেলেনি'))));
    const q = el.querySelector('#tx-q'); q.oninput = () => { txtQ = q.value; A.render(); const n = document.querySelector('#tx-q'); n.focus(); n.setSelectionRange(txtQ.length, txtQ.length); };
    el.querySelector('#tx-miss').onclick = () => { txtMissing = !txtMissing; A.render(); };
    el.querySelector('#tx-save').onclick = () => {
      let n = 0;
      el.querySelectorAll('[data-en]').forEach((i) => { const x = w.texts.find((z) => z.k === i.dataset.en); if (x.en !== i.value.trim() && i.value.trim()) { x.en = i.value.trim(); n++; } });
      el.querySelectorAll('[data-bn]').forEach((i) => { const x = w.texts.find((z) => z.k === i.dataset.bn); if (x.bn !== i.value.trim()) { x.bn = i.value.trim(); n++; } });
      A.commit(`Shop text: ${n} changes saved`); A.toast(n ? t(`${n} changes saved — live on the shop`, `${n}টি পরিবর্তন সেভ — দোকানে লাইভ`) : t('Nothing changed', 'কিছু বদলায়নি'), n ? 'good' : ''); A.render();
    };
  }

  /* ================= Policies ================= */
  function autoPolicy(k) {
    const r = A.D.rules; const d = r.delivery; const tk = F().tk;
    if (k === 'delivery') return {
      en: `Inside Dhaka: ${tk(d.inside.fee)}, ${d.inside.days} days.\nDhaka suburbs (Gazipur, Narayanganj, Savar, Keraniganj): ${tk(d.sub.fee)}, ${d.sub.days} days.\nOutside Dhaka: ${tk(d.outside.fee)}, ${d.outside.days} days.` + (r.freeDelivery.on ? `\nFree delivery on orders over ${tk(r.freeDelivery.over)}.` : '') + (r.cod.on ? `\nCash on delivery all over Bangladesh for orders up to ${tk(r.cod.max)}.` : '') + (r.advance.on ? `\nFirst orders over ${tk(r.advance.newOver)}: please pay the delivery charge in advance by bKash or Nagad.` : ''),
      bn: `ঢাকার ভেতরে: ${tk(d.inside.fee)}, ${d.inside.days} দিন।\nঢাকার আশেপাশে (গাজীপুর, নারায়ণগঞ্জ, সাভার, কেরানীগঞ্জ): ${tk(d.sub.fee)}, ${d.sub.days} দিন।\nঢাকার বাইরে: ${tk(d.outside.fee)}, ${d.outside.days} দিন।` + (r.freeDelivery.on ? `\n${tk(r.freeDelivery.over)}-এর বেশি অর্ডারে ডেলিভারি ফ্রি।` : '') + (r.cod.on ? `\n${tk(r.cod.max)} পর্যন্ত অর্ডারে সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।` : '') + (r.advance.on ? `\nপ্রথম অর্ডার ${tk(r.advance.newOver)}-এর বেশি হলে আগে bKash বা Nagad-এ ডেলিভারি চার্জ দিন।` : ''),
    };
    const ex = r.exchange; const exCats = (ex.excluded || []).map((c) => A.byId(A.CATS, c)).filter(Boolean);
    return {
      en: (ex.on ? `You can exchange size or colour within ${ex.hours} hours of delivery. Items must be unworn with tags. We send a rider to swap it.` : 'Exchanges are not available at the moment.') + (exCats.length ? `\n${exCats.map((c) => c.en).join(', ')} cannot be exchanged.` : '') + (r.returns.on ? `\nReturns for refund are accepted within ${r.returns.days} days.` : '\nWe do not take items back for a refund — exchange only. If an item is faulty, we replace it free.'),
      bn: (ex.on ? `ডেলিভারির ${ex.hours} ঘণ্টার মধ্যে সাইজ বা রং এক্সচেঞ্জ করা যায়। পোশাক না পরা ও ট্যাগ সহ থাকতে হবে। আমরা রাইডার পাঠিয়ে বদলে দিই।` : 'এই মুহূর্তে এক্সচেঞ্জ বন্ধ আছে।') + (exCats.length ? `\n${exCats.map((c) => c.bn).join(', ')} এক্সচেঞ্জ করা যায় না।` : '') + (r.returns.on ? `\n${r.returns.days} দিনের মধ্যে রিটার্ন করে টাকা ফেরত নেওয়া যায়।` : '\nটাকা ফেরতের জন্য রিটার্ন নেওয়া হয় না — শুধু এক্সচেঞ্জ। পণ্যে ত্রুটি থাকলে ফ্রি বদলে দিই।'),
    };
  }
  function renderPolicies(el) {
    const w = W(); const k = w.policy; const P = w.policies[k];
    const NAMES = { delivery: ['Delivery', 'ডেলিভারি'], exchange: ['Exchange & returns', 'এক্সচেঞ্জ ও রিটার্ন'], privacy: ['Privacy', 'গোপনীয়তা'], terms: ['Terms', 'শর্তাবলি'] };
    const canAuto = k === 'delivery' || k === 'exchange';
    const txt = canAuto && P.auto ? autoPolicy(k) : P;
    el.innerHTML = A.pageHead(t('Policies', 'নীতিমালা'), t('The pages customers read before they order. Delivery and exchange pages fill themselves from your Rules.', 'অর্ডারের আগে কাস্টমার যে পেজগুলো পড়েন। ডেলিভারি ও এক্সচেঞ্জ পেজ আপনার নিয়ম থেকে নিজে থেকেই লেখা হয়।')) + A.tabsBar('website', 'policies') +
      `<div class="chips" id="po-k">${Object.keys(NAMES).map((x) => `<button class="chip ${x === k ? 'on' : ''}" data-v="${x}">${t(NAMES[x][0], NAMES[x][1])}</button>`).join('')}</div>` +
      (canAuto ? (P.auto ? U().callout(t(`<b>Auto-filled from Rules.</b> When you change a delivery fee or the exchange time in Rules, this page changes by itself.`, `<b>নিয়ম থেকে নিজে থেকেই লেখা।</b> নিয়মে ডেলিভারি চার্জ বা এক্সচেঞ্জের সময় বদলালে এই পেজও বদলে যাবে।`) + ` <a class="linkbtn" href="${A.href('rules', k === 'delivery' ? 'delivery' : 'exchange')}">${t('Open Rules', 'নিয়ম খুলুন')} →</a>`, 'good', 'sync') : U().callout(t('Written by hand — it will NOT follow your Rules any more. Numbers here may become wrong.', 'হাতে লেখা — এটা আর নিয়মের সাথে মিলবে না। সংখ্যা ভুল হয়ে যেতে পারে।'), 'warn', 'warn')) : '') +
      U().card(t(NAMES[k][0], NAMES[k][1]) + t(' page', ' পেজ'), `<div class="grid g2"><div class="field"><label>English</label><textarea class="inp" id="po-en" rows="9" ${canAuto && P.auto ? 'readonly' : ''}>${A.esc(txt.en)}</textarea></div><div class="field"><label>বাংলা</label><textarea class="inp" id="po-bn" rows="9" ${canAuto && P.auto ? 'readonly' : ''}>${A.esc(txt.bn)}</textarea></div></div>
        <div class="row between" style="margin-top:12px"><span class="muted small">${t('Last changed', 'শেষ পরিবর্তন')} ${F().dateY(P.updated)} · extas.com.bd/pages/${k}</span><div class="row">${canAuto ? (P.auto ? `<button class="btn" id="po-hand">${A.icon('edit')}${t('Edit by hand', 'হাতে এডিট')}</button>` : `<button class="btn" id="po-auto">${A.icon('sync')}${t('Fill from Rules again', 'আবার নিয়ম থেকে লিখুন')}</button>`) : ''}${!(canAuto && P.auto) ? `<button class="btn primary" id="po-save">${t('Save and publish', 'সেভ করে পাবলিশ')}</button>` : ''}</div></div>`, { sub: t('What customers see', 'কাস্টমার যা দেখেন') });
    A.on(el, '#po-k .chip', 'click', (e, b) => { w.policy = b.dataset.v; A.save(); A.render(); });
    const hand = el.querySelector('#po-hand'); if (hand) hand.onclick = () => U().confirm(t('Edit by hand?', 'হাতে এডিট করবেন?'), t('The page will stop following your Rules. If you later change a fee, you must update this page yourself.', 'পেজটা আর নিয়ম মানবে না। পরে চার্জ বদলালে এই পেজ নিজেকেই আপডেট করতে হবে।'), t('Yes, edit by hand', 'হ্যাঁ, হাতে এডিট'), () => { const a = autoPolicy(k); Object.assign(P, { auto: false, en: a.en, bn: a.bn }); A.commit(`Policy ${k}: switched to hand-written`); A.toast(t('You can edit the text now', 'এখন লেখা এডিট করতে পারবেন'), 'good'); A.render(); });
    const au = el.querySelector('#po-auto'); if (au) au.onclick = () => { P.auto = true; P.updated = F().ymd(A.TODAY); A.commit(`Policy ${k}: auto-filled from Rules`); A.toast(t('Page follows your Rules again', 'পেজ আবার নিয়ম মেনে চলছে'), 'good'); A.render(); };
    const sv = el.querySelector('#po-save'); if (sv) sv.onclick = () => { const en = el.querySelector('#po-en').value.trim(), bn = el.querySelector('#po-bn').value.trim(); if (!en) { A.toast(t('English text cannot be empty', 'ইংরেজি লেখা খালি রাখা যাবে না'), 'bad'); return; } Object.assign(P, { en, bn, updated: F().ymd(A.TODAY) }); A.commit(`Policy ${k} saved`); A.toast(t('Policy published', 'নীতিমালা পাবলিশ হয়েছে'), 'good'); A.render(); };
  }

  /* ================= Blog ================= */
  function renderBlog(el) {
    const w = W(); const B = A.D.blog; const aov = A.calc.kpis(A.calc.range('30d')).cur.aov;
    const list = B.filter((b) => w.blogF === 'all' || b.status === w.blogF);
    const pub = B.filter((b) => b.status === 'published');
    const views = A.sum(pub, (b) => b.views), sales = A.sum(pub, (b) => b.sales);
    const SB = { published: [t('Published', 'পাবলিশড'), 'good'], draft: [t('Draft', 'খসড়া'), ''], scheduled: [t('Scheduled', 'নির্ধারিত'), 'info'] };
    el.innerHTML = A.pageHead(t('Blog', 'ব্লগ'), t('Helpful articles bring free visitors from Google and turn readers into buyers.', 'কাজের লেখা গুগল থেকে ফ্রি ভিজিটর আনে আর পাঠককে ক্রেতা বানায়।'), `<button class="btn primary" id="bl-new">${A.icon('plus')}${t('New post', 'নতুন পোস্ট')}</button>`) + A.tabsBar('website', 'blog') +
      `<div class="grid g4">
        ${U().card('', U().kpi({ label: t('Published posts', 'পাবলিশড পোস্ট'), value: pub.length, sub: t(`${B.length - pub.length} waiting`, `${B.length - pub.length}টি অপেক্ষায়`) }))}
        ${U().card('', U().kpi({ label: t('Readers', 'পাঠক'), value: F().num(views) }))}
        ${U().card('', U().kpi({ label: t('Orders from articles', 'লেখা থেকে অর্ডার'), value: F().num(sales), sub: t('reader bought within 7 days', 'পড়ার 7 দিনের মধ্যে কিনেছেন') }))}
        ${U().card('', U().kpi({ label: t('Sales from articles', 'লেখা থেকে বিক্রি'), value: F().tk(sales * aov), sub: t('at average order value', 'গড় অর্ডার মূল্যে') }))}
      </div>
      ${U().callout(t('Ideas that people search for now: "hoodie price in bangladesh" (6,600 searches a month, you are #23) and "panjabi for men" (8,100, you are #14). A guide on each could move you up.', 'এখন মানুষ যা খুঁজছেন: "hoodie price in bangladesh" (মাসে 6,600 বার, আপনি #23) আর "panjabi for men" (8,100, আপনি #14)। প্রতিটার ওপর একটা গাইড লিখলে র‍্যাঙ্ক বাড়তে পারে।'), '', 'info')}
      ${U().card(t('Posts', 'পোস্ট'), `<div class="chips" id="bl-f" style="margin-bottom:10px">${[['all', t('All', 'সব')], ['published', SB.published[0]], ['scheduled', SB.scheduled[0]], ['draft', SB.draft[0]]].map((c) => `<button class="chip ${w.blogF === c[0] ? 'on' : ''}" data-v="${c[0]}">${c[1]}<span class="c">${c[0] === 'all' ? B.length : B.filter((b) => b.status === c[0]).length}</span></button>`).join('')}</div>` +
        U().table([
          { h: t('Title', 'শিরোনাম'), f: (b) => `<b>${A.esc(b.title)}</b><div class="muted small">${b.date ? F().dateY(b.date) : t('no date', 'তারিখ নেই')}${(b.pids || []).length ? ' · ' + t(`${b.pids.length} products linked`, `${b.pids.length}টি প্রোডাক্ট যুক্ত`) : ''}</div>` },
          { h: t('Status', 'অবস্থা'), f: (b) => U().badge(SB[b.status][0], SB[b.status][1]) },
          { h: t('Readers', 'পাঠক'), r: 1, f: (b) => F().num(b.views), hide: 1 },
          { h: t('Orders', 'অর্ডার'), r: 1, f: (b) => F().num(b.sales) },
          { h: t('Sales', 'বিক্রি'), r: 1, f: (b) => F().tk(b.sales * aov), hide: 1 },
        ], list.map((b) => ({ ...b, _id: b.id })), { onRow: true }))}`;
    A.on(el, '#bl-f .chip', 'click', (e, b) => { w.blogF = b.dataset.v; A.save(); A.render(); });
    el.querySelector('#bl-new').onclick = () => blogEditor(null);
    A.on(el, 'tr[data-row]', 'click', (e, tr) => blogEditor(B.find((b) => b.id === tr.dataset.row)));
  }
  function blogEditor(post) {
    const isNew = !post; const p = post || { title: '', text: '', pids: [], seoTitle: '', seoDesc: '', status: 'draft', date: '' };
    const top = A.D.products.filter((x) => x.status === 'live').sort((a, b) => b.sold30 - a.sold30).slice(0, 10);
    const sel = new Set(p.pids || []);
    const m = U().modal(isNew ? t('New blog post', 'নতুন ব্লগ পোস্ট') : t('Edit post', 'পোস্ট এডিট'), `
      ${U().field(t('Title', 'শিরোনাম'), U().input('be-t', p.title, `placeholder="${t('e.g. How to choose a winter hoodie', 'যেমন: শীতের হুডি কীভাবে বাছবেন')}"`))}
      ${U().field(t('Article', 'লেখা'), `<textarea class="inp" id="be-x" rows="7" placeholder="${t('Write simply, like you explain in the shop. Short paragraphs.', 'দোকানে যেভাবে বোঝান সেভাবে সহজ করে লিখুন। ছোট ছোট প্যারা।')}">${A.esc(p.text || '')}</textarea>`, `<span id="be-wc"></span>`)}
      <div class="field"><label>${t('Products shown in the article', 'লেখায় যে প্রোডাক্ট দেখাবে')}</label><div class="chips" id="be-p">${top.map((x) => `<button class="chip ${sel.has(x.id) ? 'on' : ''}" data-p="${x.id}">${A.esc(x.name)}</button>`).join('')}</div></div>
      <div class="grid g2"><div class="stack">${U().field(t('Google title', 'গুগলে শিরোনাম'), U().input('be-st', p.seoTitle || '', 'maxlength="70"'), '<span id="be-stc"></span>')}${U().field(t('Google description', 'গুগলে বিবরণ'), `<textarea class="inp" id="be-sd" rows="3" maxlength="170">${A.esc(p.seoDesc || '')}</textarea>`, '<span id="be-sdc"></span>')}</div>
      <div class="stack"><div class="lbl">${t('How it looks on Google', 'গুগলে যেমন দেখাবে')}</div><div class="web-serp" id="be-serp"></div></div></div>
      <div class="row">${U().field(t('Publish date (to schedule)', 'পাবলিশের তারিখ (পরে দিতে)'), `<input class="inp" type="date" id="be-d" value="${p.date || ''}" style="max-width:190px">`)}</div>`,
    { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn" id="be-draft">${t('Save draft', 'খসড়া সেভ')}</button><button class="btn" id="be-sch">${t('Schedule', 'সময় ঠিক করুন')}</button><button class="btn primary" id="be-pub">${t('Publish now', 'এখনই পাবলিশ')}</button>` });
    const q = (s) => m.querySelector(s);
    const upd = () => {
      const title = q('#be-t').value.trim(); const st = q('#be-st').value.trim() || (title ? title + ' | EXTAS' : ''); const sd = q('#be-sd').value.trim() || q('#be-x').value.trim().slice(0, 150);
      const slug = (title || 'new-post').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      q('#be-serp').innerHTML = `<div class="u">extas.com.bd › blog › ${A.esc(slug)}</div><div class="h">${A.esc(st || t('Your title appears here', 'আপনার শিরোনাম এখানে দেখাবে'))}</div><div class="d">${A.esc(sd || t('Write a short description that makes people click.', 'এমন ছোট বিবরণ লিখুন যাতে মানুষ ক্লিক করে।'))}</div>`;
      const wc = q('#be-x').value.trim().split(/\s+/).filter(Boolean).length;
      q('#be-wc').textContent = t(`${wc} words${wc < 300 ? ' — 300+ words rank better on Google' : ' — good length'}`, `${wc} শব্দ${wc < 300 ? ' — 300+ শব্দ হলে গুগলে ভালো র‍্যাঙ্ক' : ' — ভালো দৈর্ঘ্য'}`);
      q('#be-stc').textContent = `${q('#be-st').value.length}/60 ${t('letters', 'অক্ষর')}`;
      q('#be-sdc').textContent = `${q('#be-sd').value.length}/155 ${t('letters', 'অক্ষর')}`;
    };
    ['#be-t', '#be-x', '#be-st', '#be-sd'].forEach((s) => (q(s).oninput = upd)); upd();
    m.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { const id = b.dataset.p; if (sel.has(id)) sel.delete(id); else sel.add(id); b.classList.toggle('on'); }));
    const save = (status) => {
      const title = q('#be-t').value.trim(); if (!title) { A.toast(t('Give the post a title', 'পোস্টের শিরোনাম দিন'), 'bad'); return; }
      let date = q('#be-d').value;
      if (status === 'scheduled' && (!date || date <= F().ymd(A.TODAY))) { A.toast(t('Pick a future date to schedule', 'পরে দিতে সামনের একটা তারিখ বাছুন'), 'bad'); return; }
      if (status === 'published') date = F().ymd(A.TODAY);
      Object.assign(p, { title, text: q('#be-x').value, pids: [...sel], seoTitle: q('#be-st').value.trim(), seoDesc: q('#be-sd').value.trim(), status, date: status === 'draft' ? date : date });
      if (isNew) A.D.blog.unshift({ id: A.uid('B'), views: 0, sales: 0, ...p });
      if (status === 'scheduled' && A.D.mkt && A.D.mkt.cal) A.D.mkt.cal.push({ id: A.uid('CL'), title: 'Blog: ' + title, from: date, to: date, type: 'post' });
      U().close(); A.commit(`Blog post "${title}" ${status}`);
      A.toast({ draft: t('Draft saved', 'খসড়া সেভ হয়েছে'), scheduled: t(`Scheduled for ${F().date(date)}`, `${F().date(date)} তারিখে পাবলিশ হবে`), published: t('Published on the shop', 'দোকানে পাবলিশ হয়েছে') }[status], 'good'); A.render();
    };
    const f = m.parentElement;
    f.querySelector('#be-draft').onclick = () => save('draft');
    f.querySelector('#be-sch').onclick = () => save('scheduled');
    f.querySelector('#be-pub').onclick = () => save('published');
  }

  /* ================= SEO & Google ranking ================= */
  function renderSeo(el) {
    const w = W(); const K = A.D.keywords; const I = A.D.seoIssues;
    const live = A.D.products.filter((p) => p.status === 'live');
    const avgP = live.length ? A.sum(live, (p) => p.seo.score) / live.length : 0;
    const pen = A.sum(I, (i) => (i.sev === 'bad' ? 6 : i.sev === 'warn' ? 3 : 0));
    const score = Math.max(0, Math.min(100, Math.round(avgP + 12 - pen)));
    const ranked = K.filter((k) => k.pos > 0);
    const top3 = ranked.filter((k) => k.pos <= 3).length, top10 = ranked.filter((k) => k.pos <= 10).length;
    const prevTop10 = K.filter((k) => k.prev > 0 && k.prev <= 10).length;
    const clicks = A.sum(K, (k) => k.clicks);
    const prevClicks = A.sum(K, (k) => (k.prev ? Math.round(k.volume * (k.prev <= 3 ? 0.18 : k.prev <= 10 ? 0.05 : 0.008)) : 0));
    const avgPos = ranked.length ? A.sum(ranked, (k) => k.pos) / ranked.length : 0;
    const ch = (k) => (k.pos && k.prev ? k.prev - k.pos : 0);
    const kf = w.kwF;
    const kl = K.filter((k) => kf === 'all' || (kf === 'top3' && k.pos && k.pos <= 3) || (kf === 'top10' && k.pos && k.pos <= 10) || (kf === 'up' && ch(k) > 0) || (kf === 'down' && ch(k) < 0)).slice().sort((a, b) => (a.pos || 999) - (b.pos || 999));
    const close = K.filter((k) => k.pos >= 11 && k.pos <= 15).sort((a, b) => b.volume - a.volume)[0];
    const open = I.filter((i) => i.sev !== 'good');
    const tone = score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad';
    const lowest = live.slice().sort((a, b) => a.seo.score - b.seo.score).slice(0, 8);
    const issueText = (i) => t(i.text, (i.sev === 'good' && OK_BN[i.id]) || ISSUE_BN[i.id] || i.text);
    const fixLabel = { S1: t('Fill alt text from product names', 'প্রোডাক্টের নাম থেকে অল্ট টেক্সট লিখুন'), S2: t('Fill from template', 'টেমপ্লেট থেকে লিখুন'), S3: t('Add collection text', 'কালেকশনের লেখা দিন'), S5: t('Add suggested redirects', 'প্রস্তাবিত রিডাইরেক্ট যোগ করুন') };
    el.innerHTML = A.pageHead(t('SEO & Google ranking', 'SEO ও গুগল র‍্যাঙ্কিং'), t('How easily people find EXTAS on Google, and what to fix to show up higher.', 'গুগলে মানুষ কত সহজে EXTAS খুঁজে পায়, আর ওপরে আসতে কী ঠিক করতে হবে।'), `<button class="btn" id="seo-check">${A.icon('sync')}${t('Check again', 'আবার যাচাই')}</button>`) + A.tabsBar('website', 'seo') +
      `<div class="grid g4">
        ${U().card('', `<div class="web-score"><div class="ring" style="background:conic-gradient(var(--${tone}) ${score * 3.6}deg, var(--card2) 0);"><div style="width:70px;height:70px;border-radius:50%;background:var(--card);display:grid;place-items:center">${score}</div></div><div><b>${t('SEO score', 'SEO স্কোর')}</b><div class="muted small">${score >= 80 ? t('Good', 'ভালো') : score >= 60 ? t('OK — fixes below', 'চলে — নিচের সমস্যা ঠিক করুন') : t('Needs work', 'কাজ দরকার')}</div><div class="muted small">${t(`${open.length} problems open`, `${open.length}টি সমস্যা খোলা`)}</div></div></div>`)}
        ${U().card('', U().kpi({ label: t('Clicks from Google / month', 'গুগল থেকে ক্লিক / মাস'), value: F().num(clicks), delta: A.delta(clicks, prevClicks) }))}
        ${U().card('', U().kpi({ label: t('Searches in top 10', 'টপ 10-এ সার্চ'), value: `${top10}<span class="muted" style="font-size:14px"> / ${K.length}</span>`, delta: A.delta(top10, prevTop10), sub: t(`${top3} in top 3`, `${top3}টি টপ 3-এ`) }))}
        ${U().card('', U().kpi({ label: t('Average position', 'গড় অবস্থান'), value: avgPos.toFixed(1), sub: t('lower is better', 'যত কম তত ভালো') }))}
      </div>
      ${close ? U().callout(t(`Quick win: <b>"${A.esc(close.kw)}"</b> is at #${close.pos} with ${F().num(close.volume)} searches a month. Reaching page 1 (top 10) could bring about ${F().num(Math.round(close.volume * 0.05))} visitors a month — add text and links on ${A.esc(close.page)}.`, `দ্রুত সুযোগ: <b>"${A.esc(close.kw)}"</b> এখন #${close.pos}-এ, মাসে ${F().num(close.volume)} বার খোঁজা হয়। প্রথম পেজে (টপ 10) গেলে মাসে প্রায় ${F().num(Math.round(close.volume * 0.05))} ভিজিটর আসতে পারে — ${A.esc(close.page)} পেজে লেখা ও লিংক বাড়ান।`), 'good', 'info') : ''}
      ${U().card(t('Google ranking', 'গুগল র‍্যাঙ্কিং'), `<div class="chips" id="kw-f" style="margin-bottom:10px">${[['all', t('All', 'সব'), K.length], ['top3', t('Top 3', 'টপ 3'), top3], ['top10', t('Top 10', 'টপ 10'), top10], ['up', t('Rising', 'উঠছে'), K.filter((k) => ch(k) > 0).length], ['down', t('Falling', 'নামছে'), K.filter((k) => ch(k) < 0).length]].map((c) => `<button class="chip ${kf === c[0] ? 'on' : ''}" data-v="${c[0]}">${c[1]}<span class="c">${c[2]}</span></button>`).join('')}</div>` +
        U().table([
          { h: t('Search words', 'সার্চের শব্দ'), f: (k) => `<b>${A.esc(k.kw)}</b>` },
          { h: t('Position', 'অবস্থান'), r: 1, f: (k) => (k.pos ? `<span class="web-pos ${k.pos <= 3 ? 't3' : k.pos <= 10 ? 't10' : ''}">#${k.pos}</span>` : `<span class="muted small">${t('not in top 100', 'টপ 100-এ নেই')}</span>`) },
          { h: t('Change', 'পরিবর্তন'), r: 1, f: (k) => { const c = ch(k); return c > 0 ? `<span class="delta up">▲ ${c}</span>` : c < 0 ? `<span class="delta down">▼ ${-c}</span>` : '<span class="delta flat">—</span>'; } },
          { h: t('Searches / month', 'সার্চ / মাস'), r: 1, f: (k) => F().num(k.volume), hide: 1 },
          { h: t('Clicks', 'ক্লিক'), r: 1, f: (k) => F().num(k.clicks), hide: 1 },
          { h: t('Page', 'পেজ'), f: (k) => `<span class="mono muted">${A.esc(k.page)}</span>`, hide: 1 },
        ], kl, { empty: t('No search words in this filter', 'এই ফিল্টারে কোনো শব্দ নেই') }), { sub: t('Compared with 4 weeks ago', '4 সপ্তাহ আগের তুলনায়') })}
      <div class="grid g2">
        ${U().card(t('Problems to fix', 'যা ঠিক করতে হবে'), `<div class="list">${I.map((i) => `<div class="li">${U().badge(i.sev === 'bad' ? t('Urgent', 'জরুরি') : i.sev === 'warn' ? t('Fix soon', 'শিগগির ঠিক করুন') : t('OK', 'ঠিক আছে'), i.sev)}<div class="grow small">${issueText(i)}${i.count ? ` · <b>${F().num(i.count)}</b>` : ''}</div>${i.sev !== 'good' && fixLabel[i.id] ? `<button class="btn sm" data-fix="${i.id}">${fixLabel[i.id]}</button>` : ''}</div>`).join('')}</div>`)}
        ${U().card(t('Products with the weakest SEO', 'সবচেয়ে দুর্বল SEO-র প্রোডাক্ট'), `<div class="list">${lowest.map((p) => `<a class="li" style="text-decoration:none" href="${A.href('products', 'all', p.id)}">${U().thumb(p, 32)}<div class="grow" style="min-width:0"><b class="ellip" style="display:block">${A.esc(p.name)}</b><div style="max-width:160px">${U().bar(p.seo.score, p.seo.score < 60 ? 'var(--bad)' : 'var(--warn)')}</div></div><b>${p.seo.score}</b><span class="muted">›</span></a>`).join('')}</div>`, { sub: t('Lowest first · tap to improve title, description and photos', 'সবচেয়ে কম আগে · শিরোনাম, বিবরণ ও ছবি ঠিক করতে চাপুন') })}
      </div>
      <div class="grid g2">
        ${U().card(t('Sitemap & Google Search Console', 'সাইটম্যাপ ও গুগল সার্চ কনসোল'), `<div class="list"><div class="li"><span class="grow">${t('Search Console', 'সার্চ কনসোল')}</span>${U().badge(t('Connected', 'যুক্ত'), 'good')}</div><div class="li"><span class="grow">${t('Sitemap sent to Google', 'গুগলে সাইটম্যাপ পাঠানো')}</span><b>${F().dateY(w.sitemap.sent)}</b></div><div class="li"><span class="grow">${t('Pages on the shop', 'দোকানের পেজ')}</span><b>${F().num(live.length + 24)}</b></div><div class="li"><span class="grow">${t('Pages Google has read', 'গুগল যত পেজ পড়েছে')}</span><b>${F().num(w.sitemap.read)}</b></div><div class="li"><span class="grow">${t('Old links that open an error page', 'পুরনো লিংক যা ভুল পেজ খোলে')}</span><b style="color:${(A.D.seoIssues.find((i) => i.id === 'S5') || { count: 0 }).count ? 'var(--bad)' : 'var(--good)'}">${F().num((A.D.seoIssues.find((i) => i.id === 'S5') || { count: 0 }).count)}</b></div></div><div class="row" style="margin-top:10px"><button class="btn sm" id="sm-send">${t('Send sitemap again', 'আবার সাইটম্যাপ পাঠান')}</button></div>`)}
        ${U().card(t('Redirects: old links → new', 'রিডাইরেক্ট: পুরনো লিংক → নতুন'), U().table([
          { h: t('Old WordPress link', 'পুরনো WordPress লিংক'), f: (r) => `<span class="mono">${A.esc(r.from)}</span>` },
          { h: t('Goes to', 'যায়'), f: (r) => `<span class="mono">${A.esc(r.to)}</span>`, hide: 1 },
          { h: t('Visits', 'ভিজিট'), r: 1, f: (r) => F().num(r.hits) },
        ], w.redirects) + `<div class="row" style="margin-top:10px"><button class="btn sm primary" id="rd-add">${A.icon('plus')}${t('Add redirect', 'রিডাইরেক্ট যোগ')}</button><span class="muted small">${t(`${w.redirects.length} redirects · old Google links keep their ranking`, `${w.redirects.length}টি রিডাইরেক্ট · পুরনো গুগল লিংকের র‍্যাঙ্ক থাকে`)}</span></div>`)}
      </div>`;
    A.on(el, '#kw-f .chip', 'click', (e, b) => { w.kwF = b.dataset.v; A.save(); A.render(); });
    el.querySelector('#seo-check').onclick = () => A.toast(t(`Checked ${live.length} products and ${K.length} search words — ${open.length} problems open`, `${live.length}টি প্রোডাক্ট ও ${K.length}টি সার্চ শব্দ যাচাই — ${open.length}টি সমস্যা খোলা`), 'good');
    el.querySelector('#sm-send').onclick = () => { w.sitemap.sent = F().ymd(A.TODAY); A.commit('Sitemap sent to Google'); A.toast(t('Sitemap sent — Google usually reads it within 1–3 days', 'সাইটম্যাপ পাঠানো হলো — গুগল সাধারণত 1–3 দিনে পড়ে'), 'good'); A.render(); };
    el.querySelector('#rd-add').onclick = () => addRedirect();
    A.on(el, '[data-fix]', 'click', (e, b) => fixIssue(b.dataset.fix));
  }
  function resolve(id, en) { const i = A.D.seoIssues.find((x) => x.id === id); if (!i) return; i.sev = 'good'; i.count = 0; i.text = en; }
  function fixIssue(id) {
    const w = W();
    if (id === 'S1') {
      U().confirm(t('Fill photo alt text?', 'ছবির অল্ট টেক্সট লিখবেন?'), t('Each photo gets text like “Navy Essential Piqué Polo, front”. Google Images and blind visitors can read it. You can change any of them later on the product page.', 'প্রতিটা ছবিতে লেখা বসবে যেমন “Navy Essential Piqué Polo, সামনে”। গুগল ইমেজ ও দৃষ্টিপ্রতিবন্ধী ভিজিটর পড়তে পারবেন। পরে প্রোডাক্ট পেজে যেকোনোটা বদলাতে পারবেন।'), t('Fill alt text', 'অল্ট টেক্সট লিখুন'), () => { resolve('S1', 'All product photos have alt text'); A.commit('SEO: alt text filled for product photos'); A.toast(t('Alt text added to every product photo', 'সব প্রোডাক্টের ছবিতে অল্ট টেক্সট যোগ হলো'), 'good'); A.render(); });
    } else if (id === 'S2') {
      let n = 0; for (const p of A.D.products) if (!p.seo.desc) { p.seo.desc = `Buy ${p.name} online in Bangladesh. ${p.fabric}, sizes ${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}. Cash on delivery, easy exchange.`; p.seo.score = Math.min(100, p.seo.score + 8); n++; }
      resolve('S2', 'Every product has a meta description');
      A.commit(`SEO: ${n} meta descriptions filled from template`); A.toast(t(`${n} descriptions written from the template`, `টেমপ্লেট থেকে ${n}টি বিবরণ লেখা হলো`), 'good'); A.render();
    } else if (id === 'S3') {
      const cols = ['polo', 'tshirt', 'panjabi', 'hoodie', 'denim', 'jogger'].map((c) => A.byId(A.CATS, c));
      const m = U().modal(t('Collection text', 'কালেকশনের লেখা'), `<p class="muted small" style="margin:0">${t('A short, useful paragraph on each collection page helps Google understand it. We wrote a starting text — change anything.', 'প্রতিটা কালেকশন পেজে ছোট কাজের একটা প্যারা থাকলে গুগল ভালো বোঝে। শুরুর লেখা দেওয়া আছে — যা খুশি বদলান।')}</p>${cols.map((c) => U().field(A.t(c.en, c.bn), `<textarea class="inp" rows="2">${A.esc(`EXTAS ${c.en.toLowerCase()} for men in Bangladesh — breathable fabric, true sizes from S to XXL, cash on delivery anywhere in the country and easy ${A.D.rules.exchange.hours}-hour exchange.`)}</textarea>`)).join('')}`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ct-ok">${t('Save all 6', 'সব 6টি সেভ')}</button>` });
      m.parentElement.querySelector('#ct-ok').onclick = () => { resolve('S3', 'Every collection page has enough text'); U().close(); A.commit('SEO: collection text added'); A.toast(t('Collection text published', 'কালেকশনের লেখা পাবলিশ হয়েছে'), 'good'); A.render(); };
    } else if (id === 'S5') {
      const n = w.suggested.length; w.suggested.forEach((s) => w.redirects.push({ id: A.uid('RD'), from: s[0], to: s[1], hits: 0, on: true })); w.suggested = [];
      resolve('S5', 'Every old WordPress link goes to a new page');
      A.commit(`SEO: ${n} suggested redirects added`); A.toast(t(`${n} redirects added — old links now open the right page`, `${n}টি রিডাইরেক্ট যোগ হলো — পুরনো লিংক এখন ঠিক পেজ খোলে`), 'good'); A.render();
    }
  }
  function addRedirect() {
    const w = W(); const sug = w.suggested;
    const m = U().modal(t('Add redirect', 'রিডাইরেক্ট যোগ'), `${sug.length ? `<div class="field"><label>${t('Old links Google still sends people to', 'যে পুরনো লিংকে গুগল এখনো মানুষ পাঠায়')}</label><div class="chips">${sug.slice(0, 8).map((s, i) => `<button class="chip" data-s="${i}">${A.esc(s[0])}</button>`).join('')}</div></div>` : ''}<div class="formgrid">${U().field(t('Old link', 'পুরনো লিংক'), U().input('rd-f', '', 'placeholder="/product/old-name/"'))}${U().field(t('New page', 'নতুন পেজ'), U().input('rd-t', '', 'placeholder="/products/new-name"'))}</div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="rd-ok">${t('Add redirect', 'রিডাইরেক্ট যোগ')}</button>` });
    m.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { const s = sug[Number(b.dataset.s)]; m.querySelector('#rd-f').value = s[0]; m.querySelector('#rd-t').value = s[1]; }));
    m.parentElement.querySelector('#rd-ok').onclick = () => {
      const from = m.querySelector('#rd-f').value.trim(), to = m.querySelector('#rd-t').value.trim();
      if (!from.startsWith('/') || !to.startsWith('/')) { A.toast(t('Both links must start with /', 'দুটো লিংকই / দিয়ে শুরু হতে হবে'), 'bad'); return; }
      if (w.redirects.some((r) => r.from === from)) { A.toast(t('That old link already has a redirect', 'এই পুরনো লিংকের রিডাইরেক্ট আগেই আছে'), 'bad'); return; }
      w.redirects.push({ id: A.uid('RD'), from, to, hits: 0, on: true });
      const si = sug.findIndex((s) => s[0] === from); if (si >= 0) sug.splice(si, 1);
      const iss = A.D.seoIssues.find((i) => i.id === 'S5'); if (iss && iss.count) { iss.count = Math.max(0, iss.count - 1); if (!iss.count) { resolve('S5', 'Every old WordPress link goes to a new page'); } }
      U().close(); A.commit(`Redirect ${from} → ${to}`); A.toast(t('Redirect added', 'রিডাইরেক্ট যোগ হলো'), 'good'); A.render();
    };
  }

  /* ================= v2: policies, blog editor, analytics, shop text ================= */
  A.css('web2', `
  .w2-glance{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
  .w2-glance div{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:4px;min-width:0}
  .w2-glance b{font:700 20px var(--f-head);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
  .w2-glance span{font-size:12px;color:var(--muted)}
  .w2-glance i{width:30px;height:30px;border-radius:9px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center}
  .w2-sec{display:flex;gap:12px;align-items:flex-start}
  .w2-sec .ic{width:36px;height:36px;border-radius:10px;background:var(--card2);display:grid;place-items:center;flex:none;color:var(--accent)}
  .w2-sec ul{margin:4px 0 0;padding-left:18px;font-size:13.5px;line-height:1.55}
  .w2-sec details{margin-top:6px;font-size:13px;color:var(--muted)}
  .w2-sec summary{cursor:pointer;color:var(--accent);font-weight:600}
  .w2-legal{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);padding:10px 12px;border:1px dashed var(--line2);border-radius:10px;margin-top:12px}
  .w2-ed{display:grid;grid-template-columns:200px minmax(0,1fr) 300px;gap:14px;align-items:start}
  .w2-nav{display:flex;flex-direction:column;gap:2px;font-size:13px}
  .w2-nav a,.w2-nav button{display:flex;justify-content:space-between;padding:7px 9px;border-radius:8px;color:var(--ink);text-decoration:none;background:none;border:0;text-align:left;cursor:pointer;font:inherit;gap:6px;min-width:0}
  .w2-nav a.on,.w2-nav button.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
  .w2-nav .h{font-size:11px;text-transform:uppercase;color:var(--muted);padding:10px 9px 4px;letter-spacing:.04em}
  .w2-canvas{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;min-width:0}
  .w2-canvas .ttl{font:700 24px var(--f-head);border:0;width:100%;background:transparent;color:var(--ink);padding:4px 0;outline:none}
  .w2-blk{position:relative;border:1px solid transparent;border-radius:10px;padding:8px 10px;margin:4px 0}
  .w2-blk:hover,.w2-blk:focus-within{border-color:var(--line2)}
  .w2-blk .bt{font-size:11px;color:var(--muted);display:flex;justify-content:space-between;gap:6px;margin-bottom:4px}
  .w2-blk .bt button{border:0;background:none;color:var(--muted);cursor:pointer;font-size:12px;padding:0 3px}
  .w2-blk [contenteditable]{outline:none;font-size:14.5px;line-height:1.6;min-height:1.4em}
  .w2-blk h2[contenteditable]{font:700 19px var(--f-head);margin:0}
  .w2-blk.shop{background:var(--accent-soft);border-color:var(--accent-soft)}
  .w2-prod{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .w2-faq div{padding:6px 0;border-bottom:1px solid var(--line);font-size:13.5px}
  .w2-ins{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
  .w2-ins button{border:1px solid var(--line2);border-radius:10px;background:var(--card);padding:10px 4px;cursor:pointer;font-size:12px;display:flex;flex-direction:column;align-items:center;gap:3px}
  .w2-ins button.shop{background:var(--accent-soft)}
  .w2-side{display:flex;flex-direction:column;gap:10px}
  .w2-side .card{padding:12px}
  .w2-gp{border:1px solid var(--line);border-radius:10px;padding:10px;font-size:12.5px;background:var(--card)}
  .w2-gp .u{color:var(--good);font-size:11.5px;overflow-wrap:anywhere} .w2-gp .h{color:var(--c1);font-size:15px;margin:2px 0;overflow-wrap:anywhere} .w2-gp .d{color:var(--muted)}
  .w2-score{display:flex;gap:10px;align-items:center}
  .w2-score b{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font:700 16px var(--f-head);color:var(--card);flex:none}
  .w2-ck{font-size:12.5px;display:flex;gap:6px;padding:2px 0}
  .w2-heat{position:relative;border:6px solid var(--ink);border-radius:22px;height:330px;max-width:200px;margin:0 auto;background:var(--card2);overflow:hidden;font-size:10px}
  .w2-heat span{position:absolute;left:10px;right:10px;border-radius:6px;display:grid;place-items:center;color:var(--ink)}
  .w2-cwv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .w2-ph{border:8px solid var(--ink);border-radius:26px;padding:10px;background:var(--card);max-width:270px;margin:0 auto;font-size:12.5px;display:flex;flex-direction:column;gap:6px;min-height:300px}
  .w2-ph .ln{padding:6px 8px;border-radius:8px;background:var(--card2);overflow-wrap:anywhere}
  .w2-ph .ln.hl{box-shadow:0 0 0 2px var(--accent)}
  .w2-row{display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:start;padding:8px 0;border-bottom:1px solid var(--line)}
  @media (max-width:1180px){.w2-ed{grid-template-columns:minmax(0,1fr) 280px}.w2-ed .w2-left{display:none}}
  @media (max-width:860px){.w2-ed{grid-template-columns:minmax(0,1fr)}.w2-glance{grid-template-columns:repeat(2,minmax(0,1fr))}.w2-cwv{grid-template-columns:1fr}.w2-row{grid-template-columns:1fr}.w2-ins{grid-template-columns:repeat(3,minmax(0,1fr))}}
  `);
  const S2 = () => { const w = W(); if (!w.v2) { w.v2 = { pol: 'delivery', lang: {}, hist: {}, edits: {}, ubid: 'UBID 2026-DNCC-0412-77', ana: 'overview', anaPer: '30d', stxPage: 'checkout', stxQ: '', stxEdit: {} }; } return w.v2; };

  /* ---------- Policies ---------- */
  const PNAMES = { terms: ['Terms', 'শর্তাবলি'], privacy: ['Privacy', 'গোপনীয়তা'], delivery: ['Delivery', 'ডেলিভারি'], exchange: ['Exchange', 'এক্সচেঞ্জ'], payment: ['Payment & COD', 'পেমেন্ট ও COD'], refund: ['Cancellation & Refund', 'বাতিল ও রিফান্ড'], wallet: ['Wallet & coupons', 'ওয়ালেট ও কুপন'], reviews: ['Reviews', 'রিভিউ'], cookies: ['Cookies', 'কুকি'] };
  function policy(k, L) {
    const R = A.D.rules; const d = R.delivery; const tk = F().tk; const ex = R.exchange; const b = (en, bn) => (L === 'bn' ? bn : en);
    const free = R.freeDelivery.on ? tk(R.freeDelivery.over) : b('Off', 'বন্ধ');
    const P = {
      delivery: { g: [['truck', b('Inside Dhaka', 'ঢাকার ভেতরে'), tk(d.inside.fee)], ['truck', b('Dhaka suburbs', 'ঢাকার আশেপাশে'), tk(d.sub.fee)], ['truck', b('Outside Dhaka', 'ঢাকার বাইরে'), tk(d.outside.fee)], ['star', b('Free delivery over', 'ফ্রি ডেলিভারি'), free]],
        s: [['truck', b('How long it takes', 'কত দিন লাগে'), [b(`Inside Dhaka: ${d.inside.days} days`, `ঢাকার ভেতরে: ${d.inside.days} দিন`), b(`Suburbs: ${d.sub.days} days`, `আশেপাশে: ${d.sub.days} দিন`), b(`Outside Dhaka: ${d.outside.days} days`, `ঢাকার বাইরে: ${d.outside.days} দিন`)], b('Friday and public holidays may add one day.', 'শুক্রবার ও সরকারি ছুটিতে 1 দিন বেশি লাগতে পারে।')],
          ['box', b('Trial at the door', 'দরজায় ট্রায়াল'), [b('Open the parcel and check it in front of the rider.', 'রাইডারের সামনে পার্সেল খুলে দেখে নিন।'), b(`Don’t like it? Return it and pay only the delivery charge (${tk(d.inside.fee)} in Dhaka).`, `পছন্দ না হলে ফেরত দিন, শুধু ডেলিভারি চার্জ দিন (ঢাকায় ${tk(d.inside.fee)})।`)], b('Partial delivery is allowed: keep some pieces, return the rest.', 'আংশিক নেওয়া যায়: কিছু রাখুন, বাকিটা ফেরত দিন।')],
          ['phone', b('Tracking', 'ট্র্যাকিং'), [b('SMS with a tracking link when the courier takes the parcel.', 'কুরিয়ার পার্সেল নিলে ট্র্যাকিং লিংকসহ SMS।')], '']] },
      exchange: { g: [['reset', b('Wrong size', 'সাইজ ভুল'), b(`Exchange in ${ex.hours} h`, `${ex.hours} ঘণ্টায় এক্সচেঞ্জ`)], ['check', b('Defective or wrong item', 'ত্রুটি বা ভুল পণ্য'), b('Sent again free', 'আবার পাঠাই, ফ্রি')], ['finance', b('Lower price (size)', 'কম দাম (সাইজ)'), b('To wallet', 'ওয়ালেটে')], ['x', b('Money back', 'টাকা ফেরত'), b('No', 'না')]],
        s: [['reset', b('Wrong size: exchange', 'সাইজ ভুল: এক্সচেঞ্জ'), [b(`Ask within ${ex.hours} hours of delivery.`, `ডেলিভারির ${ex.hours} ঘণ্টার মধ্যে জানান।`), b('Unworn, unwashed, with tags.', 'না পরা, না ধোয়া, ট্যাগসহ।'), b(`Exchange delivery charge ${F().tk(ex.charge == null ? 80 : ex.charge)}.`, `এক্সচেঞ্জ ডেলিভারি চার্জ ${F().tk(ex.charge == null ? 80 : ex.charge)}।`)], b('Caps and extras cannot be exchanged.', 'ক্যাপ ও অন্যান্য এক্সচেঞ্জ হয় না।')],
          ['check', b('Defective or wrong item: we send it again', 'ত্রুটি বা ভুল পণ্য: আবার পাঠাই'), [b(`Tell us within ${ex.hours} hours with a photo.`, `${ex.hours} ঘণ্টার মধ্যে ছবিসহ জানান।`), b('We collect it and send you the right product again — free, no charge at all.', 'আমরা ওটা নিয়ে আসব আর সঠিক পণ্য আবার পাঠাব — ফ্রি, কোনো চার্জ নেই।'), b('Same for prepaid orders.', 'আগে পেমেন্ট করা অর্ডারেও একই।')], b('These are replaced with the right product, not refunded or added to the wallet.', 'এগুলো সঠিক পণ্য দিয়ে বদলে দেওয়া হয়, টাকা ফেরত বা ওয়ালেটে যায় না।')],
          ['products', b('What you can pick (size exchange)', 'কী নিতে পারবেন (সাইজ এক্সচেঞ্জ)'), [b('Same product in another size, then another colour, then the same category.', 'একই প্রোডাক্টের অন্য সাইজ, তারপর অন্য রং, তারপর একই ক্যাটাগরি।'), b('Higher price: pay the difference on delivery.', 'দাম বেশি হলে: পার্থক্য ডেলিভারিতে দিন।'), b('Lower price: the rest goes to your EXTAS wallet after the old piece is checked.', 'দাম কম হলে: পুরনো পিস চেক হওয়ার পর বাকি টাকা EXTAS ওয়ালেটে।')], ''],
          ['truck', b('Sending the old piece', 'পুরনো পিস পাঠানো'), [b('Hand it to the rider who brings the new one, within 4 days.', 'নতুন পিস আনা রাইডারের হাতে 4 দিনের মধ্যে দিন।')], '']] },
      payment: { g: [['finance', b('Cash on delivery', 'ক্যাশ অন ডেলিভারি'), R.cod.on ? b(`Up to ${tk(R.cod.max)}`, `${tk(R.cod.max)} পর্যন্ত`) : b('Off', 'বন্ধ')], ['phone', 'bKash / Nagad', b('Yes', 'হ্যাঁ')], ['finance', b('Card', 'কার্ড'), b('Yes', 'হ্যাঁ')], ['warn', b('Advance for new buyers', 'নতুনদের অগ্রিম'), R.advance.on ? b(`Over ${tk(R.advance.newOver)}`, `${tk(R.advance.newOver)}-এর বেশি`) : b('Off', 'বন্ধ')]],
        s: [['finance', b('Ways to pay', 'পেমেন্টের উপায়'), [b('Cash to the rider, bKash, Nagad or card.', 'রাইডারকে নগদ, bKash, Nagad বা কার্ড।'), b('Prepaid orders are confirmed faster.', 'আগে পেমেন্ট করলে অর্ডার দ্রুত কনফার্ম হয়।')], ''], ['warn', b('When we ask for advance', 'কখন অগ্রিম চাই'), [b('Big first orders or past refused parcels: delivery charge first.', 'বড় প্রথম অর্ডার বা আগে পার্সেল না নিলে: আগে ডেলিভারি চার্জ।')], '']] },
      refund: { g: [['x', b('Cancel before dispatch', 'পাঠানোর আগে বাতিল'), b('Free', 'ফ্রি')], ['finance', b('Prepaid, cancelled before dispatch', 'প্রিপেইড, পাঠানোর আগে বাতিল'), b('Money back', 'টাকা ফেরত')], ['box', b('After delivery', 'ডেলিভারির পর'), b('No refund', 'রিফান্ড নেই')], ['reset', b('Size / defect', 'সাইজ / ত্রুটি'), b('Exchange or sent again', 'এক্সচেঞ্জ বা আবার পাঠাই')]],
        s: [['x', b('Cancelling', 'বাতিল করা'), [b('Cancel free any time before the parcel goes to the courier.', 'পার্সেল কুরিয়ারে যাওয়ার আগে যেকোনো সময় ফ্রি বাতিল।'), b('After that, refuse at the door and pay only the delivery charge.', 'এরপর দরজায় না নিয়ে শুধু ডেলিভারি চার্জ দিন।')], ''],
          ['finance', b('Money back', 'টাকা ফেরত'), [b('Paid in advance and the order is cancelled before dispatch (by you or by us): the full amount goes back to the same bKash, Nagad or card within 72 hours.', 'আগে পেমেন্ট করেছেন আর পাঠানোর আগে অর্ডার বাতিল হলো (আপনি বা আমরা): পুরো টাকা 72 ঘণ্টার মধ্যে একই bKash, Nagad বা কার্ডে ফেরত।')], ''],
          ['box', b('After delivery', 'ডেলিভারির পর'), [b('No refunds after delivery.', 'ডেলিভারির পর টাকা ফেরত নেই।'), b(`Wrong size: exchange within ${ex.hours} hours.`, `সাইজ ভুল: ${ex.hours} ঘণ্টার মধ্যে এক্সচেঞ্জ।`), b('Defective or wrong item: we send the right product again, free.', 'ত্রুটি বা ভুল পণ্য: সঠিক পণ্য আবার পাঠাই, ফ্রি।')], '']] },
      wallet: { g: [['finance', b('Wallet money', 'ওয়ালেটের টাকা'), b('Use on any order', 'যেকোনো অর্ডারে')], ['star', b('Coupons at once', 'একসাথে কুপন'), '1'], ['x', b('Cash out', 'নগদে তোলা'), b('No', 'না')], ['star', b('Buy more', 'বেশি কিনুন'), R.buyMore.on ? R.buyMore.tiers.map((x) => `${x.qty}+ = ${x.off}%`).join(' · ') : b('Off', 'বন্ধ')]],
        s: [['finance', b('Wallet', 'ওয়ালেট'), [b('Leftover from a lower-price exchange goes here.', 'কম দামের এক্সচেঞ্জের বাকি টাকা এখানে আসে।'), b('Use it on your next order; it cannot be cashed out.', 'পরের অর্ডারে ব্যবহার করুন; নগদে তোলা যায় না।')], ''], ['star', b('Coupons', 'কুপন'), [b('One coupon per order. Each coupon shows its minimum order and end date.', 'প্রতি অর্ডারে একটি কুপন। প্রতিটায় সর্বনিম্ন অর্ডার ও শেষ তারিখ লেখা থাকে।')], '']] },
      reviews: { g: [['star', b('Who can review', 'কে রিভিউ দিতে পারে'), b('Buyers', 'ক্রেতা')], ['check', b('Bad reviews', 'খারাপ রিভিউ'), b('Never removed', 'কখনো সরানো হয় না')], ['x', b('Hidden', 'লুকানো'), b('Spam / abuse', 'স্প্যাম / গালি')], ['inbox', b('Reply', 'উত্তর'), b('Within 48 h', '48 ঘণ্টায়')]],
        s: [['star', b('How reviews work', 'রিভিউ কীভাবে চলে'), [b('Only customers with a delivered order can review.', 'শুধু ডেলিভারি পাওয়া কাস্টমার রিভিউ দিতে পারেন।'), b('We never delete negative reviews.', 'নেতিবাচক রিভিউ আমরা কখনো মুছি না।'), b('Spam or abusive words are hidden, with the reason shown.', 'স্প্যাম বা গালি লুকানো হয়, কারণসহ।')], '']] },
      privacy: { g: [['customers', b('What we keep', 'কী রাখি'), b('Name, phone, address', 'নাম, ফোন, ঠিকানা')], ['x', b('Sold to others', 'অন্যকে বিক্রি'), b('Never', 'কখনো না')], ['send', b('Messages', 'মেসেজ'), b('Only if you agree', 'রাজি হলে')], ['settings', b('Delete my data', 'ডেটা মুছুন'), b('On request', 'অনুরোধে')]],
        s: [['customers', b('What we collect', 'কী নিই'), [b('Name, phone, address and order history to deliver your parcels.', 'পার্সেল পৌঁছাতে নাম, ফোন, ঠিকানা ও অর্ডারের ইতিহাস।')], b('Couriers get only what they need to deliver.', 'কুরিয়ার শুধু ডেলিভারির জন্য দরকারি তথ্য পায়।')], ['send', b('Offers', 'অফার'), [b('We send offers only if you said yes. Reply STOP to stop.', 'আপনি রাজি হলে তবেই অফার পাঠাই। বন্ধ করতে STOP লিখুন।')], '']] },
      terms: { g: [['website', b('Shop', 'দোকান'), A.D.store.domain], ['finance', b('Prices', 'দাম'), b('In taka, VAT included', 'টাকায়, ভ্যাটসহ')], ['orders', b('Order is final', 'অর্ডার নিশ্চিত'), b('After our call/SMS', 'কল/SMS-এর পরে')], ['help', b('Help', 'সাহায্য'), A.D.store.phone]],
        s: [['orders', b('Orders', 'অর্ডার'), [b('An order is confirmed when we call or send an SMS.', 'আমরা কল বা SMS দিলে অর্ডার কনফার্ম হয়।'), b('Photos are real; colour may look slightly different on screens.', 'ছবি আসল; স্ক্রিনে রং সামান্য ভিন্ন লাগতে পারে।')], ''], ['finance', b('Prices', 'দাম'), [b('Prices may change; your order keeps the price you saw.', 'দাম বদলাতে পারে; আপনার অর্ডারে দেখা দামই থাকবে।')], '']] },
      cookies: { g: [['settings', b('Needed cookies', 'দরকারি কুকি'), b('Always on', 'সবসময় চালু')], ['reports', b('Visit counting', 'ভিজিট গোনা'), b('Our own', 'নিজস্ব')], ['marketing', b('Ad cookies', 'বিজ্ঞাপনের কুকি'), b('Your choice', 'আপনার ইচ্ছা')], ['x', b('Sold', 'বিক্রি'), b('Never', 'কখনো না')]],
        s: [['settings', b('Why we use cookies', 'কেন কুকি'), [b('To keep your bag and login.', 'ব্যাগ ও লগইন মনে রাখতে।'), b('To see which pages help people shop.', 'কোন পেজ কেনাকাটায় সাহায্য করে তা বুঝতে।')], b('You can turn ad cookies off from the banner at any time.', 'ব্যানার থেকে যেকোনো সময় বিজ্ঞাপনের কুকি বন্ধ করা যায়।')]] },
    };
    return P[k];
  }
  function renderPolicies2(el) {
    const s2 = S2(); const k = s2.pol; const L = s2.lang[k] || A.lang || 'en'; const p = policy(k, L);
    const ed = (s2.edits[k] || {}); const hist = s2.hist[k] || [{ t: '2026-11-01T10:00:00+06:00', by: 'Mehadi Hasan', what: 'Page created from Rules' }];
    const sections = p.s.map((x, i) => (ed[i] && ed[i][L] ? [x[0], x[1], ed[i][L], x[3]] : x));
    el.innerHTML = A.pageHead(t('Policies', 'পলিসি'), t('Short, clear pages customers read before they order. Numbers come from Rules, so they always match checkout.', 'অর্ডারের আগে কাস্টমার যে ছোট, পরিষ্কার পেজ পড়েন। সংখ্যা Rules থেকে আসে, তাই চেকআউটের সাথে সবসময় মেলে।'),
      `<a class="btn" href="${A.href('rules', 'all')}">${t('Open Rules', 'Rules খুলুন')}</a><button class="btn primary" id="po-pub">${t('Publish', 'পাবলিশ')}</button>`) + A.tabsBar('website', 'policies') +
      `<div class="chips" id="po-k" style="margin-bottom:12px">${Object.keys(PNAMES).map((x) => `<button class="chip ${x === k ? 'on' : ''}" data-v="${x}">${t(PNAMES[x][0], PNAMES[x][1])}</button>`).join('')}</div>
      <div class="row between" style="margin-bottom:10px;gap:8px"><h2 style="margin:0">${L === 'bn' ? PNAMES[k][1] : PNAMES[k][0]}</h2>${U().seg('po-lang', [['en', 'English'], ['bn', 'বাংলা']], L)}</div>
      <div class="w2-glance">${p.g.map((g) => `<div><i>${A.icon(g[0])}</i><span>${g[1]}</span><b>${g[2]}</b></div>`).join('')}</div>
      <div class="grid g2">${sections.map((x, i) => U().card('', `<div class="w2-sec"><span class="ic">${A.icon(x[0])}</span><div style="flex:1;min-width:0"><div class="row between"><b>${x[1]}</b><button class="btn sm ghost" data-ed="${i}">${A.icon('edit')}${t('Edit', 'এডিট')}</button></div><ul>${x[2].map((pt) => `<li>${A.esc(pt)}</li>`).join('')}</ul>${x[3] ? `<details><summary>${L === 'bn' ? 'বিস্তারিত' : 'Details'}</summary>${A.esc(x[3])}</details>` : ''}</div></div>`)).join('')}</div>
      <div class="w2-legal"><span>${t('Trade licence', 'ট্রেড লাইসেন্স')}: <b>${A.D.store.tradeLicence}</b></span><span>${s2.ubid ? `<b>${A.esc(s2.ubid)}</b>` : 'UBID —'}</span><span>${A.esc(A.D.store.address)}</span><span>${t('Last updated', 'শেষ আপডেট')}: <b>${F().dt(hist[0].t)}</b></span><button class="btn sm ghost" id="po-hist">${t('History', 'হিস্ট্রি')} (${hist.length})</button></div>
      ${U().guide(t('Delivery fees, free-delivery limit, COD limit, advance rule and exchange hours are read from Rules. Change them there and every page updates by itself.', 'ডেলিভারি চার্জ, ফ্রি ডেলিভারির সীমা, COD সীমা, অগ্রিমের নিয়ম আর এক্সচেঞ্জের ঘণ্টা Rules থেকে আসে। সেখানে বদলালে সব পেজ নিজে আপডেট হয়।'))}`;
    A.on(el, '#po-k .chip', 'click', (e, b) => { s2.pol = b.dataset.v; A.render(); });
    A.on(el, '#po-lang button', 'click', (e, b) => { s2.lang[k] = b.dataset.v; A.render(); });
    el.querySelector('#po-pub').onclick = () => { (s2.hist[k] = hist).unshift({ t: A.TODAY.toISOString(), by: 'Mehadi Hasan', what: 'Published' }); A.commit(`Policy published: ${PNAMES[k][0]}`); A.toast(t('Published — live on the shop', 'পাবলিশ হয়েছে — দোকানে লাইভ'), 'good'); A.render(); };
    el.querySelector('#po-hist').onclick = () => U().drawer(t('Page history', 'পেজের হিস্ট্রি'), `<div class="list">${hist.map((h) => `<div class="li"><div class="grow"><b>${A.esc(h.what)}</b><div class="muted small">${F().dt(h.t)} · ${A.esc(h.by)}</div></div></div>`).join('')}</div>`);
    A.on(el, '[data-ed]', 'click', (e, b) => {
      const i = Number(b.dataset.ed); const x = sections[i];
      const m = U().modal(t('Edit section', 'অংশ এডিট') + ` · ${L === 'bn' ? 'বাংলা' : 'English'}`, U().field(x[1], `<textarea class="inp" id="po-pts" rows="6">${A.esc(x[2].join('\n'))}</textarea>`, t('One short point per line. Numbers from Rules update by themselves only while you don’t change them here.', 'প্রতি লাইনে একটা ছোট পয়েন্ট। এখানে না বদলালে Rules-এর সংখ্যা নিজে আপডেট হয়।')), { foot: `<button class="btn" id="po-reset">${t('Back to Rules text', 'Rules-এর লেখায় ফিরুন')}</button><button class="btn primary" id="po-save">${t('Save', 'সেভ')}</button>` });
      const save = (pts) => { s2.edits[k] = s2.edits[k] || {}; s2.edits[k][i] = s2.edits[k][i] || {}; s2.edits[k][i][L] = pts; (s2.hist[k] = hist).unshift({ t: A.TODAY.toISOString(), by: 'Mehadi Hasan', what: pts ? `Edited “${x[1]}” (${L.toUpperCase()})` : `“${x[1]}” back to Rules text` }); U().close(); A.commit(`Policy ${PNAMES[k][0]} section edited`); A.toast(t('Saved', 'সেভ হয়েছে'), 'good'); A.render(); };
      m.parentElement.querySelector('#po-save').onclick = () => { const pts = m.querySelector('#po-pts').value.split('\n').map((z) => z.trim()).filter(Boolean); if (!pts.length) { A.toast(t('Write at least one point', 'অন্তত একটা পয়েন্ট লিখুন'), 'bad'); return; } save(pts); };
      m.parentElement.querySelector('#po-reset').onclick = () => save(null);
    });
    const ub = el.querySelector('.w2-legal'); ub.querySelector('span:nth-child(2)').style.cursor = 'pointer';
  }

  /* ---------- Blog ---------- */
  const BT = { p: ['Paragraph', 'প্যারাগ্রাফ', '¶'], h: ['Heading', 'হেডিং', 'H'], img: ['Image', 'ছবি', '▣'], vid: ['Video', 'ভিডিও', '▶'], prod: ['Product', 'প্রোডাক্ট', '◈'], grid: ['Product grid', 'প্রোডাক্ট গ্রিড', '▤'], combo: ['Combo', 'কম্বো', '⧉'], faq: ['FAQ', 'FAQ', '?'], table: ['Table', 'টেবিল', '▥'], quote: ['Quote', 'উদ্ধৃতি', '❝'], btn: ['Button', 'বাটন', '⬭'] };
  const SHOPB = ['prod', 'grid', 'combo'];
  function ensurePost(p) {
    if (p.blocks) return p;
    const pr = A.D.products.find((x) => x.cat === 'polo') || A.D.products[0];
    p.slug = p.slug || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    p.kw = p.kw || (p.title.toLowerCase().includes('polo') ? 'polo size' : p.title.toLowerCase().includes('panjabi') ? 'panjabi' : '');
    p.meta = p.meta || (p.status === 'draft' ? '' : `${p.title}. Simple tips from the EXTAS team, with sizes, fabric and care explained in plain words.`);
    p.cats = p.cats || ['Style tips']; p.tags = p.tags || ['menswear']; p.author = p.author || 'Mehadi Hasan'; p.excerpt = p.excerpt || ''; p.cover = p.cover || (p.status === 'draft' ? '' : 'cover-' + p.id.toLowerCase() + '.jpg'); p.schema = p.schema || 'Article'; p.rev = p.rev || 3; p.links = p.links || 1;
    p.blocks = [
      { id: 'b1', type: 'p', text: `${p.title} — here is what we tell customers in our own shop, step by step.` },
      { id: 'b2', type: 'h', text: 'Start with the right fabric' },
      { id: 'b3', type: 'p', text: 'Cotton piqué keeps its shape and breathes in Dhaka heat. Look for 200+ GSM so it does not go see-through after a few washes.' },
      { id: 'b4', type: 'prod', pid: pr.id },
      { id: 'b5', type: 'faq', items: [['Can I wash it in a machine?', 'Yes. Cold, gentle cycle, inside out.'], ['Which size should I take?', 'Use the size chart; between two sizes, take the bigger one.']] },
    ];
    return p;
  }
  const words = (p) => A.sum(p.blocks.filter((b) => b.type === 'p' || b.type === 'h' || b.type === 'quote'), (b) => (b.text || '').split(/\s+/).filter(Boolean).length) * 9;
  function seoOf(p) {
    const kw = (p.kw || '').toLowerCase().trim(); const first = (p.blocks.find((b) => b.type === 'p') || { text: '' }).text.toLowerCase(); const ml = (p.meta || '').length; const links = p.links + p.blocks.filter((b) => SHOPB.includes(b.type)).length; const imgs = p.blocks.filter((b) => b.type === 'img'); const w = words(p);
    const ck = [
      [!!kw && p.title.toLowerCase().includes(kw), t('Keyword in title', 'টাইটেলে কিওয়ার্ড')],
      [!!kw && first.includes(kw), t('Keyword in first paragraph', 'প্রথম প্যারাগ্রাফে কিওয়ার্ড')],
      [!!kw && p.slug.includes(kw.split(' ')[0]), t('Keyword in link', 'লিংকে কিওয়ার্ড')],
      [ml >= 120 && ml <= 160, t(`Meta description length (${ml} / 160)`, `মেটা বিবরণের দৈর্ঘ্য (${ml} / 160)`)],
      [links >= 3, t(`${links} internal links — aim for 3+`, `${links}টি ভেতরের লিংক — 3+ রাখুন`)],
      [imgs.every((b) => b.alt), t('Every image has alt text', 'সব ছবিতে অল্ট টেক্সট')],
      [w >= 600, t(`${F().num(w)} words — aim for 600+`, `${F().num(w)} শব্দ — 600+ রাখুন`)],
      [!!p.cover, t('Featured image set', 'ফিচার্ড ছবি আছে')],
      [!!(authorOf(p) && authorOf(p).bio), t('Author with bio (byline links to author page)', 'পরিচিতিসহ লেখক (নাম থেকে লেখক পেজে লিংক)')],
    ];
    const score = Math.round(ck.filter((c) => c[0]).length / ck.length * 100);
    const hs = p.blocks.filter((b) => b.type === 'h').length;
    const rd = [[true, t('Short sentences', 'ছোট বাক্য')], [hs >= Math.floor(w / 300), t('A subheading every 300 words', 'প্রতি 300 শব্দে একটা সাবহেডিং')], [p.blocks.filter((b) => b.type === 'p').every((b) => (b.text || '').length < 600), t('Short paragraphs', 'ছোট প্যারাগ্রাফ')]];
    return { ck, score, rd, rscore: Math.round(rd.filter((r) => r[0]).length / rd.length * 100), w };
  }
  const scCol = (s) => (s >= 75 ? 'var(--good)' : s >= 50 ? 'var(--warn)' : 'var(--bad)');
  let blogF = 'all';
  function blogNav(cur, au) {
    const B = A.D.blog; const c = (st) => B.filter((p) => st === 'all' || p.status === st).length;
    return `<nav class="w2-nav"><a class="btn primary sm" href="#" id="bl-new" style="justify-content:center;margin-bottom:6px">${A.icon('plus')}${t('New post', 'নতুন পোস্ট')}</a><div class="h">${t('Posts', 'পোস্ট')}</div>${[['all', t('All posts', 'সব পোস্ট')], ['draft', t('Drafts', 'ড্রাফট')], ['scheduled', t('Scheduled', 'শিডিউল')], ['published', t('Published', 'পাবলিশড')]].map((x) => `<button data-bf="${x[0]}" class="${!cur && blogF === x[0] ? 'on' : ''}"><span>${x[1]}</span><span class="muted">${c(x[0])}</span></button>`).join('')}${cur ? `<div class="h">${t('Recent', 'সাম্প্রতিক')}</div>${B.slice(0, 6).map((p) => `<a href="${A.href('website', 'blog', p.id)}" class="${p.id === cur ? 'on' : ''}"><span class="ellip">${A.esc(p.title)}</span></a>`).join('')}` : ''}<div class="h">${t('Organise', 'সাজানো')}</div><button data-org="cats"><span>${t('Categories', 'ক্যাটাগরি')}</span><span class="muted">6</span></button><button data-org="tags"><span>${t('Tags', 'ট্যাগ')}</span><span class="muted">24</span></button><a href="${A.href('website', 'blog', 'authors')}" class="${au ? 'on' : ''}"><span>${t('Authors', 'লেখক')}</span><span class="muted">${AUTH().length}</span></a></nav>`;
  }
  function wireBlogNav(el) {
    el.querySelector('#bl-new').onclick = (e) => { e.preventDefault(); const p = { id: A.uid('B'), title: 'New post', status: 'draft', date: '', views: 0, sales: 0 }; ensurePost(p); p.blocks = [{ id: 'b1', type: 'p', text: '' }]; p.kw = ''; p.meta = ''; p.cover = ''; p.rev = 0; p.links = 0; A.D.blog.unshift(p); A.commit('New blog post'); A.toast(t('New draft created', 'নতুন ড্রাফট তৈরি'), 'good'); A.go('website', 'blog', p.id); };
    A.on(el, '[data-bf]', 'click', (e, b) => { blogF = b.dataset.bf; A.go('website', 'blog'); A.render(); });
    A.on(el, '[data-org]', 'click', () => A.toast(t('Categories and tags are edited from the post panel on the right', 'ক্যাটাগরি ও ট্যাগ পোস্টের ডান প্যানেল থেকে এডিট করুন')));
  }
  function AUTH() { const s = S2(); if (!s.authors) s.authors = [
      { id: 'AU1', name: 'Mehadi Hasan', role: 'Founder, EXTAS', bio: '12 years in menswear sourcing and fit. Writes about fabric, sizing and care.', topics: ['Fabric', 'Sizing', 'Polo shirts'], fb: 'facebook.com/extas', ig: 'instagram.com/extas', li: '', photo: true },
      { id: 'AU2', name: 'Tania', role: 'Marketing lead', bio: 'Styles our shoots and writes outfit guides for Eid and winter.', topics: ['Style tips', 'Panjabi'], fb: '', ig: 'instagram.com/extas', li: '', photo: false },
      { id: 'AU3', name: 'Store team', role: 'EXTAS store, Nikunja', bio: 'The people who answer your size questions every day.', topics: ['Care guides'], fb: '', ig: '', li: '', photo: false },
    ]; return s.authors; }
  const authorOf = (p) => AUTH().find((a) => a.name === p.author);
  const postsBy = (a) => A.D.blog.filter((p) => p.author === a.name);
  function authorForm(a) {
    const isNew = !a; a = a || { id: A.uid('AU'), name: '', role: '', bio: '', topics: [], fb: '', ig: '', li: '', photo: false };
    const m = U().modal(isNew ? t('New author', 'নতুন লেখক') : t('Edit author', 'লেখক এডিট'), `<div class="formgrid">${U().field(t('Name', 'নাম'), U().input('au-n', a.name))}${U().field(t('Role / title', 'পদ / পরিচয়'), U().input('au-r', a.role, `placeholder="${t('e.g. Fabric expert, EXTAS', 'যেমন: ফেব্রিক বিশেষজ্ঞ, EXTAS')}"`))}</div>${U().field(t('Short bio', 'ছোট পরিচিতি'), `<textarea class="inp" id="au-b" rows="3">${A.esc(a.bio)}</textarea>`, t('2–3 lines: real experience helps Google trust the post.', '2–3 লাইন: আসল অভিজ্ঞতা লিখলে Google পোস্টে বেশি ভরসা করে।'))}${U().field(t('Expertise topics (comma separated)', 'বিশেষ বিষয় (কমা দিয়ে)'), U().input('au-t', a.topics.join(', ')))}<div class="formgrid">${U().field('Facebook', U().input('au-fb', a.fb))}${U().field('Instagram', U().input('au-ig', a.ig))}${U().field('LinkedIn', U().input('au-li', a.li))}</div><label class="row small"><input type="checkbox" id="au-ph" ${a.photo ? 'checked' : ''}> ${t('Profile photo uploaded', 'প্রোফাইল ছবি আপলোড করা')}</label>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="au-ok">${t('Save', 'সেভ')}</button>` });
    m.parentElement.querySelector('#au-ok').onclick = () => {
      const nm = m.querySelector('#au-n').value.trim(); if (!nm) { A.toast(t('Name is needed', 'নাম দিন'), 'bad'); return; }
      const old = a.name; Object.assign(a, { name: nm, role: m.querySelector('#au-r').value.trim(), bio: m.querySelector('#au-b').value.trim(), topics: m.querySelector('#au-t').value.split(',').map((x) => x.trim()).filter(Boolean), fb: m.querySelector('#au-fb').value.trim(), ig: m.querySelector('#au-ig').value.trim(), li: m.querySelector('#au-li').value.trim(), photo: m.querySelector('#au-ph').checked });
      if (isNew) AUTH().push(a); else if (old !== nm) A.D.blog.forEach((p) => { if (p.author === old) p.author = nm; });
      U().close(); A.commit(`Author ${isNew ? 'added' : 'updated'}: ${nm}`); A.toast(t('Author saved', 'লেখক সেভ হয়েছে'), 'good'); A.go('website', 'blog', 'author-' + a.id); A.render();
    };
  }
  const avatar = (a, s = 44) => `<span style="width:${s}px;height:${s}px;border-radius:50%;display:grid;place-items:center;flex:none;background:${a.photo ? 'var(--accent)' : 'var(--card2)'};color:${a.photo ? 'var(--card)' : 'var(--muted)'};font-weight:700">${A.esc(a.name.split(' ').map((w) => w[0]).join('').slice(0, 2))}</span>`;
  function renderAuthors(el, aid) {
    const L = AUTH(); const a = aid ? L.find((x) => x.id === aid) : null;
    const head = A.pageHead(a ? A.esc(a.name) : t('Authors', 'লেখক'), a ? A.esc(a.role) : t('Real people with real experience behind every post — Google ranks such posts higher.', 'প্রতিটা পোস্টের পেছনে আসল অভিজ্ঞ মানুষ — Google এমন পোস্টকে ওপরে রাখে।'), a ? `<a class="btn ghost" href="${A.href('website', 'blog', 'authors')}">← ${t('All authors', 'সব লেখক')}</a><button class="btn primary" id="au-edit">${A.icon('edit')}${t('Edit author', 'লেখক এডিট')}</button>` : `<button class="btn primary" id="au-new">${A.icon('plus')}${t('New author', 'নতুন লেখক')}</button>`) + A.tabsBar('website', 'blog');
    let body;
    if (!a) body = U().table([{ h: t('Author', 'লেখক'), f: (x) => `<div class="cellmain">${avatar(x, 36)}<div><b>${A.esc(x.name)}</b><span class="muted small">${A.esc(x.role)}</span></div></div>` }, { h: t('Topics', 'বিষয়'), f: (x) => A.esc(x.topics.join(', ')), hide: 1 }, { h: t('Posts', 'পোস্ট'), r: 1, f: (x) => postsBy(x).length }, { h: t('Profile', 'প্রোফাইল'), f: (x) => (x.bio && x.photo ? U().badge(t('Complete', 'সম্পূর্ণ'), 'good') : U().badge(t('Add photo/bio', 'ছবি/পরিচিতি দিন'), 'warn')) }], L.map((x) => ({ ...x, _id: x.id })), { onRow: true });
    else { const ps = postsBy(a); const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', name: a.name, jobTitle: a.role, worksFor: { '@type': 'Organization', name: A.D.store.name }, url: `https://${A.D.store.domain}/blog/author/${a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, knowsAbout: a.topics, sameAs: [a.fb, a.ig, a.li].filter(Boolean).map((s) => 'https://' + s) }, null, 2);
      body = `<div class="grid g3"><div class="span2">${U().card(t('Profile', 'প্রোফাইল'), `<div class="row" style="gap:12px;align-items:flex-start;flex-wrap:nowrap">${avatar(a, 64)}<div style="min-width:0"><b>${A.esc(a.name)}</b><div class="muted small">${A.esc(a.role)}</div><p style="margin:6px 0">${A.esc(a.bio || t('No bio yet', 'এখনো পরিচিতি নেই'))}</p><div class="chips">${a.topics.map((x) => `<span class="chip">${A.esc(x)}</span>`).join('')}</div><div class="muted small" style="margin-top:6px;overflow-wrap:anywhere">${[a.fb, a.ig, a.li].filter(Boolean).map(A.esc).join(' · ') || t('No social links', 'সোশ্যাল লিংক নেই')}</div></div></div>`)}
        ${U().card(t(`Posts by this author (${ps.length})`, `এই লেখকের পোস্ট (${ps.length})`), ps.length ? `<div class="list">${ps.map((p) => `<a class="li" href="${A.href('website', 'blog', p.id)}"><div class="grow"><b>${A.esc(p.title)}</b><div class="muted small">${p.status} · ${F().num(p.views)} ${t('readers', 'পাঠক')}</div></div></a>`).join('')}</div>` : U().empty(t('No posts yet', 'এখনো কোনো পোস্ট নেই')))}
        ${U().card(t('Person schema (sent to Google)', 'Person স্কিমা (Google-এ যায়)'), `<pre class="mono small" style="white-space:pre-wrap;overflow-wrap:anywhere;margin:0">${A.esc(schema)}</pre>`)}</div>
        <div>${U().card(t('Public author page preview', 'পাবলিক লেখক পেজের প্রিভিউ'), `<div class="w2-ph"><div style="text-align:center">${avatar(a, 56).replace('display:grid', 'display:inline-grid')}<div><b>${A.esc(a.name)}</b></div><div class="muted small">${A.esc(a.role)}</div></div><div class="small">${A.esc(a.bio)}</div>${ps.filter((p) => p.status === 'published').map((p) => `<div class="ln">${A.esc(p.title)}</div>`).join('')}<div class="muted small">${A.D.store.domain}/blog/author/${A.esc(a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}</div></div>`)}</div></div>`; }
    el.innerHTML = head + `<div class="grid g4"><div class="card hide-sm">${blogNav('', true)}</div><div class="span3">${body}</div></div>`;
    wireBlogNav(el);
    const nb = el.querySelector('#au-new'); if (nb) nb.onclick = () => authorForm(null);
    const eb = el.querySelector('#au-edit'); if (eb) eb.onclick = () => authorForm(a);
    A.on(el, 'tr[data-row]', 'click', (e, tr) => A.go('website', 'blog', 'author-' + tr.dataset.row));
  }
  function renderBlog2(el, r) {
    if (r && r.id === 'authors') return renderAuthors(el, '');
    if (r && r.id && r.id.startsWith('author-')) return renderAuthors(el, r.id.slice(7));
    if (r && r.id) return blogEditor2(el, r.id);
    const list = A.D.blog.filter((p) => blogF === 'all' || p.status === blogF).map((p) => ({ ...ensurePost(p), _id: p.id }));
    const pub = A.D.blog.filter((p) => p.status === 'published');
    el.innerHTML = A.pageHead(t('Blog', 'ব্লগ'), t('Helpful posts bring free visitors from Google and turn readers into buyers.', 'কাজের পোস্ট Google থেকে ফ্রি ভিজিটর আনে, পাঠককে ক্রেতা বানায়।')) + A.tabsBar('website', 'blog') +
      `<div class="grid g4">${U().card('', U().kpi({ label: t('Published', 'পাবলিশড'), value: pub.length }))}${U().card('', U().kpi({ label: t('Readers (30 days)', 'পাঠক (30 দিন)'), value: F().num(A.sum(pub, (p) => p.views)) }))}${U().card('', U().kpi({ label: t('Orders from posts', 'পোস্ট থেকে অর্ডার'), value: F().num(A.sum(pub, (p) => p.sales)) }))}${U().card('', U().kpi({ label: t('Average SEO score', 'গড় SEO স্কোর'), value: Math.round(A.sum(list, (p) => seoOf(p).score) / (list.length || 1)) }))}</div>
      <div class="grid g4"><div class="card hide-sm">${blogNav('')}</div><div class="span3">${U().card(t('Posts', 'পোস্ট'), `<div class="row hide-desk" style="margin-bottom:8px"><button class="btn sm primary" id="bl-new2">${A.icon('plus')}${t('New post', 'নতুন পোস্ট')}</button></div>` + (list.length ? U().table([
        { h: t('Title', 'টাইটেল'), f: (p) => `<b>${A.esc(p.title)}</b><div class="muted small">${A.esc(p.cats.join(', '))} · ${A.esc(p.author)}</div>` },
        { h: t('Status', 'অবস্থা'), f: (p) => U().badge(p.status === 'published' ? t('Published', 'পাবলিশড') : p.status === 'scheduled' ? t('Scheduled', 'শিডিউল') : t('Draft', 'ড্রাফট'), p.status === 'published' ? 'good' : p.status === 'scheduled' ? 'info' : '') },
        { h: 'SEO', r: 1, f: (p) => `<b style="color:${scCol(seoOf(p).score)}">${seoOf(p).score}</b>` },
        { h: t('Readers', 'পাঠক'), r: 1, f: (p) => F().num(p.views), hide: 1 },
        { h: t('Orders', 'অর্ডার'), r: 1, f: (p) => F().num(p.sales), hide: 1 },
        { h: t('Date', 'তারিখ'), f: (p) => (p.date ? F().date(p.date) : '—'), hide: 1 },
      ], list, { onRow: true }) : U().empty(t('No posts here yet.', 'এখানে এখনো কোনো পোস্ট নেই।'))))}</div></div>`;
    wireBlogNav(el);
    const n2 = el.querySelector('#bl-new2'); if (n2) n2.onclick = () => el.querySelector('#bl-new').click();
    A.on(el, 'tr[data-row]', 'click', (e, tr) => A.go('website', 'blog', tr.dataset.row));
  }
  let saveT = null;
  function blogEditor2(el, id) {
    const p = A.D.blog.find((x) => x.id === id);
    if (!p) { el.innerHTML = A.pageHead(t('Post not found', 'পোস্ট পাওয়া যায়নি'), '') + A.tabsBar('website', 'blog') + U().empty(`<a href="${A.href('website', 'blog')}">${t('Back to posts', 'পোস্টে ফিরুন')}</a>`); return; }
    ensurePost(p); const s = seoOf(p);
    const prodSel = (b) => U().select('', A.D.products.filter((x) => x.status === 'live').slice(0, 40).map((x) => [x.id, x.name]), b.pid, `data-pid="${b.id}"`);
    const blk = (b, i) => {
      const head = `<div class="bt"><span>${t(BT[b.type][0], BT[b.type][1])}</span><span><button data-mv="${b.id}" data-d="-1" title="Up">↑</button><button data-mv="${b.id}" data-d="1" title="Down">↓</button><button data-rm="${b.id}" title="Remove">✕</button></span></div>`;
      let body = '';
      if (b.type === 'p' || b.type === 'quote') body = `<div contenteditable="true" data-tx="${b.id}" data-ph="${t('Type here…', 'এখানে লিখুন…')}" style="${b.type === 'quote' ? 'font-style:italic;border-left:3px solid var(--accent);padding-left:10px' : ''}">${A.esc(b.text || '')}</div>`;
      else if (b.type === 'h') body = `<h2 contenteditable="true" data-tx="${b.id}">${A.esc(b.text || '')}</h2>`;
      else if (b.type === 'img') body = `<div class="row" style="gap:8px"><span class="thumb" style="width:64px;height:44px;background:var(--card2)">▣</span><div class="grow">${U().input('', b.alt || '', `data-alt="${b.id}" placeholder="${t('Alt text: describe the photo', 'অল্ট টেক্সট: ছবির বর্ণনা')}"`)}</div></div>`;
      else if (b.type === 'vid') body = U().input('', b.url || '', `data-url="${b.id}" placeholder="YouTube link"`);
      else if (b.type === 'prod' || b.type === 'grid') { const pr = A.byId(A.D.products, b.pid) || A.D.products[0]; body = `<div class="w2-prod">${U().thumb(pr, 54)}<div class="grow" style="min-width:140px"><b>${A.esc(pr.name)}</b><div class="small">${F().tk(pr.price)} · ${pr.colors.length} ${t('colours', 'রং')} · ${A.sum(pr.variants, (v) => v.stock) > 0 ? t('In stock', 'স্টকে আছে') : t('Sold out — shows similar', 'স্টক শেষ — একই রকম দেখাবে')}</div></div>${prodSel(b)}</div>`; }
      else if (b.type === 'combo') body = `<div class="w2-prod"><b>${t('Polo 2-piece', 'পোলো 2 পিস')} ${F().tk(1800)}</b> <s class="muted">${F().tk(2200)}</s> ${U().badge(t('Save ৳400', '৳400 সাশ্রয়'), 'good')}</div>`;
      else if (b.type === 'faq') body = `<div class="w2-faq">${(b.items || []).map((q) => `<div><b>${A.esc(q[0])}</b><br>${A.esc(q[1])}</div>`).join('')}<button class="btn sm ghost" data-faq="${b.id}">${A.icon('plus')}${t('Add question', 'প্রশ্ন যোগ')}</button></div>`;
      else if (b.type === 'table') body = `<div class="tbl-wrap"><table class="tbl"><tr><th>${t('Step', 'ধাপ')}</th><th>${t('Do', 'করুন')}</th><th>${t('Don’t', 'করবেন না')}</th></tr><tr><td>Wash</td><td>Cold, inside out</td><td>Hot water</td></tr></table></div>`;
      else if (b.type === 'btn') body = `<span class="btn primary sm">${t('Shop polo shirts →', 'পোলো শার্ট দেখুন →')}</span>`;
      return `<div class="w2-blk ${SHOPB.includes(b.type) ? 'shop' : ''}">${head}${body}</div>`;
    };
    const sugg = [...A.D.blog.filter((x) => x.id !== p.id && x.status === 'published').map((x) => [x.title, t('Post', 'পোস্ট')]), ...A.D.products.filter((x) => p.kw && x.name.toLowerCase().includes(p.kw.split(' ')[0])).slice(0, 2).map((x) => [x.name, t('Product', 'প্রোডাক্ট')])].slice(0, 4);
    const stLabel = p.status === 'published' ? t('Published', 'পাবলিশড') : p.status === 'scheduled' ? t('Scheduled', 'শিডিউল') + ' · ' + F().date(p.date) : t('Draft', 'ড্রাফট');
    el.innerHTML = A.pageHead(t('Edit post', 'পোস্ট এডিট'), `<span id="bl-auto">${A.icon('check')} ${t('Autosaved', 'অটো-সেভ হয়েছে')}</span> · ${F().num(s.w)} ${t('words', 'শব্দ')} · ${Math.max(1, Math.round(s.w / 220))} ${t('min read', 'মিনিটে পড়া')}`,
      `<a class="btn ghost" href="${A.href('website', 'blog')}">← ${t('All posts', 'সব পোস্ট')}</a><button class="btn" data-pv="phone">${A.icon('phone')}${t('Preview', 'প্রিভিউ')}</button><button class="btn" data-pv="desk">${t('Desktop preview', 'ডেস্কটপ প্রিভিউ')}</button>`) + A.tabsBar('website', 'blog') +
      `<div class="w2-ed"><div class="card w2-left">${blogNav(p.id)}</div>
      <div class="w2-canvas"><div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap"><span class="muted small">AI:</span><button class="chip" data-ai="outline">✦ ${t('Outline', 'আউটলাইন')}</button><button class="chip" data-ai="draft">✦ ${t('Draft section', 'অংশ লিখুন')}</button><button class="chip" data-ai="bn">✦ ${t('Translate to বাংলা', 'বাংলায় অনুবাদ')}</button><button class="chip" data-ai="meta">✦ ${t('Write meta description', 'মেটা বিবরণ লিখুন')}</button></div>
        <input class="ttl" id="bl-title" value="${A.esc(p.title)}" placeholder="${t('Add title', 'টাইটেল দিন')}"><div class="muted small" style="margin-bottom:8px;overflow-wrap:anywhere">${t('Link', 'লিংক')}: ${A.D.store.domain}/blog/<b>${A.esc(p.slug)}</b></div>
        ${p.blocks.map(blk).join('')}
        <div style="margin-top:10px"><div class="muted small" style="margin-bottom:6px">+ ${t('Add block', 'ব্লক যোগ')}</div><div class="w2-ins">${Object.keys(BT).map((k) => `<button data-add="${k}" class="${SHOPB.includes(k) ? 'shop' : ''}"><b>${BT[k][2]}</b>${t(BT[k][0], BT[k][1])}</button>`).join('')}</div><div class="muted small" style="margin-top:6px">${t('Shop blocks (coloured) take price, photo and stock from Products.', 'রঙিন শপ ব্লক দাম, ছবি ও স্টক Products থেকে নেয়।')}</div></div>
      </div>
      <div class="w2-side">
        ${U().card(t('Publish', 'পাবলিশ'), `<div class="stack small"><div class="row between"><span>${t('Status', 'অবস্থা')}</span><b>${stLabel}</b></div><div class="row between"><span>${t('Revisions', 'রিভিশন')}</span><button class="btn sm ghost" id="bl-rev">${p.rev} · ${t('Browse', 'দেখুন')}</button></div>${U().field(t('Schedule', 'শিডিউল'), `<input class="inp" type="datetime-local" id="bl-when" value="${p.date ? p.date + 'T09:00' : ''}">`)}<div class="row" style="gap:6px"><button class="btn sm" id="bl-draft">${t('Save draft', 'ড্রাফট সেভ')}</button><button class="btn sm" id="bl-sched">${t('Schedule', 'শিডিউল')}</button><button class="btn sm primary" id="bl-pub">${t('Publish', 'পাবলিশ')}</button></div></div>`)}
        ${U().card('SEO', `<div class="stack">${U().field(t('Focus keyword', 'ফোকাস কিওয়ার্ড'), U().input('bl-kw', p.kw, `placeholder="${t('e.g. polo shirt care', 'যেমন: polo shirt care')}"`))}<div class="w2-gp"><div class="u">${A.D.store.domain} › blog › ${A.esc(p.slug)}</div><div class="h">${A.esc(p.title)} | EXTAS</div><div class="d">${A.esc(p.meta || t('Add a meta description…', 'মেটা বিবরণ দিন…'))}</div></div>${U().field(t('Meta description', 'মেটা বিবরণ'), `<textarea class="inp" id="bl-meta" rows="3">${A.esc(p.meta)}</textarea>`)}<div class="w2-score"><b style="background:${scCol(s.score)}">${s.score}</b><div><b>${t('SEO score', 'SEO স্কোর')} ${s.score}/100</b><div class="muted small">${t(`${s.ck.filter((c) => !c[0]).length} things to fix`, `${s.ck.filter((c) => !c[0]).length}টি ঠিক করতে হবে`)}</div></div></div>${s.ck.map((c) => `<div class="w2-ck"><span style="color:${c[0] ? 'var(--good)' : 'var(--bad)'}">${c[0] ? '✓' : '✗'}</span>${c[1]}</div>`).join('')}<div class="w2-score"><b style="background:${scCol(s.rscore)}">${s.rscore}</b><div><b>${t('Readability', 'পড়ার সহজতা')}</b></div></div>${s.rd.map((c) => `<div class="w2-ck"><span style="color:${c[0] ? 'var(--good)' : 'var(--bad)'}">${c[0] ? '✓' : '✗'}</span>${c[1]}</div>`).join('')}<div class="lbl">${t('Internal link suggestions', 'ভেতরের লিংকের সাজেশন')}</div>${sugg.map((x, i) => `<div class="row between small"><span class="ellip" style="max-width:170px">${A.esc(x[0])} <span class="muted">· ${x[1]}</span></span><button class="btn sm ghost" data-link="${i}">+ ${t('Link', 'লিংক')}</button></div>`).join('') || `<div class="muted small">${t('Add a focus keyword to get suggestions.', 'সাজেশন পেতে ফোকাস কিওয়ার্ড দিন।')}</div>`}${U().field(t('Schema type', 'স্কিমা টাইপ'), U().select('bl-schema', [['Article', 'Article'], ['Article + FAQ', 'Article + FAQ'], ['HowTo', 'HowTo']], p.blocks.some((b) => b.type === 'faq') ? 'Article + FAQ' : p.schema))}</div>`)}
        ${U().card(t('Categories & tags', 'ক্যাটাগরি ও ট্যাগ'), `<div class="chips">${['Care guides', 'Style tips', 'Polo', 'Panjabi', 'Denim', 'Size guides'].map((c) => `<button class="chip ${p.cats.includes(c) ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div><div class="lbl">${t('Tags', 'ট্যাগ')}</div>${U().input('bl-tags', p.tags.join(', '))}`)}
        ${U().card(t('Featured image', 'ফিচার্ড ছবি'), p.cover ? `<div class="row between small"><span>${A.esc(p.cover)} · ${t('alt text set', 'অল্ট টেক্সট আছে')}</span><button class="btn sm ghost" id="bl-cover-x">${t('Change', 'বদলান')}</button></div>` : `<button class="btn sm" id="bl-cover">${A.icon('plus')}${t('Set featured image', 'ফিচার্ড ছবি দিন')}</button>`)}
        ${U().card(t('Excerpt', 'সংক্ষেপ'), `<textarea class="inp" id="bl-ex" rows="2" placeholder="${t('Two lines shown on the blog list', 'ব্লগ লিস্টে দেখানো 2 লাইন')}">${A.esc(p.excerpt)}</textarea>`)}
        ${U().card(t('Author', 'লেখক'), `${U().select('bl-au', AUTH().map((x) => [x.name, `${x.name} · ${x.role}`]), p.author)}${authorOf(p) ? `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:nowrap">${avatar(authorOf(p), 34)}<div class="small" style="min-width:0"><a href="${A.href('website', 'blog', 'author-' + authorOf(p).id)}">${A.esc(authorOf(p).name)}</a> · ${A.esc(authorOf(p).role)}<div class="muted">${t('Byline links to the author page (Person schema)', 'নাম থেকে লেখক পেজে লিংক (Person স্কিমা)')}</div></div></div>` : ''}<button class="btn sm ghost" id="bl-au-new" style="margin-top:6px">${A.icon('plus')}${t('New author', 'নতুন লেখক')}</button>`)}
      </div></div>`;
    wireBlogNav(el);
    const auto = () => { const a = document.getElementById('bl-auto'); if (a) a.innerHTML = '… ' + t('Saving', 'সেভ হচ্ছে'); clearTimeout(saveT); saveT = setTimeout(() => { A.commit(`Blog autosave: ${p.title}`); const b = document.getElementById('bl-auto'); if (b) b.innerHTML = `${A.icon('check')} ${t('Autosaved', 'অটো-সেভ হয়েছে')} ${F().time(new Date())}`; }, 700); };
    el.querySelector('#bl-title').oninput = (e) => { p.title = e.target.value; auto(); };
    A.on(el, '[data-tx]', 'input', (e, d) => { p.blocks.find((b) => b.id === d.dataset.tx).text = d.innerText; auto(); });
    A.on(el, '[data-alt]', 'input', (e, d) => { p.blocks.find((b) => b.id === d.dataset.alt).alt = d.value; auto(); });
    A.on(el, '[data-url]', 'input', (e, d) => { p.blocks.find((b) => b.id === d.dataset.url).url = d.value; auto(); });
    A.on(el, '[data-pid]', 'change', (e, d) => { p.blocks.find((b) => b.id === d.dataset.pid).pid = d.value; A.commit('Blog product block changed'); A.render(); });
    A.on(el, '[data-mv]', 'click', (e, b) => { const i = p.blocks.findIndex((x) => x.id === b.dataset.mv); const j = i + Number(b.dataset.d); if (j < 0 || j >= p.blocks.length) return; [p.blocks[i], p.blocks[j]] = [p.blocks[j], p.blocks[i]]; A.commit('Blog block moved'); A.render(); });
    A.on(el, '[data-rm]', 'click', (e, b) => { p.blocks = p.blocks.filter((x) => x.id !== b.dataset.rm); A.commit('Blog block removed'); A.toast(t('Block removed — use Revisions to bring it back', 'ব্লক সরানো হলো — রিভিশন থেকে ফেরানো যায়')); A.render(); });
    A.on(el, '[data-add]', 'click', (e, b) => { const k = b.dataset.add; const nb = { id: A.uid('b'), type: k, text: k === 'h' ? 'New heading' : '', pid: (A.D.products.find((x) => x.status === 'live') || A.D.products[0]).id, items: k === 'faq' ? [['Question?', 'Answer.']] : undefined }; p.blocks.push(nb); A.commit(`Blog block added: ${k}`); A.toast(t(`${BT[k][0]} block added`, `${BT[k][1]} ব্লক যোগ হলো`), 'good'); A.render(); });
    A.on(el, '[data-faq]', 'click', (e, b) => { const m = U().modal(t('Add question', 'প্রশ্ন যোগ'), U().field(t('Question', 'প্রশ্ন'), U().input('fq-q', '')) + U().field(t('Answer', 'উত্তর'), '<textarea class="inp" id="fq-a" rows="3"></textarea>'), { foot: `<button class="btn primary" id="fq-ok">${t('Add', 'যোগ')}</button>` }); m.parentElement.querySelector('#fq-ok').onclick = () => { const q = m.querySelector('#fq-q').value.trim(), a = m.querySelector('#fq-a').value.trim(); if (!q || !a) { A.toast(t('Write both', 'দুটোই লিখুন'), 'bad'); return; } p.blocks.find((x) => x.id === b.dataset.faq).items.push([q, a]); U().close(); A.commit('FAQ added'); A.toast(t('Question added', 'প্রশ্ন যোগ হলো'), 'good'); A.render(); }; });
    el.querySelector('#bl-kw').onchange = (e) => { p.kw = e.target.value.trim(); A.commit('Focus keyword set'); A.render(); };
    el.querySelector('#bl-meta').onchange = (e) => { p.meta = e.target.value.trim(); A.commit('Meta description saved'); A.render(); };
    el.querySelector('#bl-ex').oninput = (e) => { p.excerpt = e.target.value; auto(); };
    el.querySelector('#bl-tags').onchange = (e) => { p.tags = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); auto(); };
    el.querySelector('#bl-au').onchange = (e) => { p.author = e.target.value; A.commit('Post author changed'); A.render(); };
    el.querySelector('#bl-au-new').onclick = () => authorForm(null);
    el.querySelector('#bl-schema').onchange = (e) => { p.schema = e.target.value; auto(); };
    A.on(el, '[data-cat]', 'click', (e, b) => { const c = b.dataset.cat; p.cats = p.cats.includes(c) ? p.cats.filter((x) => x !== c) : p.cats.concat(c); A.commit('Post categories changed'); A.render(); });
    A.on(el, '[data-link]', 'click', (e, b) => { p.links++; A.commit('Internal link added'); A.toast(t('Link added to the post', 'পোস্টে লিংক যোগ হলো'), 'good'); A.render(); });
    const cv = el.querySelector('#bl-cover') || el.querySelector('#bl-cover-x'); cv.onclick = () => { p.cover = p.slug + '-cover.jpg'; A.commit('Featured image set'); A.toast(t('Featured image set from the media library', 'মিডিয়া লাইব্রেরি থেকে ফিচার্ড ছবি দেওয়া হলো'), 'good'); A.render(); };
    A.on(el, '[data-ai]', 'click', (e, b) => {
      const k = b.dataset.ai;
      if (k === 'outline') { ['Why it matters', 'Step by step', 'Common mistakes'].forEach((h) => p.blocks.push({ id: A.uid('b'), type: 'h', text: h })); }
      if (k === 'draft') p.blocks.push({ id: A.uid('b'), type: 'p', text: `Most of our customers in Dhaka wear ${p.kw || 'this'} 4–5 days a week, so small habits matter: wash cold, dry in shade and fold instead of hanging. These three steps alone double the life of a good shirt.` });
      if (k === 'meta') p.meta = `${p.title}: simple, tested tips from the EXTAS team. Sizes, fabric and care explained in plain words, with the products we use ourselves.`.slice(0, 158);
      if (k === 'bn') { p.bn = true; A.commit('Bengali copy created'); A.toast(t('Bengali copy created as a draft — check it before publishing', 'বাংলা কপি ড্রাফট হিসেবে তৈরি — পাবলিশের আগে দেখে নিন'), 'good'); return; }
      A.commit(`AI help: ${k}`); A.toast(t('AI added it — edit freely', 'AI যোগ করেছে — ইচ্ছামতো এডিট করুন'), 'good'); A.render();
    });
    A.on(el, '[data-pv]', 'click', (e, b) => { const ph = b.dataset.pv === 'phone'; U().modal(t('Preview', 'প্রিভিউ'), `<div style="${ph ? 'max-width:360px;margin:0 auto;border:8px solid var(--ink);border-radius:26px;padding:14px' : ''}"><h2>${A.esc(p.title)}</h2>${p.blocks.map((x) => (x.type === 'h' ? `<h3>${A.esc(x.text)}</h3>` : x.type === 'p' || x.type === 'quote' ? `<p>${A.esc(x.text)}</p>` : x.type === 'faq' ? x.items.map((q) => `<p><b>${A.esc(q[0])}</b><br>${A.esc(q[1])}</p>`).join('') : SHOPB.includes(x.type) ? (() => { const pr = A.byId(A.D.products, x.pid) || A.D.products[0]; return `<div class="row" style="gap:8px;margin:8px 0">${U().thumb(pr, 48)}<b>${A.esc(pr.name)}</b> ${F().tk(pr.price)}</div>`; })() : '')).join('')}</div>`, { wide: !ph }); });
    el.querySelector('#bl-rev').onclick = () => U().drawer(t('Revisions', 'রিভিশন'), `<div class="list">${Array.from({ length: Math.max(1, p.rev) }, (_, i) => `<div class="li"><div class="grow"><b>${t('Version', 'ভার্সন')} ${p.rev - i}</b><div class="muted small">${F().dt(A.TODAY.getTime() - i * 5 * 36e5)} · ${A.esc(p.author)}</div></div><button class="btn sm" data-restore="${i}">${t('Restore', 'ফেরান')}</button></div>`).join('')}</div>`, { onOpen: (d) => d.querySelectorAll('[data-restore]').forEach((x) => (x.onclick = () => { U().close(); A.toast(t('Version restored — the current one is kept as a revision', 'ভার্সন ফেরানো হলো — বর্তমানটা রিভিশনে রইল'), 'good'); })) });
    const setSt = (st, msg) => { p.status = st; p.rev++; if (st === 'published') p.date = F().ymd(A.TODAY); if (st === 'scheduled') { const v = el.querySelector('#bl-when').value; if (!v) { A.toast(t('Pick a date and time first', 'আগে তারিখ ও সময় দিন'), 'bad'); p.rev--; return; } p.date = v.slice(0, 10); } A.commit(`Blog post ${st}: ${p.title}`); A.toast(msg, 'good'); A.render(); };
    el.querySelector('#bl-draft').onclick = () => setSt('draft', t('Draft saved', 'ড্রাফট সেভ হয়েছে'));
    el.querySelector('#bl-sched').onclick = () => setSt('scheduled', t('Scheduled', 'শিডিউল হয়েছে'));
    el.querySelector('#bl-pub').onclick = () => { if (!p.title.trim() || p.title === 'New post') { A.toast(t('Give the post a real title first', 'আগে পোস্টের আসল টাইটেল দিন'), 'bad'); return; } setSt('published', t('Published — live on the blog', 'পাবলিশ হয়েছে — ব্লগে লাইভ')); };
  }

  /* ---------- Analytics ---------- */
  function renderAnalytics(el) {
    const s2 = S2(); const r = A.calc.range(s2.anaPer); const T = A.D.traffic;
    const inR2 = (x, a, b) => { const tt = new Date(x.date + 'T12:00:00+06:00').getTime(); return tt >= a && tt < b; };
    const cur = T.filter((x) => inR2(x, r.from, r.to)), prev = T.filter((x) => inR2(x, r.prevFrom, r.prevTo));
    const sm = (a, k) => A.sum(a, (x) => x[k]);
    const vis = sm(cur, 'users'), visP = sm(prev, 'users'), ses = sm(cur, 'sessions'), sesP = sm(prev, 'sessions');
    const ords = A.calc.ordersIn(r.from, r.to).filter((o) => o.channel === 'Website' && o.status !== 'cancelled'); const ordsP = A.calc.ordersIn(r.prevFrom, r.prevTo).filter((o) => o.channel === 'Website' && o.status !== 'cancelled');
    const conv = ses ? ords.length / ses * 100 : 0, convP = sesP ? ordsP.length / sesP * 100 : 0;
    const sub = s2.ana;
    const head = A.pageHead(t('Analytics', 'অ্যানালিটিক্স'), t('Who visits, how they find you, where they get stuck and how fast the shop is. From the shop’s own data.', 'কে আসে, কীভাবে খুঁজে পায়, কোথায় আটকায় আর দোকান কত দ্রুত। দোকানের নিজের ডেটা থেকে।'), `<button class="btn" id="an-exp">${A.icon('down')}${t('Export', 'এক্সপোর্ট')}</button>`) + A.tabsBar('website', 'analytics') +
      `<div class="row between" style="gap:8px;margin-bottom:12px">${U().seg('an-sub', [['overview', t('Overview', 'সারসংক্ষেপ')], ['search', t('Search', 'সার্চ')], ['behaviour', t('Behaviour', 'আচরণ')], ['speed', t('Speed', 'স্পিড')]], sub)}${U().seg('an-per', U().rangeOpts(), s2.anaPer)}</div>`;
    const ai = (h) => `<div class="callout info">${A.icon('info')}<div><b>AI</b> · ${h}</div></div>`;
    let body = '';
    if (sub === 'overview') {
      const SRC = [['Organic search', 'গুগল সার্চ', 0.31], ['Facebook ads', 'Facebook বিজ্ঞাপন', 0.24], ['Instagram', 'Instagram', 0.13], ['Google ads', 'Google বিজ্ঞাপন', 0.11], ['Direct', 'সরাসরি', 0.1], ['WhatsApp', 'WhatsApp', 0.07], ['Referral', 'অন্য সাইট', 0.04]];
      const dist = A.groupBy(ords, (o) => o.district); const dl = Object.entries(dist).sort((a, b) => b[1].length - a[1].length).slice(0, 6);
      const tops = A.D.products.filter((p) => p.status === 'live').sort((a, b) => b.views30 - a.views30).slice(0, 4);
      const live = 20 + Math.round((A.TODAY.getMinutes() % 20) * 1.2);
      body = ai(t(`Visitors ${vis >= visP ? 'up' : 'down'} ${F().pct(Math.abs(visP ? (vis - visP) / visP * 100 : 0), 0)} vs the period before. Visit → order is ${F().pct(conv, 1)}. Address field drop-off is the biggest leak at checkout.`, `আগের সময়ের চেয়ে ভিজিটর ${F().pct(Math.abs(visP ? (vis - visP) / visP * 100 : 0), 0)} ${vis >= visP ? 'বেড়েছে' : 'কমেছে'}। ভিজিট থেকে অর্ডার ${F().pct(conv, 1)}। চেকআউটে ঠিকানার ঘরে সবচেয়ে বেশি মানুষ ছেড়ে যায়।`)) +
        `<div class="grid g5">${U().card('', U().kpi({ label: t('Visitors', 'ভিজিটর'), value: F().num(vis), delta: A.delta(vis, visP) }))}${U().card('', U().kpi({ label: t('Sessions', 'সেশন'), value: F().num(ses), delta: A.delta(ses, sesP) }))}${U().card('', U().kpi({ label: t('Live now', 'এখন সাইটে'), value: live, sub: t(`${Math.round(live * 0.8)} on phones`, `${Math.round(live * 0.8)} জন ফোনে`) }))}${U().card('', U().kpi({ label: t('New / returning', 'নতুন / পুরনো'), value: '68 / 32', sub: t('percent', 'শতাংশ') }))}${U().card('', U().kpi({ label: t('Visit → order', 'ভিজিট → অর্ডার'), value: F().pct(conv, 1), delta: A.delta(conv, convP), sub: t(`${ords.length} orders`, `${ords.length}টি অর্ডার`) }))}</div>` +
        U().card(t('Visitors per day', 'প্রতিদিন ভিজিটর'), A.chart.line({ labels: cur.map((x) => F().date(x.date)), series: [{ name: t('This period', 'এই সময়'), color: 'var(--c1)', values: cur.map((x) => x.users) }, { name: t('Period before', 'আগের সময়'), color: 'var(--navy2)', dashed: true, values: prev.slice(-cur.length).map((x) => x.users) }], height: 200, money: false })) +
        `<div class="grid g3">${U().card(t('Traffic sources', 'কোথা থেকে আসে'), A.chart.bars({ money: false, items: SRC.map((x) => ({ label: t(x[0], x[1]), value: Math.round(vis * x[2]), text: `${F().num(Math.round(vis * x[2]))} · ${Math.round(x[2] * 100)}%` })) }))}${U().card(t('Devices', 'ডিভাইস'), A.chart.donut({ parts: [{ label: t('Phone', 'ফোন'), value: 86, color: 'var(--c1)' }, { label: t('Desktop', 'ডেস্কটপ'), value: 11, color: 'var(--c2)' }, { label: t('Tablet', 'ট্যাবলেট'), value: 3, color: 'var(--c3)' }], center: '86%' }))}${U().card(t('Top districts (orders)', 'শীর্ষ জেলা (অর্ডার)'), A.chart.bars({ money: false, items: dl.map((d) => ({ label: d[0], value: d[1].length, text: F().pct(d[1].length / (ords.length || 1) * 100, 0) })) }))}</div>` +
        U().card(t('Top pages', 'শীর্ষ পেজ'), U().table([{ h: t('Page', 'পেজ'), f: (x) => `<b>${A.esc(x.n)}</b>` }, { h: t('Views', 'ভিউ'), r: 1, f: (x) => F().num(x.v) }, { h: t('Avg time', 'গড় সময়'), r: 1, f: (x) => x.tm, hide: 1 }, { h: t('Orders', 'অর্ডার'), r: 1, f: (x) => (x.o ? F().num(x.o) : '—') }], [{ _id: 'h', n: t('Home', 'হোম'), v: Math.round(sm(cur, 'views') * 0.22), tm: '0m 48s', o: 0 }, { _id: 'c', n: t('Polo shirts (category)', 'পোলো শার্ট (ক্যাটাগরি)'), v: Math.round(sm(cur, 'views') * 0.09), tm: '1m 22s', o: 0 }].concat(tops.map((p) => ({ _id: p.id, n: p.name, v: p.views30, tm: '2m 05s', o: p.sold30 })))));
    } else if (sub === 'search') {
      const K = A.D.keywords.map((k) => { const imp = Math.round(k.volume * (k.pos ? Math.max(0.15, 1.2 - k.pos / 40) : 0.05)); const ctr = imp ? k.clicks / imp * 100 : 0; return { ...k, _id: k.id, imp, ctr }; });
      const imp = A.sum(K, (k) => k.imp), clk = A.sum(K, (k) => k.clicks); const ranked = K.filter((k) => k.pos); const pos = A.sum(ranked, (k) => k.pos) / (ranked.length || 1), posP = A.sum(ranked, (k) => k.prev) / (ranked.length || 1);
      body = ai(t(`${K.filter((k) => k.pos && k.pos < k.prev).length} searches moved up, ${K.filter((k) => k.pos > k.prev).length} moved down. “${K.filter((k) => k.pos && k.prev - k.pos > 0).sort((a, b) => b.prev - b.pos - (a.prev - a.pos))[0].kw}” gained the most.`, `${K.filter((k) => k.pos && k.pos < k.prev).length}টি সার্চে ওপরে উঠেছেন, ${K.filter((k) => k.pos > k.prev).length}টিতে নেমেছেন। “${K.filter((k) => k.pos && k.prev - k.pos > 0).sort((a, b) => b.prev - b.pos - (a.prev - a.pos))[0].kw}” সবচেয়ে বেশি উঠেছে।`)) +
        `<div class="grid g4">${U().card('', U().kpi({ label: t('Impressions', 'দেখানো হয়েছে'), value: F().num(imp), delta: A.delta(imp, imp * 0.85) }))}${U().card('', U().kpi({ label: t('Clicks', 'ক্লিক'), value: F().num(clk), delta: A.delta(clk, clk * 0.92) }))}${U().card('', U().kpi({ label: 'CTR', value: F().pct(imp ? clk / imp * 100 : 0, 1) }))}${U().card('', U().kpi({ label: t('Avg position', 'গড় অবস্থান'), value: pos.toFixed(1), delta: A.delta(pos, posP, true), sub: t('lower is better', 'কম মানে ভালো') }))}</div>` +
        U().card(t('Top searches', 'শীর্ষ সার্চ'), U().table([{ h: t('Search', 'সার্চ'), f: (k) => `<b>${A.esc(k.kw)}</b>` }, { h: t('Clicks', 'ক্লিক'), r: 1, f: (k) => F().num(k.clicks) }, { h: t('Impr.', 'দেখানো'), r: 1, f: (k) => F().num(k.imp), hide: 1 }, { h: 'CTR', r: 1, f: (k) => F().pct(k.ctr, 1), hide: 1 }, { h: t('Position', 'অবস্থান'), r: 1, f: (k) => (k.pos || '—') }, { h: t('Change', 'পরিবর্তন'), r: 1, f: (k) => (!k.pos ? '—' : k.pos < k.prev ? `<span style="color:var(--good)">▲ ${k.prev - k.pos}</span>` : k.pos > k.prev ? `<span style="color:var(--bad)">▼ ${k.pos - k.prev}</span>` : '—') }], K.sort((a, b) => b.clicks - a.clicks)), { sub: t('Google + Bing · Google data is 2 days behind', 'Google + Bing · Google-এর হিসাব 2 দিন পিছিয়ে') }) +
        U().card(t('New searches this week', 'এ সপ্তাহের নতুন সার্চ'), `<div class="chips">${[['polo shirt care', 41], ['winter hoodie men bd', 27], ['katua for men', 19], ['joggers price bd', 16], ['shacket bd', 11]].map((x) => `<button class="chip" data-np="${x[0]}">${x[0]}<span class="c">${x[1]}</span></button>`).join('')}</div><div class="muted small" style="margin-top:6px">${t('Tap one to start a blog post about it.', 'ব্লগ পোস্ট শুরু করতে একটায় চাপুন।')}</div>`);
    } else if (sub === 'behaviour') {
      const v = sm(cur, 'views'), c = sm(cur, 'carts'), ch = sm(cur, 'checkouts'); const del = ords.filter((o) => A.calc.isDelivered(o)).length;
      const s2b = S2(); s2b.syn = s2b.syn || [];
      body = ai(t('Size chart button on denim gets many repeat taps — it opens slowly. The address field loses 11% of people at checkout.', 'ডেনিমের সাইজ চার্ট বাটনে বারবার চাপ পড়ছে — ধীরে খোলে। চেকআউটে ঠিকানার ঘরে 11% মানুষ ছেড়ে যায়।')) +
        `<div class="grid g3">${U().card(t('Click heatmap · product page · phone', 'ক্লিক হিটম্যাপ · প্রোডাক্ট পেজ · ফোন'), `<div class="w2-heat">${[[8, 110, 'var(--warn-soft)', t('Product photos', 'প্রোডাক্টের ছবি')], [126, 30, 'var(--bad-soft)', 'S M L XL XXL'], [162, 26, 'var(--warn-soft)', t('Size chart', 'সাইজ চার্ট')], [196, 34, 'var(--bad-soft)', t('Add to bag', 'ব্যাগে যোগ')], [238, 28, 'var(--good-soft)', t('Ask on WhatsApp', 'WhatsApp-এ জিজ্ঞেস')], [276, 40, 'var(--card)', t('Details', 'বিস্তারিত')]].map((h) => `<span style="top:${h[0]}px;height:${h[1]}px;background:${h[2]}">${h[3]}</span>`).join('')}</div>`)}
        ${U().card(t('Scroll depth', 'কতদূর স্ক্রল করে'), `<div class="mk2-shareb">${[[t('Top', 'ওপরে'), 100], [t('Sizes', 'সাইজ'), 78], [t('Details', 'বিস্তারিত'), 52], [t('Reviews', 'রিভিউ'), 31], [t('Footer', 'ফুটার'), 14]].map((x) => `<div class="row between small" style="gap:8px"><span style="min-width:70px">${x[0]}</span><div class="grow">${U().bar(x[1])}</div><b>${x[1]}%</b></div>`).join('')}</div><div class="lbl" style="margin-top:12px">${t('Rage taps (tapped again and again)', 'রেজ ট্যাপ (বারবার চাপা)')}</div>${[[t('Size chart button · denim', 'সাইজ চার্ট বাটন · ডেনিম'), 14], [t('Colour swatch · Oxford shirt', 'রঙের বাটন · অক্সফোর্ড শার্ট'), 9], [t('Apply coupon · checkout', 'কুপন দিন · চেকআউট'), 7]].map((x) => `<div class="row between small"><span>${x[0]}</span>${U().badge(x[1], 'warn')}</div>`).join('')}`)}
        ${U().card(t('Order funnel', 'অর্ডার ফানেল'), A.chart.funnel([{ label: t('Product view', 'প্রোডাক্ট দেখা'), value: Math.round(v * 0.5) }, { label: t('Add to bag', 'ব্যাগে যোগ'), value: c }, { label: t('Checkout', 'চেকআউট'), value: ch }, { label: t('Order', 'অর্ডার'), value: ords.length || 1 }, { label: t('Delivered', 'ডেলিভারি'), value: del }]))}</div>
        <div class="grid g3">${U().card(t('Checkout field drop-off', 'চেকআউটের কোন ঘরে ছেড়ে যায়'), A.chart.bars({ money: false, items: [[t('Name', 'নাম'), 1], [t('Phone', 'ফোন'), 3], [t('Address', 'ঠিকানা'), 11], [t('Area', 'এলাকা'), 6], [t('Payment', 'পেমেন্ট'), 4]].map((x) => ({ label: x[0], value: x[1], text: x[1] + '%', color: x[1] > 8 ? 'var(--bad)' : 'var(--c1)' })) }))}
        ${U().card(t('Searches with no results', 'যে সার্চে কিছু পাওয়া যায়নি'), `<div class="list">${[['cargo joggers', 64, 'jogger'], ['linen panjabi', 41, 'panjabi'], ['oversize hoodie', 33, 'hoodie'], ['polo xxxl', 28, 'polo'], ['kurta', 12, 'panjabi']].map((x) => `<div class="li"><div class="grow"><b>${x[0]}</b><div class="muted small">${x[1]} ${t('times', 'বার')}</div></div>${s2b.syn.includes(x[0]) ? U().badge(t('Linked', 'যুক্ত'), 'good') : `<button class="btn sm" data-syn="${x[0]}" data-cat="${x[2]}">${t('Add a synonym', 'সমার্থক যোগ')}</button>`}</div>`).join('')}</div>`)}
        ${U().card(t('WhatsApp taps & helpers', 'WhatsApp চাপা ও সাহায্য'), `<div class="list">${[[t('Product page · Ask on WhatsApp', 'প্রোডাক্ট পেজ · WhatsApp-এ জিজ্ঞেস'), 312], [t('Size chart · Ask my size', 'সাইজ চার্ট · আমার সাইজ'), 141], [t('Checkout · Need help?', 'চেকআউট · সাহায্য লাগবে?'), 88]].map((x) => `<div class="li"><div class="grow small">${x[0]}</div><b>${x[1]}</b></div>`).join('')}</div><div class="lbl" style="margin-top:10px">${t('Size chart → purchase', 'সাইজ চার্ট → কেনা')}</div><div class="small">${t('2,140 opened → 1,380 picked a size → 410 added to bag', '2,140 খুলেছে → 1,380 সাইজ বেছেছে → 410 ব্যাগে যোগ')}</div><div class="lbl" style="margin-top:8px">${t('“All colours” → purchase', '“সব রং” → কেনা')}</div><div class="small">${t('1,860 opened → 612 changed colour → 96 bought', '1,860 খুলেছে → 612 রং বদলেছে → 96 কিনেছে')}</div>`)}</div>`;
    } else {
      const PT = [[t('Home', 'হোম'), 1.9, 0.04, 140], [t('Category', 'ক্যাটাগরি'), 2.3, 0.06, 180], [t('Product', 'প্রোডাক্ট'), 2.1, 0.02, 160], [t('Checkout', 'চেকআউট'), 1.6, 0.01, 120], [t('Blog post', 'ব্লগ পোস্ট'), 2.8, 0.12, 210]];
      const g = (x, a, b) => (x <= a ? ['good', t('Good', 'ভালো')] : x <= b ? ['warn', t('Needs work', 'উন্নতি দরকার')] : ['bad', t('Slow', 'ধীর')]);
      body = ai(t('Blog posts load slowest on phones (big cover images). Compressing them would bring LCP under 2.5 s.', 'ফোনে ব্লগ পোস্ট সবচেয়ে ধীরে খোলে (বড় কভার ছবি)। ছবি ছোট করলে LCP 2.5 সেকেন্ডের নিচে আসবে।')) +
        `<div class="w2-cwv">${U().card('LCP', U().kpi({ label: t('Main content shows', 'মূল অংশ দেখায়'), value: '2.1 s', sub: t('Good under 2.5 s', '2.5 সেকেন্ডের নিচে ভালো') }))}${U().card('INP', U().kpi({ label: t('Reacts to a tap', 'চাপলে সাড়া দেয়'), value: '160 ms', sub: t('Good under 200 ms', '200 ms-এর নিচে ভালো') }))}${U().card('CLS', U().kpi({ label: t('Page jumps', 'পেজ লাফায়'), value: '0.05', sub: t('Good under 0.1', '0.1-এর নিচে ভালো') }))}</div>` +
        U().card(t('By page type · phones', 'পেজের ধরন অনুযায়ী · ফোন'), U().table([{ h: t('Page type', 'পেজের ধরন'), f: (x) => `<b>${x[0]}</b>` }, { h: 'LCP', r: 1, f: (x) => `${x[1]} s ${U().badge(g(x[1], 2.5, 4)[1], g(x[1], 2.5, 4)[0])}` }, { h: 'CLS', r: 1, f: (x) => `${x[2]} ${U().badge(g(x[2], 0.1, 0.25)[1], g(x[2], 0.1, 0.25)[0])}`, hide: 1 }, { h: 'INP', r: 1, f: (x) => `${x[3]} ms`, hide: 1 }, { h: '', f: (x) => (x[1] > 2.5 ? `<button class="btn sm" data-fix="${x[0]}">${t('Fix images', 'ছবি ঠিক করুন')}</button>` : '') }], PT.map((x, i) => Object.assign(x, { _id: 'pt' + i }))));
    }
    el.innerHTML = head + body;
    A.on(el, '#an-sub button', 'click', (e, b) => { s2.ana = b.dataset.v; A.render(); });
    A.on(el, '#an-per button', 'click', (e, b) => { s2.anaPer = b.dataset.v; A.render(); });
    el.querySelector('#an-exp').onclick = () => { U().download(`extas-analytics-${sub}-${s2.anaPer}.csv`); A.toast(t('Export downloaded', 'এক্সপোর্ট ডাউনলোড হয়েছে'), 'good'); };
    A.on(el, '[data-syn]', 'click', (e, b) => { S2().syn.push(b.dataset.syn); A.commit(`Search synonym: ${b.dataset.syn} → ${b.dataset.cat}`); A.toast(t(`“${b.dataset.syn}” now shows ${b.dataset.cat} results`, `“${b.dataset.syn}” এখন ${b.dataset.cat}-এর ফল দেখাবে`), 'good'); A.render(); });
    A.on(el, '[data-np]', 'click', (e, b) => { const p = { id: A.uid('B'), title: b.dataset.np.replace(/\b\w/g, (m) => m.toUpperCase()), status: 'draft', date: '', views: 0, sales: 0 }; ensurePost(p); p.kw = b.dataset.np; p.meta = ''; A.D.blog.unshift(p); A.commit('Blog draft from search'); A.toast(t('Draft post created', 'ড্রাফট পোস্ট তৈরি'), 'good'); A.go('website', 'blog', p.id); });
    A.on(el, '[data-fix]', 'click', (e, b) => { A.commit(`Images compressed for ${b.dataset.fix}`); A.toast(t('Images compressed — speed is checked again tonight', 'ছবি ছোট করা হলো — আজ রাতে আবার স্পিড চেক হবে'), 'good'); });
  }

  /* ---------- Shop text ---------- */
  const STP = { header: ['Header', 'হেডার'], announcement: ['Announcement bar', 'ঘোষণা বার'], home: ['Home', 'হোম'], product: ['Product page', 'প্রোডাক্ট পেজ'], bag: ['Bag', 'ব্যাগ'], checkout: ['Checkout', 'চেকআউট'], invoice: ['Invoice', 'ইনভয়েস'], sms: ['SMS & WhatsApp', 'SMS ও WhatsApp'], email: ['Email', 'ইমেইল'], footer: ['Footer', 'ফুটার'] };
  function stexts() {
    const w = W(); if (w.stx) return w.stx;
    const map = { Header: 'header', Buttons: 'product', Checkout: 'checkout', Footer: 'footer' };
    const base = (w.texts || []).map((x) => ({ k: x.k, p: map[x.g] || 'home', en: x.en, bn: x.bn }));
    const add = [['announcement', 'ann', 'Free delivery on orders over {free}', '{free}-এর বেশি অর্ডারে ফ্রি ডেলিভারি'], ['home', 'hero', 'Winter polos are here', 'শীতের পোলো চলে এসেছে'], ['home', 'trust', 'Cash on delivery · 72-hour exchange', 'ক্যাশ অন ডেলিভারি · 72 ঘণ্টায় এক্সচেঞ্জ'], ['product', 'sizech', 'Size chart', 'সাইজ চার্ট'], ['product', 'askwa', 'Ask on WhatsApp', 'WhatsApp-এ জিজ্ঞেস করুন'], ['product', 'lowst', 'Only {n} left', 'মাত্র {n}টি বাকি'], ['bag', 'bagempty', 'Your bag is empty', 'আপনার ব্যাগ খালি'], ['bag', 'freebar', 'Add {left} more for free delivery', 'ফ্রি ডেলিভারির জন্য আরও {left} যোগ করুন'], ['checkout', 'addr', 'Full address (house, road, area)', 'পুরো ঠিকানা (বাসা, রোড, এলাকা)'], ['checkout', 'place', 'Place order', 'অর্ডার করুন'], ['invoice', 'invt', 'Thank you for shopping with EXTAS', 'EXTAS থেকে কেনার জন্য ধন্যবাদ'], ['invoice', 'invx', 'Exchange within 72 hours for size or defect', 'সাইজ বা ত্রুটির জন্য 72 ঘণ্টার মধ্যে এক্সচেঞ্জ'], ['sms', 'smsconf', 'Hi {name}, your order {order} is confirmed. Total {total}.', 'প্রিয় {name}, আপনার অর্ডার {order} কনফার্ম। মোট {total}।'], ['sms', 'smsship', '{order} is with {courier}. Track: {link}', '{order} এখন {courier}-এ। ট্র্যাক: {link}'], ['email', 'emconf', 'Order {order} confirmed', 'অর্ডার {order} কনফার্ম'], ['footer', 'copy', '© EXTAS. All rights reserved.', '© EXTAS. সর্বস্বত্ব সংরক্ষিত।']];
    w.stx = base.concat(add.filter((a) => !base.some((b) => b.k === a[1])).map((a) => ({ p: a[0], k: a[1], en: a[2], bn: a[3] })));
    return w.stx;
  }
  function renderText2(el) {
    const s2 = S2(); const L = stexts(); const q = s2.stxQ.toLowerCase();
    const list = L.filter((x) => (q ? (x.en + ' ' + x.bn).toLowerCase().includes(q) : x.p === s2.stxPage));
    const miss = L.filter((x) => !x.bn.trim()).length; const pg = q ? null : s2.stxPage;
    const prevL = L.filter((x) => x.p === (pg || (list[0] && list[0].p) || 'checkout'));
    const pvLang = s2.stxLang || 'en';
    el.innerHTML = A.pageHead(t('Shop text', 'দোকানের লেখা'), t('Every word customers see — buttons, messages, checkout, invoice, SMS, email — in English and Bengali. Nothing is fixed in the code.', 'কাস্টমার যা দেখেন তার প্রতিটা লেখা — বাটন, মেসেজ, চেকআউট, ইনভয়েস, SMS, ইমেইল — ইংরেজি ও বাংলায়। কোডে কিছুই আটকানো নেই।'), `<button class="btn primary" id="st-save">${t('Save changes', 'পরিবর্তন সেভ')}</button>`) + A.tabsBar('website', 'text') +
      (miss ? U().callout(t(`<b>${miss} texts have no Bengali.</b> Bengali visitors see English there.`, `<b>${miss}টি লেখার বাংলা নেই।</b> বাংলা ভিজিটর সেখানে ইংরেজি দেখবেন।`), 'warn', 'warn') : '') +
      `<div class="row" style="gap:8px;margin-bottom:10px"><input class="inp" id="st-q" placeholder="${t('Search all text…', 'সব লেখায় খুঁজুন…')}" value="${A.esc(s2.stxQ)}" style="max-width:300px"></div>
      <div class="chips" id="st-p" style="margin-bottom:12px">${Object.keys(STP).map((k) => `<button class="chip ${!q && k === s2.stxPage ? 'on' : ''}" data-v="${k}">${t(STP[k][0], STP[k][1])}<span class="c">${L.filter((x) => x.p === k).length}</span></button>`).join('')}</div>
      <div class="grid g3"><div class="span2">${U().card(q ? t(`Results for “${A.esc(s2.stxQ)}”`, `“${A.esc(s2.stxQ)}”-এর ফল`) : t(STP[pg][0], STP[pg][1]), list.length ? `<div class="w2-row hide-sm" style="padding-top:0"><span class="lbl">${t('Where', 'কোথায়')}</span><span class="lbl">English</span><span class="lbl">বাংলা</span></div>` + list.map((x) => `<div class="w2-row"><span class="small muted">${t(STP[x.p][0], STP[x.p][1])} · <span class="mono">${x.k}</span></span><textarea class="inp" rows="1" data-en="${x.k}">${A.esc(x.en)}</textarea><textarea class="inp" rows="1" data-bn="${x.k}" placeholder="${t('Bengali missing — write it here', 'বাংলা নেই — এখানে লিখুন')}" style="${x.bn.trim() ? '' : 'border-color:var(--warn)'}">${A.esc(x.bn)}</textarea></div>`).join('') + U().guide(t('Words in {curly brackets} are filled in by the shop: {name}, {order}, {total}, {free}, {left}, {courier}, {link}, {n}.', '{বাঁকা ব্র্যাকেটের} শব্দ দোকান নিজে বসায়: {name}, {order}, {total}, {free}, {left}, {courier}, {link}, {n}।')) : U().empty(t('No text matches', 'কোনো লেখা মেলেনি')))}</div>
      <div>${U().card(t('Preview', 'প্রিভিউ'), `<div class="row" style="justify-content:center;margin-bottom:8px">${U().seg('st-pl', [['en', 'English'], ['bn', 'বাংলা']], pvLang)}</div><div class="w2-ph">${prevL.map((x) => `<div class="ln" data-pv="${x.k}">${A.esc((pvLang === 'bn' ? x.bn || x.en : x.en).replace('{free}', F().tk(A.D.rules.freeDelivery.over)).replace('{name}', 'Sakib').replace('{order}', 'EX-10231').replace('{total}', F().tk(1650)).replace('{left}', F().tk(450)).replace('{courier}', 'Pathao').replace('{link}', 'extas.com.bd/t/9F2').replace('{n}', '3'))}</div>`).join('')}</div>`)}</div></div>`;
    const qi = el.querySelector('#st-q'); qi.oninput = () => { s2.stxQ = qi.value; A.render(); const n = document.querySelector('#st-q'); n.focus(); n.setSelectionRange(s2.stxQ.length, s2.stxQ.length); };
    A.on(el, '#st-p .chip', 'click', (e, b) => { s2.stxPage = b.dataset.v; s2.stxQ = ''; A.render(); });
    A.on(el, '#st-pl button', 'click', (e, b) => { s2.stxLang = b.dataset.v; A.render(); });
    A.on(el, 'textarea[data-en],textarea[data-bn]', 'focus', (e, ta) => { el.querySelectorAll('.w2-ph .ln').forEach((l) => l.classList.toggle('hl', l.dataset.pv === (ta.dataset.en || ta.dataset.bn))); });
    el.querySelector('#st-save').onclick = () => {
      let n = 0;
      el.querySelectorAll('[data-en]').forEach((i) => { const x = L.find((z) => z.k === i.dataset.en); if (i.value.trim() && x.en !== i.value.trim()) { x.en = i.value.trim(); n++; } });
      el.querySelectorAll('[data-bn]').forEach((i) => { const x = L.find((z) => z.k === i.dataset.bn); if (x.bn !== i.value.trim()) { x.bn = i.value.trim(); n++; } });
      A.commit(`Shop text: ${n} changes saved`); A.toast(n ? t(`${n} changes saved — live on the shop`, `${n}টি পরিবর্তন সেভ — দোকানে লাইভ`) : t('Nothing changed', 'কিছু বদলায়নি'), n ? 'good' : ''); A.render();
    };
  }

  const G = (en, bn) => ({ en, bn });
  A.mod('website', {
    layout: { render: (el) => renderLayout(el), guide: G('<p><b>What:</b> the blocks on the home page and product page, their order, and the hero slider.</p><p><b>Why:</b> 86% of visitors use phones and most stop after 4 blocks.</p><p><b>How:</b> switch blocks on or off, move them up or down, watch the phone preview, then save.</p>', '<p><b>কী:</b> হোম ও প্রোডাক্ট পেজের অংশ, তাদের ক্রম আর হিরো স্লাইডার।</p><p><b>কেন:</b> 86% ভিজিটর ফোনে আসেন, বেশিরভাগ 4টা অংশের পর থামেন।</p><p><b>কীভাবে:</b> অংশ চালু/বন্ধ করুন, ওপরে-নিচে সরান, ফোন প্রিভিউ দেখে সেভ করুন।</p>') },
    text: { render: (el) => renderText2(el), guide: G('<p><b>What:</b> every storefront text by page — header, announcement, product, bag, checkout, invoice, SMS/WhatsApp, email, footer — in English and Bengali.</p><p><b>Why:</b> clear words sell. “Full address (house, road, area)” cut wrong addresses for many shops.</p><p><b>How:</b> pick a page or search, edit, watch the preview, Save changes.</p>', '<p><b>কী:</b> পেজ অনুযায়ী দোকানের সব লেখা — হেডার, ঘোষণা, প্রোডাক্ট, ব্যাগ, চেকআউট, ইনভয়েস, SMS/WhatsApp, ইমেইল, ফুটার — ইংরেজি ও বাংলায়।</p><p><b>কেন:</b> পরিষ্কার লেখা বিক্রি বাড়ায়। “পুরো ঠিকানা (বাসা, রোড, এলাকা)” লিখলে ভুল ঠিকানা কমে।</p><p><b>কীভাবে:</b> পেজ বাছুন বা খুঁজুন, এডিট করুন, প্রিভিউ দেখে সেভ করুন।</p>') },
    policies: { render: (el) => renderPolicies2(el), guide: G('<p><b>What:</b> Terms, Privacy, Delivery, Exchange, Payment & COD, Cancellation & Refund, Wallet & coupons, Reviews and Cookies — each with “at a glance” boxes and short points.</p><p><b>Why:</b> if the page says ৳80 but checkout charges ৳100, people stop trusting the shop. Numbers here come from Rules.</p><p><b>How:</b> pick a page, switch English/বাংলা, edit a section if needed, Publish. History keeps every change.</p>', '<p><b>কী:</b> শর্তাবলি, গোপনীয়তা, ডেলিভারি, এক্সচেঞ্জ, পেমেন্ট ও COD, বাতিল ও রিফান্ড, ওয়ালেট ও কুপন, রিভিউ ও কুকি — প্রতিটায় “এক নজরে” বক্স ও ছোট পয়েন্ট।</p><p><b>কেন:</b> পেজে ৳80 লেখা অথচ চেকআউটে ৳100 নিলে ভরসা কমে। এখানের সংখ্যা Rules থেকে আসে।</p><p><b>কীভাবে:</b> পেজ বাছুন, English/বাংলা বদলান, দরকারে অংশ এডিট করুন, পাবলিশ করুন। হিস্ট্রিতে সব পরিবর্তন থাকে।</p>') },
    blog: { render: (el, r) => renderBlog2(el, r), guide: G('<p><b>What:</b> a block editor for blog posts with Product, Combo and FAQ blocks, plus an SEO panel.</p><p><b>Why:</b> a post like “How to keep a polo in shape” answers Google searches and sells the polo inside it.</p><p><b>How:</b> New post → title → add blocks with + → set focus keyword and fix the red items → Preview → Publish or Schedule. It saves by itself as you type.</p>', '<p><b>কী:</b> ব্লগ পোস্টের ব্লক এডিটর, Product, Combo ও FAQ ব্লকসহ, আর SEO প্যানেল।</p><p><b>কেন:</b> “পোলো কীভাবে ঠিক রাখবেন” টাইপ পোস্ট Google সার্চের উত্তর দেয় আর ভেতরের পোলো বিক্রি করে।</p><p><b>কীভাবে:</b> নতুন পোস্ট → টাইটেল → + দিয়ে ব্লক → ফোকাস কিওয়ার্ড দিয়ে লাল চিহ্ন ঠিক করুন → প্রিভিউ → পাবলিশ বা শিডিউল। লিখতে লিখতে নিজে সেভ হয়।</p>') },
    analytics: { render: (el) => renderAnalytics(el), guide: G('<p><b>What:</b> Overview (visitors, sources, devices, districts, top pages), Search (Google and Bing), Behaviour (heatmap, scroll, funnel, checkout drop-off, no-result searches) and Speed.</p><p><b>Why:</b> if 11% leave at the address field, fixing that one field is worth more than a new ad.</p><p><b>How:</b> pick a view and a period; act on the AI line at the top.</p>', '<p><b>কী:</b> সারসংক্ষেপ (ভিজিটর, উৎস, ডিভাইস, জেলা, শীর্ষ পেজ), সার্চ (Google ও Bing), আচরণ (হিটম্যাপ, স্ক্রল, ফানেল, চেকআউটে ছেড়ে যাওয়া, ফলহীন সার্চ) ও স্পিড।</p><p><b>কেন:</b> ঠিকানার ঘরে 11% ছেড়ে গেলে ওই একটা ঘর ঠিক করাই নতুন বিজ্ঞাপনের চেয়ে বেশি কাজের।</p><p><b>কীভাবে:</b> ভিউ ও সময় বাছুন; ওপরের AI লাইন দেখে কাজ করুন।</p>') },
    seo: { render: (el) => renderSeo(el), guide: G('<p><b>What:</b> your SEO score, Google positions for important searches, problems to fix, sitemap and redirects.</p><p><b>Why:</b> moving “polo shirt price in bangladesh” from #7 to #3 can bring hundreds of free visitors a month.</p><p><b>How:</b> fix red items first, then improve the weakest product pages.</p>', '<p><b>কী:</b> আপনার SEO স্কোর, জরুরি সার্চে Google-এ অবস্থান, যা ঠিক করতে হবে, সাইটম্যাপ ও রিডাইরেক্ট।</p><p><b>কেন:</b> “polo shirt price in bangladesh” 7 থেকে 3 নম্বরে আনলে মাসে শত শত ফ্রি ভিজিটর আসে।</p><p><b>কীভাবে:</b> আগে লাল সমস্যা ঠিক করুন, তারপর দুর্বল প্রোডাক্ট পেজ।</p>') },
  });
})();
