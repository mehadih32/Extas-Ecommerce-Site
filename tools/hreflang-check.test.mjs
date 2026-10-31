// S11 · PR 236 — the smoke test's language-pair check: a complete, returned pair passes; a missing language, a relative
// or foreign address, a wrong x-default, a page that does not name itself, a twin that is not there or does not name
// the pair back each fail with words; a page with no pair is not checked.
import { describe, expect, it } from "vitest";
import { headLinks, pairProblems } from "./hreflang-check.mjs";

const O = "https://shop.example.test";
const head = (lang, canonical, pairs) =>
  `<!DOCTYPE html><html lang="${lang}" translate="no"><head><meta charSet="utf-8"/><link rel="canonical" href="${canonical}"/>${pairs
    .map(([c, h]) => `<link rel="alternate" hrefLang="${c}" href="${h}"/>`)
    .join("")}</head><body></body></html>`;
const PAIR = [
  ["en", `${O}/p/polo`],
  ["bn", `${O}/bn/p/polo`],
  ["x-default", `${O}/p/polo`],
];
const en = headLinks(head("en", `${O}/p/polo`, PAIR));
const bnTwin = { status: 200, head: headLinks(head("bn", `${O}/bn/p/polo`, PAIR)) };

describe("hreflang check", () => {
  it("reads the language, the canonical and the pairs (any attribute case, escaped addresses)", () => {
    expect(en).toEqual({ lang: "en", canonical: `${O}/p/polo`, alternates: PAIR.map(([code, href]) => ({ code, href })) });
    expect(headLinks(`<html><link hreflang="bn" rel="alternate" href="${O}/bn/c?a=1&amp;b=2">`).alternates).toEqual([{ code: "bn", href: `${O}/bn/c?a=1&b=2` }]);
    expect(headLinks("<html><body>no head</body></html>")).toEqual({ lang: null, canonical: null, alternates: [] });
  });

  it("a complete pair named back passes; a page without a pair is not checked", () => {
    expect(pairProblems("/p/polo", en, bnTwin)).toEqual([]);
    expect(pairProblems("/bn/p/polo", bnTwin.head, { status: 200, head: en })).toEqual([]);
    expect(pairProblems("/", headLinks(head("en", `${O}/`, [])), null)).toEqual([]);
    expect(pairProblems("/p/polo", headLinks(head("en", `${O}/p/polo`, PAIR.slice(0, 2))), { status: 200, head: headLinks(head("bn", `${O}/bn/p/polo`, PAIR.slice(0, 2))) })).toEqual([]);
  });

  it("names each broken rule", () => {
    const one = (pairs, canonical = `${O}/p/polo`) => pairProblems("/p/polo", headLinks(head("en", canonical, pairs)), null);
    expect(one([PAIR[0]])).toEqual(['/p/polo: hreflang names no "bn" page']);
    expect(one([...PAIR, ["en-BD", `${O}/p/polo`]])).toEqual(["/p/polo: hreflang names an unknown language (en-BD)"]);
    expect(one([...PAIR, ["bn", `${O}/bn/p/polo`]])).toEqual(["/p/polo: hreflang names a language twice"]);
    expect(one([PAIR[0], ["bn", "/bn/p/polo"]])).toEqual(["/p/polo: hreflang has an address that is not absolute"]);
    expect(one([PAIR[0], ["bn", "https://elsewhere.test/bn/p/polo"]])).toEqual(["/p/polo: hreflang names pages on more than one address"]);
    expect(one([PAIR[0], PAIR[1], ["x-default", `${O}/bn/p/polo`]])).toEqual(["/p/polo: hreflang x-default is not the English page"]);
    expect(one(PAIR, `${O}/p/other`)).toEqual([`/p/polo: hreflang does not name the page itself (canonical ${O}/p/other)`]);
  });

  it("the twin must answer 200 and name the same pair back", () => {
    expect(pairProblems("/p/polo", en, { status: 404, head: null })).toEqual(["/p/polo: hreflang twin answered 404"]);
    expect(pairProblems("/p/polo", en, { status: 0, head: null, error: "timeout" })).toEqual(["/p/polo: hreflang twin answered timeout"]);
    expect(pairProblems("/p/polo", en, { status: 200, head: headLinks(head("bn", `${O}/bn/p/polo`, [])) })).toEqual(["/p/polo: hreflang twin does not name the same pair back"]);
  });
});
