// PR 414 follow-up (CN-013 go-live gate phase 2; live run 1 Nov) — the browser half of a gate run's mock-payment grant,
// shared by tools/gate-orders/shop.mjs and tools/gate-c360/run.mjs. Pure. The shop side (lib/test-shop.ts openRun)
// keeps only the SHA-256 of the run's random token; the gate's own browser carries the token in one cookie that the
// shop never sets (apps/web/src/lib/shop/gate-run.ts reads it), so no real visitor ever pays on the practice gateway.

/** The cookie the gate's own browser carries (apps/web/src/lib/shop/gate-run.ts GATE_RUN_COOKIE). */
export const GATE_RUN_COOKIE = "extas_gate_run";

/** The SKIP reason of a scenario or step that needs cash on delivery while the owner keeps it off. */
export const COD_OFF = "COD is off (owner's setting)";

const RUN = /^[A-Za-z0-9-]{1,24}$/;
const TOKEN = /^[a-f0-9]{64}$/;

/**
 * The run's cookie for a browser context on `base` (https on the preview host; http only on a developer's loopback), or
 * null when the run has no token. HttpOnly: the shop's own scripts never read it.
 */
export function runCookie(base, runId, token) {
  if (!RUN.test(String(runId ?? "")) || !TOKEN.test(String(token ?? ""))) return null;
  let u;
  try {
    u = new URL(String(base));
  } catch {
    return null;
  }
  return { name: GATE_RUN_COOKIE, value: `${runId}.${token}`, domain: u.hostname, path: "/", httpOnly: true, secure: u.protocol === "https:", sameSite: "Lax", expires: -1 };
}

/**
 * How the run pays. `cod`: cash on delivery is on now (the owner's switch, or the run's `allow_cod`); `mobileBkash`: the
 * checkout offers bKash; `testPayments`: the owner's test payments are on; `grant`: the run's own grant opened (its
 * answer: `{ open, why }`); `prepaidBlock`: why a live payment connection forbids paying ahead (null: none).
 * Returns `{ pay: "cod" | "bkash" | null, canPrepay: null | why not, why: null | why nothing can be paid }`.
 */
export function payWay({ cod, mobileBkash, testPayments, grant, prepaidBlock = null }) {
  const pageOpen = testPayments === true || grant?.open === true;
  const canPrepay =
    prepaidBlock ??
    (!mobileBkash
      ? "bKash is not offered at the checkout (Payments › mobile wallets)"
      : !pageOpen
        ? `the mock bKash page is closed: the owner's test payments are off and the run's own grant did not open (${grant?.why ?? "no grant"})`
        : null);
  const pay = cod ? "cod" : !canPrepay ? "bkash" : null;
  return { pay, canPrepay, why: pay ? null : `no way to pay that the run can use on the mocks: ${COD_OFF}, and ${canPrepay}` };
}
