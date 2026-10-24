// S06 · PR 161 — the Levels screen's data: every word in both admin languages, a level for every band the owner has (and
// none for a band he no longer has, so a save is never refused for it), the suggested set and the default as drafts
// that keep the switch, the percent and the reason, and the partial ask refused before it is sent without its percent.
import { describe, expect, it } from 'vitest';
import { NO_RISK_ACTIONS, registry, SUGGESTED_RISK_LEVELS } from '@extas/settings';
import type { RiskLevelsView } from '@extas/orders';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { asDefault, draftProblem, forBands, levelsScreen, levelsTexts, NOTHING, percentOf, withSuggested } from './risk-levels';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const BANDS = [
  { key: 'low', en: 'Low', bn: 'কম', minScore: 0, tone: 'ok' as const },
  { key: 'medium', en: 'Medium', bn: 'মাঝারি', minScore: 35, tone: 'warn' as const },
  { key: 'high', en: 'High', bn: 'বেশি', minScore: 65, tone: 'bad' as const },
];
const DEF = registry['risk.levels'].default;
const VIEW: RiskLevelsView = {
  value: { ...DEF, levels: { ...DEF.levels, gone: { watch: true, hold: false, call: false, ask: 'none' } } },
  bands: BANDS,
  holdReasons: [{ key: 'risk-check', en: 'Risk check', bn: 'ঝুঁকি যাচাই' }],
  suggested: { low: NO_RISK_ACTIONS, medium: SUGGESTED_RISK_LEVELS.medium!, high: SUGGESTED_RISK_LEVELS.high! },
  byDefault: DEF,
  version: '0123456789abcdef',
};

describe('PR 161 · the Levels screen', () => {
  it('every word in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      const x = levelsTexts(view(lang));
      for (const [k, v] of Object.entries(x)) {
        if (typeof v === 'string') expect(v, `${lang} ${k}`).not.toMatch(/^orders\.rr\./);
        else for (const [k2, v2] of Object.entries(v)) expect(v2, `${lang} ${k}.${k2}`).not.toMatch(/^orders\.rr\./);
      }
    }
  });

  it('a level for every band the owner has, none for a band he no longer has; names and "from" in the admin language', () => {
    const s = levelsScreen(view('bn'), VIEW);
    expect(Object.keys(s.value.levels)).toEqual(['low', 'medium', 'high']);
    expect(s.bands.map((b) => [b.name, b.from])).toEqual([
      ['কম', 'স্কোর 0 থেকে'],
      ['মাঝারি', 'স্কোর 35 থেকে'],
      ['বেশি', 'স্কোর 65 থেকে'],
    ]);
    expect(s.reasons).toEqual([{ key: 'risk-check', name: 'ঝুঁকি যাচাই' }]);
    expect(forBands({ ...DEF, levels: {} }, BANDS).levels.high).toEqual(NOTHING);
  });

  it('the suggested set and the default are drafts that keep the switch, the percent and the reason', () => {
    const draft = { ...forBands(DEF, BANDS), enabled: true, partialPercent: 30, holdReasonKey: 'risk-check' };
    const s = withSuggested(draft, VIEW.suggested);
    expect(s).toMatchObject({ enabled: true, partialPercent: 30, holdReasonKey: 'risk-check' });
    expect(s.levels.high).toEqual({ watch: true, hold: true, call: true, ask: 'full' });
    expect(s.levels.medium).toEqual({ watch: true, hold: false, call: true, ask: 'delivery' });
    expect(asDefault(DEF, BANDS)).toEqual({ ...DEF, levels: { low: NOTHING, medium: NOTHING, high: NOTHING } });
  });

  it('a partial ask needs its percent; the percent field reads empty as "not set"', () => {
    const draft = { ...forBands(DEF, BANDS), levels: { low: NOTHING, medium: { ...NOTHING, ask: 'partial' as const }, high: NOTHING } };
    expect(draftProblem(draft)).toBe('PARTIAL_UNSET');
    expect(draftProblem({ ...draft, partialPercent: 25 })).toBeNull();
    expect(percentOf('')).toBeNull();
    expect(percentOf(' 25 ')).toBe(25);
    expect(percentOf('x')).toBeNaN();
  });
});
