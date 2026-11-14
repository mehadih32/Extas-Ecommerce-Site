// S28 · PR 713 — the Training page's history length ships at 10, is checked on the server (5 to 100) and has labels in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { aiTrainingPageSchema } from '../src/registry-ai-training';

describe('ai.trainingPage (v713)', () => {
  it('ships at 10 versions, installation-wide, at version 713', () => {
    const d = registry['ai.trainingPage'];
    expect(d.default).toEqual({ versionRows: 10 });
    expect(d.version).toBe(713);
    expect(d.scope).toBe('installation');
  });
  it('keeps the history length between 5 and 100', () => {
    expect(aiTrainingPageSchema.safeParse({ versionRows: 4 }).success).toBe(false);
    expect(aiTrainingPageSchema.safeParse({ versionRows: 101 }).success).toBe(false);
    expect(aiTrainingPageSchema.safeParse({ versionRows: 25 }).success).toBe(true);
    expect(aiTrainingPageSchema.safeParse({ versionRows: 25, extra: 1 }).success).toBe(false);
  });
  it('has its label and help in English and Bengali', () => {
    for (const lang of ['en', 'bn'] as const) {
      const d = registry['ai.trainingPage'];
      expect(lookup(messages[lang], d.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], d.helpKey!)).toBeTruthy();
    }
  });
});
