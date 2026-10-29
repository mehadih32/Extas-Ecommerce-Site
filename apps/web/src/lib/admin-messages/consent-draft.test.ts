// PR 298 — the Consent form's words as typed and what a save sends.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { consentChanges, consentDraft, wordsOf } from './consent-draft';

const base = registry['messages.consent'].default;

describe('the Consent form', () => {
  it('reads words split by commas or lines, trimmed, each once', () => {
    expect(wordsOf(' STOP, stop ,UNSUBSCRIBE\nবন্ধ,, no  more ')).toEqual(['STOP', 'UNSUBSCRIBE', 'বন্ধ', 'no more']);
    expect(wordsOf('')).toEqual([]);
  });

  it('sends nothing until something changed, then the whole setting', () => {
    const d = consentDraft(base);
    expect(consentChanges(d, base)).toEqual({});
    expect(consentChanges({ ...d, stopWords: `${d.stopWords}, QUIT` }, base).consent?.stopWords).toEqual([...base.stopWords, 'QUIT']);
    expect(consentChanges({ ...d, confirmReply: true }, base)).toEqual({ consent: { ...base, confirmReply: true } });
  });
});
