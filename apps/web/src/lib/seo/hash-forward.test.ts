// S11 · PR 586 — the hash-to-real-URL forwarder. The script that ships (HASH_SCRIPT_BODY, wrapped by hashScript) runs
// here in a sandbox with a fake `location`, against the same table the shop gives it; every route of the approved demo
// (docs/demo/src/02-core.js ROUTES) has its rule, so no shared demo link dies.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { hashRulesFor, hashScript } from './hash-forward';

/** Where the script sends a browser that opens `pathname` + `hash` (null: it stays). */
function forward(hash: string, pathname = '/', prefix = 'p'): string | null {
  let to: string | null = null;
  const location = { hash, pathname, replace: (u: string) => (to = u) };
  runInNewContext(hashScript(hashRulesFor(prefix)), { location });
  return to;
}

describe('PR 586 · demo #/ links forward to their live address', () => {
  it('the storefront routes', () => {
    expect(forward('#/')).toBe('/');
    expect(forward('#/p/essential-pique-polo')).toBe('/p/essential-pique-polo');
    expect(forward('#/c/polos')).toBe('/collections/polos');
    expect(forward('#/search?q=polo')).toBe('/search?q=polo');
    expect(forward('#/combo/navy-white-polo-pair')).toBe('/combo/navy-white-polo-pair');
    expect(forward('#/combo-pair/navy-white')).toBe('/combo/navy-white');
    expect(forward('#/combos')).toBe('/combos');
    expect(forward('#/combos/polo-pairs')).toBe('/combos/polo-pairs');
    expect(forward('#/set')).toBe('/combos/build-your-own');
    expect(forward('#/set/polo-trio')).toBe('/combos/build-your-own/polo-trio');
    expect(forward('#/bag')).toBe('/bag');
    expect(forward('#/checkout')).toBe('/checkout');
    expect(forward('#/thanks/EX-1001')).toBe('/checkout/thanks/EX-1001');
    expect(forward('#/login')).toBe('/account/login');
    expect(forward('#/account')).toBe('/account');
    expect(forward('#/account/orders')).toBe('/account/orders');
    expect(forward('#/order/EX-1001')).toBe('/account/orders/EX-1001');
    expect(forward('#/exchange/EX-1001')).toBe('/account/orders/EX-1001');
    expect(forward('#/journal')).toBe('/journal');
    expect(forward('#/journal/how-to-wash-linen')).toBe('/journal/how-to-wash-linen');
    expect(forward('#/page/delivery')).toBe('/help/delivery');
    expect(forward('#/size-guide')).toBe('/help/size-guide');
    expect(forward('#/l/eid-sale')).toBe('/l/eid-sale');
  });

  it('keeps the query, follows the owner product prefix, trims a trailing slash and decodes', () => {
    expect(forward('#/p/essential-pique-polo?color=navy')).toBe('/p/essential-pique-polo?color=navy');
    expect(forward('#/p/essential-pique-polo', '/', 'product')).toBe('/product/essential-pique-polo');
    expect(forward('#/p/essential-pique-polo', '/', '/products/')).toBe('/products/essential-pique-polo');
    expect(forward('#/c/polos/')).toBe('/collections/polos');
    expect(forward('#%2Fc%2Fpolos')).toBeNull(); // not a route: an encoded slash is not "#/"
    expect(forward('#/c/%70olos')).toBe('/collections/polos');
  });

  it('a Bengali page keeps its language; the admin keeps its own address', () => {
    expect(forward('#/c/polos', '/bn')).toBe('/bn/collections/polos');
    expect(forward('#/', '/bn/collections/polos')).toBe('/bn');
    expect(forward('#/admin/orders', '/bn')).toBe('/admin/orders');
    expect(forward('#/admin')).toBe('/admin');
    expect(forward('#/admin/landing/new')).toBe('/admin/landing/new');
  });

  it('an anchor or an unknown route: the anchor stays, an unknown route goes to the same path without "#"', () => {
    expect(forward('')).toBeNull();
    expect(forward('#top')).toBeNull();
    expect(forward('#size')).toBeNull();
    expect(forward('#/old-summer-sale')).toBe('/old-summer-sale');
    expect(forward('#/c/polos/extra/parts')).toBe('/c/polos/extra/parts');
    // a broken escape does not stop the page
    expect(forward('#/search?q=%')).toBe('/search?q=%');
    expect(forward('#/c/%E0%A4')).toBe('/c/%E0%A4');
  });

  it('never sends anyone to another site (qa-gate, 31 Oct)', () => {
    for (const h of ['#//evil.example', '#/%2F%2Fevil.example', '#/\\evil.example', '#/%5Cevil.example']) expect(forward(h)).toBeNull();
    expect(forward('#//evil.example', '/bn')).toBeNull();
  });

  it('nothing in the table can close the script tag or run as code', () => {
    const s = hashScript([{ re: '^/x$', to: '/</script><script>alert(1)</script>' }]);
    expect(s).not.toContain('</script>');
    expect(s).toContain('\\u003c/script>');
    let to: string | null = null;
    runInNewContext(s, { location: { hash: '#/x', pathname: '/', replace: (u: string) => (to = u) } });
    expect(to).toBe('/</script><script>alert(1)</script>');
  });

  it('every route of the approved demo has its rule (docs/demo/src/02-core.js ROUTES)', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'docs', 'demo', 'src', '02-core.js'), 'utf8');
    const table = src.slice(src.indexOf('var ROUTES = ['), src.indexOf('];', src.indexOf('var ROUTES = [')));
    const patterns = [...table.matchAll(/\[\/(\^[^,]*?\$)\/,\s*'([\w-]+)'\]/g)].map((m) => m[1]!);
    expect(patterns.length).toBeGreaterThan(20);
    for (const re of patterns) {
      const sample = re
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        .replace(/\(\[\\w-\]\+\)/g, 'sample-1')
        .replace(/\\\//g, '/');
      const to = forward(`#${sample}`);
      expect(to, re).not.toBeNull();
      // a known route never falls through to "the same path" — except where the live address is the same path
      const rule = hashRulesFor('p').find((r) => new RegExp(r.re).test(sample));
      expect(rule, `${re} → ${sample}`).toBeDefined();
    }
  });
});
