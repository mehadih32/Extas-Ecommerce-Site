// S18 · PR 383 (Blueprint F2 q27) — no stand-in text ships in the shop's own words: the footer once carried
// "[your DBID number]", "[number]" and "[support email]". Every value in the shop's messages files (not the admin's,
// whose help texts may quote such examples) is scanned; the owner's values are guarded where they are read
// (lib/shop/context.ts, @extas/settings placeholder.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../../messages');
const STAND_IN = /\[(?:your\b[^\]]*|number|support email|email|phone|address|dbid|trade licen[cs]e|bin|name|link|url)\]/i;

function strings(v: unknown, at: string, out: [string, string][]): [string, string][] {
  if (typeof v === 'string') out.push([at, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${at}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, at ? `${at}.${k}` : k, out);
  return out;
}

describe('no stand-in text in the shop words (PR 383)', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('admin'));

  it('finds the shop messages files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every value is real text or a {token} the code fills, never a [stand-in]', () => {
    const found: string[] = [];
    for (const f of files) {
      for (const [at, s] of strings(JSON.parse(readFileSync(join(DIR, f), 'utf8')), '', [])) if (STAND_IN.test(s)) found.push(`${f} ${at}: ${s}`);
    }
    expect(found).toEqual([]);
  });

  it('the pattern catches what once shipped', () => {
    for (const s of ['DBID: [your DBID number]', 'Call [number]', 'Write to [support email]']) expect(STAND_IN.test(s), s).toBe(true);
    for (const s of ['DBID: {id}', 'Call {phone}', 'Sizes [S, M, L]']) expect(STAND_IN.test(s), s).toBe(false);
  });
});
