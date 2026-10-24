// S08 · PR 554, 179–181 — the courier and fulfilment pages' words: the same keys in Bengali and English, and a label for
// every tab, state, level and refusal the services can answer with, so a page never shows a raw code.
import { describe, expect, it } from 'vitest';
import { PAIR_ARCHIVE_REASONS, ZONE_TABS } from '@extas/shipping';
import bn from '../../../messages/admin-fulfil.bn.json';
import en from '../../../messages/admin-fulfil.en.json';
import { t, type Dict } from '../i18n';
import { fulError } from './words';

const keys = (d: Dict, at = ''): string[] => Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [`${at}${k}`] : keys(v, `${at}${k}.`)));

describe('the fulfilment words (PR 554)', () => {
  it('Bengali and English have the same keys', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
  });

  it('every tab, run state, level and pair source is labelled; refusals fall back to the general words', () => {
    for (const d of [bn, en] as Dict[]) {
      const has = (k: string) => expect(t(d, k), k).not.toBe(k);
      for (const x of ZONE_TABS) has(`ful.courier.tabs.${x}`);
      for (const x of ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']) has(`ful.courier.status.${x}`);
      for (const x of ['CITY', 'ZONE', 'AREA', 'DISTRICT', 'UPAZILA', 'THANA']) has(`ful.courier.level.${x}`);
      for (const x of ['auto', 'staff']) has(`ful.courier.source.${x}`);
      for (const x of ['MOCK', 'SANDBOX', 'LIVE']) has(`ful.couriers.mode.${x}`);
      for (const x of ZONE_TABS) has(`ful.courier.empty${x[0]!.toUpperCase()}${x.slice(1)}`);
      for (const x of ['NOT_FOUND', 'NO_ZONE_LIST', 'DUPLICATE', 'INVALID_INPUT']) has(`ful.err.${x}`);
      expect(fulError(d, 'SOMETHING_NEW')).toBe(t(d, 'ful.err.default'));
    }
    expect(PAIR_ARCHIVE_REASONS).toEqual(['courierDropped', 'staff']);
  });
});
