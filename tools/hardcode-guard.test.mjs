import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile, scan, stripComments } from './hardcode-guard.mjs';

const rules = compile(JSON.parse(readFileSync(new URL('./hardcode-guard.json', import.meta.url), 'utf8')).rules);
const ids = (file, text) => scan(file, text, rules).map((f) => f.rule);

describe('hardcode guard', () => {
  it('catches secrets, even in comments', () => {
    expect(ids('a.ts', 'const apiKey = "Zx81kQ02mmPlq9Tr";')).toContain('secret-assignment');
    expect(ids('a.ts', '// ghp_' + 'a'.repeat(36))).toContain('secret-github');
    expect(ids('a.ts', 'const u = "postgresql://extas:hunter22@db:5432/x";')).toContain('connection-string');
  });
  it('catches owner data and business numbers', () => {
    expect(ids('a.ts', 'const host = "new.extas.com.bd";')).toContain('owner-domain');
    expect(ids('a.json', '{"t": "EXTAS shop"}')).toContain('owner-brand');
    expect(ids('a.ts', 'call("01712345678")')).toContain('phone-bd');
    expect(ids('a.ts', 'const deliveryCharge = 120;')).toContain('business-number');
    expect(ids('a.tsx', 'const label = `৳2,700`;')).toContain('money-literal');
  });
  it('catches visible text in components but not dictionary lookups', () => {
    expect(ids('a.tsx', '<h1>আপনার অর্ডার</h1>')).toContain('jsx-text');
    expect(ids('a.tsx', '<h1>{t(dict, "title")}</h1>')).toEqual([]);
  });
  it('ignores comments for code rules and honours a reasoned opt-out', () => {
    expect(ids('a.ts', '// the EXTAS shop at new.extas.com.bd')).toEqual([]);
    expect(ids('a.ts', 'const deliveryCharge = 0; // hardcode-ok: neutral zero, real value from settings')).toEqual([]);
    expect(ids('a.ts', 'const deliveryCharge = 5; // hardcode-ok:')).toContain('business-number');
  });
  it('allows placeholder e-mails and keeps line numbers when stripping comments', () => {
    expect(ids('a.ts', 'const e = "someone@example.com";')).toEqual([]);
    expect(stripComments('a /* x\ny */ b').split('\n')).toHaveLength(2);
  });
});
