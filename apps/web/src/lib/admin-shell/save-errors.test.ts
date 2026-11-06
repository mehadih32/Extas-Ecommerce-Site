// Follow-up 508: a settings card's refused save names no permission, gone, or signed out in the admin's language,
// whichever spelling the API used; other codes have no shared words (the page's own, or "could not save").
import { describe, expect, it } from 'vitest';
import bn from '../../../messages/admin-shell.bn.json';
import en from '../../../messages/admin-shell.en.json';
import type { Dict } from '../i18n';
import { commonSaveError, commonSaveKey } from './save-errors';

describe('the shared words for a refused save (follow-up 508)', () => {
  it('maps both spellings of the three codes', () => {
    expect(['forbidden', 'FORBIDDEN', 'not-found', 'NOT_FOUND', 'unauthorized', 'UNAUTHENTICATED', 'STALE', 'other'].map(commonSaveKey)).toEqual(['FORBIDDEN', 'FORBIDDEN', 'NOT_FOUND', 'NOT_FOUND', 'UNAUTHENTICATED', 'UNAUTHENTICATED', null, null]);
  });
  it('has words in both languages, and none for another code or a dictionary without them', () => {
    for (const d of [en, bn] as Dict[]) {
      for (const c of ['forbidden', 'NOT_FOUND', 'unauthorized']) expect(commonSaveError(d, c)).toMatch(/\S/);
      expect(commonSaveError(d, 'STALE')).toBeNull();
    }
    expect(commonSaveError(en as Dict, 'forbidden')).not.toBe(commonSaveError(bn as Dict, 'forbidden'));
    expect(commonSaveError({}, 'forbidden')).toBeNull();
  });
});
