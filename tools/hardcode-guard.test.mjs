import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile, overBaseline, scan, stripComments } from './hardcode-guard.mjs';

const rules = compile(JSON.parse(readFileSync(new URL('./hardcode-guard.json', import.meta.url), 'utf8')).rules);
const ids = (file, text) => scan(file, text, rules).map((f) => f.rule);

describe('hardcode guard', () => {
  it('catches secrets, even in comments', () => {
    expect(ids('a.ts', 'const apiKey = "Zx81kQ02mmPlq9Tr";')).toContain('secret-assignment');
    expect(ids('a.ts', '// ghp_' + 'a'.repeat(36))).toContain('secret-github');
    expect(ids('a.ts', 'const u = "postgresql://extas:hunter22@db:5432/x";')).toContain('connection-string');
  });
  it('catches owner data and business numbers', () => {
    expect(ids('a.ts', 'const host = "extas.com.bd";')).toContain('owner-domain');
    expect(ids('a.ts', 'const host = "new.extas.com.bd";')).toContain('owner-domain'); // the retired staging host stays flagged (CN-052)
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
    expect(ids('a.ts', '// the EXTAS shop at extas.com.bd')).toEqual([]);
    expect(ids('a.ts', 'const deliveryCharge = 0; // hardcode-ok: neutral zero, real value from settings')).toEqual([]);
    expect(ids('a.ts', 'const deliveryCharge = 5; // hardcode-ok:')).toContain('business-number');
  });
  // Follow-up 14 (CN-017): the texts the real-life simulation found written into code. Each one stays a test case.
  it('catches the simulation\'s hard-coded customer texts (SIM-F-033)', () => {
    // The "Message us" box: fixed reply hours and a promise.
    expect(ids('a.ts', 'const help = "We reply here and on WhatsApp, 10 am – 10 pm.";')).toEqual(expect.arrayContaining(['clock-hours', 'promise-copy']));
    expect(ids('a.tsx', '<p>We reply here and on WhatsApp, 10 am – 10 pm.</p>')).toContain('jsx-text');
    // The landing page's Terms.
    expect(ids('a.ts', 'const terms = ["We confirm every order by phone or SMS", "Prices are in Taka and include VAT"];')).toEqual(['promise-copy', 'promise-copy']);
    // The exact-amount line's report link.
    expect(ids('a.ts', 'const reportUrl = "https://extas.com.bd/report";')).toContain('owner-domain');
    // The Eid feature's fixed dates.
    expect(ids('a.ts', 'const eid = { from: "2027-03-08", to: "2027-03-12" };')).toEqual(['fixed-date', 'fixed-date']);
  });
  it('catches the simulation\'s copy that promises more than the system does (SIM-F-031)', () => {
    expect(ids('a.ts', 'const note = "We send you updates on WhatsApp at every step";')).toContain('promise-copy');
    expect(ids('a.ts', 'const sub = "Your order is confirmed.";')).toContain('promise-copy');
    expect(ids('a.ts', 'sms("Your order is confirmed and packed")')).toContain('promise-copy');
    expect(ids('a.ts', 'const placed = "Total ৳2,100";')).toContain('money-literal');
  });
  it('leaves the right places alone: message lookups, messages files, comments and timestamps', () => {
    expect(ids('a.tsx', '<p>{t(dict, "thanks.sub")}</p>')).toEqual([]);
    // A messages file is where texts live; whether they promise only what the system does is the rule texts' job (PR 215).
    expect(ids('shop.en.json', '{"sub": "We will call you to confirm the address."}')).toEqual([]);
    expect(ids('a.ts', '// we reply 10 am – 10 pm on 2027-03-08')).toEqual([]);
    expect(ids('a.ts', "const clock = new Date('2026-10-23T06:00:00Z');")).toEqual([]);
  });
  it('allows placeholder e-mails and keeps line numbers when stripping comments', () => {
    expect(ids('a.ts', 'const e = "someone@example.com";')).toEqual([]);
    expect(stripComments('a /* x\ny */ b').split('\n')).toHaveLength(2);
  });
  it('PR 625: a colour or a font family in an admin page or style is caught outside the theme layer only', () => {
    expect(ids('apps/web/src/app/admin/x/x.css', '.a{color:#FF5A36}')).toContain('admin-style-literal');
    expect(ids('apps/web/src/app/admin/x/x.css', '.a{box-shadow:0 1px 2px rgba(0,0,0,.1)}')).toContain('admin-style-literal');
    expect(ids('apps/web/src/app/admin/x/x.css', ".a{font:700 14px 'Archivo',sans-serif}")).toContain('admin-style-literal');
    expect(ids('apps/web/src/components/admin/x/X.tsx', "<i style={{ color: '#12b5a6' }} />")).toContain('admin-style-literal');
    expect(ids('apps/web/src/app/admin/x/x.css', '.a{color:var(--lm-ac-ink);border-radius:var(--lm-r-card)}')).not.toContain('admin-style-literal');
    expect(ids('apps/web/src/app/admin/x/X.tsx', '<a href="#add-item" />')).not.toContain('admin-style-literal');
    expect(ids('apps/web/src/app/admin/theme/lumen.css', ':root{--lm-bg:#eceff5}')).not.toContain('admin-style-literal');
    expect(ids('apps/web/src/app/shop.css', '.a{color:#fff}')).not.toContain('admin-style-literal');
    // only the rules marked `css` read stylesheets
    expect(ids('apps/web/src/app/admin/x/x.css', '.a{width:120px} /* deliveryCharge = 120 */')).toEqual([]);
  });
  it('PR 625: a rule\'s baseline lets a file keep what it had, never more, and a new file nothing', () => {
    const r = compile([{ id: 'x', what: 'x', pattern: '#[0-9a-f]{6}', css: true, baseline: { 'old.css': 2 } }]);
    const f = (file, n) => scan(file, Array.from({ length: n }, () => '.a{color:#abcdef}').join('\n'), r);
    expect(overBaseline(f('old.css', 2), r)).toEqual([]);
    expect(overBaseline(f('old.css', 3), r)).toHaveLength(3);
    expect(overBaseline(f('new.css', 1), r)).toHaveLength(1);
  });
});
