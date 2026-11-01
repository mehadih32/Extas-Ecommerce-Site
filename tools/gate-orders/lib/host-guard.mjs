// PR 414 follow-up (CN-013 go-live gate phase 2) — the host guard of the gate runs that place test orders. Pure. A run
// places real orders, so it refuses to start anywhere but the preview host: the host it is pointed at must be the
// preview host of the server's settings (EXTAS_STAGING_HOST in infra/config/server.conf), the same as the shop's own
// saved preview host when one is saved (`system.stagingHost`), and never one of the hosts the shop sells on (the extra
// hosts of server.conf, the store's own domains). No host is written in this file: every one comes from settings.

const HOST = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** A host name in its plain form (lower case, no scheme, port, path or trailing dot), or '' when it is not one. */
export function normHost(h) {
  let s = String(h ?? "").trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  return HOST.test(s) || s === "localhost" ? s : "";
}

/** The host names of a space- or comma-separated list (server.conf's EXTAS_EXTRA_HOSTS), plain, without blanks. */
export const hostList = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/)).map(normHost).filter(Boolean);

/**
 * Whether a run may place test orders on `target`.
 *   target  the host the run is pointed at (the shop address it opens)
 *   preview the preview host of the server's settings (server.conf)
 *   saved   the shop's saved preview host (`system.stagingHost`), or null when none is saved
 *   live    the hosts the shop sells on (server.conf's extra hosts, the store's domains)
 * Returns { ok, host, why } — `why` names the rule that refused it (never a secret).
 */
export function hostGuard({ target, preview, saved = null, live = [] }) {
  const host = normHost(target);
  const want = normHost(preview);
  if (!want) return { ok: false, host, why: "no preview host in the server's settings (EXTAS_STAGING_HOST)" };
  if (!host) return { ok: false, host, why: "the run has no valid host to open" };
  if (host !== want) return { ok: false, host, why: `the run is pointed at ${host}, not the preview host` };
  const s = saved === null || saved === undefined || saved === "" ? null : normHost(saved);
  if (saved && !s) return { ok: false, host, why: "the shop's saved preview host is not a host name" };
  if (s && s !== host) return { ok: false, host, why: "the shop's saved preview host is another host" };
  if (hostList(live).includes(host)) return { ok: false, host, why: "this host is one the shop sells on, not the preview" };
  return { ok: true, host, why: null };
}

const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

/**
 * The shop address a run opens: https on the guarded host, nothing else (a BASE with a path, port or user is refused).
 * `loopback` (a developer's local proof only, never set on the server): plain http with a port on 127.0.0.1/localhost.
 */
export function baseOf(base, host, { loopback = false } = {}) {
  let u;
  try {
    u = new URL(String(base));
  } catch {
    return null;
  }
  const h = normHost(host);
  if (!h || normHost(u.hostname) !== h || u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) return null;
  if (loopback && LOOPBACK.has(h) && (u.protocol === "http:" || u.protocol === "https:")) return `${u.protocol}//${h}${u.port ? `:${u.port}` : ""}`;
  if (u.protocol !== "https:" || u.port) return null;
  return `https://${h}`;
}
