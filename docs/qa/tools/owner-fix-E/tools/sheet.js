// node sheet.js <spec.json> <out.png>   spec: {title, sub, cols, items:[{img, cap, n}]}
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const spec=JSON.parse(fs.readFileSync(process.argv[2],'utf8')), out=process.argv[3];
  const cols=spec.cols||2, w=spec.width||1600;
  const items=spec.items.map((it,i)=>`<figure><div class="im"><img src="data:image/${/\.jpe?g$/.test(it.img)?'jpeg':'png'};base64,${fs.readFileSync(it.img).toString('base64')}"></div><figcaption><b>${it.n!=null?it.n:(i+1)}</b><span>${it.cap}</span></figcaption></figure>`).join('');
  const html=`<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600&display=swap" rel="stylesheet"><style>
  body{margin:0;background:#F4F3F0;font-family:'Hind Siliguri',sans-serif;color:#171715;width:${w}px}
  h1{margin:0;padding:28px 32px 4px;font-size:30px}.sub{padding:0 32px 18px;font-size:17px;color:#54504A}
  .g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:22px;padding:0 32px 32px}
  figure{margin:0;background:#fff;border:1px solid #E1DDD6;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
  .im{background:#fff;border-bottom:1px solid #E6E3DE;max-height:${spec.maxh||900}px;overflow:hidden}.im img{display:block;width:100%}
  figcaption{display:flex;gap:12px;align-items:flex-start;padding:12px 16px;font-size:17px;line-height:1.5}
  figcaption b{flex:0 0 auto;background:#1F4E46;color:#fff;border-radius:99px;min-width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;padding:0 8px}
  </style></head><body><h1>${spec.title}</h1><div class="sub">${spec.sub||''}</div><div class="g">${items}</div></body></html>`;
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:w,height:900}});
  await p.setContent(html,{waitUntil:'networkidle'}).catch(()=>{}); await p.waitForTimeout(500);
  await p.screenshot({path:out,fullPage:true}); await b.close(); console.log('sheet',out);
})();
