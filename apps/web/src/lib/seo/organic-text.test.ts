// S11 · PR 238 — the organic sites list as the admin card edits it, and back.
import { describe, expect, it } from 'vitest';
import { SEO_ORGANIC_DEFAULT } from '@extas/settings';
import { parseSourcesText, sourcesText } from './organic-text';

describe('the organic sites list', () => {
  it('writes one site per line and reads it back the same', () => {
    const ai = sourcesText(SEO_ORGANIC_DEFAULT.sources, 'ai');
    expect(ai.split('\n')[0]).toBe('ChatGPT: chatgpt.com, chat.openai.com, chatgpt');
    expect(parseSourcesText(ai, 'ai').sources).toEqual(SEO_ORGANIC_DEFAULT.sources.filter((s) => s.kind === 'ai'));
  });
  it('skips empty lines and names a line without a name or a word', () => {
    expect(parseSourcesText('Google: Google.com\n\nno colon\n: x.com\nEmpty:', 'search')).toEqual({ sources: [{ name: 'Google', kind: 'search', match: ['google.com'] }], bad: [3, 4, 5] });
  });
});
