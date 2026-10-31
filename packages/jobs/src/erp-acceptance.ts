// CN-029 Phase 2 · PR 621 — the ERP v6 acceptance run against the demo ERP (a go-live gate), every night and before
// every release, on the server (.github/workflows/erp-acceptance.yml and deploy.yml, infra/deploy/erp-acceptance.sh).
// It runs only once the owner has typed the demo shop's key on Settings → ERP link (the vault, installation-wide,
// `ERP_ACCEPTANCE_DEMO_KEY`; never Git, chat or a log). Without the key it answers "waiting for the demo key", fails
// nothing and calls nobody. With it: the checks of @extas/adapters `runErpAcceptance` against
// `erp.acceptance.demoBaseUrl`, each call bounded by `erp.acceptance.timeoutSeconds`; the write checks only when
// `erp.acceptance.demoWrites` is on (off as it ships). The ERP's own actions cannot be driven there, so those checks are
// SKIP. The practice ERP runs the whole list in CI (packages/adapters/test/erp-acceptance.test.ts and the books drills).
// qa-gate B2: the vault is opened only when the demo key is set (its name is listed first: no value is read and no
// access is logged otherwise), and a run that cannot read the shop's database (it is down, or its tables are not the
// ones this version knows) is "not run" with the reason, never a failure: the practice ERP in CI is the hard gate.
// CN-033: the way the shop switches (`erp.switchOver.mode`, read for the installation: fresh-start as it ships) is
// passed on, so the switch-over reads the ERP does not build are "not built in the ERP", never "could not be reached".
import { acceptanceMarkdown, createErpHttpClient, ERP_ACCEPTANCE_DEMO_KEY, EXTAS_ERP_PROVIDER, runErpAcceptance, type AcceptanceReport } from '@extas/adapters';
import type { Vault } from '@extas/vault';

export interface DemoAcceptanceDeps {
  settings: { value(key: 'erp.acceptance.demoBaseUrl' | 'erp.acceptance.timeoutSeconds' | 'erp.acceptance.demoWrites' | 'erp.switchOver.mode'): Promise<unknown> };
  /** null when the server has no vault key (then there can be no demo key either). */
  vault: Pick<Vault, 'get' | 'list'> | null;
  runId: string;
  /** Tests pass the practice ERP's fetch. */
  fetch?: typeof fetch;
  now?: () => Date;
}

export type DemoAcceptanceOutcome =
  | { state: 'WAITING_FOR_KEY' }
  /** qa-gate B2: the shop's database could not be read (nothing was called, nothing failed). */
  | { state: 'NOT_RUN'; reason: string }
  | { state: 'RAN'; report: AcceptanceReport };

/** An error in one line for a log or a report (qa-gate N1): its code (a Prisma `P2022` …) and the first line that says
 *  something; never blank, never an address with a password in it. */
export function errorLine(e: unknown): string {
  const code = e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : null;
  const lines = (e instanceof Error ? e.message : String(e ?? '')).split('\n').map((l) => l.trim()).filter(Boolean);
  // Prisma's first line only names the call ("Invalid `prisma.x.findMany()` invocation in …", then the file and a code
  // frame); its last line says why.
  const why = (/^Invalid `.*` invocation/.test(lines[0] ?? '') ? lines[lines.length - 1] : lines[0]) ?? '';
  const text = [code, why].filter(Boolean).join(': ').replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, '$1…@');
  return (text || (e instanceof Error ? e.name : 'unknown error')).slice(0, 300); // hardcode-ok: a log line's length, not a business limit
}

/** The run against the demo ERP, "waiting for the demo key" (no call made) or "not run" (the database could not be read). */
export async function runDemoAcceptance(deps: DemoAcceptanceDeps): Promise<DemoAcceptanceOutcome> {
  let key: string | null = null;
  let baseUrl: unknown, timeoutSeconds: unknown, writes: unknown, mode: unknown;
  try {
    const set = deps.vault ? (await deps.vault.list({ storeId: null })).some((x) => x.name === ERP_ACCEPTANCE_DEMO_KEY && !x.revoked) : false;
    key = set && deps.vault ? await deps.vault.get(ERP_ACCEPTANCE_DEMO_KEY, { storeId: null }, { service: 'jobs:erp-acceptance', purpose: 'ERP acceptance against the demo ERP' }) : null;
    if (!key) return { state: 'WAITING_FOR_KEY' };
    [baseUrl, timeoutSeconds, writes, mode] = await Promise.all([deps.settings.value('erp.acceptance.demoBaseUrl'), deps.settings.value('erp.acceptance.timeoutSeconds'), deps.settings.value('erp.acceptance.demoWrites'), deps.settings.value('erp.switchOver.mode')]);
  } catch (e) {
    return { state: 'NOT_RUN', reason: `the shop's database could not be read: ${errorLine(e)}` };
  }
  const api = createErpHttpClient({ baseUrl: String(baseUrl), apiKey: key, provider: EXTAS_ERP_PROVIDER, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
  const report = await runErpAcceptance(api, { target: 'demo', runId: deps.runId, writes: writes === true, driver: null, timeoutMs: Number(timeoutSeconds) * 1000, now: deps.now, switchOver: mode === 'erp-list' ? 'erp-list' : 'fresh-start' });
  return { state: 'RAN', report };
}

/** The outcome as the report page (Markdown, a Bengali line first for the owner); never a key or an address with one. */
export function demoAcceptancePage(o: DemoAcceptanceOutcome, at: Date): string {
  if (o.state === 'NOT_RUN')
    return [
      '# ERP acceptance — demo ERP',
      '',
      '**সারকথা:** এবার ডেমো ERP-এর পরীক্ষা চালানো যায়নি (দোকানের ডেটাবেস পড়া যায়নি); কোনো পরীক্ষা ফেল ধরা হয়নি। পরের রানে আবার চলবে।',
      '',
      `- ${at.toISOString()}: not run. ${o.reason.replace(/\.$/, '')}. Nothing was called; nothing failed.`,
      '- The practice ERP runs every check in CI (packages/adapters/test/erp-acceptance.test.ts, the books drills).',
      '',
    ].join('\n');
  if (o.state === 'WAITING_FOR_KEY')
    return [
      '# ERP acceptance — demo ERP',
      '',
      '**সারকথা:** ডেমো ERP-এর চাবির অপেক্ষায়। মালিক সেটিংস → ERP সংযোগ পাতায় ডেমো দোকানের চাবি দিলে প্রতি রাতে আর প্রতিটা রিলিজের আগে এই পরীক্ষা চলবে।',
      '',
      `- ${at.toISOString()}: waiting for the demo key. Nothing was called; nothing failed.`,
      '- The practice ERP runs every check in CI (packages/adapters/test/erp-acceptance.test.ts, the books drills).',
      '',
    ].join('\n');
  const r = o.report;
  const bn = r.keyRefused
    ? '**সারকথা:** ডেমো ERP চাবিটা নিল না। সেটিংস → ERP সংযোগ পাতায় ডেমো দোকানের চাবিটা আবার দিন; ততক্ষণ কোনো পরীক্ষা ফেল ধরা হয় না।'
    : r.failed
    ? `**সারকথা:** ${r.failed}টা পরীক্ষা মেলেনি — ঠিক না হওয়া পর্যন্ত নতুন রিলিজ যাবে না।`
    : r.unreachable
      ? '**সারকথা:** ডেমো ERP-তে পৌঁছানো গেল না (বা কিছু কল সেখানে এখনো নেই); সেই পরীক্ষাগুলো বাদ, কোনো পরীক্ষা ফেল ধরা হয়নি। পরের রানে আবার চেষ্টা হবে।'
      : `**সারকথা:** সব ঠিক — ${r.passed}টা পাস, ${r.skipped}টা বাদ (ERP-এর নিজের কাজ লাগে, লেখা বন্ধ, বা ERP-তে বানানো হয়নি)।`;
  const md = acceptanceMarkdown(r, 'ERP acceptance — demo ERP').split('\n');
  return [md[0], '', bn, ...md.slice(1)].join('\n');
}
