/* Page-level checks run on the current page: sideways scroll, h1, skip link, tap targets,
   cut/overlapping text, images, Bengali font, contrast (solid colours computed; gradients,
   images and overlays measured from real pixels with the text hidden). */
const sharp = require('/opt/npm-tools/node_modules/sharp');

/* in-page collector */
function collect(scopeSel){
  scopeSel = scopeSel || 'main, .bf-bar.on, .modal-back';
  const out = {};
  const vis = el => { const r = el.getBoundingClientRect(); if(r.width < 1 || r.height < 1) return false; let e = el; while(e && e.nodeType === 1){ const cs = getComputedStyle(e); if(cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; e = e.parentElement; } return true; };
  const srOnly = el => { let e = el; while(e && e.nodeType === 1){ const cs = getComputedStyle(e); if((cs.position === 'absolute' || cs.position === 'fixed') && (parseFloat(cs.width) <= 1 || parseFloat(cs.height) <= 1 || /rect\(0/.test(cs.clip) || cs.clipPath === 'inset(50%)')) return true; e = e.parentElement; } return false; };
  const ariaHidden = el => !!el.closest('[aria-hidden="true"]');
  const fixedAnc = el => { let e = el; while(e && e.nodeType === 1){ const p = getComputedStyle(e).position; if(p === 'fixed' || p === 'sticky') return true; e = e.parentElement; } return false; };
  const sel = el => { let s = el.tagName.toLowerCase(); if(el.id) s += '#' + el.id; const c = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().split(/\s+/).filter(Boolean).slice(0, 2); if(c.length) s += '.' + c.join('.'); const p = el.parentElement; if(p && !el.id){ const pc = String(p.className && p.className.baseVal !== undefined ? p.className.baseVal : p.className).trim().split(/\s+/)[0]; if(pc) s = '.' + pc + '>' + s; } return s; };
  const txt = el => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const doc = document.documentElement;
  out.hscroll = {sw: doc.scrollWidth, iw: innerWidth, bodySW: document.body.scrollWidth};
  /* elements sticking out to the right */
  out.wide = [];
  document.querySelectorAll('main *, .bf-bar *').forEach(el => { const r = el.getBoundingClientRect(); if(r.right > innerWidth + 1 && r.width > 0 && vis(el)){ let clipped = false, e = el.parentElement; while(e && e !== document.body){ const cs = getComputedStyle(e); if(/(hidden|auto|scroll|clip)/.test(cs.overflowX)) { const pr = e.getBoundingClientRect(); if(pr.right <= innerWidth + 1){ clipped = true; break; } } e = e.parentElement; } if(!clipped && out.wide.length < 8) out.wide.push(sel(el) + ' right=' + Math.round(r.right)); } });
  out.h1 = [...document.querySelectorAll('h1')].filter(vis).map(h => h.textContent.trim().slice(0, 60));
  out.h1all = document.querySelectorAll('h1').length;
  const sk = document.querySelector('a.skip'); out.skip = sk ? {href: sk.getAttribute('href'), first: (() => { const f = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(e => !e.disabled)[0]; return f === sk; })(), target: !!document.querySelector(sk.getAttribute('href'))} : null;
  /* tap targets */
  const scope = [...document.querySelectorAll(scopeSel)];
  const inter = [];
  scope.forEach(s => s.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])').forEach(el => inter.push(el)));
  out.tap = []; out.tapN = 0;
  inter.forEach(el => {
    if(!vis(el) || srOnly(el)) return; if(el.getAttribute('tabindex') === '-1' && el.getAttribute('aria-hidden') === 'true') return;
    if(el.closest('[aria-hidden="true"]') && el.tabIndex < 0) return;
    /* WCAG 2.5.8 inline exception: a link inside running text */
    if(el.tagName === 'A' && el.closest('p, li, figcaption, td, .bf-quick, .bf-bnnote, .bf-honest')){ const blk = el.closest('p, li, figcaption, td, .bf-quick, .bf-bnnote, .bf-honest'); const own = (blk.innerText || '').trim().length, me = (el.innerText || '').trim().length; if(own > me + 8 && getComputedStyle(el).display === 'inline') return; }
    out.tapN++;
    let r = el.getBoundingClientRect();
    const af = getComputedStyle(el, '::after'); if(af.content && af.content !== 'none' && af.position === 'absolute'){ let pa = el.parentElement; while(pa && getComputedStyle(pa).position === 'static') pa = pa.parentElement; if(pa) r = pa.getBoundingClientRect(); }
    if(Math.round(r.width) < 44 || Math.round(r.height) < 44) out.tap.push({s: sel(el), t: txt(el), w: Math.round(r.width), h: Math.round(r.height)});
  });
  /* text leaves */
  const leaves = new Set(); const roots = [...document.querySelectorAll(scopeSel)];
  roots.forEach(root => { const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: n => n.nodeValue.trim() ? 1 : 2}); let n; while((n = tw.nextNode())){ const el = n.parentElement; if(el && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName)) leaves.add(el); } });
  const L = [...leaves].filter(el => vis(el) && !srOnly(el) && !ariaHidden(el) && el.closest('svg') === null);
  /* cut text */
  out.cut = []; out.trunc = [];
  L.forEach(el => { [el, el.parentElement].forEach(e => { if(!e || e.__qaCut) return; const cs = getComputedStyle(e); const hidden = /(hidden|clip)/.test(cs.overflowX) || /(hidden|clip)/.test(cs.overflow); if(!hidden) return;
    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    const textInside = () => { const rg = document.createRange(); rg.selectNodeContents(e); const tr = rg.getBoundingClientRect(), er = e.getBoundingClientRect(); return tr.left >= er.left - 0.5 && tr.right <= er.right + 0.5 && tr.top >= er.top - 1 && tr.bottom <= er.bottom + 1; };
    if(e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && !textInside()){ e.__qaCut = 1; (cs.textOverflow === 'ellipsis' ? out.trunc : out.cut).push({s: sel(e), t: txt(e), sw: e.scrollWidth, cw: e.clientWidth}); }
    else if(!clamp && e.scrollHeight > e.clientHeight + 3 && e.clientHeight > 0 && !/(auto|scroll)/.test(cs.overflowY) && !textInside()){ e.__qaCut = 1; out.cut.push({s: sel(e), t: txt(e), sh: e.scrollHeight, ch: e.clientHeight, v: 1}); }
  }); });
  out.cut = out.cut.slice(0, 15); out.trunc = out.trunc.slice(0, 15);
  /* overlapping text (static content only) */
  out.overlap = [];
  const boxes = L.filter(el => !fixedAnc(el)).map(el => { const rs = [...el.getClientRects()]; return {el, rs}; });
  for(let i = 0; i < boxes.length && out.overlap.length < 10; i++) for(let j = i + 1; j < boxes.length; j++){
    const a = boxes[i], b = boxes[j]; if(a.el.contains(b.el) || b.el.contains(a.el)) continue;
    let hit = false;
    for(const ra of a.rs){ for(const rb of b.rs){ const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top); if(ix > 3 && iy > 4){ hit = [Math.round(ix), Math.round(iy)]; break; } } if(hit) break; }
    if(hit){ out.overlap.push({a: sel(a.el) + ' "' + txt(a.el).slice(0, 25) + '"', b: sel(b.el) + ' "' + txt(b.el).slice(0, 25) + '"', px: hit}); if(out.overlap.length >= 10) break; }
  }
  /* images */
  const imgs = [...document.querySelectorAll('main img, .modal-back img')];
  out.img = {n: imgs.length, noLazy: imgs.filter(i => i.getAttribute('loading') !== 'lazy').map(i => (i.getAttribute('src') || '').slice(0, 40)), noAlt: imgs.filter(i => !i.hasAttribute('alt')).map(i => (i.getAttribute('src') || '').slice(0, 40)),
    svgArt: document.querySelectorAll('main .pimg svg').length, svgNamed: [...document.querySelectorAll('main .pimg')].filter(x => x.getAttribute('role') === 'img' && x.getAttribute('aria-label')).length, pimg: document.querySelectorAll('main .pimg').length,
    pimgUnnamed: [...document.querySelectorAll('main .pimg')].filter(x => !x.closest('[aria-hidden="true"]') && !(x.getAttribute('aria-label') || x.querySelector('[aria-label],title,img[alt]'))).length};
  /* Bengali */
  const bnEls = L.filter(el => /[ঀ-৲৴-৿]/.test(el.textContent));
  document.querySelectorAll('[data-qa-bn]').forEach(e => e.removeAttribute('data-qa-bn'));
  bnEls.forEach((el, i) => { if(i < 10) el.setAttribute('data-qa-bn', i); });
  out.bn = {n: bnEls.length, fonts: [...new Set(bnEls.slice(0, 40).map(el => getComputedStyle(el).fontFamily.split(',')[0].trim()))], hindLoaded: document.fonts.check('16px "Hind Siliguri"', 'অআ'), status: document.fonts.status,
    noLang: bnEls.filter(el => !el.closest('[lang="bn"]') && document.documentElement.lang !== 'bn').length, minSize: bnEls.reduce((m, el) => Math.min(m, parseFloat(getComputedStyle(el).fontSize)), 99)};
  /* contrast candidates */
  const parse = s => { let m = s.match(/rgba?\(([^)]+)\)/); if(m){ const v = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v[3] === undefined ? 1 : v[3]]; } m = s.match(/color\(srgb ([^)]+)\)/); if(m){ const v = m[1].split(/[ \/]+/).filter(Boolean).map(Number); return [v[0]*255, v[1]*255, v[2]*255, v[3] === undefined ? 1 : v[3]]; } return null; };
  const blend = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if(a === 0) return [0,0,0,0]; return [0,1,2].map(i => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a); };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const pageBg = parse(getComputedStyle(document.body).backgroundColor) || [255,255,255,1];
  out.contrast = []; out.sample = []; let k = 0;
  L.forEach(el => {
    const cs = getComputedStyle(el); let fg = parse(cs.color); if(!fg) return;
    if(cs.webkitTextFillColor && parse(cs.webkitTextFillColor) && parse(cs.webkitTextFillColor)[3] === 0) return;
    let op = 1, e = el; while(e && e.nodeType === 1){ op *= +getComputedStyle(e).opacity; e = e.parentElement; } fg = [fg[0], fg[1], fg[2], fg[3] * op];
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, large = size >= 24 || (bold && size >= 18.66), need = large ? 3 : 4.5;
    const r = el.getBoundingClientRect();
    /* background */
    let stack = [], img = false; e = el;
    while(e && e.nodeType === 1){ const c = getComputedStyle(e); if(c.backgroundImage && c.backgroundImage !== 'none'){ img = c.backgroundImage.slice(0, 40); break; } const bg = parse(c.backgroundColor); if(bg && bg[3] > 0){ stack.push(bg); if(bg[3] >= 1) break; } e = e.parentElement; }
    /* something drawn under the text that is not an ancestor? (image, svg, overlay) */
    if(!img){ const cx = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width, 40) / 2)), cy = r.top + r.height / 2;
      if(cy > 0 && cy < innerHeight){ const st = document.elementsFromPoint(cx, cy); const i0 = st.indexOf(el); for(const x of st.slice(i0 + 1)){ if(x.contains(el)) { const c = getComputedStyle(x); if(c.backgroundImage !== 'none') { img = 'anc'; } const bg = parse(c.backgroundColor); if(bg && bg[3] >= 1) break; continue; } if(/^(IMG|svg|CANVAS|VIDEO)$/i.test(x.tagName) || x.closest('svg') || getComputedStyle(x).backgroundImage !== 'none' || (parse(getComputedStyle(x).backgroundColor) || [0,0,0,0])[3] > 0){ img = 'under:' + sel(x); break; } } } }
    let bg = pageBg; for(let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg);
    const id = 'qa' + (k++); el.setAttribute('data-qa-c', id);
    const item = {id, s: sel(el), t: txt(el).slice(0, 40), fg: fg.map(v => Math.round(v * 100) / 100), size, bold, need, y: Math.round(r.top + scrollY), h: Math.round(r.height), x: Math.round(r.left), w: Math.round(r.width)};
    if(img){ item.img = img; out.sample.push(item); }
    else { const f2 = blend(fg, bg); item.bg = bg.map(Math.round); item.ratio = Math.round(ratio(f2, bg) * 100) / 100; if(item.ratio < need) out.contrast.push(item); }
  });
  out.contrastN = L.length;
  return out;
}

const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };

/* measure the "needs pixels" items: hide all text, screenshot the box, worst 10% of pixels */
async function samplePixels(T, items, max = 30){
  const res = [];
  if(!items.length) return res;
  /* scrollIntoView also scrolls sideways rows (chips): remember and restore them */
  await T.p.evaluate(() => { window.__qaRows = [...document.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowX)).map(e => [e, e.scrollLeft]); });
  await T.p.addStyleTag({content: '.qa-hide-text *, .qa-hide-text *::before, .qa-hide-text *::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important;caret-color:transparent!important}'});
  for(const it of items.slice(0, max)){
    try{
      const box = await T.p.evaluate(id => { const el = document.querySelector('[data-qa-c="' + id + '"]'); if(!el) return null; el.scrollIntoView({block: 'center'}); const r = el.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; }, it.id);
      if(!box || box.w < 2 || box.h < 2) continue;
      await T.p.evaluate(() => document.documentElement.classList.add('qa-hide-text')); await T.p.waitForTimeout(40);
      const x = Math.max(0, Math.floor(box.x)), y = Math.max(0, Math.floor(box.y)), w = Math.max(1, Math.min(T.d.w - x, Math.ceil(box.w))), h = Math.max(1, Math.min(T.d.h - y, Math.ceil(box.h)));
      const buf = await T.p.screenshot({clip: {x, y, width: w, height: h}});
      await T.p.evaluate(() => document.documentElement.classList.remove('qa-hide-text'));
      const {data, info} = await sharp(buf).removeAlpha().raw().toBuffer({resolveWithObject: true});
      const rs = [];
      for(let i = 0; i < data.length; i += 3 * 2){ const px = [data[i], data[i+1], data[i+2]]; const a = it.fg[3]; const f = [0,1,2].map(j => it.fg[j] * a + px[j] * (1 - a)); rs.push(ratio(f, px)); }
      rs.sort((a, b) => a - b);
      const worst = rs[Math.floor(rs.length * 0.1)], med = rs[Math.floor(rs.length / 2)];
      res.push(Object.assign({}, it, {ratio: Math.round(worst * 100) / 100, median: Math.round(med * 100) / 100, measured: 'pixels'}));
    }catch(e){ res.push(Object.assign({}, it, {err: String(e).slice(0, 80)})); }
  }
  await T.p.evaluate(() => { document.documentElement.classList.remove('qa-hide-text'); scrollTo(0, 0); (window.__qaRows || []).forEach(([e, l]) => { e.scrollLeft = l; }); });
  return res;
}

/* the font Chrome really used to draw Bengali glyphs */
async function bnFonts(T){
  const out = {};
  try{
    await T.cdp.send('DOM.enable'); await T.cdp.send('CSS.enable');
    const {root} = await T.cdp.send('DOM.getDocument', {depth: -1});
    const {nodeIds} = await T.cdp.send('DOM.querySelectorAll', {nodeId: root.nodeId, selector: '[data-qa-bn]'});
    for(const id of nodeIds){ const {fonts} = await T.cdp.send('CSS.getPlatformFontsForNode', {nodeId: id}); fonts.forEach(f => { out[f.familyName] = (out[f.familyName] || 0) + f.glyphCount; }); }
  }catch(e){ out.err = String(e).slice(0, 80); }
  return out;
}
async function audit(T, opts = {}){
  const a = await T.p.evaluate(collect, opts.scope || null);
  if(a.bn.n) a.bn.used = await bnFonts(T);
  if(opts.contrast !== false){
    const px = await samplePixels(T, a.sample, opts.maxSample || 30);
    a.sampled = px.length; a.contrast = a.contrast.concat(px.filter(x => x.ratio !== undefined && x.ratio < x.need));
  }
  delete a.sample;
  return a;
}
module.exports = {audit, collect, ratio, bnFonts};
