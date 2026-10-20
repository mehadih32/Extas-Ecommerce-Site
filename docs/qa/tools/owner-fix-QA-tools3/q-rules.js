/* usage: node q-rules.js '<hash>' '<selector>' prop [w] — lists CSS rules that set prop on the element */
const L = require('./lib');
(async () => {
  const [hash, sel, prop, w] = process.argv.slice(2);
  const { browser, page } = await L.start({ width: +(w || 1366), height: 768 });
  await L.open(page, '#/'); await L.go(page, hash, 900);
  console.log(await page.evaluate(([sel, prop]) => {
    const el = document.querySelector(sel); if(!el) return 'no element';
    const out = [];
    const walk = (rules, media) => { for(const r of rules){ if(r.cssRules && !r.selectorText){ if(!r.media || matchMedia(r.media.mediaText).matches) walk(r.cssRules, (r.media && r.media.mediaText) || media); continue; }
      if(r.selectorText && r.style && (r.style.getPropertyValue(prop) || r.style.getPropertyValue(prop.replace(/-(left|right|top|bottom)$/, '')))){ try{ if(el.matches(r.selectorText)) out.push((media ? '@' + media + ' ' : '') + r.cssText.slice(0, 220)); }catch(e){} } } };
    for(const s of document.styleSheets){ try{ walk(s.cssRules, ''); }catch(e){} }
    return out.join('\n') + '\ninline: ' + el.getAttribute('style');
  }, [sel, prop]));
  await browser.close();
})();
