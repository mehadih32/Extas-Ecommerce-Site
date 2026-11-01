// PR 414 follow-up (CN-013 go-live gate phase 2) — the browser run's client of the gate-orders oracle
// (tools/gate-orders/server/oracle.ts): POST /<action> with the run's bearer token on the run's own private network.
// A refused or failed action throws with the oracle's one-line reason (never a token or a customer's details).

/** `url` the oracle's address (http://<container>:<port>), `token` the run's random token. */
export function oracleClient(url, token, fetchImpl = globalThis.fetch) {
  const base = String(url ?? "").replace(/\/+$/, "");
  if (!base || !token) throw new Error("the oracle's address and token are needed (GATE_ORACLE_URL, GATE_ORACLE_TOKEN)");
  async function call(action, body = {}, { timeoutMs = 120_000 } = {}) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetchImpl(`${base}/${action}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const j = await r.json().catch(() => null);
      if (!j || j.ok !== true) throw new Error(`oracle ${action}: ${j?.error ?? `answer ${r.status}`}`);
      return j.result;
    } finally {
      clearTimeout(t);
    }
  }
  /** Waits until the oracle answers (it starts in its own container next to this one). */
  async function ready({ tries = 60, waitMs = 1000 } = {}) {
    for (let i = 0; i < tries; i++) {
      try {
        await call("health", {}, { timeoutMs: 3000 });
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    return false;
  }
  return { call, ready };
}
