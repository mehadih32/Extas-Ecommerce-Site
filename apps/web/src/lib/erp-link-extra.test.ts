// PR 851 — Change ERP connection: the two choices and the adapter mode each one means; a bad choice is refused.
import { describe, expect, it } from 'vitest';
import { ADAPTER_MODE_OF, ErpExtraError, parseModeChoice } from './erp-link-extra';

describe('Change ERP connection (PR 851)', () => {
  it('knows the live ERP and the practice ERP and what each means on the connection', () => {
    expect(parseModeChoice('live')).toBe('live');
    expect(parseModeChoice('practice')).toBe('practice');
    expect(ADAPTER_MODE_OF).toEqual({ live: 'LIVE', practice: 'SANDBOX' });
  });
  it('refuses anything else', () => {
    for (const bad of ['', 'demo', 'LIVE', null, undefined, 3]) expect(() => parseModeChoice(bad)).toThrow(ErpExtraError);
  });
});
