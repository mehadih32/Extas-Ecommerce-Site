// PR 414 follow-up (CN-013 go-live gate phase 2) — the gate-orders oracle: the shop's own side of the go-live test-order
// run, in the live version's migrate image on the server (infra/deploy/gate-orders.sh mounts tools/gate-orders at
// /repo/apps/web/gate-orders, read only, so the @extas packages resolve; .github/workflows/gate-orders.yml starts it by hand).
//   tsx oracle.ts --serve <port>      answers the browser run (tools/gate-orders/shop.mjs) on a private network of this
//                                     run only: POST /<action> with a JSON body and the run's bearer token
//   tsx oracle.ts --close-run --out <f> the shell's trap: closes this run's mock-payment grant and puts cash on delivery
//                                     back when the run had switched it on (safe twice; on a failure or a signal too),
//                                     and writes how the grant and cash on delivery stand (the report's "Safety net")
//   tsx oracle.ts --close-run --earlier --out <f>  the start of every run and the workflow's last step: closes what
//                                     earlier runs left open and puts cash on delivery back from their records (live
//                                     run 2, 1 Nov)
//   tsx oracle.ts --cleanup --out <f> the safety net: cancels every open GATE TEST order, archives the test products,
//                                     writes the clean-up's result to <f> (the shell runs it when the browser run ended
//                                     without one)
// It reads DATABASE_URL (the shop's database), GATE_STORE_ID (default: the mother store), GATE_RUN_ID and
// GATE_ORACLE_TOKEN (a random value of this run, from a root-only temporary file). It prints action names and counts
// only, never a customer's details, a code or a token. Every connection is its mock (deps.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { disconnectPrisma, getPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { Oracle, type TestData } from './actions';
import { gateDeps } from './deps';

type Json = Record<string, unknown>;
const MAX_BODY = 64 * 1024;

const log = (line: string) => console.log(`[gate-oracle ${new Date().toISOString().slice(11, 19)}] ${line}`);
const errLine = (e: unknown) => {
  const code = (e as { code?: unknown })?.code;
  return `${typeof code === 'string' ? `${code}: ` : ''}${e instanceof Error ? e.message : String(e)}`.split('\n')[0]!.slice(0, 300);
};

function readBody(req: IncomingMessage): Promise<Json> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on('end', () => {
      try {
        const v: unknown = parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {};
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
      } catch {
        reject(new Error('not JSON'));
      }
    });
    req.on('error', reject);
  });
}

const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > 200) throw new Error(`${what} is missing`);
  return v.trim();
};
const strs = (v: unknown, what: string): string[] => {
  if (!Array.isArray(v) || v.length > 500) throw new Error(`${what} is missing`);
  return v.map((x) => str(x, what));
};

/** The actions of the browser run, by name. */
function actions(o: Oracle): Record<string, (b: Json) => Promise<unknown>> {
  return {
    health: async () => ({ ok: true }),
    // read only: the facts of the host guard, the live providers and the owner's switches (nothing is written before
    // the browser run's guard has passed)
    facts: async () => ({ facts: await o.facts(), switches: await o.switches() }),
    // after the guard: an earlier run's open test orders are cancelled and its grant closed (cash on delivery put back
    // when it had changed it); the products only when the run places orders
    prepare: async (b) => {
      const earlier = await o.closeRun(true);
      const leftovers = await o.cleanUp(false);
      const setUp = b.setUp === true ? await o.setUp() : null;
      return { leftovers, earlierRuns: earlier, setUp };
    },
    // the run's own mock-payment grant on the preview host the shell names (never a host the browser sends)
    openRun: () => o.openRun(String(process.env.GATE_PREVIEW_HOST ?? '')),
    closeRun: () => o.closeRun(),
    order: (b) => o.order(str(b.number, 'number')),
    ordersOf: (b) => o.ordersOf(str(b.phone, 'phone'), str(b.since, 'since')),
    stock: (b) => o.stock(strs(b.variantIds, 'variantIds')),
    setStock: (b) => o.setStock(str(b.variantId, 'variantId'), Math.max(0, Math.min(1000, Math.floor(Number(b.qty) || 0)))),
    book: (b) => o.book(str(b.number, 'number')),
    check1: (b) => o.check1(str(b.number, 'number')),
    check4: (b) => o.check4(str(b.number, 'number'), str(b.variantId, 'variantId')),
    check21: (b) => o.check21(str(b.number, 'number'), str(b.phone, 'phone'), str(b.since, 'since')),
    check23: (b) => o.check23(str(b.number, 'number')),
    check24: (b) => o.check24(str(b.number, 'number')),
    otp: (b) => o.otp(str(b.phone, 'phone')),
    sales: (b) => o.sales(str(b.since, 'since'), strs(b.numbers, 'numbers')),
    cancel: async (b) => ({ outcome: await o.cancel(str(b.number, 'number'), str(b.note, 'note')) }),
    cleanup: () => o.cleanUp(true),
  };
}

function sameToken(got: string | undefined, want: string): boolean {
  const a = Buffer.from(String(got ?? ''));
  const b = Buffer.from(`Bearer ${want}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

function serve(o: Oracle, port: number, token: string): void {
  const table = actions(o);
  // one action at a time: the browser run is sequential, and a race scenario's two shoppers never need the oracle at once
  let queue: Promise<unknown> = Promise.resolve();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const name = (req.url ?? '').replace(/^\/+/, '').split('?')[0] ?? '';
    if (req.method !== 'POST' || !sameToken(req.headers.authorization, token)) return send(403, { ok: false, error: 'refused' });
    const fn = table[name];
    if (!fn) return send(404, { ok: false, error: 'no such action' });
    queue = queue.then(async () => {
      try {
        const result = await fn(await readBody(req));
        log(`${name}: ok`);
        send(200, { ok: true, result });
      } catch (e) {
        log(`${name}: ${errLine(e)}`);
        send(200, { ok: false, error: errLine(e) });
      }
    });
  });
  server.listen(port, '0.0.0.0', () => log(`listening on ${port}`));
  const stop = () => {
    server.close();
    void disconnectPrisma().finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

async function main(argv: string[]): Promise<number> {
  const at = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (!process.env.DATABASE_URL) {
    console.error('gate oracle: DATABASE_URL is not set');
    return 2;
  }
  const storeId = Number(process.env.GATE_STORE_ID || MOTHER_STORE_ID);
  if (!Number.isInteger(storeId) || storeId < 1) {
    console.error('gate oracle: GATE_STORE_ID is not a store id');
    return 2;
  }
  const runId = String(process.env.GATE_RUN_ID || new Date().toISOString().replace(/\D/g, '').slice(0, 12)).replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) || 'run';
  const data = JSON.parse(readFileSync(new URL('../data/test-data.json', import.meta.url), 'utf8')) as TestData;
  const o = new Oracle(gateDeps(getPrisma(), storeId), data, runId);
  if (argv.includes('--close-run')) {
    const out = at('--out');
    try {
      // --earlier (the start of a run, and the workflow's last step): what earlier runs left; else this run's own grant,
      // then how it stands (closed now or before, by the browser run's clean-up or the safety net) for the report
      if (argv.includes('--earlier')) {
        const r = await o.earlier();
        if (out) writeFileSync(out, `${JSON.stringify(r, null, 2)}\n`);
        log(`earlier runs: ${String(r.closed)} grant(s) closed, cash on delivery put back ${String(r.codRestored)} time(s)${r.ok ? '' : ' (not complete)'}`);
        return r.ok ? 0 : 1;
      }
      const r = await o.closeRun();
      const state = await o.runState();
      if (out) writeFileSync(out, `${JSON.stringify({ ...r, state }, null, 2)}\n`);
      log(`close-run: ${String(r.closed)} grant(s) closed, cash on delivery put back ${String(r.codRestored)} time(s); the run's grant: ${state.grant}${r.ok ? '' : ' (not complete)'}`);
      return r.ok ? 0 : 1;
    } finally {
      await disconnectPrisma();
    }
  }
  if (argv.includes('--cleanup')) {
    const out = at('--out');
    try {
      const r = await o.cleanUp(true);
      if (out) writeFileSync(out, `${JSON.stringify(r, null, 2)}\n`);
      log(`clean-up: ${String(r.cancelled)} cancelled, ${String(r.productsArchived)} products archived${r.ok ? '' : ' (not complete)'}`);
      return r.ok ? 0 : 1;
    } finally {
      await disconnectPrisma();
    }
  }
  const port = Number(at('--serve'));
  const token = process.env.GATE_ORACLE_TOKEN ?? '';
  if (!Number.isInteger(port) || port < 1 || token.length < 32) {
    console.error('usage: oracle.ts --serve <port> (GATE_ORACLE_TOKEN of 32+ characters) | --cleanup --out <file> | --close-run [--earlier] --out <file>');
    return 2;
  }
  serve(o, port, token);
  return -1;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (e: unknown) => {
    console.error(`gate oracle: ${errLine(e)}`);
    process.exit(1);
  },
);
