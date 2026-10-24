// @extas/cache — the four-layer cache and its invalidation (register PR 602, server spec §5, Blueprint A3.4).
// What it is for:
//   - events.ts: the code that changes something says so once (`emitCacheEvent`); no dependencies, so the catalogue,
//     the stock and the settings can say it without knowing who keeps a copy;
//   - policy.ts: which shop address may be kept by the server or Cloudflare and for how long (the bag, the checkout,
//     the account, the admin and the API never), and the headers the proxy answers with;
//   - rules.ts: what one change clears (a price or stock change: that product, its categories and Cloudflare at once;
//     a setting: every page; a new product: its categories and the sitemap);
//   - store.ts: the server's page cache, with tags, hit counts and one load per page at a time;
//   - bus.ts: the same clear in every process over Redis, and the shared hit counts;
//   - service.ts: the purge itself, the Cache page's status, saving the times and "Clear all" (audited);
//   - runtime.ts: one process wired (the web app's instrumentation hook, the worker's main).
// The CDN purge is the Cloudflare adapter in @extas/adapters (the mock until the owner's token passes its test).
export * from "./events";
export * from "./policy";
export * from "./rules";
export * from "./store";
export * from "./bus";
export * from "./service";
export * from "./runtime";
