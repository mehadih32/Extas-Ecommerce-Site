// S11 · PR 236 — the language-pair check of the smoke test (Blueprint C12.1, GOOGLE-TRAFFIC-PLAN §1.2: the pairs are in
// the HTML head so a plain fetch can test them on every page). A shop page that names a pair must name exactly `en`
// and `bn` (and `x-default` = the English one), all absolute on one address, its own canonical among them; its twin
// must answer 200 and name the same pair back (a pair that is not returned is ignored by Google). A page that names no
// pair is not checked (its Bengali twin is not ready yet). The twin is always fetched on the host under test by its
// path, never at the address the tag names: before go-live day that address is the old shop, which is never touched.

/** Decodes the few entities a tag attribute can hold. */
const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** The attributes of one tag, names in lower case. */
function attrsOf(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g)) out[m[1].toLowerCase()] = unescape(m[2]);
  return out;
}

/** The page's language, its canonical address and the pairs it names, from its HTML. */
export function headLinks(html) {
  const lang = attrsOf(/<html\b[^>]*>/i.exec(html)?.[0] ?? "").lang ?? null;
  let canonical = null;
  const alternates = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    const rel = (a.rel ?? "").toLowerCase();
    if (rel === "canonical" && canonical === null) canonical = a.href ?? null;
    if (rel === "alternate" && a.hreflang) alternates.push({ code: a.hreflang, href: a.href ?? "" });
  }
  return { lang, canonical, alternates };
}

const absolute = (href) => {
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
};
const pairKey = (alternates) =>
  alternates
    .map((a) => `${a.code}=${a.href}`)
    .sort()
    .join(" ");

/**
 * The problems of one page's pair. `own`: headLinks of the page; `twin`: the twin's answer ({ status, head }), or null
 * when it was not asked for. Empty = fine (or no pair named).
 */
export function pairProblems(path, own, twin) {
  const p = (what) => `${path}: hreflang ${what}`;
  if (!own.alternates.length) return [];
  const out = [];
  const codes = own.alternates.map((a) => a.code);
  const by = Object.fromEntries(own.alternates.map((a) => [a.code, a.href]));
  for (const c of ["en", "bn"]) if (!codes.includes(c)) out.push(p(`names no "${c}" page`));
  const odd = codes.filter((c) => !["en", "bn", "x-default"].includes(c));
  if (odd.length) out.push(p(`names an unknown language (${odd.join(", ")})`));
  if (new Set(codes).size !== codes.length) out.push(p("names a language twice"));
  const urls = own.alternates.map((a) => absolute(a.href));
  if (urls.some((u) => !u)) out.push(p("has an address that is not absolute"));
  else if (new Set(urls.map((u) => u.origin)).size > 1) out.push(p("names pages on more than one address"));
  if (by["x-default"] !== undefined && by["x-default"] !== by.en) out.push(p("x-default is not the English page"));
  if (own.lang && by[own.lang] !== undefined && own.canonical !== by[own.lang]) out.push(p(`does not name the page itself (canonical ${own.canonical ?? "missing"})`));
  if (twin) {
    if (twin.status !== 200) out.push(p(`twin answered ${twin.status || twin.error || "nothing"}`));
    else if (pairKey(twin.head?.alternates ?? []) !== pairKey(own.alternates)) out.push(p("twin does not name the same pair back"));
  }
  return out;
}

/** Checks the pair of the page open in `page` (loaded from `base` + `path`); fetches its twin on `base`. */
export async function pagePairProblems(page, base, path) {
  const own = headLinks(await page.content());
  if (!own.alternates.length) return [];
  const other = own.lang === "bn" ? "en" : "bn";
  const u = absolute(own.alternates.find((a) => a.code === other)?.href ?? "");
  let twin = null;
  if (u) {
    try {
      const r = await page.request.get(`${base}${u.pathname}${u.search}`, { failOnStatusCode: false });
      twin = { status: r.status(), head: headLinks(await r.text()) };
    } catch (e) {
      twin = { status: 0, head: null, error: e instanceof Error ? e.message.split("\n")[0] : String(e) };
    }
  }
  return pairProblems(path, own, twin);
}
