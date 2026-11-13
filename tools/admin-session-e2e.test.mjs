// Tests for tools/admin-session-e2e.mjs (run with the web tests). The browser journey itself runs in CI's web job
// (tools/admin-session-e2e.sh) on the job's own build and a throwaway database.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { logoutLabels, logoutName, onAdmin, onLogin, scrub, sessionCookies, withDeadline } from "./admin-session-e2e.mjs";

it("tells the sign-in page from a signed-in admin page", () => {
  expect(onLogin("http://localhost:3200/admin/login")).toBe(true);
  expect(onLogin("http://localhost:3200/admin/login?next=%2Fadmin%2Fstock")).toBe(true);
  expect(onLogin("http://localhost:3200/admin/products")).toBe(false);
  expect(onAdmin("http://localhost:3200/admin/login")).toBe(false);
  expect(onAdmin("http://localhost:3200/admin/products")).toBe(true);
  expect(onAdmin("http://localhost:3200/admin")).toBe(true);
  expect(onAdmin("http://localhost:3200/administrator")).toBe(false);
  expect(onAdmin("http://localhost:3200/status")).toBe(false);
  expect(onAdmin("not a url")).toBe(false);
});

it("finds the log-out label in every admin language, and matches only that button", () => {
  const labels = logoutLabels();
  expect(labels.length).toBeGreaterThanOrEqual(2); // English and Bengali at least
  const name = logoutName(labels);
  for (const l of labels) expect(name.test(` ${l} `)).toBe(true);
  expect(name.test("Products")).toBe(false);
  expect(name.test(`${labels[0]} everywhere`)).toBe(false);
});

it("reads labels from the messages files only, and refuses when there is none", () => {
  const dir = mkdtempSync(join(tmpdir(), "admin-msgs-"));
  writeFileSync(join(dir, "admin.en.json"), JSON.stringify({ frame: { logout: "Sign (out)" } }));
  writeFileSync(join(dir, "admin-products.en.json"), JSON.stringify({ frame: { logout: "not this one" } }));
  writeFileSync(join(dir, "admin.bn.json"), JSON.stringify({ frame: {} }));
  expect(logoutLabels(dir)).toEqual(["Sign (out)"]);
  expect(logoutName(["Sign (out)"]).test("Sign (out)")).toBe(true); // brackets are escaped, not a group
  expect(() => logoutName([])).toThrow(/no frame.logout/);
});

it("keeps only the admin session cookies", () => {
  const cookies = [{ name: "__Host-admin_sid" }, { name: "admin_lang" }, { name: "__Host-admin_2fa" }, { name: "extas_preview" }];
  expect(sessionCookies(cookies).map((c) => c.name)).toEqual(["__Host-admin_sid", "__Host-admin_2fa"]);
});

it("never prints a secret or an e-mail", () => {
  expect(scrub("bad pw S3cret-pass for someone@example.test", ["S3cret-pass", ""])).toBe("bad pw <hidden> for <e-mail>");
});

// PR 585 follow-up: a `page.evaluate()` in this file's own `run()` has no `timeout` of its own (unlike every
// Playwright *wait* here), so a browser API it calls (Cache Storage, a service worker's `ready`) that never settles
// used to hang the whole CI job for its full budget with nothing printed — this is what actually happened, before
// the admin even loaded. `withDeadline` is the fix: it never leaves a caller stuck past `ms`.
it("resolves to the promise's own value when it settles in time", async () => {
  let fired = false;
  const result = await withDeadline(Promise.resolve("done"), 50, () => (fired = true));
  expect(result).toBe("done");
  expect(fired).toBe(false);
});

it("times out — and only then — a promise that never settles, calling onTimeout once", async () => {
  let calls = 0;
  const never = new Promise(() => {}); // a browser API that hangs forever, exactly like the real bug
  const result = await withDeadline(never, 20, (ms) => {
    calls += 1;
    expect(ms).toBe(20);
  });
  expect(result).toBe(null);
  expect(calls).toBe(1);
});

it("returns the given fallback on timeout instead of null", async () => {
  const never = new Promise(() => {});
  const result = await withDeadline(never, 20, () => {}, { ok: false });
  expect(result).toEqual({ ok: false });
});

it("still rejects when the promise itself rejects before the deadline", async () => {
  await expect(
    withDeadline(Promise.reject(new Error("boom")), 50, () => {
      throw new Error("must not time out — the promise rejected on its own first");
    }),
  ).rejects.toThrow("boom");
});
