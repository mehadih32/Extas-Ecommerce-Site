// PR 500 — the admin screens without a database: both messages files carry the same keys, every declared connection
// and field has its labels, the language choice, the sign-in return path, and the save form's checks.
import { describe, expect, it } from 'vitest';
import { connectionCatalogue, findConnection } from '@extas/adapters';
import bn from '../../messages/admin.bn.json';
import en from '../../messages/admin.en.json';
import { adminLocale, pickAdminLang } from './admin-i18n';
import { ADMIN_HOME, ADMIN_PAGES, safeNext } from './admin-nav';
import { t, type Dict } from './i18n';
import { parseSave } from './integrations';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

describe('admin messages (Bengali first, English beside it)', () => {
  it('both languages have exactly the same keys, none empty', () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    for (const k of keys(bn)) {
      expect(t(bn, k), `bn ${k}`).not.toBe('');
      expect(t(en, k), `en ${k}`).not.toBe('');
    }
  });

  it('English has no Bengali except the language switch', () => {
    const BN = /[ঀ-৿]/;
    for (const k of keys(en)) if (!['lang.bn', 'lang.bnShort', 'frame.lang'].includes(k)) expect(BN.test(t(en, k)), k).toBe(false);
  });

  it('every declared connection, field, page and mode has its labels', () => {
    for (const c of connectionCatalogue) {
      for (const d of [bn, en]) {
        expect(t(d, `connections.${c.id}.name`)).not.toBe(`connections.${c.id}.name`);
        expect(t(d, `connections.${c.id}.desc`)).not.toBe(`connections.${c.id}.desc`);
        for (const f of [...c.secrets, ...c.config]) expect(t(d, `connections.${c.id}.fields.${f.field}`)).not.toBe(`connections.${c.id}.fields.${f.field}`);
      }
    }
    for (const p of ADMIN_PAGES) expect(t(bn, `nav.${p.key}`)).not.toBe(`nav.${p.key}`);
    for (const m of ['MOCK', 'SANDBOX', 'LIVE']) expect(t(bn, `integrations.mode.${m}`)).not.toContain('integrations.');
  });

  it('every error code the integrations API sends has a text', () => {
    for (const code of ['INVALID_INPUT', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_CONNECTED', 'NOT_AVAILABLE', 'NOT_FOUND', 'VAULT_NOT_CONFIGURED', 'cross-site-request', 'database-not-configured', 'server-error', 'network', 'invalid-credentials', 'locked']) {
      expect(t(bn, `errors.${code}`)).not.toBe(`errors.${code}`);
    }
  });
});

describe('admin language and return path', () => {
  it('the cookie wins, then the store locale, then Bengali', () => {
    expect(pickAdminLang('en', 'bn-BD')).toBe('en');
    expect(pickAdminLang(null, 'en-GB')).toBe('en');
    expect(pickAdminLang('fr', 'bn-BD')).toBe('bn');
    expect(pickAdminLang(undefined, undefined)).toBe('bn');
    expect(adminLocale('bn', 'bn-BD')).toBe('bn-BD');
    expect(adminLocale('en', 'bn-BD')).toBe('en');
  });

  it('after sign-in only an admin path is followed (no open redirect)', () => {
    expect(safeNext('/admin/integrations')).toBe('/admin/integrations');
    for (const bad of ['https://evil.example.test', '//evil.example.test', '/admin/../status', '/admin/login', '/status', undefined]) expect(safeNext(bad)).toBe(ADMIN_HOME);
  });
});

describe('the save form (parseSave)', () => {
  const azure = findConnection('azureBlob')!;

  it('takes the declared fields and trims them; an empty optional field is left out', () => {
    const r = parseSave(azure, { secrets: { accountKey: '  c2FtcGxl  ' }, config: { accountName: 'samplestore', container: 'media', endpoint: '' } });
    expect(r).toEqual({ secrets: { accountKey: 'c2FtcGxl' }, config: { accountName: 'samplestore', container: 'media' } });
  });

  it('names missing, unknown and invalid fields (never their values)', () => {
    const r = parseSave(azure, { secrets: { other: 'x' }, config: { container: 'media' } });
    expect('bad' in r && r.bad.sort()).toEqual(['config.accountName', 'secrets.accountKey', 'secrets.other']);
    const bad = parseSave(azure, { secrets: { accountKey: 'c2FtcGxl' }, config: { accountName: 'NOT valid', container: 'media' } });
    expect(bad).toEqual({ bad: ['config.accountName'] });
    expect(parseSave(azure, { secrets: 'nope', config: [] })).toHaveProperty('bad');
  });
});
