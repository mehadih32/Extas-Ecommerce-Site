// PR 718 — Website › Policies, the pure part: the nine pages in the prototype's order, the split between the pages the
// shop already had and the four this tab added, how a stored version is read, and the page's state.
import { HELP_PAGES } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { EMPTY_WORDS, EXISTING_POLICIES, hasWords, isExistingPolicy, isNewPolicy, isPolicySlug, NEW_POLICIES, policyPath, POLICY_SLUGS, sameWords, sourceOfPayload, stateOf, wordsOfPayload } from './model';

const pair = (en: string, bn: string) => ({ en, bn });

describe('the policy pages (PR 718)', () => {
  it('lists the prototype`s nine pages in its order', () => {
    expect([...POLICY_SLUGS]).toEqual(['terms', 'privacy', 'delivery', 'exchange', 'payment', 'cancellation', 'wallet', 'reviews', 'cookies']);
  });

  it('splits them: the five the shop had read Settings, the four new ones are not help pages of Settings', () => {
    expect([...EXISTING_POLICIES, ...NEW_POLICIES]).toEqual([...POLICY_SLUGS]);
    for (const s of EXISTING_POLICIES) expect(HELP_PAGES).toContain(s);
    for (const s of NEW_POLICIES) expect(HELP_PAGES).not.toContain(s);
    expect(isNewPolicy('cookies') && !isExistingPolicy('cookies')).toBe(true);
    expect(isExistingPolicy('terms') && !isNewPolicy('terms')).toBe(true);
    expect(isPolicySlug('faq')).toBe(false);
    expect(isPolicySlug(undefined)).toBe(false);
  });

  it('gives each page its public address', () => {
    expect(policyPath('cancellation')).toBe('/help/cancellation');
  });

  it('reads a stored version defensively', () => {
    const words = { title: pair('Cookies', 'কুকি'), lede: null, body: pair('Text', 'লেখা') };
    expect(wordsOfPayload({ words, source: 'edit' })).toEqual(words);
    expect(wordsOfPayload(null)).toEqual(EMPTY_WORDS);
    expect(wordsOfPayload({ words: { body: 'not a pair' } })).toEqual(EMPTY_WORDS);
    expect(wordsOfPayload({ words: { body: pair('only english', '') } })).toEqual(EMPTY_WORDS); // half a pair is not the setting's shape
    expect(sourceOfPayload({ source: 'settings' })).toBe('settings');
    expect(sourceOfPayload({ source: 'restore' })).toBe('restore');
    expect(sourceOfPayload({})).toBe('edit');
  });

  it('compares words, and knows when none are written', () => {
    expect(hasWords(EMPTY_WORDS)).toBe(false);
    expect(hasWords({ ...EMPTY_WORDS, lede: pair('a', 'b') })).toBe(true);
    expect(sameWords({ title: null, lede: null, body: pair('a', 'b') }, { title: null, lede: null, body: pair('a', 'b') })).toBe(true);
    expect(sameWords(EMPTY_WORDS, { ...EMPTY_WORDS, body: pair('a', 'b') })).toBe(false);
  });

  it('names the state: live, live with a draft waiting, or draft', () => {
    expect(stateOf(true, false)).toBe('published');
    expect(stateOf(true, true)).toBe('published-draft');
    expect(stateOf(false, true)).toBe('draft');
    expect(stateOf(false, false)).toBe('draft');
  });
});
