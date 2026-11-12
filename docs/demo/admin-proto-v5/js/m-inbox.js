/* EXTAS admin prototype — Inbox: conversations from Messenger, WhatsApp, Instagram and website chat in one place,
   quick replies, response times. */
(function () {
  'use strict';
  const A = window.A; const U = A.ui; const C = A.calc; const t = (en, bn) => A.t(en, bn);
  const ME = 'Mehadi';
  const STAFF = () => [['', t('Unassigned', 'কেউ না')], [ME, 'Mehadi'], ['Nusrat', 'Nusrat'], ['Rafi', 'Rafi']];
  const CHS = ['Messenger', 'WhatsApp', 'Instagram', 'Website chat'];
  const CHCOL = { Messenger: 'var(--c2)', WhatsApp: 'var(--good)', Instagram: 'var(--c6)', 'Website chat': 'var(--c1)' };

  A.css('inbox', `
  .ibx-av-l{width:44px;height:44px;font-size:18px;flex:none}
  .ibx-cap{display:flex;gap:8px;align-items:flex-start;background:var(--card2);border:1px dashed var(--accent);border-radius:10px;padding:8px 10px;margin-bottom:8px;font-size:13px}
  .ibx-cap svg{width:16px;height:16px;flex:none;margin-top:2px;color:var(--accent)}
  .ibx-sc{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:8px}
  .ibx-sc b{display:block;font:700 20px var(--f-head)}
  .ibx-live{display:flex;flex-direction:column;gap:3px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:8px 10px;margin-bottom:8px;text-decoration:none;color:inherit}

  .ibx{display:grid;grid-template-columns:320px minmax(0,1fr) 280px;gap:14px;align-items:start}
  .ibx-list{padding:12px}
  .ibx-items{max-height:68vh;overflow:auto;margin:8px -12px -12px}
  .ibx-it{display:flex;gap:10px;padding:10px 12px;border-top:1px solid var(--line);text-decoration:none;color:inherit;align-items:flex-start}
  .ibx-it:hover{background:var(--card2)}
  .ibx-it.on{background:var(--accent-soft)}
  .ibx-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;flex:none;font-size:14px}
  .ibx-it .tx{font-size:12.5px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
  .ibx-it.un b{color:var(--ink)} .ibx-it.un .tx{color:var(--ink2);font-weight:600}
  .ibx-ud{width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block;margin-left:4px}
  .ibx-th{display:flex;flex-direction:column;padding:0;overflow:hidden}
  .ibx-hd{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line)}
  .ibx-msgs{padding:14px;display:flex;flex-direction:column;gap:8px;max-height:52vh;min-height:260px;overflow:auto;background:var(--card2)}
  .ibx-b{max-width:78%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
  .ibx-b.c{align-self:flex-start;background:var(--card);border:1px solid var(--line);border-bottom-left-radius:4px}
  .ibx-b.s{align-self:flex-end;background:var(--navy2);color:#fff;border-bottom-right-radius:4px}
  .ibx-b .m{display:block;font-size:11px;opacity:.7;margin-top:3px}
  .ibx-cmp{padding:12px 14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
  .ibx-cmp textarea{min-height:64px;resize:vertical}
  .ibx-cmp .row{gap:8px;flex-wrap:wrap}
  .ibx-back{display:none}
  .ibx-cust .li{font-size:13px}
  @media (max-width:1180px){.ibx{grid-template-columns:300px minmax(0,1fr)}.ibx-cust{grid-column:2}}
  @media (max-width:960px){.ibx{grid-template-columns:minmax(0,1fr)}.ibx-cust{grid-column:auto}.ibx.has .ibx-list{display:none}.ibx:not(.has) .ibx-th,.ibx:not(.has) .ibx-cust{display:none}.ibx-back{display:inline-flex}.ibx-items{max-height:none}.ibx-msgs{max-height:none}.ibx-b{max-width:88%}}
  `);

  function ensure() {
    const D = A.D; seedInstagram();
    if (!D.ibxInit) {
      D.ibxInit = true;
      D.conversations.filter((c) => c.status === 'open' && c.assignee === 'Nusrat').slice(0, 2).forEach((c) => (c.assignee = ME));
      D.quickReplies.forEach((q, i) => { if (q.used == null) q.used = [42, 31, 18, 27][i] || 0; });
    }
  }
  const avColor = (name) => `var(--c${(A.sum(name.split(''), (c) => c.charCodeAt(0)) % 6) + 1})`;
  const cust = (cv) => A.byId(A.D.customers, cv.customerId);
  const firstReply = (cv) => { const c0 = cv.msgs.find((m) => m.from === 'c'); if (!c0) return null; const s = cv.msgs.find((m) => m.from === 's' && new Date(m.t) >= new Date(c0.t)); return s ? (new Date(s.t) - new Date(c0.t)) / 6e4 : null; };
  const waiting = (cv) => { const last = cv.msgs[cv.msgs.length - 1]; return cv.status === 'open' && last.from === 'c' ? (A.TODAY - new Date(last.t)) / 6e4 : 0; };
  const mins = (m) => (m == null ? '—' : m < 60 ? Math.round(m) + t(' min', ' মিনিট') : (m / 60).toFixed(1) + t(' h', ' ঘণ্টা'));
  const chBadge = (ch) => `<span class="badge" style="color:${CHCOL[ch]};border-color:${CHCOL[ch]}">${A.esc(ch)}</span>`;

  /* ================= CONVERSATIONS ================= */
  const st = { f: 'open', ch: 'all', q: '' };
  function renderChats(el, r) {
    if (r.id === 'comments') st.view = 'comments'; else if (r.id) st.view = 'msgs';
    if (st.view === 'comments') return renderComments(el, r);
    ensure(); const CV = A.D.conversations;
    const counts = { open: CV.filter((c) => c.status === 'open').length, mine: CV.filter((c) => c.status === 'open' && c.assignee === ME).length, un: CV.filter((c) => c.status === 'open' && !c.assignee).length, done: CV.filter((c) => c.status === 'done').length, all: CV.length };
    const replied = CV.map(firstReply).filter((x) => x != null); const avg = replied.length ? A.sum(replied) / replied.length : null;
    const longest = Math.max(0, ...CV.map(waiting));
    const cur = r.id ? A.byId(CV, r.id) : null;
    if (cur && cur.unread) { cur.unread = false; A.save(); }
    el.innerHTML = A.pageHead(t('Inbox', 'ইনবক্স'), t(`${counts.open} open · ${counts.un} not assigned · first reply in ${mins(avg)} on average · longest wait ${mins(longest)}`, `${counts.open}টি খোলা · ${counts.un}টি কারো নামে নেই · প্রথম উত্তরের গড় সময় ${mins(avg)} · সবচেয়ে বেশি অপেক্ষা ${mins(longest)}`)) + A.tabsBar('inbox', 'chats') + viewBar() +
      `<div class="ibx ${cur ? 'has' : ''}"><div class="card ibx-list"><input class="inp" id="ib-q" placeholder="${t('Search name, phone or message', 'নাম, ফোন বা মেসেজ খুঁজুন')}" value="${A.esc(st.q)}"><div class="chips" style="margin-top:8px">${[['open', t('Open', 'খোলা')], ['mine', t('Mine', 'আমার')], ['un', t('Unassigned', 'কারো নামে নেই')], ['done', t('Done', 'শেষ')], ['all', t('All', 'সব')]].map((c) => `<button class="chip ${st.f === c[0] ? 'on' : ''}" data-f="${c[0]}">${c[1]}<span class="c">${counts[c[0]]}</span></button>`).join('')}</div><div class="chips" style="margin-top:6px">${[['all', t('All channels', 'সব চ্যানেল')]].concat(CHS.map((c) => [c, c])).map((c) => `<button class="chip ${st.ch === c[0] ? 'on' : ''}" data-ch="${c[0]}">${c[1]}</button>`).join('')}</div><div class="ibx-items" id="ib-items"></div></div>
      ${cur ? thread(cur) + panel(cur) : `<div class="card ibx-th">${U.empty(t('Pick a conversation on the left', 'বাম দিক থেকে একটা কথোপকথন বাছুন'))}</div><div class="card ibx-cust">${U.callout(t(`${counts.un} chats have no owner. Assign them so nobody waits.`, `${counts.un}টি চ্যাট কারো নামে নেই। কাউকে দিন যাতে কেউ অপেক্ষায় না থাকে।`), counts.un ? 'warn' : 'good', counts.un ? 'warn' : 'check')}</div>`}</div>`;
    const drawList = () => {
      const s = st.q.toLowerCase();
      const list = CV.filter((c) => (st.f === 'all' || (st.f === 'done' ? c.status === 'done' : c.status === 'open' && (st.f === 'open' || (st.f === 'mine' ? c.assignee === ME : !c.assignee)))) && (st.ch === 'all' || c.channel === st.ch) && (!s || c.name.toLowerCase().includes(s) || (cust(c) || {}).phone?.includes(s) || c.msgs.some((m) => m.text.toLowerCase().includes(s)))).sort((a, b) => new Date(b.last) - new Date(a.last));
      el.querySelector('#ib-items').innerHTML = list.map((c) => { const last = c.msgs[c.msgs.length - 1]; const w = waiting(c); return `<a class="ibx-it ${c.unread ? 'un' : ''} ${cur && cur.id === c.id ? 'on' : ''}" href="${A.href('inbox', 'chats', c.id)}"><span class="ibx-av" style="background:${avColor(c.name)}">${A.esc(c.name[0])}</span><div style="min-width:0;flex:1"><div class="row between" style="gap:6px"><b class="ellip">${A.esc(c.name)}${c.unread ? '<span class="ibx-ud"></span>' : ''}</b><span class="muted small" style="flex:none">${A.fmt.ago(c.last)}</span></div><div class="tx">${last.from === 's' ? t('You: ', 'আপনি: ') : ''}${A.esc(last.text)}</div><div class="row" style="gap:6px;margin-top:4px">${chBadge(c.channel)}${c.assignee ? `<span class="small muted">${A.esc(c.assignee === ME ? t('You', 'আপনি') : c.assignee)}</span>` : U.badge(t('No owner', 'কারো নামে নেই'), 'warn')}${w > 30 ? U.badge(t(`waiting ${mins(w)}`, `${mins(w)} অপেক্ষায়`), 'bad') : ''}</div></div></a>`; }).join('') || `<div style="padding:12px">${U.empty(t('No conversations here', 'এখানে কোনো কথোপকথন নেই'))}</div>`;
    };
    el.querySelector('#ib-q').oninput = (e) => { st.q = e.target.value; drawList(); };
    A.on(el, '[data-f]', 'click', (e, b) => { st.f = b.dataset.f; A.render(); });
    A.on(el, '[data-ch]', 'click', (e, b) => { st.ch = b.dataset.ch; A.render(); });
    drawList(); wireView(el);
    if (cur) { wireThread(el, cur); wireCapture(el, cur); }
  }
  function thread(cv) {
    const qr = A.D.quickReplies;
    return `<div class="card ibx-th"><div class="ibx-hd"><a class="btn sm ibx-back" href="${A.href('inbox', 'chats')}">←</a><span class="ibx-av" style="background:${avColor(cv.name)}">${A.esc(cv.name[0])}</span><div style="min-width:0;flex:1"><b>${A.esc(cv.name)}</b><div>${chBadge(cv.channel)} ${cv.status === 'done' ? U.badge(t('Done', 'শেষ'), 'good') : U.badge(t('Open', 'খোলা'), 'accent')}</div></div>${U.select('ib-as', STAFF(), cv.assignee || '', `aria-label="${t('Assign', 'দায়িত্ব দিন')}" style="width:auto"`)}<button class="btn sm ${cv.status === 'done' ? '' : 'primary'}" id="ib-done">${cv.status === 'done' ? t('Reopen', 'আবার খুলুন') : A.icon('check') + t('Mark done', 'শেষ করুন')}</button></div>
      <div class="ibx-msgs" id="ib-msgs">${cv.msgs.map((m) => `<div class="ibx-b ${m.from}">${A.esc(m.text)}<span class="m">${m.from === 's' ? A.esc(m.by === ME ? t('You', 'আপনি') : m.by || '') + ' · ' : ''}${A.fmt.dt(m.t)}</span></div>`).join('')}</div>
      <div class="ibx-cmp"><div class="row">${U.select('ib-qr', [['', t('Quick reply…', 'দ্রুত উত্তর…')]].concat(qr.filter((q) => !q.archived).map((q) => [q.id, '/' + q.key + ' · ' + q.text.slice(0, 34) + '…'])), '', 'style="flex:1;min-width:160px"')}<button class="btn sm" id="ib-link">${A.icon('ext')}${t('Send order link', 'অর্ডার লিংক পাঠান')}</button><button class="btn sm" id="ib-order">${A.icon('plus')}${t('Create order', 'অর্ডার বানান')}</button></div><textarea class="inp" id="ib-txt" placeholder="${t('Write a reply… type / for quick replies', 'উত্তর লিখুন… দ্রুত উত্তরের জন্য / লিখুন')}"></textarea><div class="row between"><span class="muted small">${t(`Goes out on ${cv.channel}`, `${cv.channel} এ যাবে`)}</span><button class="btn primary" id="ib-send">${A.icon('send')}${t('Send', 'পাঠান')}</button></div></div></div>`;
  }
  const PH_RE = /(?:\+?88)?0?1[3-9]\d{8}/;
  const normPh = (s) => { const d = String(s).replace(/\D/g, '').replace(/^88/, ''); return d.length === 10 ? '0' + d : d; };
  const phoneInChat = (cv) => { for (let i = cv.msgs.length - 1; i >= 0; i--) { const m = cv.msgs[i]; if (m.from === 'c') { const x = String(m.text).replace(/[\s-]/g, '').match(PH_RE); if (x) return normPh(x[0]); } } return ''; };
  function seedInstagram() {
    const D = A.D; if (D.ibxIg) return; D.ibxIg = true;
    const pickC = (i) => D.customers[(i * 37 + 11) % D.customers.length];
    const now = A.TODAY.getTime(); const iso = (m) => new Date(now - m * 6e4).toISOString();
    const c1 = pickC(1), c2 = pickC(2), c3 = D.customers.find((c) => c.refused >= 1) || pickC(3);
    D.conversations.unshift(
      { id: 'IG1', customerId: c1.id, name: c1.name, handle: '@' + c1.name.split(' ')[0].toLowerCase() + '.style', channel: 'Instagram', status: 'open', unread: true, assignee: '', last: iso(6), msgs: [{ from: 'c', text: 'Replied to your story: ei olive overshirt ta ki M e ache?', t: iso(9) }, { from: 'c', text: 'Price koto bhai?', t: iso(6) }] },
      { id: 'IG2', customerId: null, name: 'tanvir_rahman.bd', handle: '@tanvir_rahman.bd', channel: 'Instagram', status: 'open', unread: true, assignee: '', last: iso(14), msgs: [{ from: 'c', text: 'Black panjabi XL nibo, cash on delivery hobe?', t: iso(22) }, { from: 's', text: 'Ji hobe! Apnar phone number ar address din please.', t: iso(18), by: 'Nusrat' }, { from: 'c', text: `Number ${c3.phone}, Mirpur 10`, t: iso(14) }] },
      { id: 'IG3', customerId: c2.id, name: c2.name, handle: '@' + c2.name.split(' ')[1].toLowerCase() + '_fits', channel: 'Instagram', status: 'done', unread: false, assignee: 'Rafi', last: iso(300), msgs: [{ from: 'c', text: 'Size chart ta den', t: iso(330) }, { from: 's', text: 'L size chest 42", length 29". Size chart pathalam.', t: iso(300), by: 'Rafi' }] },
    );
    if (!D.conversations.some((v) => v.customerId === c1.id && v.channel !== 'Instagram')) D.conversations.push({ id: 'WA-IG1', customerId: c1.id, name: c1.name, channel: 'WhatsApp', status: 'done', unread: false, assignee: 'Nusrat', last: iso(60 * 24 * 9), msgs: [{ from: 'c', text: 'Parcel peyechi, thanks!', t: iso(60 * 24 * 9) }] });
  }
  function panel(cv) {
    const ph = phoneInChat(cv); let c = cust(cv);
    const byPhone = !c && ph ? A.D.customers.find((x) => normPh(x.phone) === ph) : null;
    const who = c || byPhone; const phone = who ? who.phone : ph;
    const conv = A.D.conversations.filter((v) => v.id !== cv.id && ((who && v.customerId === who.id) || (ph && phoneInChat(v) === ph)));
    const chans = Array.from(new Set([cv.channel, ...conv.map((v) => v.channel)]));
    const os = who ? A.D.orders.filter((o) => o.customerId === who.id) : [];
    const liveO = os.find((o) => !['delivered', 'returned', 'cancelled', 'exchanged'].includes(o.status));
    const api = A.rulesApi; const g = who && api ? api.gradeOf(who) : null;
    const sc = phone && api ? api.scoreOf(api.metricsFor(phone)) : null; const band = sc != null ? api.band(sc) : '';
    const col = band === 'auto' ? 'good' : band === 'call' ? 'warn' : 'bad';
    const fin = who ? who.delivered + who.refused : 0; const rate = fin ? who.delivered / fin * 100 : null;
    const head = `<div class="row" style="gap:10px;margin-bottom:8px;flex-wrap:nowrap"><span class="ibx-av ibx-av-l" style="background:${avColor(cv.name)}">${A.esc((who ? who.name : cv.name)[0].toUpperCase())}</span><div style="min-width:0"><b class="ellip" style="display:block">${A.esc(who ? who.name : cv.name)}</b>${cv.handle ? `<div class="small muted ellip">${A.esc(cv.handle)}</div>` : ''}<div class="small">${phone ? `<a href="tel:${phone}" class="mono">${phone}</a>` : `<span class="muted">${t('No phone yet', 'এখনো ফোন নেই')}</span>`}</div></div></div>`;
    const capture = !c && ph ? `<div class="ibx-cap">${A.icon('phone')}<div style="min-width:0"><b>${t('Phone found in chat', 'চ্যাটে ফোন নম্বর পাওয়া গেছে')}</b> <span class="mono">${ph}</span><div class="small">${byPhone ? t(`Matches ${byPhone.name} · ${byPhone.orders} orders · ${byPhone.refused} refused`, `${byPhone.name} এর সাথে মিলেছে · ${byPhone.orders}টি অর্ডার · ${byPhone.refused}টি ফেরত`) : t('New number · no order with us yet', 'নতুন নম্বর · আমাদের কাছে কোনো অর্ডার নেই')}</div><button class="btn sm" id="ib-link-c" style="margin-top:6px">${byPhone ? t('Link chat to this customer', 'চ্যাট এই কাস্টমারের সাথে যুক্ত করুন') : t('Save as new customer', 'নতুন কাস্টমার হিসেবে সেভ')}</button></div></div>` : '';
    const scoreH = sc != null ? `<div class="ibx-sc"><div><span class="small muted">${t('Courier score', 'কুরিয়ার স্কোর')}</span><b style="color:var(--${col})">${sc}/10</b></div><span class="small">${band === 'auto' ? t('Confirms by itself', 'নিজে কনফার্ম হবে') : band === 'call' ? t('Call before sending', 'পাঠানোর আগে কল') : t('Ask delivery charge first', 'আগে ডেলিভারি চার্জ নিন')}</span></div>` : '';
    return `<div class="card ibx-cust">${head}${capture}
      <div class="cus-seg" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">${g ? U.badge(g.name + ' · ' + g.off + '%', 'accent') : ''}${chans.map(chBadge).join(' ')}</div>
      ${scoreH}
      ${liveO ? `<a class="ibx-live" href="${A.href('orders', 'all', liveO.id)}"><span class="small muted">${t('Live order', 'চলতি অর্ডার')}</span><span class="row between" style="gap:6px"><b class="mono">${liveO.id}</b>${U.statusBadge(liveO.status)}</span><span class="small">${liveO.lines.map((l) => `${A.esc(l.name)} ${A.esc(l.size)}`).join(', ')} · ${A.fmt.tk(liveO.total)}</span></a>` : ''}
      ${who ? `<div class="list"><div class="li"><span class="grow">${t('Area', 'এলাকা')}</span>${A.esc(who.area)}, ${A.esc(who.district)}</div><div class="li"><span class="grow">${t('Orders', 'অর্ডার')}</span><b>${who.orders}</b></div><div class="li"><span class="grow">${t('Spent', 'মোট কেনা')}</span><b>${A.fmt.tk(who.spent)}</b></div><div class="li"><span class="grow">${t('Delivery success', 'ডেলিভারি সফল')}</span>${rate == null ? t('new customer', 'নতুন কাস্টমার') : A.fmt.pct(rate, 0)}</div><div class="li"><span class="grow">${t('Wallet', 'ওয়ালেট')}</span>${A.fmt.tk(who.wallet || 0)}</div></div>` : ''}
      ${who && who.refused >= 2 ? U.callout(t('Refused parcels before. Ask for the delivery charge in advance.', 'আগে পার্সেল ফেরত দিয়েছেন। ডেলিভারি চার্জ আগে নিন।'), 'bad', 'warn') : ''}
      ${conv.length ? `<div class="small strong" style="margin:12px 0 4px">${t('Other chats (same person)', 'অন্য চ্যাট (একই মানুষ)')}</div><div class="list">${conv.slice(0, 4).map((v) => `<a class="li" href="${A.href('inbox', 'chats', v.id)}" style="text-decoration:none;color:inherit">${chBadge(v.channel)}<span class="grow small ellip">${A.esc(v.msgs[v.msgs.length - 1].text)}</span></a>`).join('')}</div>` : ''}
      <div class="small strong" style="margin:12px 0 4px">${t('Orders', 'অর্ডার')}</div>${os.length ? `<div class="list">${os.slice(0, 5).map((o) => `<a class="li" href="${A.href('orders', 'all', o.id)}" style="text-decoration:none;color:inherit"><span class="grow small"><b>${o.id}</b><br><span class="muted">${A.fmt.date(o.created)} · ${A.fmt.tk(o.total)}</span></span>${U.statusBadge(o.status)}</a>`).join('')}</div>` : U.empty(t('No orders yet', 'এখনো কোনো অর্ডার নেই'))}
      ${who ? `<a class="btn sm" style="margin-top:10px" href="${A.href('customers', 'all', who.id)}" target="_blank" rel="noopener">${A.icon('ext')} ${t('Open Customer 360', 'কাস্টমার 360 খুলুন')}</a>` : ''}</div>`;
  }
  function wireCapture(el, cv) {
    const b = el.querySelector('#ib-link-c'); if (!b) return;
    b.onclick = () => {
      const ph = phoneInChat(cv); let c = A.D.customers.find((x) => normPh(x.phone) === ph);
      if (!c) { c = { id: 'C' + (900 + A.D.customers.length), name: cv.name, phone: ph, district: 'Dhaka', area: '', zone: 'inside', created: A.TODAY.toISOString(), points: 0, wallet: 0, tags: ['From ' + cv.channel], email: '', orders: 0, delivered: 0, refused: 0, spent: 0, lastOrder: null }; A.D.customers.unshift(c); }
      cv.customerId = c.id; A.commit(`Chat with ${cv.name} linked to customer ${c.name} (${ph})`); A.toast(t(`Linked to ${c.name}`, `${c.name} এর সাথে যুক্ত হলো`), 'good'); A.render();
    };
  }
  function addMsg(cv, text, log) {
    cv.msgs.push({ from: 's', text, t: A.TODAY.toISOString(), by: ME }); cv.last = A.TODAY.toISOString(); cv.unread = false; if (!cv.assignee) cv.assignee = ME;
    A.commit(log || `Replied to ${cv.name} on ${cv.channel}`);
  }
  function wireThread(el, cv) {
    const $ = (s) => el.querySelector(s); const box = $('#ib-msgs'); box.scrollTop = box.scrollHeight;
    const txt = $('#ib-txt');
    txt.oninput = () => { const m = txt.value.match(/^\/(\w+)\s?$/); if (m) { const q = A.D.quickReplies.find((x) => x.key === m[1] && !x.archived); if (q) { txt.value = q.text; q.used = (q.used || 0) + 1; } } };
    $('#ib-qr').onchange = (e) => { const q = A.byId(A.D.quickReplies, e.target.value); if (q) { txt.value = (txt.value ? txt.value + '\n' : '') + q.text; q.used = (q.used || 0) + 1; txt.focus(); } e.target.value = ''; };
    $('#ib-send').onclick = () => { const v = txt.value.trim(); if (!v) { A.toast(t('Write something first', 'আগে কিছু লিখুন'), 'bad'); return; } addMsg(cv, v); A.toast(t(`Sent on ${cv.channel}`, `${cv.channel} এ পাঠানো হলো`), 'good'); A.render(); };
    txt.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#ib-send').click(); };
    $('#ib-as').onchange = (e) => { cv.assignee = e.target.value; A.commit(`Chat with ${cv.name} assigned to ${cv.assignee || 'nobody'}`); A.toast(cv.assignee ? t(`Assigned to ${cv.assignee}`, `${cv.assignee} কে দেওয়া হলো`) : t('Unassigned', 'কারো নামে নেই'), 'good'); A.render(); };
    $('#ib-done').onclick = () => { const done = cv.status !== 'done'; cv.status = done ? 'done' : 'open'; cv.unread = false; A.commit(`Chat with ${cv.name} ${done ? 'done' : 'reopened'}`); A.toast(done ? t('Marked done', 'শেষ করা হলো') : t('Reopened', 'আবার খোলা হলো'), 'good'); if (done) { const next = A.D.conversations.find((c) => c.status === 'open' && c.id !== cv.id); A.go('inbox', 'chats', next ? next.id : ''); } else A.render(); };
    $('#ib-link').onclick = () => linkModal(cv);
    $('#ib-order').onclick = () => orderModal(cv);
  }
  const liveProducts = () => A.D.products.filter((p) => p.status === 'live' && A.sum(p.variants, (v) => v.stock) > 0).sort((a, b) => b.sold30 - a.sold30);
  function guessProduct(cv) { const txt = cv.msgs.map((m) => m.text.toLowerCase()).join(' '); const cat = /panjabi/.test(txt) ? 'panjabi' : /polo/.test(txt) ? 'polo' : null; return liveProducts().find((p) => !cat || p.cat === cat) || liveProducts()[0]; }
  function linkModal(cv) {
    const ps = liveProducts(); const g = guessProduct(cv);
    const m = U.modal(t('Send order link', 'অর্ডার লিংক পাঠান'), `${U.field(t('Product', 'প্রোডাক্ট'), U.select('ol-p', ps.map((p) => [p.id, `${p.name} · ${A.fmt.tk(p.price)}`]), g.id))}<div id="ol-prev" style="margin-top:10px"></div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ol-ok">${A.icon('send')}${t('Send', 'পাঠান')}</button>` });
    const text = () => { const p = A.byId(A.D.products, m.querySelector('#ol-p').value); const sz = [...new Set(p.variants.filter((v) => v.stock > 0).map((v) => v.size))]; return `${p.name} — ${A.fmt.tk(p.price)}\nSizes in stock: ${sz.join(', ')}\nOrder here: https://extas.com.bd/products/${p.seo.slug}`; };
    const upd = () => (m.querySelector('#ol-prev').innerHTML = `<div class="ibx-b s" style="max-width:100%">${A.esc(text())}</div>`);
    m.querySelector('#ol-p').onchange = upd; upd();
    m.querySelector('#ol-ok').onclick = () => { addMsg(cv, text(), `Sent product link to ${cv.name}`); U.close(); A.toast(t('Link sent', 'লিংক পাঠানো হলো'), 'good'); A.render(); };
  }
  function orderModal(cv) {
    const c = cust(cv); const ps = liveProducts(); const g = guessProduct(cv);
    const lastO = A.D.orders.find((o) => o.customerId === c.id);
    const m = U.modal(t('Create order from chat', 'চ্যাট থেকে অর্ডার বানান'), `<div class="formgrid">${U.field(t('Customer', 'কাস্টমার'), `<div class="inp" style="background:var(--card2)">${A.esc(c.name)} · ${c.phone}</div>`)}${U.field(t('Product', 'প্রোডাক্ট'), U.select('co-p', ps.map((p) => [p.id, `${p.name} · ${A.fmt.tk(p.price)}`]), g.id))}<div id="co-vs" style="display:contents"></div>${U.field(t('Quantity', 'পরিমাণ'), U.input('co-q', '1', 'type="number" min="1" max="10"'))}${U.field(t('Payment', 'পেমেন্ট'), U.select('co-pay', [['COD', t('Cash on delivery', 'ক্যাশ অন ডেলিভারি')], ['bKash', 'bKash'], ['Nagad', 'Nagad']], 'COD'))}</div>${U.field(t('Address', 'ঠিকানা'), U.input('co-ad', lastO ? lastO.address : `${c.area}, ${c.district}`))}<div id="co-sum" style="margin-top:10px"></div>`,
      { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="co-ok">${t('Create order', 'অর্ডার বানান')}</button>` });
    const $ = (s) => m.querySelector(s);
    const vs = () => { const p = A.byId(A.D.products, $('#co-p').value); const sz = p.variants.filter((v) => v.stock > 0); const col = [...new Set(sz.map((v) => v.color))]; $('#co-vs').innerHTML = U.field(t('Colour', 'কালার'), U.select('co-c', col.map((x) => [x, x]), col[0])) + U.field(t('Size', 'সাইজ'), U.select('co-s', [], '')); const sizes = () => { const cc = $('#co-c').value; $('#co-s').innerHTML = sz.filter((v) => v.color === cc).map((v) => `<option value="${v.size}">${v.size} (${v.stock} ${t('left', 'আছে')})</option>`).join(''); }; $('#co-c').onchange = () => { sizes(); sum(); }; $('#co-s').onchange = sum; sizes(); };
    const calc = () => { const p = A.byId(A.D.products, $('#co-p').value); const qty = Math.max(1, Math.min(10, +$('#co-q').value || 1)); const sub = p.price * qty; const bm = A.D.rules.buyMore; const tier = bm.on ? bm.tiers.filter((x) => qty >= x.qty).pop() : null; const disc = tier ? Math.round(sub * tier.off / 100) : 0; const del = C.deliveryFee(c.zone, sub - disc); return { p, qty, sub, disc, del, total: sub - disc + del, tier }; };
    const sum = () => { const x = calc(); $('#co-sum').innerHTML = `<div class="list small"><div class="li"><span class="grow">${t('Products', 'প্রোডাক্ট')}</span>${A.fmt.tk(x.sub)}</div>${x.disc ? `<div class="li"><span class="grow">${t(`Buy more discount (${x.tier.off}%)`, `বেশি কিনলে ছাড় (${x.tier.off}%)`)}</span>−${A.fmt.tk(x.disc)}</div>` : ''}<div class="li"><span class="grow">${t('Delivery', 'ডেলিভারি')} (${c.district})</span>${x.del ? A.fmt.tk(x.del) : t('Free', 'ফ্রি')}</div><div class="li"><b class="grow">${t('Total', 'মোট')}</b><b>${A.fmt.tk(x.total)}</b></div></div>${c.refused >= 2 ? U.callout(t('This customer refused parcels before — the order will be marked for a check.', 'এই কাস্টমার আগে পার্সেল ফেরত দিয়েছেন — অর্ডারে যাচাইয়ের চিহ্ন থাকবে।'), 'warn', 'warn') : ''}`; };
    $('#co-p').onchange = () => { vs(); sum(); }; $('#co-q').oninput = sum; vs(); sum();
    $('#co-ok').onclick = () => {
      const x = calc(); const v = x.p.variants.find((y) => y.color === $('#co-c').value && y.size === $('#co-s').value); if (!v) { A.toast(t('Pick colour and size', 'কালার ও সাইজ বাছুন'), 'bad'); return; }
      const id = 'EX-' + (Math.max(...A.D.orders.map((o) => +o.id.slice(3))) + 1); const now = A.TODAY.toISOString(); const pay = $('#co-pay').value;
      const channel = { Messenger: 'Facebook', WhatsApp: 'WhatsApp', Instagram: 'Instagram', 'Website chat': 'Website' }[cv.channel];
      const o = { id, created: now, customerId: c.id, name: c.name, phone: c.phone, district: c.district, area: c.area, zone: c.zone, address: $('#co-ad').value, lines: [{ pid: x.p.id, sku: v.sku, name: x.p.name, color: v.color, size: v.size, qty: x.qty, price: x.p.price, cost: x.p.cost }], subtotal: x.sub, discount: x.disc, coupon: '', delivery: x.del, total: x.total, payment: pay, paid: false, channel, source: channel, courier: '', tracking: '', status: 'new', risk: c.refused >= 2 ? 'high' : c.refused ? 'medium' : 'low', notes: 'Created from chat', timeline: [{ t: now, text: `Created from chat (${cv.channel})`, by: ME }], erp: { pushed: false }, deliveredAt: null, settled: false, returnReason: '' };
      A.D.orders.unshift(o); c.orders++; c.lastOrder = now;
      addMsg(cv, `Your order ${id} is placed: ${x.p.name}, ${v.color} ${v.size} × ${x.qty}. Total ${A.fmt.tk(x.total)}${pay === 'COD' ? ' (cash on delivery)' : ''}. We will call you to confirm.`, `Created order ${id} from chat with ${c.name}`);
      U.close(); A.toast(t(`Order ${id} created — it is in “Processing”`, `অর্ডার ${id} তৈরি — “প্রসেসিং” তে আছে`), 'good'); A.render();
    };
  }

  /* ================= COMMENTS (Facebook & Instagram post/ad comments, live selling) ================= */
  const viewBar = () => `<div class="row" style="gap:8px;margin:0 0 12px">${U.seg('ib-view', [['msgs', t('Messages', 'মেসেজ')], ['comments', t('Comments', 'কমেন্ট')]], st.view || 'msgs')}<span class="muted small">${st.view === 'comments' ? t('Facebook & Instagram post and ad comments', 'Facebook ও Instagram পোস্ট ও বিজ্ঞাপনের কমেন্ট') : t('Messenger, WhatsApp, Instagram and website chat', 'মেসেঞ্জার, হোয়াটসঅ্যাপ, ইনস্টাগ্রাম ও ওয়েবসাইট চ্যাট')}</span></div>`;
  const wireView = (el) => A.on(el, '#ib-view button', 'click', (e, b) => { st.view = b.dataset.v; A.go('inbox', 'chats', st.view === 'comments' ? 'comments' : undefined); });
  function seedComments() {
    const D = A.D; if (D.comments) return;
    const cs = D.customers.slice(0, 40); const posts = [['Facebook', 'Ad · Winter polo — 3 colours'], ['Facebook', 'Post · New panjabi for Eid'], ['Instagram', 'Reel · Denim fit check'], ['Instagram', 'Ad · Twill pants 2 for ৳2,200']];
    const texts = [['Price koto?', 'ask'], ['XL ache? navy', 'ask'], ['01712-55 98 31 call me', 'phone'], ['Inbox plz', 'ask'], ['Fake product, chor company', 'abuse'], ['Delivery charge koto Chittagong?', 'ask'], ['Very nice 👍', 'praise'], ['L size chest koto', 'ask'], ['amar number 01819 443322 e call den', 'phone'], ['Order korte chai', 'ask'], ['Quality kemon?', 'ask'], ['Bad words removed by filter', 'abuse']];
    D.comments = texts.map((x, i) => { const c = cs[(i * 3) % cs.length]; const p = posts[i % posts.length]; const auto = x[1] === 'ask' && i % 2 === 0; return { id: 'CM' + (100 + i), ch: p[0], post: p[1], name: c.name, customerId: c.id, text: x[0], kind: x[1], t: new Date(A.TODAY - (i * 23 + 4) * 6e4).toISOString(), hidden: x[1] === 'phone' || x[1] === 'abuse', hideWhy: x[1] === 'phone' ? 'phone' : x[1] === 'abuse' ? 'abuse' : '', dm: auto, replied: auto }; });
    D.commentRules = { hidePhone: true, hideAbuse: true, autoDm: true, dmText: 'Hi! We sent you the price and sizes in Messenger 😊', keywords: 'price, koto, size, ache, order, inbox' };
    const ps = D.products.filter((p) => p.status === 'live').slice(0, 3);
    D.liveSession = { on: true, title: 'Friday night live — winter polos', ch: 'Facebook', started: new Date(A.TODAY - 42 * 6e4).toISOString(), codes: ps.map((p, i) => ({ code: 'P' + (i + 1), pid: p.id })), caught: cs.slice(5, 14).map((c, i) => ({ id: 'LV' + i, name: c.name, customerId: c.id, text: ['P1 L 2 pcs', 'P2 XL 1', 'P1 M 1 pcs', 'L 2 pcs', 'P3 32 1', 'P2 L 2', 'koto?', 'P1 XL 1', 'P3 34 2 pcs'][i], done: false, order: '' })) };
  }
  const parseLive = (x) => { const L = A.D.liveSession; const m = x.text.toUpperCase().match(/(?:(P\d)\s+)?(XS|S|M|L|XL|XXL|\d{2})\s+(\d+)/); if (!m) return null; const code = m[1] || (L.codes[0] || {}).code; const cd = L.codes.find((c) => c.code === code); if (!cd) return null; const p = A.byId(A.D.products, cd.pid); const v = p && p.variants.find((y) => y.size === m[2] && y.stock - y.reserved > 0); return { p, size: m[2], qty: +m[3], v, guessed: !m[1] }; };
  function draftFromLive(x) {
    const pr = parseLive(x); const c = A.byId(A.D.customers, x.customerId); if (!pr || !pr.v || !c) return null;
    const id = 'EX-' + (Math.max(...A.D.orders.map((o) => +o.id.slice(3))) + 1); const now = A.TODAY.toISOString(); const sub = pr.p.price * pr.qty; const del = C.deliveryFee(c.zone, sub);
    A.D.orders.unshift({ id, created: now, customerId: c.id, name: c.name, phone: c.phone, district: c.district, area: c.area, zone: c.zone, address: `${c.area}, ${c.district}`, lines: [{ pid: pr.p.id, sku: pr.v.sku, name: pr.p.name, color: pr.v.color, size: pr.v.size, qty: pr.qty, price: pr.p.price, cost: pr.p.cost }], subtotal: sub, discount: 0, coupon: '', delivery: del, total: sub + del, payment: 'COD', paid: false, channel: 'Facebook', source: 'Live selling', courier: '', tracking: '', status: 'new', risk: c.refused >= 2 ? 'high' : c.refused ? 'medium' : 'low', notes: 'Draft from live selling — confirm colour and address on the call', timeline: [{ t: now, text: `Draft order from live comment “${x.text}”`, by: ME }], erp: { pushed: false }, deliveredAt: null, settled: false, returnReason: '' });
    c.orders++; c.lastOrder = now; x.done = true; x.order = id; return id;
  }
  function renderComments(el) {
    ensure(); seedComments(); const D = A.D; const CM = D.comments; const R2 = D.commentRules; const L = D.liveSession; st.cf = st.cf || 'all';
    const n = { all: CM.length, need: CM.filter((c) => !c.hidden && !c.replied && c.kind === 'ask').length, hidden: CM.filter((c) => c.hidden).length, dm: CM.filter((c) => c.dm).length };
    const list = CM.filter((c) => st.cf === 'all' || (st.cf === 'need' ? !c.hidden && !c.replied && c.kind === 'ask' : st.cf === 'hidden' ? c.hidden : c.dm));
    const ready = L.caught.filter((x) => !x.done && parseLive(x) && parseLive(x).v);
    el.innerHTML = A.pageHead(t('Inbox', 'ইনবক্স'), t(`${n.need} comments need a reply · ${n.hidden} hidden · ${n.dm} got a private message by themselves`, `${n.need}টি কমেন্টে উত্তর বাকি · ${n.hidden}টি লুকানো · ${n.dm}টিতে নিজে থেকে প্রাইভেট মেসেজ গেছে`)) + A.tabsBar('inbox', 'chats') + viewBar() +
      `<div class="grid g4">${[[t('Comments today', 'আজকের কমেন্ট'), n.all], [t('Need a reply', 'উত্তর বাকি'), n.need], [t('Hidden (phone / abuse)', 'লুকানো (ফোন / গালি)'), n.hidden], [t('Live orders caught', 'লাইভ থেকে অর্ডার'), L.caught.filter((x) => x.done).length]].map((k) => U.kpi({ label: k[0], value: k[1] })).join('')}</div>
      <div class="grid g2" style="margin-top:14px;align-items:start">
        <div class="card"><div class="card-h"><h3>${t('Comments', 'কমেন্ট')}</h3></div><div class="chips">${[['all', t('All', 'সব')], ['need', t('Need a reply', 'উত্তর বাকি')], ['hidden', t('Hidden', 'লুকানো')], ['dm', t('Auto-replied', 'অটো উত্তর')]].map((c) => `<button class="chip ${st.cf === c[0] ? 'on' : ''}" data-cf="${c[0]}">${c[1]}<span class="c">${n[c[0]]}</span></button>`).join('')}</div>
          <div class="list" style="margin-top:8px">${list.map((c) => `<div class="li ibx-cm" style="align-items:flex-start;gap:10px"><span class="ibx-av" style="background:${avColor(c.name)}">${A.esc(c.name[0])}</span><div class="grow" style="min-width:0"><div class="row between" style="gap:6px"><b class="ellip">${A.esc(c.name)}</b><span class="muted small">${A.fmt.ago(c.t)}</span></div><div class="muted small ellip">${chBadge(c.ch === 'Facebook' ? 'Messenger' : 'Instagram').replace(/Messenger/, 'Facebook')} ${A.esc(c.post)}</div><div style="margin:4px 0;${c.hidden ? 'opacity:.6;text-decoration:line-through' : ''}">${A.esc(c.text)}</div><div class="row" style="gap:6px;flex-wrap:wrap">${c.hidden ? U.badge(c.hideWhy === 'phone' ? t('Hidden · phone number', 'লুকানো · ফোন নম্বর') : c.hideWhy === 'abuse' ? t('Hidden · abuse', 'লুকানো · গালি') : t('Hidden', 'লুকানো'), 'warn') : ''}${c.dm ? U.badge(t('Private message sent', 'প্রাইভেট মেসেজ গেছে'), 'good') : ''}${!c.hidden && !c.dm ? `<button class="btn sm" data-dm="${c.id}">${A.icon('send')}${t('Reply privately', 'প্রাইভেটে উত্তর')}</button>` : ''}<button class="btn sm ghost" data-hide="${c.id}">${c.hidden ? t('Show again', 'আবার দেখান') : t('Hide', 'লুকান')}</button>${c.hideWhy === 'phone' ? `<button class="btn sm ghost" data-cmo="${c.id}">${A.icon('plus')}${t('Make order', 'অর্ডার বানান')}</button>` : ''}</div></div></div>`).join('') || U.empty(t('Nothing here', 'এখানে কিছু নেই'))}</div></div>
        <div class="stack">
          <div class="card"><div class="card-h"><h3>${t('Comment rules', 'কমেন্টের নিয়ম')}</h3></div><div class="stack">
            <label class="rl-check row" style="gap:8px">${U.switch('cr-ph', R2.hidePhone)} <span>${t('Hide comments with a phone number (others can’t copy it)', 'ফোন নম্বরসহ কমেন্ট লুকান (অন্যরা কপি করতে পারবে না)')}</span></label>
            <label class="rl-check row" style="gap:8px">${U.switch('cr-ab', R2.hideAbuse)} <span>${t('Hide abusive comments', 'গালিগালাজের কমেন্ট লুকান')}</span></label>
            <label class="rl-check row" style="gap:8px">${U.switch('cr-dm', R2.autoDm)} <span>${t('Comment asks price or size → send a private message by itself', 'কমেন্টে দাম বা সাইজ জিজ্ঞেস করলে → নিজে প্রাইভেট মেসেজ যাবে')}</span></label>
            ${U.field(t('Words that trigger the private message', 'যে শব্দে প্রাইভেট মেসেজ যাবে'), U.input('cr-kw', R2.keywords))}${U.field(t('Public reply under the comment', 'কমেন্টের নিচে সবার জন্য উত্তর'), U.input('cr-tx', R2.dmText))}
            <div class="row" style="justify-content:flex-end"><button class="btn primary" id="cr-save">${t('Save', 'সেভ')}</button></div></div></div>
          <div class="card"><div class="card-h"><h3>${A.icon('star')} ${t('Live selling', 'লাইভ সেলিং')}</h3>${L.on ? U.badge(t('Live now', 'এখন লাইভ'), 'bad') : U.badge(t('Ended', 'শেষ'), 'dark')}</div>
            <div class="small"><b>${A.esc(L.title)}</b> · ${L.ch} · ${t('started', 'শুরু')} ${A.fmt.time(L.started)}</div>
            <div class="muted small" style="margin:4px 0 8px">${t('Product codes said on the live:', 'লাইভে বলা প্রোডাক্ট কোড:')} ${L.codes.map((c) => `<b>${c.code}</b> = ${A.esc((A.byId(D.products, c.pid) || {}).name || '')}`).join(' · ')}. ${t('Comments like “P1 L 2 pcs” become draft orders.', '“P1 L 2 pcs” এর মতো কমেন্ট ড্রাফট অর্ডার হয়।')}</div>
            <div class="list">${L.caught.map((x) => { const p = parseLive(x); return `<div class="li" style="gap:8px;flex-wrap:wrap"><span class="grow" style="min-width:140px"><b>${A.esc(x.name)}</b> · <span class="mono">${A.esc(x.text)}</span><br><span class="muted small">${x.done ? t(`Draft order ${x.order}`, `ড্রাফট অর্ডার ${x.order}`) : !p ? t('Not an order — skipped', 'অর্ডার নয় — বাদ') : !p.v ? t(`${p.size} is sold out`, `${p.size} স্টক শেষ`) : `${A.esc(p.p.name)} · ${p.size} × ${p.qty}${p.guessed ? t(' (no code → P1)', ' (কোড নেই → P1)') : ''}`}</span></span>${x.done ? `<a class="btn sm ghost" href="${A.href('orders', 'all', x.order)}">${t('Open', 'খুলুন')}</a>` : p && p.v ? `<button class="btn sm" data-lv="${x.id}">${t('Make draft', 'ড্রাফট বানান')}</button>` : ''}</div>`; }).join('')}</div>
            <div class="row between" style="margin-top:10px;gap:8px">${L.on ? `<button class="btn ghost" id="lv-end">${t('End session', 'সেশন শেষ')}</button>` : `<button class="btn ghost" id="lv-start">${t('Start a new live', 'নতুন লাইভ শুরু')}</button>`}<button class="btn primary" id="lv-all" ${ready.length ? '' : 'disabled'}>${t(`Make all drafts (${ready.length})`, `সব ড্রাফট বানান (${ready.length})`)}</button></div>
            <div class="muted small" style="margin-top:6px">${t('Drafts land in Orders › Processing. Staff call to confirm colour and address.', 'ড্রাফট অর্ডার › প্রসেসিং তে যায়। স্টাফ কল করে কালার ও ঠিকানা কনফার্ম করবেন।')}</div></div>
        </div></div>`;
    wireView(el);
    A.on(el, '[data-cf]', 'click', (e, b) => { st.cf = b.dataset.cf; A.render(); });
    A.on(el, '[data-dm]', 'click', (e, b) => { const c = A.byId(CM, b.dataset.dm); c.dm = true; c.replied = true; A.commit(`Private message sent to ${c.name} from a ${c.ch} comment`); A.toast(t(`Private message sent to ${c.name}`, `${c.name} কে প্রাইভেট মেসেজ পাঠানো হলো`), 'good'); A.render(); });
    A.on(el, '[data-hide]', 'click', (e, b) => { const c = A.byId(CM, b.dataset.hide); c.hidden = !c.hidden; if (c.hidden && !c.hideWhy) c.hideWhy = 'manual'; A.commit(`Comment by ${c.name} ${c.hidden ? 'hidden' : 'shown again'}`); A.toast(c.hidden ? t('Comment hidden — only the writer and their friends see it', 'কমেন্ট লুকানো হলো — শুধু লেখক ও তার বন্ধুরা দেখবেন') : t('Comment shown again', 'কমেন্ট আবার দেখানো হলো'), 'good'); A.render(); });
    A.on(el, '[data-cmo]', 'click', (e, b) => { const c = A.byId(CM, b.dataset.cmo); let cv = A.D.conversations.find((x) => x.customerId === c.customerId); if (!cv) { cv = { id: A.uid('CV'), customerId: c.customerId, name: c.name, channel: 'Messenger', status: 'open', assignee: ME, unread: false, last: A.TODAY.toISOString(), msgs: [{ from: 'c', text: c.text, t: c.t }] }; A.D.conversations.unshift(cv); A.commit(`Chat opened from ${c.name}'s comment`); } st.view = 'msgs'; A.go('inbox', 'chats', cv.id); });
    el.querySelector('#cr-save').onclick = () => { Object.assign(R2, { hidePhone: el.querySelector('#cr-ph').checked, hideAbuse: el.querySelector('#cr-ab').checked, autoDm: el.querySelector('#cr-dm').checked, keywords: el.querySelector('#cr-kw').value.trim(), dmText: el.querySelector('#cr-tx').value.trim() }); A.commit('Comment rules saved'); A.toast(t('Comment rules saved', 'কমেন্টের নিয়ম সেভ হলো'), 'good'); A.render(); };
    A.on(el, '[data-lv]', 'click', (e, b) => { const x = L.caught.find((y) => y.id === b.dataset.lv); const id = draftFromLive(x); if (id) { A.commit(`Draft order ${id} from live comment`); A.toast(t(`Draft order ${id} — in “Processing”`, `ড্রাফট অর্ডার ${id} — “প্রসেসিং” তে`), 'good'); } A.render(); });
    const all = el.querySelector('#lv-all'); if (all) all.onclick = () => { const ids = ready.map(draftFromLive).filter(Boolean); A.commit(`${ids.length} draft orders from the live session`); A.toast(t(`${ids.length} draft orders made`, `${ids.length}টি ড্রাফট অর্ডার তৈরি`), 'good'); A.render(); };
    const en = el.querySelector('#lv-end'); if (en) en.onclick = () => { L.on = false; A.commit('Live selling session ended'); A.toast(t('Live session ended', 'লাইভ সেশন শেষ'), 'good'); A.render(); };
    const sn = el.querySelector('#lv-start'); if (sn) sn.onclick = () => { L.on = true; L.started = A.TODAY.toISOString(); A.commit('Live selling session started'); A.toast(t('Capturing comments from your live', 'লাইভের কমেন্ট ধরা হচ্ছে'), 'good'); A.render(); };
  }

  /* ================= QUICK REPLIES ================= */
  function renderReplies(el) {
    ensure(); const Q = A.D.quickReplies; st.qf = st.qf || 'active'; const nArc = Q.filter((q) => q.archived).length; const shown = Q.filter((q) => (st.qf === 'archived' ? q.archived : !q.archived)); const top = Q.filter((q) => !q.archived).slice().sort((a, b) => (b.used || 0) - (a.used || 0))[0];
    el.innerHTML = A.pageHead(t('Quick replies', 'দ্রুত উত্তর'), t('Saved answers for the questions customers ask every day. Type / and the short name in any chat.', 'কাস্টমার প্রতিদিন যে প্রশ্ন করে তার সেভ করা উত্তর। যেকোনো চ্যাটে / আর ছোট নাম লিখুন।'), `<button class="btn primary" id="qr-add">${A.icon('plus')}${t('Add quick reply', 'দ্রুত উত্তর যোগ করুন')}</button>`) + A.tabsBar('inbox', 'replies') +
      (top ? U.callout(t(`Most used: <b>/${A.esc(top.key)}</b> (${top.used} times). Keep prices and delivery days here up to date when rules change.`, `সবচেয়ে বেশি ব্যবহার: <b>/${A.esc(top.key)}</b> (${top.used} বার)। নিয়ম বদলালে এখানকার দাম ও ডেলিভারির দিন ঠিক করে দিন।`), 'info') : '') +
      `<div class="chips" style="margin-top:14px">${[['active', t('In use', 'চালু'), Q.length - nArc], ['archived', t('Archived', 'আর্কাইভ'), nArc]].map((c) => `<button class="chip ${st.qf === c[0] ? 'on' : ''}" data-qf="${c[0]}">${c[1]}<span class="c">${c[2]}</span></button>`).join('')}</div><div class="card" style="margin-top:10px">${U.table([
        { h: t('Short name', 'ছোট নাম'), f: (q) => `<b class="mono">/${A.esc(q.key)}</b>` },
        { h: t('Message', 'মেসেজ'), f: (q) => `<div style="max-width:560px;white-space:normal">${A.esc(q.text)}</div>` },
        { h: t('Used', 'ব্যবহার'), r: true, hide: true, f: (q) => q.used || 0 },
        { h: '', r: true, f: (q) => `<span class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" data-ed="${q.id}" aria-label="Edit">${A.icon('edit')}</button>${q.archived ? `<button class="btn sm" data-res="${q.id}">${A.icon('reset')}${t('Restore', 'ফেরত আনুন')}</button>` : `<button class="btn sm ghost" data-arc="${q.id}">${A.icon('box')}${t('Archive', 'আর্কাইভ')}</button>`}</span>` },
      ], shown, { empty: st.qf === 'archived' ? t('Nothing archived', 'আর্কাইভে কিছু নেই') : t('No quick replies yet', 'এখনো কোনো দ্রুত উত্তর নেই') })}</div><div class="muted small" style="margin-top:8px">${t('Quick replies are never deleted. Archived ones stop showing in chats and can be restored any time.', 'দ্রুত উত্তর কখনো মুছে যায় না। আর্কাইভ করলে চ্যাটে আর দেখায় না, যেকোনো সময় ফেরত আনা যায়।')}</div>`;
    const edit = (q) => {
      const m = U.modal(q ? t('Edit quick reply', 'দ্রুত উত্তর এডিট') : t('Add quick reply', 'দ্রুত উত্তর যোগ করুন'), `${U.field(t('Short name (one word)', 'ছোট নাম (এক শব্দ)'), U.input('qe-k', q ? q.key : '', 'placeholder="price"'), t('Typed as /name in the chat box', 'চ্যাটে /নাম লিখলে আসবে'))}${U.field(t('Message', 'মেসেজ'), `<textarea class="inp" id="qe-t" rows="4" placeholder="${t('Write in Bengali or English', 'বাংলা বা ইংরেজিতে লিখুন')}">${A.esc(q ? q.text : '')}</textarea>`, `<span id="qe-c"></span>`)}`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="qe-ok">${t('Save', 'সেভ করুন')}</button>` });
      const ta = m.querySelector('#qe-t'); const cnt = () => (m.querySelector('#qe-c').textContent = t(`${ta.value.length} letters`, `${ta.value.length} অক্ষর`)); ta.oninput = cnt; cnt();
      m.querySelector('#qe-ok').onclick = () => {
        const k = m.querySelector('#qe-k').value.trim().toLowerCase().replace(/[^a-z0-9]/g, ''); const tx = ta.value.trim();
        if (!k || !tx) { A.toast(t('Fill in both boxes', 'দুইটা ঘরই পূরণ করুন'), 'bad'); return; }
        if (Q.some((x) => x.key === k && x !== q)) { A.toast(t('This short name is already used', 'এই ছোট নাম আগেই আছে'), 'bad'); return; }
        if (q) { q.key = k; q.text = tx; } else Q.push({ id: A.uid('QR'), key: k, text: tx, used: 0 });
        U.close(); A.commit(`Quick reply /${k} saved`); A.toast(t('Quick reply saved', 'দ্রুত উত্তর সেভ হলো'), 'good'); A.render();
      };
    };
    el.querySelector('#qr-add').onclick = () => edit(null);
    A.on(el, '[data-ed]', 'click', (e, b) => edit(A.byId(Q, b.dataset.ed)));
    A.on(el, '[data-qf]', 'click', (e, b) => { st.qf = b.dataset.qf; A.render(); });
    A.on(el, '[data-arc]', 'click', (e, b) => { const q = A.byId(Q, b.dataset.arc); U.confirm(t('Archive this quick reply?', 'এই দ্রুত উত্তর আর্কাইভ করবেন?'), `/${A.esc(q.key)} — ${A.esc(q.text)}<br><span class="muted small">${t('It stops showing in chats. You can restore it from Archived.', 'চ্যাটে আর দেখাবে না। আর্কাইভ থেকে ফেরত আনা যাবে।')}</span>`, t('Archive', 'আর্কাইভ'), () => { q.archived = true; q.archivedAt = A.TODAY.toISOString(); A.commit(`Quick reply /${q.key} archived`); A.toast(t('Archived — find it under Archived', 'আর্কাইভ হলো — আর্কাইভ ফিল্টারে পাবেন'), 'good'); A.render(); }); });
    A.on(el, '[data-res]', 'click', (e, b) => { const q = A.byId(Q, b.dataset.res); q.archived = false; A.commit(`Quick reply /${q.key} restored`); A.toast(t(`/${q.key} is back in chats`, `/${q.key} আবার চ্যাটে আছে`), 'good'); A.render(); });
  }

  /* ================= RESPONSE TIMES ================= */
  function renderStats(el) {
    ensure(); const CV = A.D.conversations;
    const fr = CV.map((c) => ({ c, m: firstReply(c) }));
    const rep = fr.filter((x) => x.m != null); const avg = rep.length ? A.sum(rep, (x) => x.m) / rep.length : null;
    const fast = rep.length ? rep.filter((x) => x.m <= 15).length / rep.length * 100 : 0;
    const open = CV.filter((c) => c.status === 'open'); const wait = open.map((c) => ({ c, w: waiting(c) })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
    const doneToday = CV.filter((c) => c.status === 'done' && A.fmt.ymd(c.last) === A.fmt.ymd(A.TODAY)).length;
    const byCh = CHS.map((ch) => { const l = fr.filter((x) => x.c.channel === ch); const r = l.filter((x) => x.m != null); return { ch, n: l.length, open: l.filter((x) => x.c.status === 'open').length, avg: r.length ? A.sum(r, (x) => x.m) / r.length : null }; });
    const staff = [ME, 'Nusrat', 'Rafi'].map((s) => { const replies = CV.flatMap((c) => c.msgs.filter((m) => m.from === 's' && m.by === s)); const firsts = fr.filter((x) => x.m != null && x.c.msgs.find((m) => m.from === 's').by === s); return { s, chats: CV.filter((c) => c.assignee === s || c.msgs.some((m) => m.by === s)).length, replies: replies.length, avg: firsts.length ? A.sum(firsts, (x) => x.m) / firsts.length : null, open: open.filter((c) => c.assignee === s).length }; });
    const hours = []; for (let h = 8; h <= 23; h++) hours.push(h);
    const hc = Object.fromEntries(hours.map((h) => [h, 0])); CV.forEach((c) => c.msgs.filter((m) => m.from === 'c').forEach((m) => { const h = +A.fmt.time(m.t).slice(0, 2); if (h in hc) hc[h]++; }));
    const oh = Object.fromEntries(hours.map((h) => [h, 0])); C.ordersIn(A.TODAY - 30 * 864e5, A.TODAY.getTime()).forEach((o) => { const h = +A.fmt.time(o.created).slice(0, 2); if (h in oh) oh[h]++; });
    const peak = hours.slice().sort((a, b) => oh[b] - oh[a])[0];
    const bestCh = byCh.filter((x) => x.avg != null).sort((a, b) => b.avg - a.avg)[0];
    el.innerHTML = A.pageHead(t('Response times', 'উত্তরের সময়'), t('How fast customers hear back. Every hour a buyer waits, the chance of an order drops.', 'কাস্টমার কত দ্রুত উত্তর পায়। প্রতি ঘণ্টা অপেক্ষায় অর্ডারের সম্ভাবনা কমে।')) + A.tabsBar('inbox', 'stats') +
      `<div class="grid g5" style="margin-bottom:14px">${U.kpi({ label: t('Average first reply', 'গড় প্রথম উত্তর'), value: mins(avg) })}${U.kpi({ label: t('Answered within 15 min', '15 মিনিটের মধ্যে উত্তর'), value: A.fmt.pct(fast, 0) })}${U.kpi({ label: t('Open now', 'এখন খোলা'), value: open.length, sub: `<a href="${A.href('inbox', 'chats')}">${t('Open inbox', 'ইনবক্স খুলুন')} →</a>` })}${U.kpi({ label: t('Longest waiting', 'সবচেয়ে বেশি অপেক্ষা'), value: wait.length ? mins(wait[0].w) : '—' })}${U.kpi({ label: t('Finished today', 'আজ শেষ হয়েছে'), value: doneToday })}</div>` +
      U.callout(t(`Most orders come around ${peak}:00–${peak + 1}:00 — keep someone on chat then.${bestCh ? ` ${bestCh.ch} is the slowest channel (${mins(bestCh.avg)} on average).` : ''}`, `সবচেয়ে বেশি অর্ডার আসে ${peak}:00–${peak + 1}:00 এর দিকে — তখন কাউকে চ্যাটে রাখুন।${bestCh ? ` সবচেয়ে ধীর চ্যানেল ${bestCh.ch} (গড়ে ${mins(bestCh.avg)})।` : ''}`), 'info') +
      `<div class="grid g2" style="margin-top:14px">
        ${U.card(t('Messages by hour', 'ঘণ্টা অনুযায়ী মেসেজ'), A.chart.columns({ labels: hours.map((h) => String(h)), values: hours.map((h) => hc[h]), money: false, height: 190 }), { sub: t('Customer messages, by hour of the day', 'দিনের কোন ঘণ্টায় কাস্টমারের মেসেজ আসে') })}
        ${U.card(t('Orders by hour · 30 days', 'ঘণ্টা অনুযায়ী অর্ডার · 30 দিন'), A.chart.columns({ labels: hours.map((h) => String(h)), values: hours.map((h) => oh[h]), money: false, height: 190, color: 'var(--c2)' }), { sub: t('Plan chat staff around these hours', 'এই সময় ধরে চ্যাটের লোক ঠিক করুন') })}
        ${U.card(t('By channel', 'চ্যানেল অনুযায়ী'), U.table([{ h: t('Channel', 'চ্যানেল'), f: (x) => chBadge(x.ch) }, { h: t('Chats', 'চ্যাট'), r: true, f: (x) => x.n }, { h: t('Open', 'খোলা'), r: true, f: (x) => x.open }, { h: t('First reply', 'প্রথম উত্তর'), r: true, f: (x) => mins(x.avg) }], byCh) + A.chart.bars({ items: byCh.map((x) => ({ label: x.ch, value: x.n, color: CHCOL[x.ch] })), money: false }))}
        ${U.card(t('By team member', 'টিম অনুযায়ী'), U.table([{ h: t('Name', 'নাম'), f: (x) => `<b>${x.s === ME ? 'Mehadi (' + t('you', 'আপনি') + ')' : x.s}</b>` }, { h: t('Chats', 'চ্যাট'), r: true, f: (x) => x.chats }, { h: t('Replies sent', 'উত্তর পাঠিয়েছে'), r: true, hide: true, f: (x) => x.replies }, { h: t('First reply', 'প্রথম উত্তর'), r: true, f: (x) => mins(x.avg) }, { h: t('Open now', 'এখন খোলা'), r: true, f: (x) => x.open }], staff))}
      </div>` +
      U.card(t('Waiting for a reply', 'উত্তরের অপেক্ষায়'), wait.length ? `<div class="list">${wait.slice(0, 8).map((x) => `<a class="li" href="${A.href('inbox', 'chats', x.c.id)}" style="text-decoration:none;color:inherit"><span class="ibx-av" style="background:${avColor(x.c.name)};width:28px;height:28px;font-size:12px">${A.esc(x.c.name[0])}</span><span class="grow ellip">${A.esc(x.c.name)} · <span class="muted">${A.esc(x.c.msgs[x.c.msgs.length - 1].text)}</span></span>${chBadge(x.c.channel)} ${U.badge(mins(x.w), x.w > 60 ? 'bad' : 'warn')}</a>`).join('')}</div>` : U.empty(t('Nobody is waiting. Well done!', 'কেউ অপেক্ষায় নেই। দারুণ!')), { cls: '', sub: t('Oldest first', 'পুরনোটা আগে') }).replace('<section class="card ', '<section style="margin-top:14px" class="card ');
  }

  const G = (en, bn) => ({ en, bn });
  A.mod('inbox', {
    chats: { render: renderChats, guide: G(
      '<p><b>What:</b> every message from Messenger, WhatsApp, Instagram and website chat in one list, with the customer’s orders beside it.</p><p><b>Why:</b> a buyer asking “Navy polo XL ache?” at 10 PM orders from whoever answers first. One inbox means nobody is missed.</p><p><b>Comments:</b> switch to “Comments” for Facebook and Instagram post and ad comments — comments with a phone number or abuse are hidden by themselves, price questions get a private message, and live-selling comments like “P1 L 2 pcs” become draft orders.</p><p><b>How:</b> pick a chat (Open, Mine, Unassigned). Read the customer panel — refused parcels show in red. Reply, or pick a quick reply (or type /size). “Send order link” sends the product with sizes in stock. “Create order” makes the order straight from the chat — it lands in Orders › Processing. Assign to a person, then “Mark done”.</p>',
      '<p><b>কী:</b> মেসেঞ্জার, হোয়াটসঅ্যাপ, ইনস্টাগ্রাম ও ওয়েবসাইট চ্যাটের সব মেসেজ এক লিস্টে, পাশে কাস্টমারের অর্ডারগুলো।</p><p><b>কেন:</b> রাত 10টায় “নেভি পোলো XL আছে?” জিজ্ঞেস করা ক্রেতা যে আগে উত্তর দেয় তার কাছেই কেনে। এক ইনবক্সে কেউ বাদ পড়ে না।</p><p><b>কমেন্ট:</b> “কমেন্ট” এ গেলে Facebook ও Instagram পোস্ট ও বিজ্ঞাপনের কমেন্ট পাবেন — ফোন নম্বর বা গালির কমেন্ট নিজে লুকিয়ে যায়, দাম জিজ্ঞেস করলে প্রাইভেট মেসেজ যায়, আর লাইভের “P1 L 2 pcs” এর মতো কমেন্ট ড্রাফট অর্ডার হয়।</p><p><b>কীভাবে:</b> একটা চ্যাট বাছুন (খোলা, আমার, কারো নামে নেই)। পাশের প্যানেলে কাস্টমার দেখুন — পার্সেল ফেরত দিলে লাল দেখায়। উত্তর লিখুন, বা দ্রুত উত্তর বাছুন (অথবা /size লিখুন)। “অর্ডার লিংক পাঠান” স্টকে থাকা সাইজসহ প্রোডাক্ট পাঠায়। “অর্ডার বানান” চ্যাট থেকেই অর্ডার তৈরি করে — সেটা অর্ডার › প্রসেসিং তে যায়। কাউকে দায়িত্ব দিন, তারপর “শেষ করুন”।</p>') },
    replies: { render: renderReplies, guide: G(
      '<p><b>What:</b> saved answers for common questions — size, cash on delivery, exchange, tracking.</p><p><b>Why:</b> Nusrat answers “L size e chest koto?” 30 times a day. One saved answer keeps it fast and always the same.</p><p><b>How:</b> press “Add quick reply”, give a one-word short name and the message (Bengali is fine). In a chat, type / and the short name, or pick it from the list. Update them when your delivery fee or exchange rule changes.</p>',
      '<p><b>কী:</b> সাধারণ প্রশ্নের সেভ করা উত্তর — সাইজ, ক্যাশ অন ডেলিভারি, এক্সচেঞ্জ, পার্সেল কোথায়।</p><p><b>কেন:</b> Nusrat দিনে 30 বার “L সাইজে বুক কত?” এর উত্তর দেন। সেভ করা উত্তরে দ্রুত হয় আর সবসময় একই থাকে।</p><p><b>কীভাবে:</b> “দ্রুত উত্তর যোগ করুন” চাপুন, এক শব্দের ছোট নাম আর মেসেজ দিন (বাংলায় লিখলেই হবে)। চ্যাটে / আর ছোট নাম লিখুন, বা লিস্ট থেকে বাছুন। ডেলিভারি চার্জ বা এক্সচেঞ্জের নিয়ম বদলালে এগুলোও ঠিক করুন।</p>') },
    stats: { render: renderStats, guide: G(
      '<p><b>What:</b> how fast your team answers — average first reply, share answered within 15 minutes, by channel and by person, and the busiest hours.</p><p><b>Why:</b> if Messenger chats wait 2 hours during the 9–11 PM rush, those buyers order from another page.</p><p><b>How:</b> check “Waiting for a reply” first and open the oldest. Look at the hour charts to decide who stays online in the evening. Compare team members to see who needs help.</p>',
      '<p><b>কী:</b> টিম কত দ্রুত উত্তর দেয় — গড় প্রথম উত্তর, 15 মিনিটের মধ্যে কত ভাগ, চ্যানেল ও মানুষ অনুযায়ী, আর কোন ঘণ্টায় সবচেয়ে ব্যস্ত।</p><p><b>কেন:</b> রাত 9–11টার ভিড়ে মেসেঞ্জারে 2 ঘণ্টা অপেক্ষা করালে ক্রেতা অন্য পেজ থেকে কিনে ফেলে।</p><p><b>কীভাবে:</b> আগে “উত্তরের অপেক্ষায়” দেখুন, সবচেয়ে পুরনোটা খুলুন। ঘণ্টার চার্ট দেখে ঠিক করুন সন্ধ্যায় কে অনলাইনে থাকবে। টিমের মধ্যে তুলনা করে দেখুন কার সাহায্য লাগবে।</p>') },
  });
})();
