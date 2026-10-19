/* diagnostic: who sets the 4 s hold after a mouse drag + leave on a non-home row (category) */
const L = require('./lib');
(async()=>{
  const p = await L.newPage('d1366');
  await L.open(p, '#/c/polos', {wait:1300});
  const id = 'cat-bn-sl';
  await p.evaluate(i=>{ document.getElementById(i).scrollIntoView({block:'center'}); const st=SMOOTH.peek(i); let v=st.pause; window.__tr=[]; const t0=performance.now();
    Object.defineProperty(st,'pause',{get(){return v;}, set(x){ v=x; window.__tr.push(Math.round(performance.now()-t0)+'ms pause='+(x?Math.round(x-Date.now()):0)+' <- '+new Error().stack.split('\n').slice(2,5).map(s=>s.trim().replace(/\(?file:.*?:(\d+):\d+\)?/,'L$1')).join(' < ')); }});
    const e=document.getElementById(i); ['pointerleave','pointercancel','dragstart','dragend','pointerup'].forEach(t=>e.addEventListener(t,()=>window.__tr.push(Math.round(performance.now()-t0)+'ms EVENT '+t)));
  }, id);
  await p.waitForTimeout(300);
  const c = await p.evaluate(i=>{const r=document.getElementById(i).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,b:r.bottom}},id);
  await p.mouse.move(c.x,c.y,{steps:4}); await p.mouse.down(); await p.mouse.move(c.x-130,c.y,{steps:8}); await p.mouse.up(); await p.mouse.move(c.x, c.b+60);
  await p.waitForTimeout(1500);
  console.log((await p.evaluate(()=>window.__tr)).join('\n'));
  // home row: leave during glide
  await L.open(p, '#/', {wait:1300});
  const id2='hm-flash1';
  await p.evaluate(i=>{ document.getElementById(i).scrollIntoView({block:'center'}); const st=SMOOTH.peek(i); let v=st.pause; window.__tr=[]; const t0=performance.now();
    Object.defineProperty(st,'pause',{get(){return v;}, set(x){ v=x; window.__tr.push(Math.round(performance.now()-t0)+'ms pause='+(x?Math.round(x-Date.now()):0)+' <- '+new Error().stack.split('\n').slice(2,5).map(s=>s.trim().replace(/\(?file:.*?:(\d+):\d+\)?/,'L$1')).join(' < ')); }});
    const e=document.getElementById(i); ['pointerleave'].forEach(t=>e.addEventListener(t,()=>window.__tr.push(Math.round(performance.now()-t0)+'ms EVENT '+t)));}, id2);
  await p.waitForTimeout(300);
  const d = await p.evaluate(i=>{const r=document.getElementById(i).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,b:r.bottom}},id2);
  await p.mouse.move(d.x,d.y,{steps:4}); await p.mouse.down(); await p.mouse.move(d.x-130,d.y,{steps:8}); await p.mouse.up(); await p.mouse.move(d.x, d.b+80);
  await p.waitForTimeout(1200);
  console.log('--- home'); console.log((await p.evaluate(()=>window.__tr)).slice(-8).join('\n'));
  // vertical wheel
  await L.open(p, '#/c/polos', {wait:1300});
  await p.evaluate(i=>{ document.getElementById(i).scrollIntoView({block:'center'}); const st=SMOOTH.peek(i); let v=st.pause; window.__tr=[]; const t0=performance.now();
    Object.defineProperty(st,'pause',{get(){return v;}, set(x){ v=x; window.__tr.push(Math.round(performance.now()-t0)+'ms pause='+(x?Math.round(x-Date.now()):0)+' <- '+new Error().stack.split('\n').slice(2,5).map(s=>s.trim().replace(/\(?file:.*?:(\d+):\d+\)?/,'L$1')).join(' < ')); }});}, id);
  await p.waitForTimeout(300);
  const e2 = await p.evaluate(i=>{const r=document.getElementById(i).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}},id);
  await p.mouse.move(e2.x,e2.y,{steps:3}); for(let i=0;i<4;i++){ await p.mouse.wheel(0,100); await p.waitForTimeout(30);} await p.waitForTimeout(600);
  console.log('--- vertical wheel'); console.log((await p.evaluate(()=>window.__tr)).slice(-6).join('\n'));
  await L.closeBrowser();
})();
