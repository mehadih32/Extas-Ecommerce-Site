// Tests for tools/gate-c360/lib.mjs (PR 414 follow-up, CN-013 phase 2; run with the web tests). The browser part runs on
// the VM (infra/deploy/gate-c360.sh); these are the rules it leans on.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  amountsIn,
  bengaliShare,
  gateLabel,
  gatePhone,
  hostGuard,
  inLang,
  isGateLabel,
  localPhone,
  messageProblems,
  phoneForms,
  pickScenarios,
  redact,
  reportMarkdown,
  row,
  SCENARIOS,
  summarise,
  toAsciiDigits,
  toBengaliDigits,
  untranslated,
  withUtm,
} from './lib.mjs';
import { askHelper } from './run.mjs';

const cfg = JSON.parse(readFileSync(new URL('./gate-c360.json', import.meta.url), 'utf8'));
// a made-up number of the gate's own shape (never a real one: the gate makes a fresh one each run)
const PHONE = gatePhone('013', '12345678');

it('the config walks a mid Android phone, an iPhone and a 1366 desktop, in English and Bengali, with the in-app browsers', () => {
  expect(cfg.screens.map((s) => s.id)).toEqual(['android-mid', 'iphone', 'desktop-1366']);
  expect(cfg.screens.find((s) => s.id === 'desktop-1366').width).toBe(1366);
  expect(cfg.langs).toEqual(['en', 'bn']);
  expect(cfg.inApp.map((a) => a.ua)).toEqual([expect.stringContaining('FB_IAB/FB4A'), expect.stringContaining('FBAN/MessengerForiOS')]);
  for (const x of [...cfg.inApp, ...cfg.interactive, cfg.order]) expect(cfg.screens.some((s) => s.id === x.screen)).toBe(true);
  expect(cfg.utm.utm_campaign).toMatch(/gate-test/);
  expect(isGateLabel(cfg.order.address)).toBe(true);
  expect(cfg.search.map((s) => s.id)).toEqual(expect.arrayContaining(['english', 'bengali', 'misspelt']));
  expect(cfg.phonePrefix).toMatch(/^01[3-9]$/);
});

it('picks scenarios in life-cycle order and names unknown ones', () => {
  expect(pickScenarios('').list).toEqual(SCENARIOS);
  expect(pickScenarios('all').list).toEqual(SCENARIOS);
  expect(pickScenarios('after, before').list).toEqual(['before', 'after']);
  expect(pickScenarios('before,refund').problems).toEqual(['no such scenario: refund']);
});

it('writes the gate number every way a person does, and reads them all back', () => {
  expect(PHONE).toMatch(/^013\d{8}$/);
  expect(gatePhone('012', '1')).toBeNull();
  const forms = phoneForms(PHONE);
  expect(forms.map((f) => f.id)).toEqual(['local', 'intl', 'intl-no-plus', 'spaced', 'bengali-digits', 'bengali-intl']);
  for (const f of forms) expect(localPhone(f.value)).toBe(PHONE);
  expect(forms.find((f) => f.id === 'bengali-digits').value).toMatch(/^০১৩/);
  expect(toAsciiDigits(toBengaliDigits('2026'))).toBe('2026');
  expect(localPhone('12345')).toBeNull();
});

it('marks every row it makes', () => {
  expect(gateLabel('customer', '202611011200')).toBe('GATE TEST customer 202611011200');
  expect(isGateLabel('GATE TEST order')).toBe(true);
  expect(isGateLabel('Rahim')).toBe(false);
});

it('adds the ad link tags and the Bengali prefix', () => {
  expect(withUtm('/bn', { utm_source: 'facebook', fbclid: 'X' })).toBe('/bn?utm_source=facebook&fbclid=X');
  expect(inLang('bn', '/')).toBe('/bn');
  expect(inLang('bn', '/bag')).toBe('/bn/bag');
  expect(inLang('en', '/bag')).toBe('/bag');
});

it('runs only on the preview host from the settings, never on a public host or after go-live', () => {
  const ok = { base: 'https://preview.example.test', previewHost: 'preview.example.test' };
  expect(hostGuard(ok)).toBeNull();
  expect(hostGuard({ ...ok, base: 'https://shop.example.test' })).toMatch(/not the preview host/);
  expect(hostGuard({ ...ok, base: 'http://preview.example.test' })).toMatch(/not the preview host/);
  expect(hostGuard({ ...ok, previewHost: '' })).toMatch(/no preview host/);
  expect(hostGuard({ ...ok, extraHosts: 'a.example.test preview.example.test' })).toMatch(/public host/);
  expect(hostGuard({ ...ok, mainOpen: 'yes' })).toMatch(/go-live/);
  expect(hostGuard({ ...ok, base: 'not a url' })).toMatch(/not an address/);
});

it('keeps secrets out of what it writes', () => {
  const s = redact('password=hunter2hunter2 code: 123456 postgresql://u:p@db/x Bearer abc.def __Host-extas_c=zzz ' + 'a'.repeat(50));
  expect(s).not.toMatch(/hunter2|123456|u:p@|abc\.def|zzz|a{50}/);
  expect(s).toContain('<hidden>');
  expect(redact('order 1042 delivered')).toBe('order 1042 delivered');
});

it('finds English left on a Bengali page, but not brand words, sizes or mixed Bengali text', () => {
  const found = untranslated(['Add to bag', 'ব্যাগে রাখুন', 'WhatsApp', 'XL', 'bKash দিয়ে দিন', 'Order number EX-1042', ''], cfg.allowLatin);
  expect(found).toEqual(['Add to bag', 'Order number EX-1042']);
});

it('reads the money a message names, in either digits', () => {
  expect(amountsIn('মোট ৳১,২৫০ টাকা')).toEqual([1250]);
  expect(amountsIn('Total Tk 990 to pay')).toEqual([990]);
  expect(amountsIn('order 1042')).toEqual([]);
  expect(bengaliShare('আপনার order')).toBeGreaterThan(0.3);
});

it('checks a confirmation message: the mock, the order, the amount, the language, no money ask when nothing is due', () => {
  const order = { number: 'EX-1042', dueMinor: 125000, totalMinor: 125000, lang: 'bn' };
  const good = { channel: 'SMS', step: 'placed', locale: 'bn', status: 'SENT', mode: 'MOCK', toOrderPhone: true, text: 'আপনার অর্ডার EX-১০৪২ পেয়েছি। মোট ৳১২৫০, ডেলিভারির সময় দেবেন।' };
  expect(messageProblems(good, order)).toEqual([]);
  expect(messageProblems({ ...good, mode: 'LIVE' }, order)).toEqual(['sent through LIVE, not the mock']);
  expect(messageProblems({ ...good, text: 'আপনার অর্ডার পেয়েছি। মোট ৳১২৫০' }, order)).toEqual(['does not name the order number']);
  expect(messageProblems({ ...good, text: 'অর্ডার EX-1042, মোট ৳৯৯০' }, order)[0]).toMatch(/says 990/);
  expect(messageProblems({ ...good, locale: 'en', text: 'Order EX-1042 received, total Tk 1250' }, order)).toEqual(['in en, the order was placed in bn']);
  expect(messageProblems({ ...good, text: 'Order EX-1042 received, total Tk 1250' }, order)).toEqual(['meant to be Bengali, but mostly English']);
  const prepaid = { ...order, dueMinor: 0 };
  expect(messageProblems({ ...good, text: 'অর্ডার EX-1042: বিকাশে পেমেন্ট করুন ৳১২৫০' }, prepaid)).toEqual(['asks for money on an order with nothing due']);
  expect(messageProblems({ ...good, text: null, status: 'SENT' }, order)).toEqual(['sent, but its words could not be drawn again']);
});

it('summarises and reports every step with its reason', () => {
  const rows = [
    row({ scenario: 'before', id: 'landing-ad', title: 'Lands', screen: 'iphone', lang: 'bn', status: 'FAIL', reason: 'tags lost', ms: 812.4, where: 'a.ts:1' }),
    row({ scenario: 'before', id: 'search', status: 'PASS', ms: 300 }),
    row({ scenario: 'support', id: 'chat', status: 'SKIP', reason: 'off' }),
    row({ scenario: 'after', id: 'odd', status: 'MAYBE' }),
  ];
  expect(rows[0].ms).toBe(812);
  expect(rows[3].status).toBe('FAIL');
  const s = summarise(rows);
  expect(s).toMatchObject({ ok: false, steps: 4, pass: 1, fail: 2, skip: 1 });
  expect(s.problems[0]).toBe('before/landing-ad (iphone, bn): tags lost');
  const md = reportMarkdown({ ...s, rows }, { at: 'now', base: 'https://preview.example.test', scenarios: ['before'], cleanup: 'archived' });
  expect(md).toMatch(/^# Customer 360° gate — FAIL/);
  expect(md).toContain('| Lands | iphone · bn | **FAIL** | 812 ms | tags lost — a.ts:1 |');
  expect(md).toContain('Clean-up: archived');
});

it('asks the database side through the bridge folder and waits for its answer', async () => {
  const { mkdtempSync, readdirSync, readFileSync: read, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'gate-bridge-'));
  const answer = setInterval(() => {
    for (const f of readdirSync(dir).filter((x) => /^req-.*\.json$/.test(x))) {
      const q = JSON.parse(read(join(dir, f), 'utf8'));
      writeFileSync(join(dir, f.replace('req-', 'res-')), JSON.stringify({ ok: true, echo: q.action }));
    }
  }, 50);
  try {
    expect(await askHelper('facts', { number: 'X' }, { GATE_BRIDGE: dir }, 5)).toEqual({ ok: true, echo: 'facts' });
    expect(await askHelper('facts', {}, {}, 1)).toMatchObject({ ok: false });
  } finally {
    clearInterval(answer);
  }
});
