// S15 · PR 580 — the pure quality rubric: no DB, no settings resolver. `model-qualification.db.test.ts` covers the
// feature switch, the API route and the persisted qualification runs on PostgreSQL.
import { describe, expect, it } from 'vitest';
import { JOB_CATALOG, MODEL_CATALOG, jobOf, modelOf } from './cost-book';
import { isBlockedForJob, pickSuggestion, requiredTierOf, scoreCandidates, scoreOf } from './model-qualification';

describe('requiredTierOf / scoreOf (PR 580)', () => {
  it('reads a job\'s own required tier straight off its already-recommended model, never a second guess', () => {
    const easy = jobOf('supportClassify'); // TEXT_SMALL
    const hard = jobOf('reportsExecSummary'); // TEXT_LARGE
    expect(requiredTierOf(easy)).toBe('small');
    expect(requiredTierOf(hard)).toBe('large');
  });

  it('scores a candidate at or above the required tier strongly, and weaker the further short it falls', () => {
    const job = jobOf('seoBlogArticle'); // TEXT_MID
    const atTier = modelOf('claude-sonnet'); // mid
    const above = modelOf('claude-opus'); // large
    const oneBelow = modelOf('gemini-flash'); // small
    expect(scoreOf(job, atTier)).toBe(95);
    expect(scoreOf(job, above)).toBe(97);
    expect(scoreOf(job, oneBelow)).toBeLessThan(scoreOf(job, atTier));
  });

  it('every job in the catalogue has a real recommended-model entry (scoreOf never throws)', () => {
    for (const j of JOB_CATALOG) {
      for (const m of MODEL_CATALOG.filter((x) => x.kind === j.usage.kind)) {
        expect(() => scoreOf(j, m)).not.toThrow();
      }
    }
  });
});

describe('isBlockedForJob (PR 580, generalising the A5.2 Locked policy to any free model)', () => {
  it('blocks a free model for a personal/business job (gyani, sawdagor, prohori, tirondaj)', () => {
    const job = jobOf('supportReply'); // gyani · personal
    const free = modelOf('llama-3.1-8b-free');
    expect(isBlockedForJob(job, free)).toBe(true);
  });

  it('allows a free model for a public/draft job (doot, shilpi)', () => {
    const job = jobOf('seoBlogArticle'); // doot · publicDraft
    const free = modelOf('gemma-2-9b-free');
    expect(isBlockedForJob(job, free)).toBe(false);
  });

  it('never blocks a paid model, whatever the job\'s own data class', () => {
    const job = jobOf('orderFraudJudge'); // gyani · personal
    expect(isBlockedForJob(job, modelOf('claude-opus'))).toBe(false);
  });
});

describe('scoreCandidates (PR 580)', () => {
  it('computes the bar as barPercent% of the best UNBLOCKED candidate, excluding a blocked free model from "best"', () => {
    const job = jobOf('supportClassify'); // gyani · personal · TEXT_SMALL
    const { candidates, best, bar } = scoreCandidates(job, 95);
    const free = candidates.find((c) => c.isFree)!;
    expect(free.blocked).toBe(true);
    expect(free.passed).toBeNull();
    expect(best).toBeGreaterThan(0);
    expect(bar).toBe(Math.round((best * 95) / 100));
  });

  it('lets a free model pass an easy (small-tier), public/draft job\'s quality bar', () => {
    const job = jobOf('seoAltText'); // doot · publicDraft · TEXT_SMALL
    const { candidates } = scoreCandidates(job, 95);
    const free = candidates.filter((c) => c.isFree);
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((c) => !c.blocked)).toBe(true);
    expect(free.some((c) => c.passed)).toBe(true);
  });

  it('a stricter bar (98%) never passes more candidates than a looser one (90%) on the same job', () => {
    const job = jobOf('seoBlogArticle');
    const loose = scoreCandidates(job, 90).candidates.filter((c) => c.passed).length;
    const strict = scoreCandidates(job, 98).candidates.filter((c) => c.passed).length;
    expect(strict).toBeLessThanOrEqual(loose);
  });

  it('every candidate costs exactly 100x its own per-run estimate, for 100 runs', () => {
    const job = jobOf('mktEmailBody');
    const { candidates } = scoreCandidates(job, 95);
    for (const c of candidates) expect(c.costPer100RunsUsdMinor).toBeGreaterThanOrEqual(0);
  });
});

describe('pickSuggestion (PR 580 — only a REAL, persisted test counts)', () => {
  const job = jobOf('seoAltText');
  const { candidates } = scoreCandidates(job, 95);

  it('suggests nothing when nothing has been tested yet, even if the math would pass', () => {
    expect(pickSuggestion(candidates, new Set())).toBeNull();
  });

  it('suggests the cheapest TESTED-and-passing candidate, never an untested one, however cheap', () => {
    const passing = candidates.filter((c) => c.passed);
    expect(passing.length).toBeGreaterThan(1);
    const onlyExpensiveOneTested = [...passing].sort((a, b) => b.costPer100RunsUsdMinor - a.costPer100RunsUsdMinor)[0]!;
    const sug = pickSuggestion(candidates, new Set([onlyExpensiveOneTested.modelKey]));
    expect(sug?.modelKey).toBe(onlyExpensiveOneTested.modelKey);
  });

  it('once every passing candidate is tested, suggests the cheapest of them', () => {
    const tested = new Set(candidates.filter((c) => c.passed).map((c) => c.modelKey));
    const sug = pickSuggestion(candidates, tested);
    const cheapestPassing = [...candidates].filter((c) => c.passed).sort((a, b) => a.costPer100RunsUsdMinor - b.costPer100RunsUsdMinor)[0]!;
    expect(sug?.modelKey).toBe(cheapestPassing.modelKey);
  });

  it('never suggests a blocked candidate even if its key is somehow marked tested', () => {
    const otherJob = jobOf('supportReply'); // gyani · personal — blocks the free pool
    const blockedCandidates = scoreCandidates(otherJob, 95).candidates;
    const blocked = blockedCandidates.find((c) => c.blocked)!;
    expect(blocked).toBeDefined();
    const sug = pickSuggestion(blockedCandidates, new Set([blocked.modelKey]));
    expect(sug === null || sug.modelKey !== blocked.modelKey).toBe(true);
  });
});
