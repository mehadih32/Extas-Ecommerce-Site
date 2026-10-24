// PR 171 — the guard: the wallet's ledger has one writer here (wallet.ts `postWalletEntry`) and the two older writers
// that do exactly the same (the checkout spending it, PR 122; the review reward, PR 65). Any other code that writes a
// WalletEntry or moves a WalletAccount balance would be a balance with no ledger line behind it, so this test reads the
// source of every package and the web app (tests excluded) and fails on it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The files allowed to write the wallet, each with its reason. */
const WRITERS: Record<string, string> = {
  'packages/payments/src/wallet.ts': 'the one ledger writer (PR 171)',
  'packages/checkout/src/place.ts': 'the checkout spends the wallet under the wallet row lock, one ORDER entry per order (PR 122)',
  'packages/catalogue/src/reviews.ts': 'the photo-review reward, one REVIEW_REWARD entry per review (PR 65)',
};

const WRITE = [/walletEntry\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/, /walletAccount\.(update|updateMany|upsert|delete|deleteMany)\b/, /(INSERT INTO|UPDATE)\s+"Wallet(Entry|Account)"/];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|mjs)$/.test(name) && !name.endsWith('.d.ts') && name !== 'testing.ts') out.push(p);
  }
  return out;
}

describe('PR 171 guard: every wallet balance has its ledger line', () => {
  it('only the listed files write the wallet', () => {
    const dirs = [join(ROOT, 'apps/web/src'), ...readdirSync(join(ROOT, 'packages')).map((p) => join(ROOT, 'packages', p, 'src'))].filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    });
    const bad: string[] = [];
    for (const f of dirs.flatMap((d) => sources(d))) {
      const rel = relative(ROOT, f).split('\\').join('/');
      if (WRITERS[rel]) continue;
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          if (WRITE.some((re) => re.test(line))) bad.push(`${rel}:${i + 1}`);
        });
    }
    expect(bad, 'write the wallet through @extas/payments postWalletEntry').toEqual([]);
  });

  it('every listed writer still writes the wallet', () => {
    for (const rel of Object.keys(WRITERS)) expect(WRITE.some((re) => re.test(readFileSync(join(ROOT, rel), 'utf8'))), rel).toBe(true);
  });
});
