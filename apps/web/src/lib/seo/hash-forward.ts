// S11 · PR 586 (Blueprint C12.2) — the hash-to-real-URL forwarder. The approved demo answers every page at a `#/…`
// link (`https://…/#/p/essential-pique-polo`, `#/c/polos`, `#/combos` …), and such links were shared while the shop was
// being built. A browser never sends what comes after `#` to the server, so the forward runs in the page: a tiny script
// in the shop's head reads `location.hash` and, when it is a demo route, replaces the address with the live one
// (`location.replace`, so Back does not return to the dead link). The table below is the one truth: the server turns
// it into the script's data (`hashRulesFor`, the product prefix from `naming.productPathPrefix`), and the tests run the
// script itself against the same table. A route the table does not know goes to the same path without the `#`, where
// the redirect table (PR 235) or the shop's own "page not found" (with its 404 report) answers — no shared link dies.
// The shop layout puts the script first in every shop page while `seo.hashLinks.forward` is on (on as shipped).
import { ROUTES } from '../shop/routes';

/** One demo route: a pattern over the hash path, and the live address with `$1` for the captured part. */
export interface HashRule {
  re: string;
  to: string;
}

const seg = '([\\w.~-]+)';
/** The routing table encodes what it is given, so its addresses are made with a word that survives and then marked. */
const SLOT = '__hash_seg__';
const at = (path: string) => path.replace(SLOT, '$1');

/** The demo's routes (docs/demo/src/02-core.js ROUTES and the later pushes) and their live addresses. */
export function hashRulesFor(productPathPrefix: string): HashRule[] {
  const pre = `/${productPathPrefix.replace(/^\/+|\/+$/g, '')}`;
  return [
    { re: '^/$', to: ROUTES.home },
    { re: `^/c/${seg}$`, to: at(ROUTES.category(SLOT)) },
    { re: `^/p/${seg}$`, to: `${pre}/$1` },
    { re: '^/search$', to: ROUTES.search },
    { re: `^/combo/${seg}$`, to: at(ROUTES.combo(SLOT)) },
    { re: `^/combo-pair/${seg}$`, to: at(ROUTES.combo(SLOT)) },
    { re: '^/combos$', to: ROUTES.combos },
    { re: `^/combos/${seg}$`, to: at(ROUTES.comboRule(SLOT)) },
    { re: '^/set$', to: ROUTES.buildSet },
    { re: `^/set/${seg}$`, to: `${ROUTES.buildSet}/$1` },
    { re: '^/bag$', to: ROUTES.bag },
    { re: '^/checkout$', to: ROUTES.checkout },
    { re: `^/thanks/${seg}$`, to: at(ROUTES.thanks(SLOT)) },
    { re: '^/login$', to: ROUTES.login },
    { re: '^/account$', to: ROUTES.account },
    { re: `^/account/${seg}$`, to: `${ROUTES.account}/$1` },
    { re: `^/order/${seg}$`, to: at(ROUTES.order(SLOT)) },
    { re: `^/exchange/${seg}$`, to: at(ROUTES.order(SLOT)) },
    { re: '^/journal$', to: ROUTES.journal },
    { re: `^/journal/${seg}$`, to: `${ROUTES.journal}/$1` },
    { re: `^/page/${seg}$`, to: at(ROUTES.help(SLOT)) },
    { re: '^/size-guide$', to: ROUTES.help('size-guide') },
    { re: `^/l/${seg}$`, to: '/l/$1' },
    // the admin keeps its own addresses (/admin/orders, /admin/rules …)
    { re: '^/admin(/[\\w./~-]*)?$', to: '/admin$1' },
  ];
}

/**
 * The script's whole logic as source (it runs before the page draws, with no framework). `R` is the rule table. A hash
 * that is not a route (`#top`, `#size`) is left alone; a demo route's query (`#/search?q=polo`, `#/p/x?color=navy`) is
 * kept. Written once here and evaluated by the tests, so what is tested is exactly what ships.
 */
export const HASH_SCRIPT_BODY =
  "try{var h=location.hash;if(h.indexOf('#/')===0){h=h.slice(1);var q='',i=h.indexOf('?');if(i>=0){q=h.slice(i);h=h.slice(0,i)}" +
  "try{h=decodeURIComponent(h)}catch(e){}h=h.replace(/\\/+$/,'')||'/';var to=null;" +
  "for(var k=0;k<R.length&&to===null;k++){var m=new RegExp(R[k].re).exec(h);if(m){to=R[k].to.replace(/\\$1/g,m[1]===undefined?'':encodeURIComponent(m[1]).replace(/%2F/g,'/'))}}" +
  "if(to===null)to=h;if(!/^\\/(?![\\/\\\\])/.test(to))return;if(/^\\/bn(\\/|$)/.test(location.pathname)&&to.indexOf('/admin')!==0)to='/bn'+(to==='/'?'':to);" +
  "location.replace(to+q)}}catch(e){}";

/** The inline script for one shop (the rules as JSON; `<` escaped so the data can never close the script tag). */
export function hashScript(rules: readonly HashRule[]): string {
  return `(function(R){${HASH_SCRIPT_BODY}})(${JSON.stringify(rules).replace(/</g, '\\u003c')});`;
}
