// S15 · PR 585 — pure logic for the continuous learning engine (no database: learning-engine.db.test.ts covers
// every read/write on real Postgres). What is checked here never changes behind a mock: the closed list of power
// agents, the six source kinds, the tip/task/grade vocabularies, the fixed "doesn't work for us" phrase, the
// card/version hashing `FieldsCard` relies on for optimistic concurrency, and the error shape every route catches.
import { describe, expect, it } from 'vitest';
import {
  DOESNT_WORK_NOTE,
  isLearningEngineError,
  isLearningSourceKind,
  isPowerAgentKey,
  isPracticeGrade,
  isPracticeTaskStatus,
  isTipStatus,
  LearningEngineError,
  learningEngineCard,
  LEARNING_SOURCE_KINDS,
  PAID_TOOL_COST_MAX,
  PAID_TOOL_KIND,
  POWER_AGENT_KEYS,
  POWER_AGENT_OPTIONS,
  PRACTICE_GRADES,
  PRACTICE_TASK_STATUSES,
  TIP_STATUSES,
} from './learning-engine';

describe('the power agents are a closed, structural list — never a setting', () => {
  it('is exactly doot and tirondaj, in that order', () => {
    expect(POWER_AGENT_KEYS).toEqual(['doot', 'tirondaj']);
  });

  it('accepts only those two keys', () => {
    expect(isPowerAgentKey('doot')).toBe(true);
    expect(isPowerAgentKey('tirondaj')).toBe(true);
    expect(isPowerAgentKey('gyani')).toBe(false);
    expect(isPowerAgentKey('')).toBe(false);
  });

  it('POWER_AGENT_OPTIONS carries the real agent names, not placeholders', () => {
    expect(POWER_AGENT_OPTIONS).toHaveLength(2);
    const doot = POWER_AGENT_OPTIONS.find((a) => a.key === 'doot')!;
    expect(doot.nameEn).toBe('Doot');
    expect(doot.nameBn).toBe('দূত');
    const tirondaj = POWER_AGENT_OPTIONS.find((a) => a.key === 'tirondaj')!;
    expect(tirondaj.nameEn).toBe('Tirondaj');
  });
});

describe('vocabularies the register row fixes (status columns, never free text)', () => {
  it('six source kinds, in the order the register row lists them', () => {
    expect(LEARNING_SOURCE_KINDS).toEqual(['official_docs', 'practitioner_blog', 'reddit', 'youtube_transcript', 'specialist_social', 'case_study']);
    expect(isLearningSourceKind('official_docs')).toBe(true);
    expect(isLearningSourceKind('tiktok')).toBe(false);
  });

  it('a tip is candidate, verified, failed or promoted, never anything else', () => {
    expect(TIP_STATUSES).toEqual(['candidate', 'verified', 'failed', 'promoted']);
    expect(isTipStatus('verified')).toBe(true);
    expect(isTipStatus('pending')).toBe(false);
  });

  it('a practice task is open, done or missed', () => {
    expect(PRACTICE_TASK_STATUSES).toEqual(['open', 'done', 'missed']);
    expect(isPracticeTaskStatus('open')).toBe(true);
    expect(isPracticeTaskStatus('graded')).toBe(false);
  });

  it('a grade is pass, partial or fail', () => {
    expect(PRACTICE_GRADES).toEqual(['pass', 'partial', 'fail']);
    expect(isPracticeGrade('pass')).toBe(true);
    expect(isPracticeGrade('A+')).toBe(false);
  });
});

describe('a failed tip is recorded with the register row\'s own exact phrase', () => {
  it('is fixed text, never invented per failure', () => {
    expect(DOESNT_WORK_NOTE).toBe("doesn't work for us");
  });
});

describe('LearningEngineError', () => {
  it('carries its own code, status and field details', () => {
    const e = new LearningEngineError('ENGINE_OFF', 409);
    expect(isLearningEngineError(e)).toBe(true);
    expect(e.code).toBe('ENGINE_OFF');
    expect(e.status).toBe(409);
    expect(e.details).toEqual([]);
    expect(isLearningEngineError(new Error('plain'))).toBe(false);
  });

  it('details name the offending field, same shape as every other admin-ai gate error', () => {
    const e = new LearningEngineError('INVALID_INPUT', 400, ['url']);
    expect(e.details).toEqual(['url']);
  });
});

describe('learningEngineCard', () => {
  it('carries only the two settings fields, never the whole settings object by accident', () => {
    const card = learningEngineCard({ on: false, minIndependentSources: 2 });
    expect(card).toEqual({ key: 'learningEngine', value: { on: false, minIndependentSources: 2 }, version: JSON.stringify({ on: false, minIndependentSources: 2 }) });
  });

  it('two different values hash to two different versions — the optimistic-concurrency check FieldsCard relies on', () => {
    const off = learningEngineCard({ on: false, minIndependentSources: 2 });
    const on = learningEngineCard({ on: true, minIndependentSources: 2 });
    const moreSources = learningEngineCard({ on: false, minIndependentSources: 3 });
    expect(off.version).not.toBe(on.version);
    expect(off.version).not.toBe(moreSources.version);
  });

  it('the same value always hashes to the same version, so a stale PUT is caught, not a reordering artifact', () => {
    const a = learningEngineCard({ on: true, minIndependentSources: 1 });
    const b = learningEngineCard({ on: true, minIndependentSources: 1 });
    expect(a.version).toBe(b.version);
  });
});

describe('the paid-tool proposal reuses the one generic approval queue', () => {
  it('its kind is a plain string key, not one of the health/skill GATE_KINDS', () => {
    expect(PAID_TOOL_KIND).toBe('ai.paidTool');
  });

  it('has a technical cost bound, not a spending policy (the owner decides case by case)', () => {
    expect(PAID_TOOL_COST_MAX).toBeGreaterThan(0);
    expect(Number.isFinite(PAID_TOOL_COST_MAX)).toBe(true);
  });
});
