// PR 104 — a call the page makes and does not wait for (a combo page was opened, a full set of colours picked, the size
// a shopper took). Its answer is still read, then dropped: an answer nobody reads keeps the request open in the
// browser's network log, so Lighthouse (and the smoke test's "page is quiet") waited about a minute on every combo page.
// Browser only; a failure is ignored, the shopper is never held up.

/** Sends one fire-and-forget request; `keepalive` lets it finish when the page is being left. */
export function beacon(url: string, init: RequestInit): void {
  try {
    void fetch(url, { keepalive: true, ...init })
      .then((r) => r.text())
      .catch(() => null);
  } catch {
    /* the count misses one; nothing else depends on it */
  }
}
