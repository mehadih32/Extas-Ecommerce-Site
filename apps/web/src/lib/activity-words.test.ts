// PR 1162 — the Activity log's plain words for raw event keys (owner decision 3, p101): no key is ever shown as code.
import { describe, expect, it } from 'vitest';
import { actionWords, keyParts } from './activity-words';
import en from '../../messages/admin-people.en.json';
import bn from '../../messages/admin-people.bn.json';
import type { Dict } from './i18n';

const E = en as unknown as Dict;
const B = bn as unknown as Dict;
const raw = /\b[a-z][A-Za-z0-9]+(\.[a-z][A-Za-z0-9]+)+\b/;

describe('activity words', () => {
  it('splits a key into words', () => {
    expect(keyParts('settings.checkout.codFee_save')).toEqual(['settings', 'checkout', 'cod', 'fee', 'save']);
  });
  it('reads common keys as sentences', () => {
    expect(actionWords(E, 'rule.create')).toBe('Rule created');
    expect(actionWords(E, 'staff.password.change')).toBe('Password changed');
    expect(actionWords(E, 'erp.link.test')).toBe('ERP link tested');
    expect(actionWords(E, 'checkout.settings')).toBe('Checkout settings changed');
    expect(actionWords(E, 'SET')).toBe('Set changed');
    expect(actionWords(B, 'rule.create')).toBe('Rule: তৈরি হয়েছে');
  });
  it('never shows a dotted code name for any key the code writes', () => {
    const keys = ['blog.post.publish', 'media.render', 'combo.rule.sample', 'settings.checkout.cod.save', 'ai.agent.keepOn', 'backups.request.restore'];
    for (const k of keys) {
      expect(actionWords(E, k)).not.toMatch(raw);
      expect(actionWords(B, k)).not.toMatch(raw);
    }
  });
});
