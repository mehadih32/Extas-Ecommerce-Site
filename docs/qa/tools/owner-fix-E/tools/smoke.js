// node smoke.js <html> [width] [lang]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path=require('path');
(async()=>{
  const html=process.argv[2], w=+(process.argv[3]||1366), lang=process.argv[4]||'en';
  const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:w,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('PE '+e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/fonts|net::/.test(m.text())) errs.push('C '+m.text()); });
  await p.goto('file://'+path.resolve(html)+'#/'); await p.waitForTimeout(700);
  await p.evaluate(l=>{ ST.seenIntro=true; ST.adminLang=l; saveState(); closeModal(); },lang);
  const routes=['#/admin/orders','#/admin/finance','#/admin/finance?tab=day','#/admin/finance?tab=style','#/admin/finance?tab=cat','#/admin/finance?tab=combo','#/admin/finance?tab=costs','#/admin/finance?tab=ads','#/admin/expenses','#/admin/expenses?tab=staff','#/admin/expenses?tab=heads','#/admin/expenses?tab=erp','#/admin/team','#/admin/team?tab=people','#/admin/team?tab=log','#/admin/comms','#/admin/bulk','#/admin/review','#/admin/review?tab=done','#/admin/review?tab=rules','#/admin/exchanges','#/admin/exchanges?tab=ret','#/admin/exchanges?tab=recv','#/admin/exchanges?tab=done','#/admin/support','#/admin/support?t=T-1001','#/admin/coupons','#/admin/couriers?tab=money'];
  for(const r of routes){ errs.length=0; await p.evaluate(h=>{ location.hash='#/x'; location.hash=h; },r); await p.waitForTimeout(250);
    const info=await p.evaluate(()=>{ const t=document.querySelector('.admin-main'); const BN=/[ঀ-৥ৰ-৲৴-৿]/; let bn=[]; const tw=document.createTreeWalker(document.getElementById('app'),NodeFilter.SHOW_TEXT); let n; while((n=tw.nextNode())){ if(BN.test(n.nodeValue)&&!n.parentElement.closest('[translate="no"],textarea,script,style')){ const s=getComputedStyle(n.parentElement); if(s.display!=='none'&&s.visibility!=='hidden') bn.push(n.nodeValue.trim().slice(0,50)); } }
      return {wrong:/Something went wrong/.test(t?t.innerText:''), of:document.documentElement.scrollWidth-innerWidth, bn:bn.slice(0,4), h1:(document.querySelector('.admin-main h1')||{}).textContent}; });
    console.log((info.wrong||errs.length||info.of>1?'BAD ':'ok  ')+r, info.h1, info.of>1?'overflow '+info.of:'', ' bn:'+info.bn.length, info.bn.join(' | '), errs.join(' ; '));
  }
  await b.close();
})();
