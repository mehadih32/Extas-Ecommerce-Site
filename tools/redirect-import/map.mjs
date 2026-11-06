// S19 · PR 653 (CN-036) — the old shop's public sitemap → the WordPress map of the redirect table (PR 235 / 587).
// The pure half: read the sitemap files (fetched by infra/deploy/redirect-import.sh with GET only), keep the page
// addresses of the old site's own host, and match each one to its new twin:
//   - a product (`/product/<slug>`) → the product with the same slug, at the shop's product prefix;
//   - a product category (`/product-category/<parent>/<slug>`) → the category with the same slug, else its parent's;
//   - a product tag (`/product-tag/<slug>`) → the category with the same slug;
//   - the WooCommerce / CartFlows pages (shop, cart, checkout steps, my account, thank you) → the shop's own page;
//   - anything else, or a product, category or tag without a twin → the nearest category (shared words, at least
//     `seo.notFound.suggestMatchAtLeast` per cent, as the 404 report suggests) or the home page, and LISTED for the
//     owner (never a 404 plan).
// An address that is already a page of the new shop (the home page, a live product or category, the checkout) needs no
// row. The writer (server/import.ts, in the migrate image) applies the rows with the redirect manager's own rules.

/** Words that say nothing about which page it was (as apps/web/src/lib/seo/suggest.ts, plus the old shop's extras). */
const NOISE = new Set(["p", "product", "products", "shop", "store", "collections", "collection", "category", "product-category", "tag", "html", "php", "www", "bn", "en", "the", "and", "of", "for", "color", "colour", "free", "home", "delivery", "pcs"]);

/**
 * First segments of the shop's own pages, which an old link may never take over (mirrors `isOwnAddress` in
 * apps/web/src/lib/seo/suggest.ts, built from the routing table: bag, checkout, account, search, combos, bulk-order,
 * pay, journal, and the Bengali twin `/bn`). The test keeps the two lists equal.
 */
export const OWN_FAMILIES = ["bag", "checkout", "account", "search", "combos", "bulk-order", "pay", "journal", "bn"];

/** The shop's own pages an old WooCommerce / CartFlows page lands on (the routing table's paths). */
export const SHOP_PAGES = { home: "/", bag: "/bag", checkout: "/checkout", login: "/account/login", combos: "/combos", category: (slug) => `/collections/${slug}` };

/** The redirect table's key of an address (as `redirectKey` in apps/web/src/lib/seo/redirect-table.ts). */
export function redirectKey(path) {
  let p = String(path ?? "").trim();
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep as typed */
  }
  p = p.replace(/^https?:\/\/[^/]+/i, "").replace(/^#/, "").split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/^[/\\]+/, "/");
  p = p.replace(/\/+$/, "");
  return (p || "/").toLowerCase();
}

/** Every <loc> of a sitemap or a sitemap index, unescaped. */
export function sitemapLocs(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
  );
}

/** A sitemap file of the old host that may be fetched: https, the same host (or www.), a `…sitemap….xml` file name. */
export function isSitemapFile(loc, host) {
  let u;
  try {
    u = new URL(loc);
  } catch {
    return false;
  }
  const h = String(host).toLowerCase().replace(/^www\./, "");
  return u.protocol === "https:" && u.hostname.replace(/^www\./, "") === h && !u.search && /^\/[a-z0-9._-]*sitemap[a-z0-9._-]*\.xml$/i.test(u.pathname);
}

/** The page addresses of the old host in the fetched sitemap files (sitemap files themselves left out), each once. */
export function oldAddresses(xmlFiles, host) {
  const h = String(host).toLowerCase().replace(/^www\./, "");
  const out = [];
  const seen = new Set();
  for (const xml of xmlFiles) {
    for (const loc of sitemapLocs(xml)) {
      let u;
      try {
        u = new URL(loc);
      } catch {
        continue;
      }
      if (u.hostname.replace(/^www\./, "") !== h || isSitemapFile(loc, host)) continue;
      const key = redirectKey(u.pathname);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url: loc, path: key });
    }
  }
  return out;
}

/** One word's plain form: "t-shirt", "t shirt" and "tshirts" are one word; a plural's "s" dropped ("trousers"). */
const stem = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** The words of an address: lower case, split on anything that is not a letter or a digit, noise dropped, stemmed. */
export function wordsOf(path) {
  return redirectKey(path)
    .replace(/(^|[^\p{L}\p{N}])t[-_ ]?(shirts?)(?=$|[^\p{L}\p{N}])/gu, "$1t$2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !NOISE.has(w))
    .map(stem);
}

/** The candidate sharing the most words with `path` (at least `minPercent` of its words; ties: fewer own words). */
export function nearest(path, candidates, minPercent) {
  const asked = [...new Set(wordsOf(path))];
  if (asked.length === 0) return null;
  let best = null;
  for (const c of candidates) {
    const own = new Set(c.words ?? wordsOf(c.path));
    if (own.size === 0) continue;
    const shared = asked.filter((w) => own.has(w)).length;
    const percent = Math.round((shared / asked.length) * 100);
    const extra = own.size - shared;
    if (shared === 0 || percent < minPercent) continue;
    if (!best || percent > best.percent || (percent === best.percent && extra < best.extra)) best = { path: c.path, percent, extra };
  }
  return best ? { path: best.path, percent: best.percent } : null;
}

/** An address of the shop's own pages (an old link may never take one over). */
export function isOwnAddress(path) {
  const key = redirectKey(path);
  if (key === "/") return true;
  return OWN_FAMILIES.includes(key.split("/")[1] ?? "");
}

/** The product's address at the shop's prefix (as `productPath` in apps/web/src/lib/shop/home-model.ts). */
export function productPath(prefix, slug) {
  return `${String(prefix).replace(/\/+$/, "") || ""}/${encodeURIComponent(slug)}`;
}

/**
 * Each old address with its new page.
 *   catalog: { prefix, products: [slug], categories: [{ slug, words? (its names) }], combosHub: boolean, minPercent }
 * Row: { from, to, how, twin } — `to` null when no row is needed (`how` = "same": the address is a page of the new shop
 * already); `twin` false when it landed on the nearest category or the home page (listed for the owner).
 */
export function mapAddresses(addresses, catalog) {
  const products = new Set((catalog.products ?? []).map((s) => String(s).toLowerCase()));
  const cats = (catalog.categories ?? []).map((c) => ({ slug: String(c.slug).toLowerCase(), words: c.words }));
  const catSlugs = new Set(cats.map((c) => c.slug));
  const prefix = redirectKey(catalog.prefix ?? "/p");
  const minPercent = Number(catalog.minPercent); // `seo.notFound.suggestMatchAtLeast`, read by the writer
  if (!Number.isFinite(minPercent)) throw new Error("catalog.minPercent is required (seo.notFound.suggestMatchAtLeast)");
  const candidates = cats.map((c) => ({ path: SHOP_PAGES.category(c.slug), words: [...new Set([...wordsOf(c.slug), ...(c.words ?? []).flatMap((w) => wordsOf(w))])] }));
  if (catalog.combosHub) candidates.push({ path: SHOP_PAGES.combos, words: ["combo", "set"] });

  const live = (from) => {
    if (from === "/") return true;
    if (from.startsWith(`${prefix}/`) && products.has(from.slice(prefix.length + 1))) return true;
    const [, first, slug, extra] = from.split("/");
    if (first === SHOP_PAGES.category("x").split("/")[1] && slug && !extra && catSlugs.has(slug)) return true;
    return from === SHOP_PAGES.checkout || from === SHOP_PAGES.bag;
  };
  // A product, category or tag of the old shop is a list of clothes: any shared word finds its nearest category; any
  // other address needs the 404 report's share of its words (`seo.notFound.suggestMatchAtLeast`).
  const fallback = (from, catalogue = false) => {
    const n = nearest(from, candidates, catalogue ? 1 : minPercent);
    return n ? { to: n.path, how: "nearest category", twin: false, percent: n.percent } : { to: SHOP_PAGES.home, how: "home page", twin: false };
  };

  return addresses.map(({ path, url }) => {
    const from = redirectKey(path);
    const base = { from, url: url ?? null };
    if (live(from)) return { ...base, to: null, how: "same", twin: true };
    if (isOwnAddress(from)) return { ...base, to: null, how: "own page", twin: false };
    const seg = from.split("/").filter(Boolean);
    const [first, ...rest] = seg;
    if (first === "product" && rest.length === 1) {
      if (products.has(rest[0])) return { ...base, to: productPath(prefix, rest[0]), how: "product", twin: true };
      return { ...base, ...fallback(from, true) };
    }
    if (first === "product-category" && rest.length >= 1) {
      for (let i = rest.length - 1; i >= 0; i--) {
        if (catSlugs.has(rest[i])) return { ...base, to: SHOP_PAGES.category(rest[i]), how: i === rest.length - 1 ? "category" : "parent category", twin: true };
      }
      return { ...base, ...fallback(from, true) };
    }
    if (first === "product-tag" && rest.length === 1) {
      if (catSlugs.has(rest[0])) return { ...base, to: SHOP_PAGES.category(rest[0]), how: "category", twin: true };
      return { ...base, ...fallback(from, true) };
    }
    if (seg.length === 1 && first === "shop") return { ...base, to: SHOP_PAGES.home, how: "shop page", twin: true };
    if (seg.length === 1 && first === "cart") return { ...base, to: SHOP_PAGES.bag, how: "bag", twin: true };
    if (seg.length === 1 && first === "my-account") return { ...base, to: SHOP_PAGES.login, how: "account", twin: true };
    if (first === "step" && rest.length === 1 && /checkout/.test(rest[0])) return { ...base, to: SHOP_PAGES.bag, how: "checkout step", twin: true };
    if (first === "step" && rest.length === 1 && /thank-?you/.test(rest[0])) return { ...base, to: SHOP_PAGES.home, how: "thank-you step", twin: true };
    return { ...base, ...fallback(from) };
  });
}

/** The counts the report and the hand-back show. */
export function tally(rows) {
  const twins = rows.filter((r) => r.to && r.twin).length;
  const listed = rows.filter((r) => r.to && !r.twin).length;
  const same = rows.filter((r) => !r.to && r.how === "same").length;
  const own = rows.filter((r) => !r.to && r.how === "own page").length;
  return { addresses: rows.length, rows: twins + listed, twins, listed, same, own };
}

/** The report: a Bengali summary for the owner, then every address and where it goes. */
export function reportMarkdown(r) {
  const t = r.tally;
  const lines = [
    `# Old shop's addresses → new pages (PR 653)`,
    "",
    `- When: ${r.at ?? "—"} · version: ${r.sha || "—"} · old site: ${r.oldSite} (public sitemap only, GET) · mode: **${r.committed ? "written" : "dry run (nothing written)"}**`,
    "",
    `**সারকথা:** পুরনো সাইটের সাইটম্যাপে ${t.addresses}টা ঠিকানা। ${t.twins}টা নতুন সাইটের একই পাতায় যাবে, ${t.listed}টার হুবহু পাতা নেই — কাছের ক্যাটাগরি বা হোম পেজে যাবে (নিচে তালিকা, চাইলে Website › SEO › Redirects-এ বদলানো যায়), ${t.same}টা ঠিকানা নতুন সাইটে এমনিতেই খোলে। ${r.committed ? `${r.written}টা রিডাইরেক্ট লেখা হলো` : "কিছু লেখা হয়নি (শুধু মহড়া)"}; চালুর দিনে ম্যাপ চালু হবে। কোনো ঠিকানা ৪০৪-এ যাবে না।`,
    "",
    `- Addresses: **${t.addresses}** · redirect rows: **${t.rows}** (twin ${t.twins}, nearest or home ${t.listed}) · already a page: ${t.same} · own pages: ${t.own}`,
    r.committed ? `- Written: ${r.written} · unchanged: ${r.unchanged ?? 0} · older links repointed: ${r.repointed ?? 0}` : "- Nothing written (dry run).",
    `- The map forwards only while \`seo.redirects.wordpressMapLive\` is on (off until the go-live switch, PR 587).`,
    "",
    "## Without a twin (listed for the owner)",
    "",
    ...rows(r).filter((x) => x.to && !x.twin).map((x) => `- \`${x.from}\` → \`${x.to}\` (${x.how}${x.percent ? `, ${x.percent}% of its words` : ""})`),
    ...(rows(r).some((x) => x.to && !x.twin) ? [] : ["- none"]),
    "",
    "## Every address",
    "",
    "| Old address | New page | How |",
    "|---|---|---|",
    ...rows(r).map((x) => `| \`${x.from}\` | ${x.to ? `\`${x.to}\`` : "— (no row)"} | ${x.how}${x.twin ? "" : " · listed"} |`),
    "",
    ...(r.problems?.length ? ["## Problems", "", ...r.problems.map((p) => `- ${p}`), ""] : []),
  ];
  return `${lines.join("\n")}\n`;
}
const rows = (r) => r.rows ?? [];
