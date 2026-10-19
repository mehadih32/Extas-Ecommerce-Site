const L = require('./lib');
(async () => { const T = await L.open(L.dev('p393x852')); await L.prep(T, '#/bn/journal'); await T.p.waitForTimeout(1500);
  await T.p.evaluate(() => { document.querySelector('h1').setAttribute('data-qa-bn', '0'); });
  await T.cdp.send('DOM.enable'); await T.cdp.send('CSS.enable');
  const {root} = await T.cdp.send('DOM.getDocument', {depth: -1});
  const q = await T.cdp.send('DOM.querySelectorAll', {nodeId: root.nodeId, selector: '[data-qa-bn]'}); console.log(q);
  for(const id of q.nodeIds){ console.log(JSON.stringify(await T.cdp.send('CSS.getPlatformFontsForNode', {nodeId: id}))); }
  console.log(await T.p.evaluate(() => [getComputedStyle(document.querySelector('h1')).fontFamily, document.fonts.check('16px "Hind Siliguri"','অ'), [...document.fonts].filter(f=>/Hind/.test(f.family)).map(f=>f.status+f.weight).join(',')]));
  await L.shot(T, 'dbg-bn'); await L.close(T); })();
