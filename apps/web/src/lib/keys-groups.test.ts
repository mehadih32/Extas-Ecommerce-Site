// PR 1020 (D12) — Keys & connections as the prototype draws it: every real connection has one place (a group, on the page or under
// "More options"), the prototype's rows are all there in its order and words, a row's status is worked out the way the prototype's
// three cards count it, and a key's last 4 characters are kept only when the key is long enough to give nothing away.
import { connectionCatalogue } from '@extas/adapters';
import { describe, expect, it } from 'vitest';
import en from '../../messages/admin.en.json';
import bn from '../../messages/admin.bn.json';
import { KEY_GROUPS, MAIN_ROWS, MORE_ROWS, agoParts, keyState, maskOf, placeOf } from './keys-groups';
import { keyHintOf } from './integrations';

describe('keys-groups (PR 1020)', () => {
  it('puts every declared connection in exactly one place, and lists nothing that is not declared', () => {
    const declared = new Set(connectionCatalogue.map((c) => c.id));
    const listed = KEY_GROUPS.flatMap((g) => [...MAIN_ROWS[g], ...MORE_ROWS[g]]);
    expect(new Set(listed).size).toBe(listed.length);
    for (const id of declared) expect(listed, id).toContain(id);
    for (const id of listed) expect(declared.has(id), id).toBe(true);
  });
  it('has the prototype\'s seven groups with its rows, in its words', () => {
    expect(KEY_GROUPS).toEqual(['pay', 'cour', 'msg', 'ads', 'safe', 'ai', 'erp']);
    const names = (d: typeof en) => KEY_GROUPS.flatMap((g) => MAIN_ROWS[g]).map((id) => (d.connections as Record<string, { name: string }>)[id]!.name);
    expect(names(en)).toEqual(['bKash', 'Nagad', 'SSLCommerz (cards)', 'Pathao', 'Steadfast', 'RedX', 'SMS gateway', 'WhatsApp Business', 'Email sending', 'Meta (Facebook & Instagram ads)', 'Google Ads', 'TikTok Ads', 'Google Search Console', 'Google Merchant Center', 'Google Drive (backups)', 'Telegram bot', 'Claude', 'OpenAI', 'Gemini', 'Extas ERP link']);
    expect(en.integrations.keys.group).toEqual({ pay: 'Payments', cour: 'Couriers', msg: 'Messages', ads: 'Ads & Google', safe: 'Backups & alerts', ai: 'AI providers', erp: 'ERP' });
    expect(Object.keys(bn.integrations.keys.group)).toEqual(Object.keys(en.integrations.keys.group));
  });
  it('places a connection on the page or under More options', () => {
    expect(placeOf('bkash')).toEqual({ group: 'pay', more: false });
    expect(placeOf('cloudflare')).toEqual({ group: 'safe', more: true });
    expect(placeOf('somethingNew').more).toBe(true);
  });
  it('works out the status', () => {
    const base = { adapter: true, builtIn: false, managedAt: null, keySaved: false, enabled: false, mode: null, lastTest: null, inUse: false } as const;
    expect(keyState({ ...base })).toBe('none');
    expect(keyState({ ...base, adapter: false })).toBe('later');
    expect(keyState({ ...base, keySaved: true, enabled: true, mode: 'LIVE', lastTest: { at: '', ok: true, message: null } })).toBe('ok');
    expect(keyState({ ...base, keySaved: true, enabled: false, mode: 'MOCK', lastTest: { at: '', ok: false, message: 'no' } })).toBe('err');
    expect(keyState({ ...base, keySaved: true, enabled: false, mode: 'MOCK' })).toBe('err');
    expect(keyState({ ...base, builtIn: true, inUse: true })).toBe('ok');
    expect(keyState({ ...base, managedAt: '/x', enabled: true, mode: 'LIVE' })).toBe('ok');
    expect(keyState({ ...base, managedAt: '/x' })).toBe('none');
  });
  it('keeps the last 4 characters only of a long key and masks the rest', () => {
    expect(keyHintOf('abcdefghijkl7A2C')).toBe('7A2C');
    expect(keyHintOf('short')).toBeNull();
    expect(keyHintOf(undefined)).toBeNull();
    expect(maskOf('7A2C')).toBe('••••7A2C');
    expect(maskOf(null)).toBe('••••');
  });
  it('says how long ago', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    expect(agoParts('2026-11-16T11:51:00Z', now)).toEqual({ unit: 'min', n: 9 });
    expect(agoParts('2026-11-16T06:00:00Z', now)).toEqual({ unit: 'h', n: 6 });
    expect(agoParts('2026-11-13T12:00:00Z', now)).toEqual({ unit: 'd', n: 3 });
    expect(agoParts('2026-11-16T12:00:00Z', now).unit).toBe('now');
  });
});
