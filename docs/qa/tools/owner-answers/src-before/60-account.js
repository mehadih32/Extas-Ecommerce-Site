/* ================= EXTAS demo — login, my account, order details (60-account.js) ================= */
(function(){
  var css = `
.acc-page{padding-top:16px;padding-bottom:8px}
@media(min-width:1024px){.acc-page{padding-top:26px}}
.acc-layout{display:grid;gap:16px;margin-top:12px}
@media(min-width:1024px){.acc-layout{grid-template-columns:240px minmax(0,1fr);gap:32px;align-items:start;margin-top:18px}}
.acc-side{display:none}
@media(min-width:1024px){.acc-side{display:block;position:sticky;top:96px}}
.acc-side-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--card-radius);overflow:hidden}
.acc-side-top{padding:16px;border-bottom:1px solid var(--line2);display:flex;gap:12px;align-items:center}
.acc-nav{display:flex;flex-direction:column;padding:6px 0}
.acc-nav a{display:flex;align-items:center;gap:12px;padding:11px 16px;color:var(--ink);font-size:14.5px;font-weight:500;border-left:3px solid transparent}
.acc-nav a:hover{background:var(--surface2)}
.acc-nav a.on{border-left-color:var(--brand);background:var(--brand-tint);font-weight:600}
.acc-nav .acc-n{margin-left:auto;font-size:12px;color:var(--muted);font-weight:600}
.acc-side-foot{border-top:1px solid var(--line2);padding:6px 16px}
.acc-logout{background:none;border:none;padding:10px 0;display:flex;align-items:center;gap:10px;color:var(--text2);font-size:14px;cursor:pointer;font-weight:500;width:100%}
.acc-avatar{width:46px;height:46px;border-radius:50%;background:var(--brand);color:var(--brand-ink);display:flex;align-items:center;justify-content:center;font-weight:700;font-family:var(--font-display);font-size:16px;flex-shrink:0;letter-spacing:.03em}
.acc-avatar.sm{width:38px;height:38px;font-size:13.5px}
.acc-hd{display:grid}
.acc-hd-id{padding:18px;display:flex;gap:14px;align-items:center;min-width:0}
.acc-hi{font-size:24px}
@media(min-width:1024px){.acc-hi{font-size:30px}}
.acc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--line2)}
.acc-stat{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:12px 6px;color:var(--ink)!important}
.acc-stat+.acc-stat{border-left:1px solid var(--line2)}
.acc-stat:hover{background:var(--surface2)}
.acc-stat .v{font-family:var(--font-display);font-weight:700;font-size:19px;line-height:1.25}
.acc-stat .k{font-size:11px;color:var(--muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase}
@media(min-width:768px){.acc-hd{grid-template-columns:minmax(0,1fr) auto;align-items:stretch}.acc-stats{border-top:0;border-left:1px solid var(--line2)}.acc-stat{padding:16px 28px}}
.acc-chips{margin:0 -16px;padding:0 16px 4px}
.acc-chips .chip{min-height:40px;padding:9px 15px}
.acc-hero{position:relative;overflow:hidden;background:var(--brand-dark);color:var(--brand-ink);border-radius:var(--card-radius);padding:22px 20px;display:flex;gap:14px;align-items:center;justify-content:space-between}
.acc-hero::before,.acc-hero::after{content:'';position:absolute;border-radius:50%;border:1px solid currentColor;pointer-events:none}
.acc-hero::before{right:-70px;top:-90px;width:280px;height:280px;opacity:.13}
.acc-hero::after{right:-24px;top:-44px;width:190px;height:190px;opacity:.10}
.acc-hero-eb{font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;opacity:.82;display:flex;gap:8px;align-items:center}
.acc-hero-t{font-size:22px;margin-top:10px;color:inherit}
.acc-hero-n{font-size:13.5px;opacity:.82;margin-top:6px}
.acc-hero-btn{background:var(--brand-ink);color:var(--brand-dark)!important;border-color:var(--brand-ink)}
.acc-hero-code{font-size:12.5px;border:1px dashed currentColor;padding:7px 11px;border-radius:var(--radius);letter-spacing:.08em;font-weight:600}
.acc-hero-big{font-family:var(--font-display);font-weight:800;font-size:40px;line-height:1;position:relative;z-index:1;text-align:right;flex-shrink:0}
.acc-hero-big small{display:block;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-top:6px}
@media(min-width:1024px){.acc-hero{padding:30px 36px}.acc-hero-t{font-size:28px}.acc-hero-big{font-size:72px;padding-right:12px}}
.acc-ocard{padding:16px;display:grid;gap:14px}
@media(min-width:768px){.acc-ocard{grid-template-columns:210px minmax(0,1fr) auto;align-items:center;padding:18px 20px;gap:20px}}
.acc-thumbs{display:flex;gap:8px;min-width:0}
.acc-thumb{flex-shrink:0;border-radius:var(--radius);overflow:hidden}
.acc-thumb .pimg{border-radius:var(--radius)}
.acc-more{width:52px;aspect-ratio:4/5;display:flex;align-items:center;justify-content:center;background:var(--bg);font-size:12px;font-weight:700;color:var(--muted);border-radius:var(--radius)}
.acc-ocard-r{display:flex;align-items:center;justify-content:space-between;gap:16px}
@media(min-width:768px){.acc-ocard-r{justify-content:flex-end;text-align:right}}
.acc-g2{display:grid;gap:12px}
@media(min-width:768px){.acc-g2{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}
.acc-oico{width:40px;height:40px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center}
.acc-ocode{display:inline-flex;gap:8px;align-items:baseline;border:1px dashed var(--brand-line);padding:6px 10px;border-radius:var(--radius);background:var(--surface2)}
.acc-ocode b{letter-spacing:.1em;font-family:var(--font-display)}
.acc-pcell{width:158px}
@media(min-width:768px){.acc-pcell{width:200px}}
@media(min-width:1024px){.acc-pcell{width:206px}}
.acc-sizebox{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.acc-sizebox>div{background:var(--bg);border-radius:var(--radius);padding:12px 14px}
.acc-sizebox .v{font-family:var(--font-display);font-weight:700;font-size:22px;line-height:1.3}
@media(min-width:768px){.acc-sizebox{grid-template-columns:repeat(4,minmax(0,1fr))}}
.acc-stepr{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line2)}
.acc-stepper{display:inline-flex;align-items:center;border:1px solid var(--input);border-radius:var(--radius);background:var(--surface)}
.acc-stepper button{width:44px;height:44px;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--ink)}
.acc-stepper span{min-width:70px;text-align:center;font-weight:700;font-family:var(--font-display);font-size:16px}
.acc-wal{overflow:hidden}
.acc-wal-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:22px 20px}
.acc-bal{font-size:40px;margin:6px 0 2px}
.acc-wal-i{width:52px;height:52px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.acc-wal-note{margin:0 20px 20px;padding:12px 14px;gap:10px}
.acc-tx{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 16px;border-top:1px solid var(--line2)}
@media(min-width:1024px){.acc-tx{padding:14px 20px}}
.acc-tx .amt{font-family:var(--font-display);font-weight:700;white-space:nowrap}
.acc-tx .amt.pos{color:var(--brand)}
:root[data-theme="festive"] .acc-tx .amt.pos{color:var(--gold)}
.acc-code{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1.5px dashed var(--brand-line);background:var(--brand-tint);border-radius:var(--radius);padding:10px 12px}
.acc-code b{font-family:var(--font-display);font-size:21px;letter-spacing:.14em}
.acc-fbform{display:flex;gap:8px}
.acc-fbform .input{min-width:0}
.acc-share{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 0;border-top:1px solid var(--line2)}
.acc-share a{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:13.5px}
.acc-nrow{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-top:1px solid var(--line2)}
.acc-prompt{max-width:520px;margin:0 auto;padding:34px 22px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}
.acc-prompt p{margin:0 0 10px}
.acc-prompt-i{width:56px;height:56px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;margin-bottom:8px}
.acc-err{background:var(--warn-bg);color:var(--warn);border-radius:var(--radius);padding:10px 12px;font-size:13px;display:flex;gap:8px;align-items:flex-start}
.acc-link{color:var(--ink)!important}
.acc-login{padding-top:16px;padding-bottom:8px}
.acc-login-grid{display:grid;gap:16px;margin-top:14px}
@media(min-width:1024px){.acc-login-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;max-width:1040px;margin:30px auto 0}.acc-login-grid .acc-login-card{border-radius:var(--card-radius) 0 0 var(--card-radius)}.acc-login-side{border-radius:0 var(--card-radius) var(--card-radius) 0}}
.acc-login-card{padding:24px 18px}
@media(min-width:768px){.acc-login-card{padding:40px 44px}}
.acc-in{max-width:560px}
.acc-login-side{background:var(--brand-dark);color:var(--brand-ink);border-radius:var(--card-radius);padding:26px 22px;display:flex;flex-direction:column;justify-content:center;gap:20px;position:relative;overflow:hidden}
.acc-login-side::after{content:'';position:absolute;right:-90px;bottom:-90px;width:260px;height:260px;border-radius:50%;border:1px solid currentColor;opacity:.12}
@media(min-width:1024px){.acc-login-side{padding:44px 48px}}
.acc-ben{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:16px}
.acc-ben li{display:flex;gap:14px;align-items:flex-start;font-size:14px;line-height:1.45}
.acc-ben .i{width:36px;height:36px;border-radius:50%;border:1px solid currentColor;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:.9}
.acc-ben b{display:block;font-size:14.5px}
.acc-ben span.s{opacity:.8;font-size:13px}
.acc-pw{position:relative}
.acc-pw .input{padding-right:72px}
.acc-pw-t{position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:none;font-weight:600;font-size:13px;color:var(--brand);cursor:pointer;padding:10px 12px}
.ord-page{padding-top:16px;padding-bottom:8px}
@media(min-width:1024px){.ord-page{padding-top:26px}}
.ord-main{display:flex;flex-direction:column;gap:16px;min-width:0}
.ord-hd{padding:18px 16px}
@media(min-width:1024px){.ord-hd{padding:24px 26px}}
.ord-track{list-style:none;margin:20px 0 0;padding:0;display:flex;flex-direction:column}
.ord-st{display:flex;gap:12px;position:relative;padding-bottom:18px}
.ord-st:last-child{padding-bottom:0}
.ord-st::before{content:'';position:absolute;left:11px;top:28px;bottom:3px;width:2px;background:var(--line)}
.ord-st.ln::before{background:var(--brand)}
.ord-st:last-child::before{display:none}
.ord-st .lbl{font-size:14px;font-weight:600}
.ord-st.todo .lbl{color:var(--muted);font-weight:500}
@media(min-width:1024px){.ord-track{flex-direction:row;margin-top:26px}.ord-st{flex:1;flex-direction:column;gap:10px;padding:0 12px 0 0}.ord-st::before{left:32px;right:6px;top:11px;bottom:auto;width:auto;height:2px}}
.ord-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:20px;padding-top:16px;border-top:1px solid var(--line2)}
.ord-meta .wide{grid-column:1/-1}
@media(min-width:1024px){.ord-meta{grid-template-columns:150px 170px minmax(0,1fr)}.ord-meta .wide{grid-column:auto}}
.ord-cardhd{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px}
@media(min-width:1024px){.ord-cardhd{padding:16px 20px}}
.ord-line{display:flex;gap:14px;padding:16px;border-top:1px solid var(--line2)}
@media(min-width:1024px){.ord-line{padding:18px 20px;gap:18px}}
.ord-thumb{width:76px;flex-shrink:0}
@media(min-width:1024px){.ord-thumb{width:92px}}
.ord-name{color:var(--ink)!important;font-weight:600;font-size:14.5px;line-height:1.35}
.ord-x{padding:14px 16px;border-top:1px solid var(--line2)}
@media(min-width:1024px){.ord-x{padding:16px 20px}}
.ord-x-swap{display:grid;grid-template-columns:44px minmax(0,1fr) 18px 44px minmax(0,1fr);gap:8px;align-items:center}
.ord-x-arr{color:var(--muted)}
.ord-sum-row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:14px}
.ord-sum-row.total{border-top:1px solid var(--line);margin-top:8px;padding-top:12px;font-weight:700;font-size:16px}
.ord-pay{padding:12px 14px}
.ord-demo{border:1.5px dashed var(--input);border-radius:var(--card-radius);padding:16px;background:var(--surface2)}
.ord-stars{display:flex;gap:2px}
.ord-star{background:none;border:none;padding:5px;cursor:pointer;border-radius:var(--radius)}
.ord-star svg{fill:var(--line);stroke:var(--input);stroke-width:.6}
.ord-star.on svg{fill:var(--brand);stroke:var(--brand)}
:root[data-theme="festive"] .ord-star.on svg{fill:var(--gold);stroke:var(--gold)}
.ord-hw{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:8px}
.ord-kg{position:relative}
.ord-kg .input{padding-right:38px}
.ord-kg span{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--muted)}
.ord-photo{width:88px;height:88px;border:1.5px dashed var(--input);border-radius:var(--radius);background:var(--surface2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11.5px;color:var(--text2);cursor:pointer;font-weight:600;flex-shrink:0;padding:0}
.ord-photo.has{border:1.5px solid var(--brand);position:relative;overflow:hidden;cursor:default}
.ord-photo.has .pimg{width:100%;height:100%}
.ord-photo-x{position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;border:none;background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2);z-index:2}
.ord-eline{display:flex;gap:12px;padding:14px 0;border-top:1px solid var(--line2)}
.ord-eline .size-pill{min-width:48px;padding:8px 10px}
`;
  var s = document.createElement('style'); s.setAttribute('data-mod', 'account'); s.textContent = css; document.head.appendChild(s);
})();

/* ---------- shared helpers (also used by 61-exchange.js) ---------- */
/* 52. The six the owner asked for, in his order: My orders, For you (offers
   for you), Rewards, Wallet, Wishlist, Profile. The phone shows them as the
   scrolling chip row (acc_chips); the desktop as the side nav. */
var ACC_TABS = [
  {id:'orders', label:'My orders', icon:'box'},
  {id:'foryou', label:'For you', icon:'spark'},
  {id:'rewards', label:'Rewards', icon:'gift'},
  {id:'wallet', label:'Wallet', icon:'wallet'},
  {id:'wishlist', label:'Wishlist', icon:'heart'},
  {id:'profile', label:'Profile', icon:'user'}
];
var ACC_REASON = {small:'Too small', big:'Too big', problem:'Faulty, damaged or wrong item'};
var ACC_XSTATUS = {requested:'Requested', approved:'Approved', completed:'Completed'};

/* R15 wave 1 (bug 9b): an address that names no tab used to show My orders
   silently. Saved addresses live in Profile, so those words go there; any
   other unknown tab is a proper "Page not found". */
var ACC_ALIAS = {addresses:'profile', address:'profile', details:'profile', size:'foryou', offers:'foryou'};
function acc_tab(id){ if(ACC_ALIAS[id]) id = ACC_ALIAS[id]; for(var i=0;i<ACC_TABS.length;i++) if(ACC_TABS[i].id===id) return ACC_TABS[i]; return ACC_TABS[0]; }
function acc_tabKnown(id){ if(!id) return true; if(ACC_ALIAS[id]) return true; for(var i=0;i<ACC_TABS.length;i++) if(ACC_TABS[i].id===id) return true; return false; }
function acc_first(name){ return String(name||'').trim().split(/\s+/)[0] || 'there'; }
function acc_initials(name){ var p = String(name||'').trim().split(/\s+/); return (((p[0]||'')[0]||'E') + ((p[1]||'')[0]||'')).toUpperCase(); }
/* 52. One avatar for the whole account area, so the photo the customer uploads
   in Profile shows up in the header, the side nav and the login card too. */
function acc_avatar(acc, cls){
  var c = 'acc-avatar'+(cls?' '+cls:'');
  if(acc && acc.photo) return '<span class="'+c+' has-photo"><img src="'+esc(acc.photo)+'" alt=""></span>';
  return '<span class="'+c+'">'+esc(acc_initials(acc && acc.name))+'</span>';
}
function acc_nicePhone(ph){ var c = checkPhone(ph); return c.nice || String(ph||''); }
function acc_owns(acc, o){ return !!(acc && o && ((acc.orders||[]).indexOf(o.id)>=0 || o.phone===acc.phone)); }
function acc_orders(acc){ return (acc.orders||[]).map(function(id){ return ty_fixAdds(ST.orders[id]); }).filter(Boolean); }
function acc_next(n){ n = String(n||''); return (/^#\/\S*$/.test(n) && n.indexOf('#/login')!==0) ? n : '#/account'; }
function acc_payLabel(p){ return {cod:'Cash on Delivery', bkash:'bKash', nagad:'Nagad', card:'Card'}[p] || String(p||''); }
function acc_ftIn(h){ if(!h) return '—'; return Math.floor(h/12)+'\''+(h%12)+'"'; }
function acc_err(msg){ return '<div class="acc-err">'+ico('info',16,'style="flex-shrink:0;margin-top:1px"')+'<span>'+esc(msg)+'</span></div>'; }
function acc_crumbs(items){
  return '<nav class="crumbs" aria-label="Breadcrumb">'+items.map(function(it, i){
    var last = i===items.length-1;
    return (i?'<span aria-hidden="true">/</span>':'')+(it[1] && !last ? '<a href="'+it[1]+'">'+esc(it[0])+'</a>' : '<span'+(last?' aria-current="page"':'')+'>'+esc(it[0])+'</span>');
  }).join('')+'</nav>';
}
function acc_thumb(pid, color, w){ var p = P(pid); if(!p) return ''; return '<div class="acc-thumb" style="width:'+(w||52)+'px">'+productImg(p, color, {ratio:'ratio-45', label:false})+'</div>'; }
function acc_tierTag(acc){
  var tr = acc.tier || 'New';
  if(tr==='VIP') return '<span class="tag gold">'+ico('star',12)+'VIP</span>';
  if(tr==='New') return '<span class="tag plain">New customer</span>';
  return '<span class="tag">'+esc(tr)+'</span>';
}
function acc_statusTag(o){
  var lbl = STATUS_LABEL[o.status] || o.status;
  var cls = (o.status==='delivered' || o.status==='shipped') ? 'tag' : 'tag warn';
  return '<span class="'+cls+'">'+(o.status==='delivered' ? ico('check',12) : (o.status==='shipped' ? ico('truck',12) : ico('clock',12)))+esc(lbl)+'</span>';
}
function acc_excWindowTag(o){
  if(o.status!=='delivered') return '';
  var h = exchangeHoursLeft(o);
  return h>0 ? '<span class="tag warn">'+ico('clock',12)+plural(h,'hour')+' left to exchange</span>' : '<span class="tag plain">Exchange window closed</span>';
}
function acc_lineExchangeable(o, i){ var max = Number(SET('exchange','perItem')) || 1; return (o.exchanges||[]).filter(function(x){ return x.lineIdx===i; }).length < max; }
function acc_loginPrompt(title, msg, href){
  return '<section class="card acc-prompt"><span class="acc-prompt-i">'+ico('lock',24)+'</span><h1 class="h2">'+esc(title)+'</h1><p class="text2 small">'+esc(msg)+'</p>'+
    '<a class="btn btn-primary" href="'+esc(href||'#/login')+'">'+ico('user',17)+'Log in</a>'+
    '<p class="xs muted" style="margin:14px 0 0">New here? Your account is created automatically with your first order.</p></section>';
}
/* refresh a modal without jumping its scroll position */
function acc_refreshKeep(){ var m = document.querySelector('.modal'), y = m ? m.scrollTop : 0; refreshModal(); var m2 = document.querySelector('.modal'); if(m2) m2.scrollTop = y; }

/* ================= LOGIN ================= */
PAGES.login = {
  layout:'store',
  title:function(){ return 'Log in'; },
  render:function(params, query){
    query = query || {};
    var next = acc_next(query.next), acc = currentAccount();
    var crumbs = acc_crumbs([['Home','#/'],['Log in']]);
    if(acc){
      return '<div class="container acc-login">'+crumbs+
        '<section class="card acc-login-card acc-in mt16"><div class="row" style="gap:14px">'+acc_avatar(acc)+'<div><h1 class="h2">You are logged in</h1><div class="small text2">'+esc(acc.name)+' · '+esc(acc_nicePhone(acc.phone))+'</div></div></div>'+
        '<div class="row wrap mt24"><a class="btn btn-primary" href="'+esc(next)+'">Go to my account</a><button class="btn btn-ghost" data-act="acc-logout" data-to="#/login">Log out</button></div></section></div>';
    }
    var win = SET('exchange','windowHours');
    return '<div class="container acc-login">'+crumbs+
      '<div class="acc-login-grid">'+
        '<section class="card acc-login-card" aria-labelledby="lg-h">'+
          '<div class="eyebrow">'+esc(t('My account'))+'</div>'+
          '<h1 class="h1 mt8" id="lg-h">Log in</h1>'+
          '<p class="text2 small" style="margin:6px 0 0">Use the mobile number you ordered with.</p>'+
          '<form class="stack s16 mt24" data-submit="login-form" data-next="'+esc(next)+'" novalidate>'+
            '<div><label class="label" for="lg-phone">Mobile number</label><input id="lg-phone" name="phone" class="input" type="tel" inputmode="numeric" autocomplete="tel" placeholder="01XXX-XXXXXX" data-input="login-phone"><div id="lg-phone-msg" class="xs" aria-live="polite"></div></div>'+
            '<div><label class="label" for="lg-pw">Password</label><div class="acc-pw"><input id="lg-pw" name="password" class="input" type="password" autocomplete="current-password"><button type="button" class="acc-pw-t" data-act="login-showpw" aria-label="Show password">Show</button></div></div>'+
            '<div id="lg-err" role="alert"></div>'+
            '<button class="btn btn-primary btn-block" type="submit">Log in</button>'+
            '<button type="button" class="link" data-act="login-forgot" style="align-self:flex-start">Forgot password? We\'ll SMS a code</button>'+
          '</form>'+
          '<div class="soft p16 small mt16 row between wrap" style="gap:6px 12px"><span>Returning customer demo: <b>01712345678</b> · password <b>01712345678</b></span><button type="button" class="link" data-act="login-demo">Fill it in</button></div>'+
          '<div class="row top small text2 mt16" style="gap:8px">'+ico('info',17,'style="flex-shrink:0;margin-top:2px"')+'<span>New here? Your account is created automatically with your first order.</span></div>'+
        '</section>'+
        '<aside class="acc-login-side" aria-label="Why log in">'+
          '<div class="eyebrow" style="color:inherit;opacity:.75">Your EXTAS account</div>'+
          '<div class="display" style="font-size:27px;color:inherit">Your orders, sizes and wallet in one place</div>'+
          '<ul class="acc-ben">'+
            '<li><span class="i">'+ico('truck',17)+'</span><span><b>Track every order</b><span class="s">Order updates by SMS, no app needed</span></span></li>'+
            '<li><span class="i">'+ico('swap',17)+'</span><span><b>Exchange a size in '+esc(win)+' hours</b><span class="s">Request it here — the courier swaps it at your door</span></span></li>'+
            '<li><span class="i">'+ico('wallet',17)+'</span><span><b>Wallet credit</b><span class="s">Use exchange credit on your next order</span></span></li>'+
            '<li><span class="i">'+ico('gift',17)+'</span><span><b>Offers only for you</b><span class="s">Applied automatically at checkout</span></span></li>'+
          '</ul>'+
        '</aside>'+
      '</div></div>';
  }
};
INPUT['login-phone'] = function(el){
  var c = checkPhone(el.value), box = document.getElementById('lg-phone-msg'); if(!box) return;
  el.classList.remove('ok'); el.classList.remove('warn');
  if(c.state==='ok'){ el.classList.add('ok'); box.innerHTML = ''; }
  else if(c.state==='warn' && (c.digits.length>=11 || /^01[0-2]/.test(c.digits))){ el.classList.add('warn'); box.innerHTML = '<div class="mt8" style="color:var(--warn)">'+esc(c.msg)+'</div>'; }
  else box.innerHTML = '';
};
SUBMIT['login-form'] = function(f){
  var ph = f.querySelector('[name=phone]').value, pw = f.querySelector('[name=password]').value, err = document.getElementById('lg-err');
  /* R15 wave 2 (AX13): the wrong fields are marked and tied to the message */
  var mark = function(phBad, pwBad){ [['lg-phone', phBad], ['lg-pw', pwBad]].forEach(function(x){ var el = document.getElementById(x[0]) || f.querySelector(x[0]==='lg-pw' ? '[name=password]' : '[name=phone]'); if(!el) return;
    if(x[1]){ el.setAttribute('aria-invalid','true'); el.setAttribute('aria-describedby','lg-err'); } else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); } }); };
  if(!String(ph).trim() || !pw){ mark(!String(ph).trim(), !pw); err.innerHTML = acc_err('Please enter your mobile number and password.'); return; }
  if(login(ph, pw)){ var a = currentAccount(); toast('Welcome back, '+acc_first(a.name)); go(f.getAttribute('data-next') || '#/account'); }
  else { mark(true, true); err.innerHTML = acc_err('That number and password don\'t match. Check them, or tap "Forgot password".'); }
};
ACT['login-showpw'] = function(el){ var i = document.getElementById('lg-pw'); if(!i) return; var show = i.type==='password'; i.type = show ? 'text' : 'password'; el.textContent = show ? 'Hide' : 'Show'; el.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); };
ACT['login-forgot'] = function(){ toast('Demo: we would SMS a 6-digit code to your number'); };
ACT['login-demo'] = function(){ var a = document.getElementById('lg-phone'), b = document.getElementById('lg-pw'); if(a){ a.value = '01712345678'; INPUT['login-phone'](a); } if(b) b.value = '01712345678'; var e = document.getElementById('lg-err'); if(e) e.innerHTML = ''; };
ACT['acc-logout'] = function(el){ logout(); closeModal(true); toast('You are logged out'); go((el && el.getAttribute('data-to')) || '#/'); };

/* ================= MY ACCOUNT ================= */
PAGES.account = {
  layout:'store',
  after:acc_after,
  title:function(params){ if(!acc_tabKnown(params && params[0])) return 'Page not found'; return acc_tab(params && params[0]).label+' · '+t('My account'); },
  render:function(params){
    if(!acc_tabKnown(params && params[0])) return PAGES.notfound.render();
    var tab = acc_tab(params && params[0]).id, acc = currentAccount();
    if(!acc){
      if(tab==='wishlist') return acc_guestWishlist();
      return '<div class="container acc-page">'+acc_crumbs([['Home','#/'],[t('My account')]])+'<div class="mt16">'+
        acc_loginPrompt('Log in to your account', 'See your orders, track deliveries, exchange a size and use your wallet.', '#/login')+'</div></div>';
    }
    ACC_ROW_N = 0;                                  /* ids must be stable per render */
    var body = {orders:acc_tabOrders, foryou:acc_tabForYou, wallet:acc_tabWallet, rewards:acc_tabRewards, wishlist:acc_tabWishlist, profile:acc_tabProfile}[tab](acc);
    return '<div class="container acc-page">'+acc_crumbs([['Home','#/'],[t('My account'),'#/account'],[acc_tab(tab).label]])+
      '<div class="acc-layout">'+acc_side(acc, tab)+
        '<div class="stack s16" style="min-width:0">'+acc_header(acc)+acc_chips(tab)+
          /* 51. The banner carries the offers AND the wallet, so the old
             single-offer hero underneath it would just say the same thing
             twice — it only shows when the banner is switched off. */
          /* On the account landing. For you lists the same offers as full
             cards underneath, Wallet has its own balance card and Profile
             should stay quiet — so one banner, in one place. */
          (tab==='orders'
            ? (SHOW('account','offerBanner') ? ty_offerBanner({big:true, acc:acc}) : acc_hero(acc))+acc_personalOffer(acc)
            : '')+body+acc_homeRow()+'</div>'+
      '</div></div>';
  }
};

/* 47. There was no way back to the shop from in here — only the breadcrumb,
   which nobody reads on a phone. Every account page now ends with the way
   home, next to the way out. */
function acc_homeRow(){
  return '<div class="acc-home" data-testid="acc-home">'+
    '<a class="btn btn-secondary btn-block" href="#/">'+ico('home',17)+'Back to home</a>'+
    '<a class="btn btn-ghost btn-block" href="#/c/new">'+ico('bag',17)+'Keep shopping</a>'+
    '<button type="button" class="btn btn-ghost btn-block acc-logout-b" data-act="acc-logout">'+ico('back',17)+'Log out</button>'+
  '</div>';
}
function acc_side(acc, tab){
  var counts = {orders:acc_orders(acc).length, wallet:fmt(acc.wallet||0), foryou:(acc.offers||[]).length || '', wishlist:ST.wishlist.length || ''};
  return '<aside class="acc-side" aria-label="Account menu"><div class="acc-side-card">'+
    '<div class="acc-side-top">'+acc_avatar(acc,'sm')+'<div style="min-width:0"><div class="bold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(acc.name)+'</div><div style="margin-top:3px">'+acc_tierTag(acc)+'</div></div></div>'+
    '<nav class="acc-nav">'+ACC_TABS.map(function(x){
      var on = x.id===tab, n = counts[x.id];
      return '<a href="#/account/'+x.id+'" class="'+(on?'on':'')+'"'+(on?' aria-current="page"':'')+'>'+ico(x.icon,18)+'<span>'+esc(x.label)+'</span>'+(n!==undefined && n!=='' ? '<span class="acc-n">'+esc(n)+'</span>' : '')+'</a>';
    }).join('')+'</nav>'+
    '<div class="acc-side-foot"><button class="acc-logout" data-act="acc-logout">'+ico('back',17)+'Log out</button></div>'+
  '</div><div class="mt16">'+co_waBtn('Need help? WhatsApp us', 'Hi EXTAS, I need help with my account', 'btn-block acc-sidewa')+'</div></aside>';
}
function acc_header(acc){
  var n = acc_orders(acc).length, offers = (acc.offers||[]).length;
  return '<section class="card acc-hd" aria-label="Account summary">'+
    '<div class="acc-hd-id">'+acc_avatar(acc)+'<div style="min-width:0"><h1 class="h1 acc-hi">Hi, '+esc(acc_first(acc.name))+'</h1>'+
      '<div class="row wrap small text2" style="gap:8px;margin-top:4px"><span>'+esc(acc_nicePhone(acc.phone))+'</span>'+acc_tierTag(acc)+'</div></div></div>'+
    '<div class="acc-stats">'+
      '<a class="acc-stat" href="#/account/orders"><span class="v">'+n+'</span><span class="k">Orders</span></a>'+
      '<a class="acc-stat" href="#/account/wallet"><span class="v">'+fmt(acc.wallet||0)+'</span><span class="k">Wallet</span></a>'+
      '<a class="acc-stat" href="#/account/foryou"><span class="v">'+offers+'</span><span class="k">Offers</span></a>'+
    '</div></section>';
}
function acc_chips(tab){
  return '<nav class="scroll-x hide-d acc-chips" aria-label="Account sections">'+ACC_TABS.map(function(x){
    var on = x.id===tab; return '<a class="chip'+(on?' on':'')+'" href="#/account/'+x.id+'"'+(on?' aria-current="page"':'')+'>'+esc(x.label)+'</a>';
  }).join('')+'</nav>';
}
function acc_hero(acc){
  var o = (acc.offers||[])[0]; if(!o) return '';
  var big = o.pct ? o.pct+'%' : (o.amount ? fmt(o.amount) : '');
  return '<section class="acc-hero" aria-label="Offer for you"><div style="position:relative;z-index:1;min-width:0">'+
    '<div class="acc-hero-eb">'+ico('spark',14)+'Only for you'+(acc.tier==='VIP' ? ' · VIP' : '')+'</div>'+
    '<div class="display acc-hero-t">'+esc(o.title)+'</div>'+
    '<div class="acc-hero-n">'+esc(o.note)+'</div>'+
    '<div class="row wrap mt16" style="gap:12px"><a class="btn acc-hero-btn" href="#/c/new">'+esc(t('Shop now'))+ico('right',16)+'</a>'+(o.code ? '<span class="acc-hero-code">CODE '+esc(o.code)+'</span>' : '')+'</div>'+
  '</div>'+(big ? '<div class="acc-hero-big" aria-hidden="true">'+esc(big)+'<small>off</small></div>' : '')+'</section>';
}

/* ================= 44. the order card tells its story in pictures ========
   The owner asked for a picture instead of the word "View": a tick when the
   order is confirmed, a pick-up mark when it has been collected, the
   courier's own mark while it is with them, and a rider handing the parcel
   over at the end. The four marks are drawn here (no image files, so they
   survive being a single HTML file), and the whole rail is a link to the
   full tracking page — tapping the picture is tapping "View".
   NOTE for production: acc_courierMark() draws a wordmark badge in each
   courier's own colour. Drop the courier's real logo file in here when the
   brand assets arrive; nothing else has to change. */
var ACC_COURIERS = {
  steadfast:{name:'Steadfast', short:'SF', bg:'#0C8A4B', ink:'#FFFFFF'},
  pathao   :{name:'Pathao',    short:'ph', bg:'#E42C44', ink:'#FFFFFF'},
  redx     :{name:'RedX',      short:'R',  bg:'#D5202F', ink:'#FFFFFF'},
  paperfly :{name:'Paperfly',  short:'P',  bg:'#1C4FA1', ink:'#FFFFFF'}
};
function acc_courier(o){
  var k = String((o && o.courier) || '').toLowerCase().replace(/[^a-z]/g,'');
  return ACC_COURIERS[k] || {name:(o && o.courier) || 'Courier', short:(((o && o.courier) || 'C')[0]||'C').toUpperCase(), bg:'#4A4640', ink:'#FFFFFF'};
}
function acc_courierMark(o, size){
  var c = acc_courier(o); size = size || 26;
  return '<span class="acc-cour" style="background:'+c.bg+';color:'+c.ink+';width:'+size+'px;height:'+size+'px" aria-hidden="true">'+esc(c.short)+'</span>';
}
/* a box with two hands under it — "collected from us" */
function acc_icPickup(s){ s = s||20; return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
  '<path d="M4 4h10l2 3H6z"/><path d="M6 7h10v6H6z"/><path d="M3 20c1.4-2.2 3-3.3 4.8-3.3h8.4c1.8 0 3.4 1.1 4.8 3.3"/><path d="M12 16.7v-3"/></svg>'; }
/* a rider handing a parcel to someone at the door */
function acc_icHandover(s){ s = s||20; return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
  '<circle cx="5.5" cy="5.2" r="2.1"/><path d="M3 20v-5.2c0-1.6.9-2.6 2.5-2.6h1.2"/>'+
  '<rect x="8.4" y="9.6" width="7" height="5.6" rx="1"/><path d="M11.9 9.6v5.6"/>'+
  '<circle cx="19" cy="5.2" r="2.1"/><path d="M21 20v-5.2c0-1.6-.9-2.6-2.5-2.6h-1.1"/></svg>'; }
function acc_trackFlow(o){
  var cur = STATUS_FLOW.indexOf(o.status); if(cur<0) cur = 0;
  var c = acc_courier(o);
  var steps = [
    {k:'confirmed', lbl:'Confirmed', art:ico('check',19)},
    {k:'packed',    lbl:'Picked up', art:acc_icPickup(19)},
    {k:'shipped',   lbl:c.name,      art:acc_courierMark(o, 26), raw:true},
    {k:'delivered', lbl:'Delivered', art:acc_icHandover(19)}
  ];
  return '<a class="acc-flow" href="#/order/'+esc(o.id)+'" aria-label="Track order '+esc(o.id)+'" data-testid="flow-'+esc(o.id)+'">'+
    steps.map(function(s, i){
      var done = i<=cur, now = i===cur;
      return '<span class="acc-fstep'+(done?' done':'')+(now?' now':'')+(s.raw?' raw':'')+'">'+
        '<span class="acc-fdot">'+s.art+'</span>'+
        '<span class="acc-flbl">'+esc(s.lbl)+'</span>'+
        (i<steps.length-1 ? '<span class="acc-fline'+(i<cur?' on':'')+'" aria-hidden="true"></span>' : '')+
      '</span>';
    }).join('')+'</a>';
}

/* ----- tab: orders ----- */
function acc_tabOrders(acc){
  var list = acc_orders(acc).sort(function(a,b){ return b.createdAt - a.createdAt; });
  var h = '<section aria-labelledby="ao-h"><div class="sec-hd"><h2 class="h2" id="ao-h">My orders</h2><span class="small muted">'+plural(list.length,'order')+'</span></div>';
  if(!list.length) return h+'<div class="card empty"><div class="h3" style="color:var(--ink)">No orders yet</div><p class="small" style="margin:6px 0 14px">Your orders will show up here.</p><a class="btn btn-primary" href="#/c/new">Start shopping</a></div></section>';
  /* 37. The return note the owner wants seen once in the journey: here and
     on the thank-you page, never on the checkout. */
  return h+'<div class="stack s12">'+list.map(acc_orderCard).join('')+'</div>'+bag_returnNote('acc-ret')+'</section>';
}
function acc_orderCard(o){
  var units = o.lines.reduce(function(s,l){ return s + (l.qty||1); }, 0);
  var thumbs = o.lines.slice(0,4).map(function(l){ return acc_thumb(l.product, l.color, 52); }).join('') + (o.lines.length>4 ? '<div class="acc-more">+'+(o.lines.length-4)+'</div>' : '');
  var xt = acc_excWindowTag(o);
  return '<article class="card acc-ocard" data-testid="ocard-'+esc(o.id)+'">'+
    /* R16. The order number opens the order page, and the invoice is one tap
       away beside it (the same sheet the order page opens). Both 44px. */
    '<div><div class="acc-onum">'+
        '<a class="h3 acc-onum-a" href="#/order/'+esc(o.id)+'" data-testid="ocard-link-'+esc(o.id)+'" aria-label="Open order '+esc(o.id)+'">#'+esc(o.id)+'</a>'+
        (SHOW('account','invoices') ? '<button type="button" class="acc-oinv" data-act="inv-open" data-id="'+esc(o.id)+'" aria-label="Invoice for order '+esc(o.id)+'" title="Invoice">'+ico('doc',18)+'</button>' : '')+
      '</div><div class="xs muted" style="margin-top:2px">Placed '+esc(dateStr(o.createdAt))+' · '+plural(units,'item')+'</div>'+
      '<div class="row wrap mt8" style="gap:6px">'+acc_statusTag(o)+xt+'</div></div>'+
    /* 44. the picture of where the parcel is, beside the product image */
    '<div class="acc-ordmid"><div class="acc-thumbs">'+thumbs+'</div>'+acc_trackFlow(o)+'</div>'+
    '<div class="acc-ocard-r"><div><div class="xs muted">Total</div><div class="price" style="font-size:17px">'+fmt(o.total)+'</div></div>'+
      '<a class="btn btn-sm btn-secondary" href="#/order/'+esc(o.id)+'" aria-label="Track order '+esc(o.id)+'">'+ico('truck',15)+'Track'+ico('right',15)+'</a></div>'+
  '</article>';
}

/* ================= 48. the offer that knows what he buys ================
   Worked out from his own order history: whichever category he has bought
   most goes on offer, the percentage is fixed by the owner from the
   dashboard, and the products inside it rotate one at a time so the whole
   range gets shown rather than the same polo forever.
   Everything the owner would want to change is in ACC_OFFER. */
var ACC_OFFER = {
  on       : true,      /* dashboard switch                                  */
  pct      : 15,        /* the discount, fixed by the owner — 15 means 15%   */
  rotateMs : 4200,      /* how long each product is shown                    */
  max      : 6,         /* how many products take turns                      */
  fallback : 'polos'    /* used for a customer with no history yet           */
};
function acc_topCat(acc){
  var count = {}, best = null;
  acc_orders(acc).forEach(function(o){
    (o.lines||[]).forEach(function(l){ var p = P(l.product); if(!p) return;
      var c = CAT(p.cat); if(!c || c.group==='acc') return;
      count[p.cat] = (count[p.cat]||0) + (l.qty||1); });
  });
  Object.keys(count).forEach(function(k){ if(!best || count[k]>count[best]) best = k; });
  return best || ACC_OFFER.fallback;
}
function acc_offerPicks(cat){
  var list = DB.products.filter(function(p){ return p.cat===cat && !p.hidden; });
  if(list.length<2) list = DB.products.filter(function(p){ var c = CAT(p.cat); return c && c.group!=='acc' && !p.hidden; });
  return list.slice(0, ACC_OFFER.max);
}
function acc_personalOffer(acc){
  if(!ACC_OFFER.on) return '';
  var cat = acc_topCat(acc), c = CAT(cat), picks = acc_offerPicks(cat);
  if(!picks.length) return '';
  var pct = Number(ACC_OFFER.pct) || 0;
  var seen = acc_orders(acc).length > 0;
  var slides = picks.map(function(p, i){
    var was = p.price, now = Math.round(p.price*(100-pct)/100);
    return '<div class="acc-po-slide'+(i?'':' on')+'" data-i="'+i+'">'+
      '<a class="acc-po-img" href="#/p/'+esc(p.id)+'" tabindex="'+(i?-1:0)+'" aria-label="'+esc(p.name)+'">'+productImg(p, p.colors[0], {ratio:'ratio-11', label:false})+'</a>'+
      '<div class="acc-po-tx"><a class="acc-po-name" href="#/p/'+esc(p.id)+'" tabindex="'+(i?-1:0)+'">'+esc(p.name)+'</a>'+
        '<div class="acc-po-price"><b>'+fmt(now)+'</b><span class="strike">'+fmt(was)+'</span>'+
        '<span class="acc-po-save">−'+pct+'%</span></div></div></div>';
  }).join('');
  return '<section class="acc-po acc-po-rot" data-testid="acc-personal-offer" data-rotate="'+(Number(ACC_OFFER.rotateMs)||4200)+'" aria-label="An offer picked for you">'+
    '<div class="acc-po-hd"><span class="acc-po-eb">'+ico('spark',14)+'Picked for you</span>'+
      '<a class="acc-po-all" href="#/c/'+esc(cat)+'">See all '+esc((c&&c.name)||'items')+ico('right',14)+'</a></div>'+
    '<div class="acc-po-t">'+esc(pct)+'% off '+esc(((c&&c.name)||'your favourites').toLowerCase())+'</div>'+
    '<div class="acc-po-n">'+esc(seen ? 'Because '+((c&&c.name)||'these').toLowerCase()+' are what you keep ordering.' : 'Our best sellers to start you off.')+'</div>'+
    '<div class="acc-po-stage">'+slides+'</div>'+
    '<div class="acc-po-dots" aria-hidden="true">'+picks.map(function(p,i){ return '<span class="acc-po-dot'+(i?'':' on')+'"></span>'; }).join('')+'</div>'+
  '</section>'+acc_offer3(acc, cat);
}
/* ================= R16. desktop: three offers side by side ===============
   Phone keeps the rotating card above, untouched. From 1024px up the
   rotating card is hidden (r12-zinv.css) and three cards in the SAME look
   fill the width instead — each from a DIFFERENT category, each showing that
   category's top seller.
   Category order: the customer's own top category first (the same one the
   phone card offers), then the categories he buys next most, then the
   shop's best-selling categories. Accessories (group 'acc') are left out,
   as on the phone card.
   "Top seller" = units sold across all orders in the shop (ST.orders);
   ties — and categories with no orders yet — go to the product with the
   most reviews (every review is a verified purchase), then the rating. */
function acc_soldUnits(){
  var n = {};
  Object.keys(ST.orders||{}).forEach(function(id){ var o = ST.orders[id];
    (o && o.lines || []).forEach(function(l){ n[l.product] = (n[l.product]||0) + (l.qty||1); }); });
  return n;
}
function acc_topSeller(cat, sold){
  var list = DB.products.filter(function(p){ return p.cat===cat && !p.hidden; });
  list.sort(function(a,b){ return (sold[b.id]||0) - (sold[a.id]||0) || (b.reviews||0) - (a.reviews||0) || (b.rating||0) - (a.rating||0); });
  return list[0] || null;
}
function acc_offer3(acc, first){
  var sold = acc_soldUnits(), mine = {}, shop = {};
  acc_orders(acc).forEach(function(o){ (o.lines||[]).forEach(function(l){ var p = P(l.product); if(p) mine[p.cat] = (mine[p.cat]||0) + (l.qty||1); }); });
  DB.products.forEach(function(p){ shop[p.cat] = (shop[p.cat]||0) + (sold[p.id]||0)*1000 + (p.reviews||0); });
  var cats = DB.categories.filter(function(c){ return c.group!=='acc' && !c.soon; }).map(function(c){ return c.id; });
  cats.sort(function(a,b){ return (a===first ? -1 : b===first ? 1 : 0) || (mine[b]||0) - (mine[a]||0) || (shop[b]||0) - (shop[a]||0); });
  var pct = Number(ACC_OFFER.pct) || 0, cards = [];
  for(var i=0; i<cats.length && cards.length<3; i++){
    var c = CAT(cats[i]), p = acc_topSeller(cats[i], sold); if(!c || !p) continue;
    var now = Math.round(p.price*(100-pct)/100), nm = (c.name||'').toLowerCase();
    cards.push('<article class="acc-po acc-po-one" data-testid="acc-offer3-'+esc(c.id)+'" aria-label="'+esc(pct+'% off '+nm)+'">'+
      '<div class="acc-po-hd"><span class="acc-po-eb">'+ico('spark',14)+(cards.length ? 'Top seller' : 'Picked for you')+'</span>'+
        '<a class="acc-po-all" href="#/c/'+esc(c.id)+'">See all'+ico('right',14)+'</a></div>'+
      '<div class="acc-po-t">'+esc(pct)+'% off '+esc(nm)+'</div>'+
      '<div class="acc-po-n">'+esc(mine[c.id] ? 'Because '+nm+' are what you keep ordering.' : 'Our best-selling '+nm+'.')+'</div>'+
      '<div class="acc-po-stage"><div class="acc-po-slide on">'+
        '<a class="acc-po-img" href="#/p/'+esc(p.id)+'" aria-label="'+esc(p.name)+'">'+productImg(p, p.colors[0], {ratio:'ratio-11', label:false})+'</a>'+
        '<div class="acc-po-tx"><a class="acc-po-name" href="#/p/'+esc(p.id)+'">'+esc(p.name)+'</a>'+
          '<div class="acc-po-price"><b>'+fmt(now)+'</b><span class="strike">'+fmt(p.price)+'</span><span class="acc-po-save">−'+pct+'%</span></div></div>'+
      '</div></div></article>');
  }
  return cards.length ? '<div class="acc-po3" data-testid="acc-offer3">'+cards.join('')+'</div>' : '';
}
/* the rotation itself — one timer, cleared on every render */
var ACC_PO_TIMER = null;
function acc_poRotate(){
  if(ACC_PO_TIMER){ clearInterval(ACC_PO_TIMER); ACC_PO_TIMER = null; }
  var box = document.querySelector('.acc-po'); if(!box) return;
  var slides = box.querySelectorAll('.acc-po-slide'), dots = box.querySelectorAll('.acc-po-dot');
  if(slides.length<2) return;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var i = 0, ms = Number(box.getAttribute('data-rotate')) || 4200;
  ACC_PO_TIMER = setInterval(function(){
    if(!document.body.contains(box)){ clearInterval(ACC_PO_TIMER); ACC_PO_TIMER = null; return; }
    slides[i].classList.remove('on'); if(dots[i]) dots[i].classList.remove('on');
    /* the slide that just left must not keep a tab stop */
    Array.prototype.forEach.call(slides[i].querySelectorAll('a'), function(a){ a.tabIndex = -1; });
    i = (i+1) % slides.length;
    slides[i].classList.add('on'); if(dots[i]) dots[i].classList.add('on');
    Array.prototype.forEach.call(slides[i].querySelectorAll('a'), function(a){ a.tabIndex = 0; });
  }, ms);
}

/* ----- tab: for you ----- */
function acc_tabForYou(acc){
  var offers = acc.offers || [];
  var h = '<section aria-labelledby="fy-o"><div class="sec-hd"><h2 class="h2" id="fy-o">Offers for you</h2><span class="small muted">'+plural(offers.length,'offer')+'</span></div>';
  h += offers.length ? '<div class="acc-g2">'+offers.map(acc_offerCard).join('')+'</div>' : '<div class="card p20 small text2">No personal offers right now. We\'ll SMS you when there\'s one.</div>';
  h += '</section>' + acc_sizeCard();
  var r = acc_recs(acc);
  h += acc_row('Recommended for you', r.rec, 'Picked from what you bought') + acc_row('Trending now', r.trending) + acc_row(t('New in'), r.newIn) + acc_row('On offer', r.onOffer);
  return '<div class="stack s24">'+h+'</div>';
}
function acc_offerCard(o){
  return '<article class="card p20"><div class="row between top"><span class="acc-oico">'+ico(o.pct ? 'tag' : 'gift', 20)+'</span><span class="tag">'+ico('check',12)+'Applied automatically</span></div>'+
    '<div class="h3 mt12" style="font-size:16px">'+esc(o.title)+'</div><div class="small text2" style="margin-top:3px">'+esc(o.note)+'</div>'+
    (o.code ? '<div class="acc-ocode mt12"><span class="xs muted">Code</span><b>'+esc(o.code)+'</b></div>' : '')+'</article>';
}
function acc_sizeCard(){
  var ms = mySize();
  var body = ms ? '<div class="acc-sizebox mt16">'+
      '<div><div class="xs muted">Tops</div><div class="v">'+esc(ms.top||'—')+'</div></div>'+
      '<div><div class="xs muted">Trousers (waist)</div><div class="v">'+esc(ms.bottom||'—')+'</div></div>'+
      '<div><div class="xs muted">Height</div><div class="v">'+esc(acc_ftIn(ms.heightIn))+'</div></div>'+
      '<div><div class="xs muted">Weight</div><div class="v">'+(ms.weightKg ? esc(ms.weightKg)+' kg' : '—')+'</div></div></div>'
    : '<p class="small text2" style="margin:12px 0 0">Not saved yet. Tell us your height and weight and we\'ll work out your size.</p>';
  return '<section class="card p20" aria-labelledby="fy-s"><div class="row between top" style="gap:12px"><div><h2 class="h2" id="fy-s">Your size</h2><div class="xs muted" style="margin-top:2px">We pre-select it and show “Your size in stock”. You can always pick another size.</div></div>'+
    '<button class="btn btn-sm btn-ghost shrink0" data-act="acc-size-edit">'+ico('edit',15)+(ms ? 'Edit' : 'Find my size')+'</button></div>'+body+'</section>';
}
function acc_recs(acc){
  var all = DB.products.filter(function(p){ var c = CAT(p.cat); return c && c.group!=='acc'; });
  var byRating = function(a,b){ return b.rating - a.rating || b.reviews - a.reviews; };
  var bought = {}, cats = {};
  acc_orders(acc).forEach(function(o){ o.lines.forEach(function(l){ bought[l.product] = 1; var p = P(l.product); if(p) cats[p.cat] = 1; }); });
  var rec = all.filter(function(p){ return !bought[p.id] && cats[p.cat]; }).sort(byRating)
    .concat(all.filter(function(p){ return !bought[p.id] && !cats[p.cat]; }).sort(byRating)).slice(0,8);
  var trending = all.slice().sort(function(a,b){ return b.reviews - a.reviews; }).slice(0,8);
  var newIn = all.filter(function(p){ return p.tag==='New' || p.collection==='Winter 2026' || p.tag==='Eid edit'; });
  if(newIn.length<4) newIn = newIn.concat(all.slice().reverse().filter(function(p){ return newIn.indexOf(p)<0; })).slice(0,6);
  var onOffer = all.filter(function(p){ return p.compareAt && p.compareAt>p.price; });
  return {rec:rec, trending:trending, newIn:newIn, onOffer:onOffer};
}
var ACC_ROW_N = 0;
function acc_row(title, list, sub){
  if(!list.length) return '';
  /* each product row gets an id so the one slider engine can glide it */
  var id = 'acc-row-'+(++ACC_ROW_N);
  return '<section><div class="sec-hd"><div><h2 class="h2">'+esc(title)+'</h2>'+(sub ? '<div class="xs muted" style="margin-top:2px">'+esc(sub)+'</div>' : '')+'</div><a class="link" href="#/c/new">See all</a></div>'+
    '<div class="scroll-x acc-slrow" id="'+id+'" data-speed="20">'+list.map(function(p){ return '<div class="acc-pcell">'+productCard(p)+'</div>'; }).join('')+'</div></section>';
}
/* 'For you' is the only account tab with sliding rows; the chip nav is not one
   (navigation that drifts under your thumb is a trap, not a flourish). */
function acc_after(){
  acc_chipsHome();
  acc_poRotate();
  if(typeof SMOOTH === 'undefined') return;
  SMOOTH.stopAll();                               /* every render rebuilds the DOM */
  ACC_ROW_N = 0;
  var rows = document.querySelectorAll('.acc-slrow'), i;
  for(i=0;i<rows.length;i++) SMOOTH.start(rows[i].id, {dir: i%2 ? 1 : -1, speed:Number(rows[i].getAttribute('data-speed'))||20});
}

/* The tab row used to open already scrolled, with the first tab cut off at
   the left edge. It only ever needs to scroll when the CURRENT tab is out of
   sight; otherwise it starts where it should, at the beginning. */
function acc_chipsHome(){
  var row = document.querySelector('.acc-chips'); if(!row) return;
  var on = row.querySelector('.chip.on');
  if(!on){ row.scrollLeft = 0; return; }
  var r = on.getBoundingClientRect(), box = row.getBoundingClientRect();
  if(r.left >= box.left && r.right <= box.right - 24){ row.scrollLeft = 0; return; }
  row.scrollLeft = Math.max(0, on.offsetLeft - 16);
}

/* size finder modal (For you + Profile) */
function acc_sizeModalHTML(){
  var u = UI['acc:size'], hIn = u.ft*12 + u.inch;
  var top = recommendSize(CHART('polo-regular'), hIn, u.kg), bot = recommendSize(CHART('chino-slim'), hIn, u.kg);
  var stepper = function(label, f, val, id){
    return '<div class="acc-stepr"><span class="small bold" id="'+id+'">'+label+'</span><div class="acc-stepper" role="group" aria-labelledby="'+id+'">'+
      '<button type="button" data-act="acc-size-step" data-f="'+f+'" data-d="-1" aria-label="Less">'+ico('minus',18)+'</button><span aria-live="polite">'+val+'</span>'+
      '<button type="button" data-act="acc-size-step" data-f="'+f+'" data-d="1" aria-label="More">'+ico('plus',18)+'</button></div></div>';
  };
  return '<p class="small text2" style="margin:0 0 6px">Tell us your height and weight. We work out your size from our size charts.</p>'+
    stepper('Height · feet', 'ft', u.ft+' ft', 'sz-ft')+stepper('Height · inches', 'inch', u.inch+' in', 'sz-in')+stepper('Weight', 'kg', u.kg+' kg', 'sz-kg')+
    '<div class="tint p16 mt16"><div class="xs muted">Your sizes</div><div class="row wrap" style="gap:6px 22px;margin-top:4px">'+
      '<span>Tops: <b class="price" style="font-size:20px">'+esc(top ? top.size : '—')+'</b></span><span>Trousers (waist): <b class="price" style="font-size:20px">'+esc(bot ? bot.size : '—')+'</b></span></div></div>'+
    '<div class="xs muted mt8">A starting point only — you can always choose another size on any product.</div>'+
    '<button class="btn btn-primary btn-block mt16" data-act="acc-size-save">Save my size</button>';
}
ACT['acc-size-edit'] = function(){
  var ms = mySize() || {}, h = ms.heightIn || 68;
  UI['acc:size'] = {ft:Math.floor(h/12), inch:h%12, kg:ms.weightKg || 68};
  openModal(acc_sizeModalHTML(), {title:'Your size', rebuild:acc_sizeModalHTML});
};
ACT['acc-size-step'] = function(el){
  var u = UI['acc:size']; if(!u) return; var f = el.getAttribute('data-f'), d = +el.getAttribute('data-d');
  if(f==='ft') u.ft = Math.max(4, Math.min(7, u.ft+d));
  if(f==='inch'){ u.inch += d; if(u.inch>11){ if(u.ft<7){ u.inch = 0; u.ft++; } else u.inch = 11; } if(u.inch<0){ if(u.ft>4){ u.inch = 11; u.ft--; } else u.inch = 0; } }
  if(f==='kg') u.kg = Math.max(35, Math.min(150, u.kg+d));
  acc_refreshKeep();
};
ACT['acc-size-save'] = function(){
  var u = UI['acc:size']; if(!u) return; var hIn = u.ft*12 + u.inch;
  var val = {top:recommendSize(CHART('polo-regular'), hIn, u.kg).size, bottom:recommendSize(CHART('chino-slim'), hIn, u.kg).size, heightIn:hIn, weightKg:u.kg};
  var acc = currentAccount(); if(acc) acc.mySize = val; else ST.guestSize = val;
  saveState(); closeModal(); toast('Size saved · tops '+val.top+', waist '+val.bottom); rerender();
};

/* ----- tab: wallet ----- */
function acc_tabWallet(acc){
  var tx = acc.walletTx || [];
  var rows = tx.length ? tx.map(function(x){
    return '<div class="acc-tx"><div style="min-width:0"><div class="small bold">'+esc(x.label)+'</div><div class="xs muted">'+esc(dateStr(x.at))+'</div></div><div class="amt'+(x.amount>0?' pos':'')+'">'+(x.amount>0?'+':'')+fmt(x.amount)+'</div></div>';
  }).join('') : '<div class="acc-tx small muted">No wallet activity yet.</div>';
  return '<div class="stack s16">'+
    '<section class="card acc-wal" aria-labelledby="w-h">'+
      '<div class="acc-wal-top"><div><div class="eyebrow" id="w-h">Wallet balance</div><div class="display acc-bal">'+fmt(acc.wallet||0)+'</div><div class="small text2">Ready to use at checkout</div></div><span class="acc-wal-i">'+ico('wallet',26)+'</span></div>'+
      '<div class="soft acc-wal-note small text2 row top">'+ico('info',16,'style="flex-shrink:0;margin-top:2px"')+'<span>Credit from exchanges (when your new item costs less). Use it at checkout. It can\'t be withdrawn as cash.</span></div>'+
    '</section>'+
    '<section class="card" aria-labelledby="w-tx"><div class="ord-cardhd"><h2 class="h3" id="w-tx">Transactions</h2><span class="xs muted">'+tx.length+' '+(tx.length===1?'entry':'entries')+'</span></div>'+rows+'</section>'+
    '<a class="card p16 row between acc-link" href="#/account/foryou"><span class="row" style="gap:12px"><span class="acc-oico">'+ico('gift',18)+'</span><span><b class="small" style="display:block">See your offers</b><span class="xs muted">Your personal offers are in For you</span></span></span>'+ico('right',16)+'</a>'+
  '</div>';
}

/* ----- tab: rewards ----- */
function acc_tabRewards(acc){
  var parts = [];
  if(SET('referral','on')==='Yes'){
    var give = SET('referral','give');
    var waText = 'Hi! Use my code '+acc.referralCode+' at EXTAS and get '+fmt(give)+' off your first order.';
    parts.push('<section class="card p20" aria-labelledby="rw-r"><div class="row between top" style="gap:12px"><div><div class="eyebrow">Refer a friend</div><h2 class="h2 mt8" id="rw-r">Give '+fmt(give)+', get '+fmt(SET('referral','get'))+'</h2></div><span class="acc-oico shrink0">'+ico('gift',20)+'</span></div>'+
      '<div class="acc-code mt16"><div><div class="xs muted">Your code</div><b>'+esc(acc.referralCode)+'</b></div><button class="btn btn-sm btn-secondary" data-act="acc-copy" data-v="'+esc(acc.referralCode)+'">Copy</button></div>'+
      '<div class="row wrap mt12" style="gap:8px">'+co_waBtn('Share on WhatsApp', waText, 'wa-share')+'<button class="btn btn-ghost" data-act="acc-fb-share" style="min-height:44px;padding:10px 16px;font-size:14px">'+ico('link',16)+'Share on Facebook</button></div>'+
      '<div class="mt12">'+ruleBlock('referral', {key:'rw'})+'</div></section>');
  }
  var pr = SET('reviews','photoReward'), rewardsOn = SET('reviews','rewardsOn')==='Yes';
  var pend = (acc.reviews||[]).filter(function(r){ return r.status==='pending'; }).length;
  parts.push('<section class="card p20" aria-labelledby="rw-p"><div class="row between top" style="gap:12px"><div><div class="eyebrow">Photo reviews</div><h2 class="h2 mt8" id="rw-p">'+(rewardsOn ? 'Get '+fmt(pr)+' for a photo review' : 'Share a photo review')+'</h2></div><span class="acc-oico shrink0">'+ico('camera',20)+'</span></div>'+
    '<p class="small text2" style="margin:8px 0 0">'+esc(ruleText('reviews','short'))+'</p>'+
    '<p class="small" style="margin:8px 0 0">Open a delivered order → <b>Rate & review</b> → add a photo.</p>'+
    (pend ? '<div class="mt12"><span class="tag warn">'+ico('clock',12)+plural(pend,'review')+' waiting for approval</span></div>' : '')+
    '<a class="btn btn-sm btn-secondary mt16" href="#/account/orders">Go to my orders</a></section>');
  var shares = acc.fbShares || [], fr = SET('reviews','fbReward');
  var list = shares.length ? '<div class="mt16">'+shares.map(function(s){
    var ok = s.status==='Approved';
    return '<div class="acc-share"><a href="'+esc(/^https?:/i.test(s.url) ? s.url : 'https://'+s.url)+'" target="_blank" rel="noopener">'+esc(s.url)+'</a><span class="tag'+(ok?'':' warn')+' shrink0">'+(ok?ico('check',12):ico('clock',12))+esc(s.status)+'</span></div>';
  }).join('')+'</div>' : '';
  var fb = '<section class="card p20" aria-labelledby="rw-f"><div class="eyebrow">Facebook</div><h2 class="h2 mt8" id="rw-f">Shared us on Facebook? Submit the post link</h2>'+
    '<p class="small text2" style="margin:6px 0 0">'+(rewardsOn ? 'When we approve it, you get '+fmt(fr)+' in your wallet.' : 'We\'ll check it and say thanks.')+'</p>'+
    '<form class="acc-fbform mt12" data-submit="acc-fb" novalidate><label class="sr" for="fb-url">Facebook post link</label><input id="fb-url" name="url" class="input" type="url" placeholder="https://facebook.com/..."><button class="btn btn-primary shrink0" type="submit">Submit</button></form>'+
    '<div id="fb-err" class="mt8" role="alert"></div>'+list+'</section>';
  return '<div class="stack s16"><div class="acc-g2">'+parts.join('')+'</div>'+fb+'</div>';
}
ACT['acc-copy'] = function(el){ var v = el.getAttribute('data-v'); try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).catch(function(){}); }catch(e){} toast('Code '+v+' copied'); };
ACT['acc-fb-share'] = function(){ toast('Demo: this opens Facebook with your code ready to share'); };
SUBMIT['acc-fb'] = function(f){
  var acc = currentAccount(); if(!acc) return;
  var url = f.querySelector('[name=url]').value.trim(), err = document.getElementById('fb-err');
  if(!/^(https?:\/\/)?([\w-]+\.)*(facebook\.com|fb\.com|fb\.watch)\/\S+/i.test(url)){ err.innerHTML = acc_err('Please paste the link to your Facebook post (it looks like facebook.com/...).'); return; }
  acc.fbShares = acc.fbShares || []; acc.fbShares.unshift({url:url, status:'Waiting for approval', at:Date.now()});
  saveState(); toast('Link sent — we\'ll check it soon'); rerender();
};

/* ----- tab: wishlist ----- */
function acc_wishGrid(){
  var list = ST.wishlist.map(P).filter(Boolean);
  if(!list.length) return '<div class="card empty">'+ico('heart',30,'style="margin:0 auto 10px;color:var(--muted)"')+'<div class="h3" style="color:var(--ink)">Your wishlist is empty</div><p class="small" style="margin:6px 0 14px">Tap the heart on any product to save it here.</p><a class="btn btn-primary" href="#/c/new">Browse new in</a></div>';
  /* R15 wave 2 (A09): each saved item can go straight into the bag (a size
     sheet opens when the size is not known yet — the bag's own "Move to bag")
     or be removed */
  return '<div class="grid g4 acc-wl">'+list.map(function(p){ return '<div class="acc-wl-item">'+productCard(p)+
    '<div class="acc-wl-acts"><button type="button" class="btn btn-sm btn-secondary" data-act="bag-unsave" data-pid="'+esc(p.id)+'" data-testid="wl-add">'+ico('bag',15)+'Add to bag</button>'+
    '<button type="button" class="link" data-act="wish" data-id="'+esc(p.id)+'" aria-label="Remove '+esc(p.name)+' from wishlist">Remove</button></div></div>'; }).join('')+'</div>';
}
function acc_tabWishlist(){
  return '<section aria-labelledby="wl-h"><div class="sec-hd"><h2 class="h2" id="wl-h">Wishlist</h2><span class="small muted">'+plural(ST.wishlist.length,'item')+'</span></div>'+acc_wishGrid()+'</section>';
}
function acc_guestWishlist(){
  return '<div class="container acc-page">'+acc_crumbs([['Home','#/'],['Wishlist']])+
    '<div class="row between wrap mt16" style="gap:12px"><h1 class="h1">Wishlist</h1><span class="small muted">'+plural(ST.wishlist.length,'item')+'</span></div>'+
    '<div class="tint p16 mt16 row between wrap" style="gap:12px"><span class="small row" style="gap:10px">'+ico('heart',18)+'Saved on this phone only. Log in to see your orders and offers too.</span><a class="btn btn-sm btn-secondary" href="#/login?next='+encodeURIComponent('#/account/wishlist')+'">Log in</a></div>'+
    '<div class="mt16">'+acc_wishGrid()+'</div></div>';
}

/* ================= 46. Delivery address, and a second one ===============
   Renamed from "Saved address", kept in the owner's order (name, phone,
   then the address), and a customer who has two — home and office, which is
   most of them — adds the second with the icon beside the label. Checkout
   reads the same list: two addresses are offered as a choice, one fills
   itself in (see co_addrBook / the picker in 51-checkout.js). */
var ACC_ADDR_MAX = 3;
function acc_addrList(acc){
  var list = (acc.addresses || []).slice();
  if(!list.length) list = acc.address ? [acc.address] : [''];
  return list;
}
function acc_addrFields(acc){
  var list = acc_addrList(acc);
  var rows = list.map(function(a, i){
    var label = list.length>1 ? (i===0 ? 'Delivery address 1 · default' : 'Delivery address '+(i+1)) : 'Delivery address';
    return '<div class="acc-addrow">'+
      '<div class="row between" style="gap:10px;align-items:baseline">'+
        '<label class="label" for="pf-addr-'+i+'">'+esc(label)+'</label>'+
        (list.length>1 ? '<button type="button" class="link xs" data-act="acc-addr-rm" data-i="'+i+'">Remove</button>' : '')+
      '</div>'+
      '<textarea id="pf-addr-'+i+'" name="address'+i+'" class="input" rows="2" autocomplete="street-address" placeholder="House, road, area, district">'+esc(a)+'</textarea>'+
    '</div>';
  }).join('');
  var add = list.length < ACC_ADDR_MAX
    ? '<button type="button" class="acc-addr-add" data-act="acc-addr-add" aria-label="Add another delivery address">'+ico('plus',16)+'<span>Add another address</span></button>'
    : '';
  return '<div class="acc-addrs" data-testid="acc-addrs">'+rows+add+'</div>';
}
ACT['acc-addr-add'] = function(){
  var acc = currentAccount(); if(!acc) return;
  var list = acc_addrList(acc);
  if(list.length>=ACC_ADDR_MAX) return;
  /* keep what is on screen before we re-render, so nothing typed is lost */
  var f = document.querySelector('[data-submit="acc-profile"]');
  if(f) list = acc_formAddrs(f, list.length);
  list.push(''); acc.addresses = list; saveState(); rerender();
  var el = document.getElementById('pf-addr-'+(list.length-1)); if(el) el.focus();
};
ACT['acc-addr-rm'] = function(el){
  var acc = currentAccount(); if(!acc) return;
  var i = Number(el.getAttribute('data-i'));
  var f = document.querySelector('[data-submit="acc-profile"]');
  var list = f ? acc_formAddrs(f, acc_addrList(acc).length) : acc_addrList(acc);
  list.splice(i, 1); if(!list.length) list = [''];
  acc.addresses = list; acc.address = list[0]||''; saveState(); rerender(); toast('Address removed');
};
function acc_formAddrs(f, n){
  var out = [];
  for(var i=0;i<n;i++){ var el = f.querySelector('[name=address'+i+']'); out.push(el ? el.value : ''); }
  return out;
}

/* ----- tab: profile ----- */
function acc_tabProfile(acc){
  var ms = mySize(), offersOn = acc.offersOptIn!==false;
  var langSeg = '<div class="seg mt12" role="group" aria-label="Language">'+
    (ST.lang==='en' ? '<button class="on" aria-pressed="true">EN</button><button data-act="lang" aria-pressed="false">বাং</button>'
                    : '<button data-act="lang" aria-pressed="false">EN</button><button class="on" aria-pressed="true">বাং</button>')+'</div>';
  return '<div class="stack s16">'+
    (SHOW('account','photoUpload') ? acc_photoCard(acc) : '')+
    '<div class="acc-g2">'+
      '<section class="card p20" aria-labelledby="pf-d"><h2 class="h3" id="pf-d">Your details</h2>'+
        '<form class="stack s12 mt12" data-submit="acc-profile" novalidate>'+
          '<div><label class="label" for="pf-name">Name</label><input id="pf-name" name="name" class="input" value="'+esc(acc.name)+'" autocomplete="name"></div>'+
          '<div><label class="label" for="pf-phone">Mobile number</label><input id="pf-phone" class="input" value="'+esc(acc_nicePhone(acc.phone))+'" readonly aria-describedby="pf-ph-n" style="background:var(--surface2)"><div id="pf-ph-n" class="xs muted mt8">Your number is your login. To change it, message us on WhatsApp.</div></div>'+
          acc_addrFields(acc)+
          '<div id="pf-err" role="alert"></div><button class="btn btn-primary" type="submit" style="align-self:flex-start">Save details</button>'+
        '</form></section>'+
      '<section class="card p20" aria-labelledby="pf-p"><h2 class="h3" id="pf-p">Change password</h2>'+
        '<form class="stack s12 mt12" data-submit="acc-pw" novalidate>'+
          '<div><label class="label" for="pf-cur">Current password</label><input id="pf-cur" name="cur" type="password" class="input" autocomplete="current-password"></div>'+
          '<div><label class="label" for="pf-new">New password</label><input id="pf-new" name="nw" type="password" class="input" autocomplete="new-password" placeholder="At least 6 characters"></div>'+
          '<div id="pf-pw-err" role="alert"></div><button class="btn btn-secondary" type="submit" style="align-self:flex-start">Update password</button>'+
        '</form></section>'+
    '</div>'+
    '<section class="card p20" aria-labelledby="pf-s"><div class="row between top" style="gap:12px"><div><h2 class="h3" id="pf-s">Saved size</h2><div class="small text2" style="margin-top:3px">'+
      (ms ? 'Tops <b>'+esc(ms.top||'—')+'</b> · Trousers <b>'+esc(ms.bottom||'—')+'</b> · '+esc(acc_ftIn(ms.heightIn))+(ms.weightKg ? ', '+esc(ms.weightKg)+' kg' : '') : 'Not saved yet')+
      '</div></div><button class="btn btn-sm btn-ghost shrink0" data-act="acc-size-edit">'+ico('edit',15)+(ms ? 'Edit' : 'Find my size')+'</button></div></section>'+
    /* 45. Three cards, each holding one small setting, read as clutter on a
       phone — language, notifications and the rest are all the same kind of
       thing, so they live together in one Preferences card now, as rows. */
    '<section class="card p20 acc-prefs" aria-labelledby="pf-pr"><h2 class="h3" id="pf-pr">Preferences</h2>'+
      '<div class="acc-nrow" style="margin-top:10px"><div><div class="small bold">Language</div><div class="xs muted">Main buttons and menus switch to Bangla.</div></div>'+langSeg+'</div>'+
      '<div class="acc-nrow"><div><div class="small bold">Tracking SMS — always on</div><div class="xs muted">Order and delivery updates. These can\'t be turned off.</div></div><button class="switch on" disabled aria-pressed="true" aria-label="Tracking SMS, always on" style="opacity:.55;cursor:not-allowed"></button></div>'+
      '<div class="acc-nrow"><div><div class="small bold">Offers on SMS/WhatsApp</div><div class="xs muted">New drops and offers only for you. Stop anytime.</div></div><button class="switch'+(offersOn?' on':'')+'" data-act="acc-offers-toggle" aria-pressed="'+offersOn+'" aria-label="Offers on SMS and WhatsApp"></button></div>'+
    '</section>'+
  '</div>';
}
/* 52. Profile photo. A real client-side picker: the file never leaves the
   phone — it is drawn onto a 256px canvas, saved as a small JPEG data URL in
   ST (so it survives a reload) and shown everywhere the avatar appears. The
   downscale matters: a 4 MB camera photo would blow localStorage away. */
function acc_photoCard(acc){
  var has = !!acc.photo;
  return '<section class="card p20 acc-ph" aria-labelledby="pf-ph" data-testid="acc-photo">'+
    '<div class="acc-ph-row">'+
      '<label class="acc-ph-pic" for="pf-photo" title="Change your photo">'+
        (has ? '<img src="'+esc(acc.photo)+'" alt="Your profile photo">'
             : '<span class="acc-ph-ini">'+esc(acc_initials(acc.name))+'</span>')+
        '<span class="acc-ph-cam">'+ico('camera',16)+'</span></label>'+
      '<div class="grow" style="min-width:0"><h2 class="h3" id="pf-ph">Your photo</h2>'+
        '<p class="xs text2" style="margin:4px 0 0;line-height:1.45">Only on this phone, for this demo. JPG or PNG, up to 8 MB — we shrink it before saving.</p>'+
        '<div class="row wrap acc-ph-btns">'+
          '<label class="btn btn-secondary btn-sm acc-ph-pick" for="pf-photo">'+ico('camera',15)+(has?'Change photo':'Upload a photo')+'</label>'+
          (has ? '<button type="button" class="btn btn-ghost btn-sm" data-act="acc-photo-rm">'+ico('trash',15)+'Remove</button>' : '')+
        '</div>'+
        '<div id="pf-photo-err" role="alert"></div>'+
      '</div>'+
    '</div>'+
    '<input id="pf-photo" class="sr acc-ph-input" type="file" accept="image/*" data-change="acc-photo">'+
  '</section>';
}
CHANGE['acc-photo'] = function(el){
  var acc = currentAccount(), f = el.files && el.files[0], box = document.getElementById('pf-photo-err');
  if(box) box.innerHTML = '';
  if(!acc || !f) return;
  if(f.size > 8*1024*1024){ if(box) box.innerHTML = acc_err('That photo is over 8 MB. Please pick a smaller one.'); el.value = ''; return; }
  if(!/^image\//.test(f.type)){ if(box) box.innerHTML = acc_err('That is not an image file.'); el.value = ''; return; }
  var rd = new FileReader();
  rd.onerror = function(){ if(box) box.innerHTML = acc_err('We could not read that file. Try another photo.'); };
  rd.onload = function(){
    var img = new Image();
    img.onerror = function(){ if(box) box.innerHTML = acc_err('That image would not open. Try a JPG or PNG.'); };
    img.onload = function(){
      try{
        var S = 256, side = Math.min(img.width, img.height);
        var cv = document.createElement('canvas'); cv.width = S; cv.height = S;
        /* square crop from the middle, so a portrait photo is not squashed */
        cv.getContext('2d').drawImage(img, (img.width-side)/2, (img.height-side)/2, side, side, 0, 0, S, S);
        acc.photo = cv.toDataURL('image/jpeg', 0.82);
        saveState(); toast('Photo saved'); rerender();
      }catch(e){ if(box) box.innerHTML = acc_err('We could not save that photo on this device.'); }
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
};
ACT['acc-photo-rm'] = function(){
  var acc = currentAccount(); if(!acc) return;
  acc.photo = null; saveState(); toast('Photo removed'); rerender();
};
SUBMIT['acc-profile'] = function(f){
  var acc = currentAccount(); if(!acc) return;
  var name = f.querySelector('[name=name]').value.trim(), err = document.getElementById('pf-err');
  if(!name){ err.innerHTML = acc_err('Please enter your name.'); return; }
  /* 46. One address or three — they are all read, trimmed and checked the
     same way, and the first one stays the default the checkout fills in. */
  var raw = acc_formAddrs(f, acc_addrList(acc).length).map(function(a){ return String(a||'').trim(); });
  var bad = raw.filter(function(a){ return a && a.length<10; });
  if(bad.length){ err.innerHTML = acc_err('Please write each address in full — house, road and area.'); return; }
  var list = raw.filter(function(a){ return !!a; });
  acc.name = name; acc.addresses = list; acc.address = list[0] || '';
  if(acc.address) acc.zone = zoneOf(acc.address).zone;
  err.innerHTML = '';
  saveState(); toast(list.length>1 ? 'Details saved · '+plural(list.length,'address') : 'Details saved'); rerender();
};
SUBMIT['acc-pw'] = function(f){
  var cur = f.querySelector('[name=cur]').value, nw = f.querySelector('[name=nw]').value, err = document.getElementById('pf-pw-err');
  if(!cur){ err.innerHTML = acc_err('Please enter your current password.'); return; }
  if(nw.length<6){ err.innerHTML = acc_err('The new password needs at least 6 characters.'); return; }
  err.innerHTML = ''; f.reset(); toast('Demo: password changed (your demo login stays the same)');
};
ACT['acc-offers-toggle'] = function(){ var acc = currentAccount(); if(!acc) return; acc.offersOptIn = acc.offersOptIn===false; saveState(); toast(acc.offersOptIn ? 'Offers on SMS/WhatsApp: on' : 'Offers on SMS/WhatsApp: off'); rerender(); };

/* ================= ORDER DETAILS ================= */
PAGES.order = {
  layout:'store',
  title:function(params){ return 'Order #'+params[0]; },
  render:function(params){
    var id = params[0], o = ty_fixAdds(ST.orders[id]), acc = currentAccount();
    var crumbs = acc_crumbs([['Home','#/'],[t('My account'),'#/account'],['Order #'+id]]);
    if(!acc || !o || !acc_owns(acc, o)){
      return '<div class="container acc-page">'+crumbs+'<div class="mt16">'+acc_loginPrompt(
        !acc ? 'Log in to see your order' : 'This order is not in your account',
        !acc ? 'Log in with the mobile number you used for this order.' : 'Log in with the mobile number used for order #'+id+'.',
        '#/login?next='+encodeURIComponent('#/order/'+id))+'</div></div>';
    }
    var hours = exchangeHoursLeft(o), winOpen = o.status==='delivered' && hours>0;
    var units = o.lines.reduce(function(s,l){ return s + (l.qty||1); }, 0);
    /* First time a customer lands here from the thank-you page: tell them plainly
       that this is their own dashboard and that an account was made for them. */
    var u2 = ui('ordwelcome:'+o.id, {dismissed:false, showPw:false});
    var fresh = CUR.query && CUR.query.from==='thanks';
    var welcome = (fresh && !u2.dismissed) ? '<section class="card ord-welcome">'+
      '<div class="row between top" style="gap:12px">'+
        '<div class="row top" style="gap:12px"><span class="ord-wic">'+ico('user',20)+'</span>'+
        '<div><div class="h3">This is your account</div>'+
        '<p class="xs text2" style="margin:3px 0 0;line-height:1.45">Created with this order. Every order, delivery and size exchange lives here.</p></div></div>'+
        '<button class="iconbtn shrink0" data-act="ordw-close" data-id="'+esc(o.id)+'" aria-label="Close">'+ico('close',18)+'</button>'+
      '</div>'+
      '<div class="ord-cred mt12">'+
        '<div><span class="xs muted">Log in with</span><b>'+esc(o.phone)+'</b></div>'+
        '<div><span class="xs muted">Password</span><span class="row" style="gap:10px"><b>'+(u2.showPw?esc(o.phone):new Array(String(o.phone).length+1).join('\u2022'))+'</b>'+
          '<button class="link" data-act="ordw-pw" data-id="'+esc(o.id)+'">'+(u2.showPw?'Hide':'Show')+'</button></span></div>'+
      '</div>'+
      '</section>' : '';
    var head = welcome+'<section class="card ord-hd" aria-labelledby="ord-h">'+
      '<div class="row between wrap top" style="gap:12px"><div><div class="eyebrow">Order</div><h1 class="h1" id="ord-h" style="margin-top:4px">#'+esc(o.id)+'</h1><div class="small text2" style="margin-top:2px">Placed '+esc(dateTimeStr(o.createdAt))+' · '+plural(units,'item')+'</div></div>'+
        '<div class="row wrap" style="gap:8px">'+acc_statusTag(o)+acc_excWindowTag(o)+'</div></div>'+
      ord_track(o)+
      '<div class="ord-meta">'+
        '<div><div class="xs muted">Courier</div><div class="small bold">'+esc(o.courier||'—')+'</div></div>'+
        '<div><div class="xs muted">Tracking number</div><div class="small bold">'+esc(o.tracking||'—')+'</div></div>'+
        '<div class="wide"><div class="xs muted">Delivering to</div><div class="small"><b>'+esc(o.name)+'</b> · '+esc(acc_nicePhone(o.phone))+'</div><div class="small text2">'+esc(o.address)+'</div></div>'+
      '</div></section>';
    var items = '<section class="card" aria-labelledby="oi-h"><div class="ord-cardhd"><h2 class="h3" id="oi-h">Items</h2><span class="xs muted">'+plural(units,'item')+'</span></div>'+
      o.lines.map(function(l, i){ return ord_line(o, l, i, winOpen); }).join('')+
      (SHOW('account','invoices') ? '<div class="ord-invrow"><div><b class="small">Invoice '+esc(inv_no(o))+'</b><div class="xs muted">All '+plural(units,'item')+' on this order, ready to print or keep.</div></div>'+
        '<button type="button" class="btn btn-secondary shrink0" data-act="inv-open" data-id="'+esc(o.id)+'">'+ico('doc',16)+'Get invoice</button></div>' : '')+
      '</section>';
    return '<div class="container ord-page">'+crumbs+
      '<div class="split-side mt16"><div class="ord-main">'+head+items+ord_exchanges(o)+ord_editCard(o)+ord_demo(o)+'</div>'+ord_side(o)+'</div></div>';
  }
};
function ord_track(o){
  var cur = STATUS_FLOW.indexOf(o.status), times = {};
  (o.timeline||[]).forEach(function(e){ times[e.s] = e.at; });
  /* R16. The delivery time in HOURS for this order's band (rule 'delivery') */
  var hrs = zoneHours(o.zone), days = zoneDays(o.zone);
  return '<ol class="ord-track" aria-label="Order tracking">'+STATUS_FLOW.map(function(s, i){
    var done = i<=cur, now = i===cur+1, ln = i+1<=cur;
    var when = times[s] ? dateTimeStr(times[s]) : (s==='delivered' ? (hrs ? 'Within '+hrs+' hours' : 'Usually '+days+' days') : (now ? 'Next step' : 'Coming up'));
    return '<li class="ord-st'+(ln?' ln':'')+(done?'':' todo')+'"'+(i===cur?' aria-current="step"':'')+'><span class="tl-dot'+(done?' done':(now?' now':''))+'">'+(done ? ico('check',13) : (i+1))+'</span>'+
      '<div><div class="lbl">'+esc(STATUS_LABEL[s])+'</div><div class="xs muted">'+esc(when)+'</div></div></li>';
  }).join('')+'</ol>';
}
function ord_line(o, l, i, winOpen){
  var p = P(l.product); if(!p) return '';
  var rv = o.reviewed ? o.reviewed[i] : null, xs = (o.exchanges||[]).filter(function(x){ return x.lineIdx===i; }), acts = [];
  if(o.status==='delivered'){
    if(!rv) acts.push('<button class="btn btn-sm btn-ghost" data-act="ord-rev-open" data-id="'+esc(o.id)+'" data-i="'+i+'">'+ico('star',15)+'Rate & review</button>');
    else if(rv==='approved') acts.push('<span class="tag">'+ico('check',12)+'Review published</span>');
    else acts.push('<span class="tag warn">'+ico('clock',12)+'Review waiting for approval</span>');
    xs.forEach(function(x){ acts.push('<span class="tag plain">'+ico('swap',12)+'Exchange '+(x.status==='completed' ? 'completed' : 'requested')+' · '+esc(x.id)+'</span>'); });
    if(winOpen && acc_lineExchangeable(o, i)) acts.push('<a class="btn btn-sm btn-secondary" href="#/exchange/'+esc(o.id)+'?line='+i+'">'+ico('swap',15)+(p.sizes.length>1 ? 'Exchange size' : 'Report a problem')+'</a>');
  }
  return '<div class="ord-line"><a class="ord-thumb" href="#/p/'+p.id+'" aria-label="'+esc(p.name)+'">'+productImg(p, l.color, {ratio:'ratio-45', label:false})+'</a>'+
    '<div class="grow"><div class="row between top" style="gap:10px"><a class="ord-name" href="#/p/'+p.id+'">'+esc(p.name)+'</a><span class="price">'+fmt(l.unitPrice*(l.qty||1))+'</span></div>'+
    '<div class="small text2" style="margin-top:2px">'+esc(COL(l.color).name)+' · '+esc(l.size)+(l.qty>1 ? ' · Qty '+l.qty : '')+'</div>'+
    (l.addOn ? '<div class="mt8"><span class="tag">'+ico('plus',12)+'Added to this parcel after you ordered</span></div>' : '')+
    (l.setLabel ? '<div class="mt8"><span class="tag plain">'+ico('layers',12)+esc(l.setLabel)+' set price</span></div>' : '')+
    (acts.length ? '<div class="row wrap mt12" style="gap:8px">'+acts.join('')+'</div>' : '')+
  '</div></div>';
}
function ord_xTag(x){ var c = x.status==='completed' ? 'tag' : 'tag warn'; return '<span class="'+c+'">'+(x.status==='completed' ? ico('check',12) : ico('clock',12))+esc(ACC_XSTATUS[x.status] || x.status)+'</span>'; }
function ord_exchanges(o){
  var xs = o.exchanges || []; if(!xs.length) return '';
  return '<section class="card" aria-labelledby="ox-h"><div class="ord-cardhd"><h2 class="h3" id="ox-h">Exchanges</h2><span class="xs muted">'+plural(xs.length,'request')+'</span></div>'+xs.map(function(x){
    var l = o.lines[x.lineIdx], np = P(x.newItem.product), op = P(l.product), money = [];
    if(x.codDue>0) money.push('Pay on delivery: <b>'+fmt(x.codDue)+'</b>');
    if(x.walletCredit>0) money.push('Wallet credit: <b>'+fmt(x.walletCredit)+'</b> '+(x.status==='completed' ? '(added)' : '(after we receive the old item)'));
    if(!money.length) money.push('Nothing to pay');
    return '<div class="ord-x" data-testid="x-'+esc(x.id)+'"><div class="row between wrap" style="gap:8px"><div class="row wrap" style="gap:8px"><b class="small">'+esc(x.id)+'</b><span class="xs muted">'+esc(ACC_REASON[x.reason]||'')+' · '+esc(dateStr(x.at))+'</span></div>'+ord_xTag(x)+'</div>'+
      '<div class="ord-x-swap mt12">'+acc_thumb(l.product, l.color, 44)+'<div class="xs" style="min-width:0"><div class="muted">Sending back</div><div class="bold">'+esc(op.name)+'</div><div class="text2">'+esc(COL(l.color).name)+' · '+esc(l.size)+'</div></div>'+
        '<span class="ord-x-arr">'+ico('right',16)+'</span>'+acc_thumb(x.newItem.product, x.newItem.color, 44)+'<div class="xs" style="min-width:0"><div class="muted">New item</div><div class="bold">'+esc(np.name)+'</div><div class="text2">'+esc(COL(x.newItem.color).name)+' · '+esc(x.newItem.size)+'</div></div></div>'+
      '<div class="small text2 mt12">'+money.join(' · ')+'</div></div>';
  }).join('')+'</section>';
}
function ord_editCard(o){
  var max = Number(SET('order-edit','maxEdits')) || 0, left = max - (o.edits||0), can = o.status==='confirmed' && left>0;
  var why = o.status!=='confirmed'
    ? 'This order is already '+({packed:'packed', shipped:'with the courier', delivered:'delivered'}[o.status] || o.status)+', so it can\'t be edited.'+(o.status==='delivered' && exchangeHoursLeft(o)>0 ? ' Need a different size? Use “Exchange size” above.' : '')
    : 'You have used all '+plural(max,'edit')+' for this order.';
  return '<section class="card p20" aria-labelledby="oe-h"><div class="row between wrap" style="gap:12px"><div style="min-width:0;flex:1 1 260px"><h2 class="h3" id="oe-h">Change address, phone or size</h2>'+
    '<div class="small text2" style="margin-top:3px">'+(can ? 'You can edit this order until we start packing it.' : esc(why))+'</div></div>'+
    (can ? '<button class="btn btn-secondary" data-act="ord-edit-open" data-id="'+esc(o.id)+'">'+ico('edit',16)+'Edit order ('+left+' left)</button>' : '')+'</div>'+
    (o.status==='delivered' ? '' : '<div class="mt12">'+ruleBlock('order-edit', {key:'ord'})+'</div>')+'</section>';
}
function ord_demo(o){
  var btns = '';
  if(o.status!=='delivered') btns += '<button class="btn btn-sm btn-dark" data-act="ord-demo-next" data-id="'+esc(o.id)+'">'+ico('right',15)+'Move to next status</button>';
  (o.exchanges||[]).filter(function(x){ return x.status==='requested'; }).forEach(function(x){
    btns += '<button class="btn btn-sm btn-ghost" data-act="ord-demo-recv" data-id="'+esc(o.id)+'" data-x="'+esc(x.id)+'">'+ico('box',15)+'Old item received · '+esc(x.id)+'</button>';
  });
  if(!btns) btns = '<span class="xs muted">Nothing to move forward — this order is delivered'+((o.exchanges||[]).length ? ' and its exchanges are done' : '')+'.</span>';
  return '<section class="ord-demo" aria-label="Demo only controls"><div class="row wrap" style="gap:8px"><span class="tag dark">Demo only</span><span class="xs muted">Customers never see this. Use it to play the next steps.</span></div><div class="row wrap mt12" style="gap:8px">'+btns+'</div></section>';
}
function ord_side(o){
  var setSum = (o.setDiscounts||[]).reduce(function(s,d){ return s + d.amount; }, 0), other = Math.max(0, (o.discount||0) - setSum);
  var row = function(k, v, cls){ return '<div class="ord-sum-row'+(cls?' '+cls:'')+'"><span>'+k+'</span><span>'+v+'</span></div>'; };
  var payNote = o.payment==='cod' ? (o.status==='delivered' ? 'Paid in cash on delivery' : 'Pay '+fmt(o.total)+' in cash when it arrives') : 'Paid online';
  return '<aside class="stack s16 sticky-d" aria-label="Order summary">'+
    '<section class="card p20" aria-labelledby="op-h"><h2 class="h3" id="op-h">Payment summary</h2><div class="mt12">'+
      row('Subtotal', fmt(o.subtotal))+
      (o.setDiscounts||[]).map(function(d){ return row(esc(d.label), '<span class="brandc">'+fmt(-d.amount)+'</span>'); }).join('')+
      (other ? row('Offers & codes', '<span class="brandc">'+fmt(-other)+'</span>') : '')+
      row('Delivery', o.delivery ? fmt(o.delivery) : '<span class="bg-freeb">'+ico('check',13)+'FREE</span>')+
      row('Total', '<span class="price">'+fmt(o.total)+'</span>', 'total')+
    '</div>'+bag_returnNote('ord-ret')+'<div class="soft ord-pay mt12"><div class="row between"><span class="small">Payment</span><span class="small bold">'+esc(acc_payLabel(o.payment))+'</span></div><div class="xs muted" style="margin-top:2px">'+esc(payNote)+'</div></div></section>'+
    '<section class="card p20" aria-labelledby="oh-h"><h2 class="h3" id="oh-h">Need help with this order?</h2><p class="small text2" style="margin:4px 0 12px">We reply on WhatsApp, 10 am – 10 pm, every day.</p>'+
      co_waBtn('Message us on WhatsApp', 'Hi EXTAS, I need help with order #'+o.id, 'btn-block')+
      '<div class="stack s12 mt16">'+ruleBlock('exchange', {key:'ord-x', title:'Size exchange'})+ruleBlock('no-return', {key:'ord-nr', title:'Returns'})+'</div></section>'+
  '</aside>';
}

/* review modal */
function ord_revHTML(){
  var u = UI['ord:rev'], o = ST.orders[u.id], l = o.lines[u.i], p = P(l.product);
  var stars = [1,2,3,4,5].map(function(n){
    return '<button type="button" class="ord-star'+(n<=u.stars?' on':'')+'" data-act="ord-rev-star" data-v="'+n+'" aria-label="'+n+' star'+(n>1?'s':'')+'" aria-pressed="'+(n===u.stars)+'"><svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .9-5 4.8 1.2 7L12 17.8 5.8 21.2 7 14.2 2 9.4l7-.9z"/></svg></button>';
  }).join('');
  var fits = ['Too small','Just right','Too big'].map(function(f){ return '<button type="button" class="chip'+(u.fit===f?' on':'')+'" data-act="ord-rev-fit" data-v="'+f+'" aria-pressed="'+(u.fit===f)+'" style="min-height:40px">'+f+'</button>'; }).join('');
  var opt = function(vals, cur, suffix, ph){ return '<option value="">'+ph+'</option>'+vals.map(function(v){ return '<option value="'+v+'"'+(String(cur)===String(v)?' selected':'')+'>'+v+' '+suffix+'</option>'; }).join(''); };
  var rewardsOn = SET('reviews','rewardsOn')==='Yes';
  var photo = u.photo
    ? '<div class="ord-photo has">'+productImg(p, l.color, {ratio:'ratio-11', label:false, view:'model'})+'<button type="button" class="ord-photo-x" data-act="ord-rev-photo" aria-label="Remove photo">'+ico('close',14)+'</button></div>'
    : '<button type="button" class="ord-photo" data-act="ord-rev-photo">'+ico('camera',22)+'<span>Add photo</span></button>';
  return '<div class="row" style="gap:12px">'+acc_thumb(p.id, l.color, 56)+'<div><div class="bold">'+esc(p.name)+'</div><div class="small text2">'+esc(COL(l.color).name)+' · Size '+esc(l.size)+'</div></div></div>'+
    '<div class="mt16"><div class="label" id="rv-st">Your rating</div><div class="ord-stars" role="group" aria-labelledby="rv-st">'+stars+'</div></div>'+
    '<div class="mt16"><div class="label" id="rv-fit">How did size '+esc(l.size)+' fit?</div><div class="row wrap" role="group" aria-labelledby="rv-fit" style="gap:8px">'+fits+'</div></div>'+
    '<div class="mt16"><div class="label">Your height & weight <span class="muted" style="font-weight:400">(optional — helps others choose a size)</span></div><div class="ord-hw">'+
      '<div><label class="sr" for="rv-ft">Height, feet</label><select id="rv-ft" class="input" data-change="ord-rev-hw" data-f="ft">'+opt([4,5,6,7], u.ft, 'ft', 'Feet')+'</select></div>'+
      '<div><label class="sr" for="rv-in">Height, inches</label><select id="rv-in" class="input" data-change="ord-rev-hw" data-f="inch">'+opt([0,1,2,3,4,5,6,7,8,9,10,11], u.inch, 'in', 'Inches')+'</select></div>'+
      '<div class="ord-kg"><label class="sr" for="rv-kg">Weight in kg</label><input id="rv-kg" class="input" type="number" inputmode="numeric" min="30" max="200" placeholder="Weight" value="'+esc(u.kg)+'" data-input="ord-rev-kg"><span aria-hidden="true">kg</span></div>'+
    '</div></div>'+
    '<div class="mt16"><div class="label">Photo <span class="muted" style="font-weight:400">(optional)</span></div><div class="row" style="gap:14px">'+photo+
      '<div class="xs text2">'+(rewardsOn ? 'Approved photo reviews get <b>'+fmt(SET('reviews','photoReward'))+'</b> in your wallet.' : 'Photos help other shoppers a lot.')+'</div></div></div>'+
    '<div class="mt16"><label class="label" for="rv-text">Your review</label><textarea id="rv-text" class="input" rows="3" data-input="ord-rev-text" placeholder="How are the fabric, colour and fit?">'+esc(u.text)+'</textarea></div>'+
    '<div id="rv-err" class="mt8" role="alert"></div>'+
    '<button class="btn btn-primary btn-block mt12" data-act="ord-rev-submit">Submit review</button>'+
    '<div class="xs muted center mt8">'+esc(ruleText('reviews','short'))+'</div>';
}
ACT['ord-rev-open'] = function(el){
  var id = el.getAttribute('data-id'), i = +el.getAttribute('data-i'), ms = mySize() || {}, h = ms.heightIn || 0;
  UI['ord:rev'] = {id:id, i:i, stars:0, fit:'', ft:h ? Math.floor(h/12) : '', inch:h ? h%12 : '', kg:ms.weightKg || '', text:'', photo:false};
  openModal(ord_revHTML(), {title:'Rate & review', rebuild:ord_revHTML});
};
ACT['ord-rev-star'] = function(el){ UI['ord:rev'].stars = +el.getAttribute('data-v'); acc_refreshKeep(); };
ACT['ord-rev-fit'] = function(el){ var u = UI['ord:rev'], v = el.getAttribute('data-v'); u.fit = u.fit===v ? '' : v; acc_refreshKeep(); };
ACT['ord-rev-photo'] = function(){ var u = UI['ord:rev']; u.photo = !u.photo; if(u.photo) toast('Demo: photo added'); acc_refreshKeep(); };
CHANGE['ord-rev-hw'] = function(el){ var u = UI['ord:rev']; if(u) u[el.getAttribute('data-f')] = el.value==='' ? '' : +el.value; };
INPUT['ord-rev-kg'] = function(el){ var u = UI['ord:rev']; if(u) u.kg = el.value; };
INPUT['ord-rev-text'] = function(el){ var u = UI['ord:rev']; if(u) u.text = el.value; };
ACT['ord-rev-submit'] = function(){
  var u = UI['ord:rev'], o = ST.orders[u.id], acc = currentAccount(), err = document.getElementById('rv-err');
  if(!u.stars){ if(err) err.innerHTML = acc_err('Please tap a star rating first.'); return; }
  var hIn = (u.ft!=='' && u.ft!=null) ? u.ft*12 + (+u.inch||0) : null;
  o.reviewed = o.reviewed || {}; o.reviewed[u.i] = 'pending';
  if(acc){ acc.reviews = acc.reviews || []; acc.reviews.push({order:o.id, lineIdx:u.i, product:o.lines[u.i].product, size:o.lines[u.i].size, stars:u.stars, fit:u.fit, heightIn:hIn, weightKg:u.kg ? +u.kg : null, text:u.text, photo:!!u.photo, status:'pending', at:Date.now()}); }
  saveState(); closeModal(); toast('Thanks! Your review will appear after our check.'); rerender();
};

/* edit order modal */
function ord_editHTML(){
  var u = UI['ord:edit'], o = ST.orders[u.id], max = Number(SET('order-edit','maxEdits')) || 0, left = max - (o.edits||0);
  var lines = o.lines.map(function(l, i){
    var p = P(l.product); if(!p) return '';
    var pills = p.sizes.length<2 ? '<span class="small text2">One size</span>' : p.sizes.map(function(s){
      var ok = s===l.size || stockOf(l.product, l.color, s)>0, on = u.sizes[i]===s;
      return '<button type="button" class="size-pill'+(on?' on':'')+(ok?'':' out')+'"'+(ok ? ' data-act="ord-edit-size" data-i="'+i+'" data-s="'+esc(s)+'"' : ' disabled aria-disabled="true"')+' aria-pressed="'+on+'" aria-label="Size '+esc(s)+(ok?'':', out of stock')+'">'+esc(s)+'</button>';
    }).join('');
    return '<div class="ord-eline">'+acc_thumb(l.product, l.color, 48)+'<div class="grow"><div class="small bold">'+esc(p.name)+'</div><div class="xs text2">'+esc(COL(l.color).name)+(l.setLabel ? ' · '+esc(l.setLabel) : '')+'</div><div class="row wrap mt8" style="gap:6px" role="group" aria-label="Size for '+esc(p.name)+'">'+pills+'</div></div></div>';
  }).join('');
  return '<p class="small text2" style="margin:0 0 14px">You can edit this order <b>'+plural(left,'more time')+'</b> before we start packing it. Sizes that are out of stock can\x27t be picked.</p>'+
    '<div><label class="label" for="ed-addr">Delivery address</label><textarea id="ed-addr" class="input" rows="2" data-input="ord-edit-addr">'+esc(u.address)+'</textarea></div>'+
    '<div class="mt12"><label class="label" for="ed-phone">Mobile number</label><input id="ed-phone" class="input" type="tel" inputmode="numeric" value="'+esc(u.phone)+'" data-input="ord-edit-phone"><div id="ed-phone-msg" class="xs" aria-live="polite"></div></div>'+
    '<div class="label mt16" style="margin-bottom:0">Sizes</div>'+lines+
    '<div id="ed-err" class="mt8" role="alert"></div>'+
    '<button class="btn btn-primary btn-block mt12" data-act="ord-edit-save">Save changes</button>';
}
ACT['ord-edit-open'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')]; if(!o) return;
  UI['ord:edit'] = {id:o.id, address:o.address, phone:acc_nicePhone(o.phone), sizes:o.lines.map(function(l){ return l.size; })};
  openModal(ord_editHTML(), {title:'Edit order #'+o.id, rebuild:ord_editHTML});
};
ACT['ord-edit-size'] = function(el){ UI['ord:edit'].sizes[+el.getAttribute('data-i')] = el.getAttribute('data-s'); acc_refreshKeep(); };
INPUT['ord-edit-addr'] = function(el){ UI['ord:edit'].address = el.value; };
INPUT['ord-edit-phone'] = function(el){
  UI['ord:edit'].phone = el.value; var c = checkPhone(el.value), box = document.getElementById('ed-phone-msg');
  if(box) box.innerHTML = c.state==='warn' && c.digits.length>=11 ? '<div class="mt8" style="color:var(--warn)">'+esc(c.msg)+'</div>' : '';
};
ACT['ord-edit-save'] = function(){
  var u = UI['ord:edit'], o = ST.orders[u.id], err = document.getElementById('ed-err');
  var max = Number(SET('order-edit','maxEdits')) || 0;
  if(o.status!=='confirmed' || (o.edits||0)>=max){ closeModal(); toast('This order can\'t be edited any more'); rerender(); return; }
  var ph = checkPhone(u.phone);
  if(ph.state!=='ok'){ err.innerHTML = acc_err(ph.msg || 'Please enter your mobile number.'); return; }
  var addr = String(u.address||'').trim();
  if(addr.length<10){ err.innerHTML = acc_err('Please write the full address — house, road and area.'); return; }
  var changes = [];
  if(addr!==o.address) changes.push('address');
  if(ph.digits!==o.phone) changes.push('phone');
  u.sizes.forEach(function(s, i){ if(s!==o.lines[i].size) changes.push(P(o.lines[i].product).name+' '+o.lines[i].size+' → '+s); });
  if(!changes.length){ toast('Nothing changed'); return; }
  o.address = addr; o.zone = zoneOf(addr).zone; o.phone = ph.digits;
  u.sizes.forEach(function(s, i){ o.lines[i].size = s; });
  var del = deliveryCharge(o.zone, o.subtotal - o.discount); o.total += del - o.delivery; o.delivery = del;
  o.edits = (o.edits||0) + 1; o.editLog = (o.editLog||[]).concat([{at:Date.now(), changes:changes}]);
  saveState(); closeModal();
  var left = max - o.edits; toast('Order updated · '+(left>0 ? plural(left,'edit')+' left' : 'no edits left')); rerender();
};

/* demo-only controls */
ACT['ord-demo-next'] = function(el){ var id = el.getAttribute('data-id'); advanceOrder(id); toast('Status: '+STATUS_LABEL[ST.orders[id].status]); rerender(); };
ACT['ord-demo-recv'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')], xid = el.getAttribute('data-x'); if(!o) return;
  var x = (o.exchanges||[]).filter(function(e){ return e.id===xid; })[0]; if(!x || x.status==='completed') return;
  x.status = 'completed'; x.completedAt = Date.now();
  var acc = currentAccount() || ST.accounts[o.phone];
  if(x.walletCredit>0 && acc){ acc.wallet = (acc.wallet||0) + x.walletCredit; acc.walletTx = acc.walletTx || []; acc.walletTx.unshift({label:'Exchange credit · #'+x.id, amount:x.walletCredit, at:Date.now()}); }
  saveState(); toast(x.walletCredit>0 ? 'Old item received — '+fmt(x.walletCredit)+' added to wallet' : 'Old item received — exchange completed'); rerender();
};

ACT['ordw-close'] = function(el){ ui('ordwelcome:'+el.getAttribute('data-id'), {}).dismissed = true; rerender(); };
ACT['ordw-pw'] = function(el){ var u = ui('ordwelcome:'+el.getAttribute('data-id'), {}); u.showPw = !u.showPw; rerender(); };
