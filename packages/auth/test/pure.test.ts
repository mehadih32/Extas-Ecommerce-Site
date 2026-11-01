// Pure checks: hashing, password rules, tokens, TOTP (RFC 6238 vectors), the catalogue and the policy. No database.
import { describe, expect, it } from 'vitest';
import { lookup, registry } from '@extas/settings';
import {
  authMessages,
  base32Decode,
  base32Encode,
  counterAt,
  customerPasswordIssues,
  defaultSecurityPolicy,
  hashPassword,
  hashToken,
  httpStatus,
  isWellFormedToken,
  needsRehash,
  newToken,
  otpauthUri,
  ACCESS_TREE,
  CHECK_PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSIONS,
  PIN_PERMISSIONS,
  permissionCatalogue,
  staffPasswordIssues,
  totpAt,
  verifyPassword,
  verifyTotp,
} from '../src';

describe('password hashing (PR 15)', () => {
  it('hashes with scrypt, a fresh salt each time, and verifies', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a).toMatch(/^scrypt\$ln=15,r=8,p=1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse battery staple', a)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', a)).toBe(false);
    expect(needsRehash(a)).toBe(false);
  });

  it('never matches a malformed hash and asks to re-hash an old cost', async () => {
    expect(await verifyPassword('x', 'plain-text')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$ln=99,r=8,p=1$AAAA$AAAA')).toBe(false);
    expect(needsRehash('scrypt$ln=14,r=8,p=1$AAAA$AAAA')).toBe(true);
  });
});

describe('password rules come from settings (PR 15)', () => {
  const policy = defaultSecurityPolicy();

  it('staff: length, common passwords, own e-mail', () => {
    expect(staffPasswordIssues('short', policy)).toContain('too-short');
    expect(staffPasswordIssues('password1234', policy)).toContain('common');
    expect(staffPasswordIssues('sample.person-2026!', policy, { email: 'sample.person@example.com' })).toContain('contains-email');
    expect(staffPasswordIssues('a long sentence nobody guesses', policy, { email: 'sample@example.com' })).toEqual([]);
    expect(staffPasswordIssues('x'.repeat(policy.passwordMaxLength + 1), policy)).toContain('too-long');
  });

  it('a changed setting changes the rule', () => {
    const relaxed = defaultSecurityPolicy({ staffPasswordMinLength: 8, blockCommonPasswords: false });
    expect(staffPasswordIssues('password', relaxed)).toEqual([]);
  });

  it('customers: only the length, so the mobile number works as the first password', () => {
    expect(customerPasswordIssues('01000000000'.replace(/0/g, '5'), policy)).toEqual([]);
    expect(customerPasswordIssues('123', policy)).toEqual(['too-short']);
  });

  it('the default policy is exactly the declared setting defaults', () => {
    const p = defaultSecurityPolicy();
    expect(p.staffTwoFactorRequired).toBe(registry['security.staffTwoFactorRequired'].default);
    expect(p.staffTwoFactorRequired).toBe(false);
    expect(p.loginMaxAttempts).toBe(registry['security.loginMaxAttempts'].default);
    expect(Object.values(p).every((v) => v !== undefined)).toBe(true);
  });
});

describe('tokens', () => {
  it('are random, well formed, and stored only as a hash', () => {
    const t = newToken();
    expect(isWellFormedToken(t)).toBe(true);
    expect(newToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(isWellFormedToken('x')).toBe(false);
    expect(isWellFormedToken(`${t}'; drop`)).toBe(false);
  });
});

describe('TOTP (RFC 6238)', () => {
  const seed = Buffer.from('12345678901234567890');

  it('matches the RFC test vectors (6 digits)', () => {
    expect(totpAt(seed, counterAt(new Date(59_000)))).toBe('287082');
    expect(totpAt(seed, counterAt(new Date(1_111_111_109_000)))).toBe('081804');
    expect(totpAt(seed, counterAt(new Date(1_234_567_890_000)))).toBe('005924');
  });

  it('accepts a code within the allowed drift only, and says which step matched', () => {
    const now = new Date(1_111_111_109_000);
    const code = totpAt(seed, counterAt(now) - 1);
    expect(verifyTotp(seed, code, now, 1)).toBe(counterAt(now) - 1);
    expect(verifyTotp(seed, code, now, 0)).toBeNull();
    expect(verifyTotp(seed, 'abcdef', now, 1)).toBeNull();
  });

  it('round-trips base32 and builds the authenticator link', () => {
    expect(base32Decode(base32Encode(seed)).equals(seed)).toBe(true);
    expect(base32Encode(seed)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    const uri = otpauthUri(seed, { issuer: 'Sample shop', account: 'staff@example.com' });
    expect(uri).toMatch(/^otpauth:\/\/totp\/Sample%20shop:staff%40example\.com\?secret=GEZDGNBV/);
  });
});

describe('permission catalogue (PR 16, 495)', () => {
  it('every permission and group has an English and a Bengali label', () => {
    for (const key of PERMISSION_KEYS) {
      expect(lookup(authMessages.en, `permissions.${key}`), key).toBeTruthy();
      expect(lookup(authMessages.bn, `permissions.${key}`), key).toBeTruthy();
      const g = PERMISSIONS[key].group;
      expect(lookup(authMessages.en, `permissionGroups.${g}`), g).toBeTruthy();
      expect(lookup(authMessages.bn, `permissionGroups.${g}`), g).toBeTruthy();
    }
    expect(permissionCatalogue()).toHaveLength(PERMISSION_KEYS.length);
  });

  it('CN-028 §12: the books and ERP keys are in the catalogue and in the access tree, each once, under its group', () => {
    const erpKeys = ['books.read', 'books.reconcile', 'books.adjust', 'books.close', 'erp.account.read', 'erp.payments.record', 'returns.handback', 'exchange.approve', 'fixedcosts.write'];
    for (const k of erpKeys) expect(PERMISSION_KEYS, k).toContain(k);
    const inTree = ACCESS_TREE.flatMap((b) => b.keys);
    expect([...inTree].sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(new Set(inTree).size).toBe(inTree.length);
    for (const b of ACCESS_TREE) for (const k of b.keys) expect(PERMISSIONS[k].group, k).toBe(b.group);
    // ~~expect(ACCESS_TREE.find((b) => b.group === 'books')?.keys).toEqual(['books.read', 'books.reconcile', 'books.adjust', 'books.close', 'erp.account.read', 'erp.payments.record', 'fixedcosts.write']);~~
    // PR 343: the cost ledger's `costs.write` joins the books group.
    // ~~expect(ACCESS_TREE.find((b) => b.group === 'books')?.keys).toEqual(['books.read', 'books.reconcile', 'books.adjust', 'books.close', 'erp.account.read', 'erp.payments.record', 'fixedcosts.write', 'costs.write']);~~
    // PR 350: the VAT system's `vat.manage` joins the books group after it.
    expect(ACCESS_TREE.find((b) => b.group === 'books')?.keys).toEqual(['books.read', 'books.reconcile', 'books.adjust', 'books.close', 'erp.account.read', 'erp.payments.record', 'fixedcosts.write', 'costs.write', 'vat.manage']);
    // A correction of the books and a month closed with differences also need the owner's PIN.
    expect([...PIN_PERMISSIONS]).toEqual(['books.adjust', 'books.close']);
    // The read-only smoke check account may see the books, never change them or record money.
    expect(CHECK_PERMISSIONS).toEqual(expect.arrayContaining(['books.read', 'erp.account.read']));
    for (const k of ['books.reconcile', 'books.adjust', 'books.close', 'erp.payments.record', 'fixedcosts.write', 'costs.write', 'vat.manage', 'returns.handback', 'exchange.approve']) expect(CHECK_PERMISSIONS, k).not.toContain(k);
  });

  it('keys look like area.action', () => {
    for (const key of PERMISSION_KEYS) expect(key).toMatch(/^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*)+$/);
  });

  it('maps refusals to HTTP statuses', () => {
    expect(httpStatus('UNAUTHENTICATED')).toBe(401);
    expect(httpStatus('FORBIDDEN')).toBe(403);
    expect(httpStatus('ESCALATION')).toBe(403);
    expect(httpStatus('INVALID_INPUT')).toBe(400);
  });
});
