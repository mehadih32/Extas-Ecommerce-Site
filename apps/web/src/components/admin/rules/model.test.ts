// S10 · PR 209, 215–219 — the Smart Rules screens without a database: both languages carry the same keys and none
// overlaps another admin file, every topic, status, issue, action, history field and refusal has its words, and the
// pure helpers (values typed in, the live text, token lines, clashes in words, the notice form).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIND_SPECS, RULE_KINDS, RULE_STATUSES, NOTICE_KINDS, TRIGGERS, CAP_PERIODS, TEXT_SLOTS, noticeInputSchema, type Param, type RuleContent } from '@extas/rules/pure';
import adminBn from '../../../../messages/admin.bn.json';
import adminEn from '../../../../messages/admin.en.json';
import productsBn from '../../../../messages/admin-products.bn.json';
import toolsBn from '../../../../messages/admin-tools.bn.json';
import stockBn from '../../../../messages/admin-stock.bn.json';
import bn from '../../../../messages/admin-rules.bn.json';
import en from '../../../../messages/admin-rules.en.json';
import { adminDicts } from '@/lib/admin-i18n';
import { ADMIN_PAGES } from '@/lib/admin-nav';
import { t, type Dict } from '@/lib/i18n';
import {
  changeText,
  clashCounts,
  conflictText,
  isoToLocalInput,
  issueText,
  keyFromTitle,
  liveText,
  localInputToIso,
  money,
  moneyFromInput,
  moneyToInput,
  offStatus,
  paramLabels,
  rulesRefusal,
  sameContent,
  targetName,
  tokenLines,
  withParam,
  withText,
  zoneOffset,
  type RulesEnv,
} from './model';
import { blankNotice, formOf, inputOf } from './notice-form';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

const ENV: RulesEnv = {
  ctx: { locale: 'bn-BD', currency: 'BDT', timeZone: 'Asia/Dhaka' },
  limits: { shortMaxChars: 90, fullMaxChars: 2000, maxPercentOff: 90, placements: ['product', 'bag', 'faq'] },
  others: { delivery: { params: [{ key: 'freeOver', type: 'money', value: 150000, labelEn: 'Free over' }], startsAt: null, endsAt: null } },
};

const RULE: RuleContent = {
  key: 'exchange',
  kind: 'exchange',
  nameEn: 'Exchange for size or fault',
  nameBn: 'সাইজ বা ত্রুটির জন্য এক্সচেঞ্জ',
  text: { short: { en: 'Exchange within {windowHours} hours for size or fault', bn: '{windowHours} ঘণ্টার মধ্যে সাইজ বা ত্রুটির জন্য এক্সচেঞ্জ' }, full: { en: 'Free delivery over {delivery.freeOver}. {nope}' } },
  params: [
    { key: 'windowHours', type: 'hours', value: 72, labelEn: 'Exchange window (hours)', labelBn: 'বদলের সময় (ঘণ্টা)' },
    { key: 'charge', type: 'money', value: null, labelEn: 'Charge' },
  ],
  scope: { include: [{ type: 'all' }], exclude: [] },
  conditions: { all: [] },
  actions: [],
  placements: ['product'],
  priority: 0,
  stackable: false,
  status: 'ACTIVE',
  startsAt: null,
  endsAt: null,
};

describe('Smart Rules messages', () => {
  it('both languages have the same keys, none empty; English has no Bengali', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
    for (const k of keys(bn as Dict)) {
      expect(t(bn as Dict, k), k).not.toBe('');
      expect(/[ঀ-৿]/.test(t(en as Dict, k)), k).toBe(false);
    }
  });

  it('no key is also in another admin file (the merge would hide one)', () => {
    const taken = new Set([adminBn, adminEn, productsBn, toolsBn, stockBn].flatMap((o) => keys(o as Dict)));
    expect(keys(bn as Dict).filter((k) => taken.has(k))).toEqual([]);
  });

  it('every fixed key the screens ask for is a line of words (a key that is also a group would show as raw text)', () => {
    const screens: [string, string][] = [
      ['RulesScreen.tsx', 'rules.'],
      ['RuleEditor.tsx', 'rules.'],
      ['RuleSheets.tsx', 'rules.'],
      ['NoticesScreen.tsx', 'rules.notices.'],
    ];
    for (const [file, prefix] of screens) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      const asked = [...src.matchAll(/\btt\('([A-Za-z0-9.]+)'/g)].map((m) => `${prefix}${m[1]}`);
      expect(asked.length, file).toBeGreaterThan(0);
      for (const d of [adminDicts.bn, adminDicts.en]) for (const k of asked) expect(t(d, k), `${file}: ${k}`).not.toBe(k);
    }
  });

  it('every topic, status, slot, action, issue, notice choice, history field and refusal has its words', () => {
    const issues = ['UNKNOWN_PARAM', 'WRONG_PARAM_TYPE', 'DUPLICATE_PARAM', 'ACTION_NOT_ALLOWED', 'SLOT_NOT_ALLOWED', 'UNKNOWN_TOKEN', 'MISSING_VALUE', 'TOO_LONG', 'NO_TEXT', 'PERCENT_TOO_HIGH', 'BAD_WINDOW', 'UNKNOWN_PLACEMENT', 'HAND_WRITTEN_NUMBER'];
    const noticeIssues = ['ARRIVAL_POPUP', 'DELAY_TOO_SHORT', 'SCROLL_TOO_SHORT', 'NO_CAP', 'NO_TRIGGER', 'TIMING_NOT_FOR_KIND', 'BAD_WINDOW', 'UNKNOWN_PLACEMENT', 'CLICK_KEY_MISSING', 'MISSING_VALUE', 'UNKNOWN_TOKEN'];
    const errors = ['INVALID_INPUT', 'NOT_FOUND', 'CONFLICT', 'KEY_TAKEN', 'RULE_INCOMPLETE', 'OWNER_OK_REQUIRED', 'RULE_ACTIVE', 'RULE_ARCHIVED', 'NOTHING_TO_PUBLISH', 'STALE_DRAFT', 'KEY_FIXED', 'NOTICE_INVALID', 'COUPON_CODE_INVALID', 'COUPON_RULE_INVALID', 'COUPON_NOT_USABLE', 'CANNOT_FIX'];
    const fields = ['name', 'text', 'param', 'paramAdded', 'paramRemoved', 'scope', 'conditions', 'actions', 'placements', 'priority', 'stackable', 'status', 'startsAt', 'endsAt', 'kind', 'key'];
    for (const d of [adminDicts.bn, adminDicts.en]) {
      const has = (k: string) => expect(t(d, k), k).not.toBe(k);
      for (const k of RULE_KINDS) has(`rules.kinds.${k}`);
      for (const s of RULE_STATUSES) has(`rules.status.${s}`);
      for (const s of TEXT_SLOTS.filter((x) => x !== 'short' && x !== 'full')) has(`rules.editor.slots.${s}`);
      for (const a of new Set(Object.values(KIND_SPECS).flatMap((x) => x.actions))) has(`rules.editor.actions.${a}`);
      for (const c of issues) has(`rules.issues.${c}`);
      for (const c of noticeIssues) has(`rules.notices.issues.${c}`);
      for (const c of errors) has(`rules.errors.${c}`);
      for (const f of fields) has(`rules.history.fields.${f}`);
      for (const k of NOTICE_KINDS) has(`rules.notices.kinds.${k}`);
      for (const k of TRIGGERS) has(`rules.notices.triggers.${k}`);
      for (const k of CAP_PERIODS) has(`rules.notices.capPer.${k}`);
      for (const k of ['SAME_SLOT', 'STACKING', 'TEXT_DRIFT', 'SETTING_DRIFT']) has(`rules.conflicts.kinds.${k}`);
      for (const p of ADMIN_PAGES.filter((x) => x.group === 'rules')) has(`nav.${p.key}`);
      has('frame.groups.rules');
    }
  });
});

describe('Smart Rules screen helpers', () => {
  it('money is typed in whole taka and kept in poisha; empty is "not set"', () => {
    expect(moneyToInput(15000, 'BDT')).toBe('150');
    expect(moneyToInput(null, 'BDT')).toBe('');
    expect(moneyFromInput('1,500', 'BDT')).toBe(150000);
    expect(moneyFromInput('', 'BDT')).toBeNull();
    expect(Number.isNaN(moneyFromInput('abc', 'BDT'))).toBe(true);
    expect(money(-25000, ENV, 'en', true)).toMatch(/^−/);
    expect(money(25000, ENV, 'en', true)).toMatch(/^\+/);
  });

  it('dates are typed in the store time zone and stored with its offset', () => {
    expect(zoneOffset(new Date('2026-10-20T00:00:00Z'), 'Asia/Dhaka')).toBe(360);
    expect(localInputToIso('2026-12-20T18:00', 'Asia/Dhaka')).toBe('2026-12-20T18:00:00+06:00');
    expect(isoToLocalInput('2026-12-20T12:00:00Z', 'Asia/Dhaka')).toBe('2026-12-20T18:00');
    expect(localInputToIso('', 'Asia/Dhaka')).toBeNull();
  });

  it('the live line fills the values exactly as the storefront does, in each language', () => {
    expect(liveText(RULE, 'short', 'en', ENV)!.text).toBe('Exchange within 72 hours for size or fault');
    expect(liveText(RULE, 'short', 'bn', ENV)!.text).toBe('৭২ ঘণ্টার মধ্যে সাইজ বা ত্রুটির জন্য এক্সচেঞ্জ');
    expect(liveText(withParam(RULE, 'windowHours', 48), 'short', 'en', ENV)!.text).toBe('Exchange within 48 hours for size or fault');
    const lines = tokenLines(RULE, 'en', ENV);
    expect(lines.find((l) => l.token === '{windowHours}')).toMatchObject({ kind: 'param', value: '72' });
    expect(lines.find((l) => l.token === '{delivery.freeOver}')).toMatchObject({ kind: 'other' });
    expect(lines.find((l) => l.token === '{nope}')).toMatchObject({ kind: 'unknown' });
  });

  it('texts, keys and statuses', () => {
    const r = withText(RULE, 'short', 'bn', '');
    expect(r.text.short).toEqual({ en: RULE.text.short!.en });
    expect(withText(RULE, 'badge', 'en', '').text.badge).toBeUndefined();
    expect(sameContent(RULE, { ...RULE })).toBe(true);
    expect(sameContent(RULE, withParam(RULE, 'windowHours', 48))).toBe(false);
    expect(keyFromTitle('Puja delivery cut-off!', 'x')).toBe('puja-delivery-cut-off');
    expect(keyFromTitle('পূজার ডেলিভারি', 'festive-1')).toBe('festive-1');
    expect(offStatus(RULE)).toBe('PAUSED');
    expect(offStatus(null)).toBe('DRAFT');
  });

  it('issues, history changes, clashes and refusals read as words', () => {
    const d = adminDicts.en;
    expect(issueText(d, { code: 'MISSING_VALUE', at: 'params.charge', subject: 'Charge', blocking: true })).toBe('“Charge” is not set yet');
    expect(changeText(d, { field: 'param', path: 'params.windowHours', before: 72, after: 48, paramType: 'hours' }, { ...ENV.ctx, locale: 'en-BD' })).toBe('windowHours: 72 → 48');
    // with the rule's params the line names the setting the admin sees in the editor
    const labels = paramLabels([{ key: 'windowHours', type: 'hours', labelEn: 'Exchange window', labelBn: 'বদলের সময়', value: 72 }] as Param[], 'en');
    expect(changeText(d, { field: 'param', path: 'params.windowHours', before: 72, after: 48, paramType: 'hours' }, { ...ENV.ctx, locale: 'en-BD' }, labels)).toBe('Exchange window: 72 → 48');
    expect(paramLabels([{ key: 'windowHours', type: 'hours', labelEn: 'Exchange window', labelBn: 'বদলের সময়', value: 72 }] as Param[], 'bn').get('windowHours')).toBe('বদলের সময়');
    expect(changeText(d, { field: 'scope', path: 'scope', before: 1, after: 2 }, ENV.ctx)).toBe('Applies to / Except: changed');
    const drift = { kind: 'TEXT_DRIFT', otherType: 'notice', otherId: 'n1', ruleA: { id: 'r1', nameEn: 'Exchange', nameBn: null }, ruleB: null, winnerRuleId: null, detail: { literal: '7 days', ruleValue: 72, unit: 'hours' } };
    expect(conflictText(d, drift, 'en', ENV, { n1: 'FAQ answer' })).toBe('The notice “FAQ answer” still says “7 days”; the rule “Exchange” says 72 hours.');
    expect(clashCounts([drift, { ...drift, ruleB: { id: 'r2', nameEn: 'B', nameBn: null } }]).get('r1')).toBe(2);
    expect(rulesRefusal(d, 'OWNER_OK_REQUIRED')).toMatch(/owner's OK/);
    expect(rulesRefusal(d, 'FORBIDDEN')).toBe(t(d, 'errors.FORBIDDEN'));
    expect(rulesRefusal(d, 'nonsense')).toBe(t(d, 'errors.server-error'));
    expect(targetName({ type: 'all' }, [], {}, d, 'en')).toBe('Everything');
    expect(targetName({ type: 'category', id: 'c1' }, [{ type: 'category', id: 'c1', nameEn: 'Polos', nameBn: 'পোলো' }], {}, d, 'bn')).toBe('পোলো');
  });

  it('the notice form goes to the API shape and back; only a pop-up has timing and a cap', () => {
    const f = { ...blankNotice(), key: 'eid-pop', kind: 'popup' as const, nameEn: 'Eid', contentEn: 'Order by {festive.cutoffDhaka}', trigger: 'time' as const, delay: '20', capPer: 'day' as const, capTimes: '1', pages: ['product'], startsAt: '2026-12-20T18:00' };
    const input = inputOf(f, 'Asia/Dhaka');
    expect(noticeInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({ timing: { trigger: 'time', delaySeconds: 20 }, frequencyCap: { per: 'day', times: 1 }, placement: { pages: ['product'] }, startsAt: '2026-12-20T18:00:00+06:00', cta: null });
    const bar = inputOf({ ...f, kind: 'bar' }, 'Asia/Dhaka');
    expect(bar.timing).toBeNull();
    expect(bar.frequencyCap).toBeNull();
    const back = formOf({ ...input, key: input.key, nameEn: input.nameEn, nameBn: null, titleEn: null, titleBn: null, contentBn: null, ruleId: null, priority: 0, startsAt: '2026-12-20T12:00:00.000Z', endsAt: null, cta: null, timing: input.timing, frequencyCap: input.frequencyCap, placement: input.placement }, 'Asia/Dhaka');
    expect(back).toMatchObject({ kind: 'popup', trigger: 'time', delay: '20', capPer: 'day', pages: ['product'], startsAt: '2026-12-20T18:00' });
  });
});
