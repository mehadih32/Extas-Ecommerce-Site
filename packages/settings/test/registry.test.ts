// Pure checks on the registry: no database.
import { describe, expect, it } from 'vitest';
import {
  constraintsOf,
  definitionColumns,
  lookup,
  messages,
  ownerSettingKeys,
  registry,
  registryVersion,
  tokensOf,
  underOwnerPrefix,
} from '../src';

const entries = Object.entries(registry);

describe('settings registry (PR 491)', () => {
  it('has the settings S00 and the app need', () => {
    expect(Object.keys(registry)).toEqual(
      expect.arrayContaining(['store.name', 'store.locale', 'store.timeZone', 'store.currency', 'system.stagingHost']),
    );
  });

  it.each(entries)('%s: default passes its own schema', (_key, spec) => {
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
  });

  it.each(entries)('%s: key is dotted camelCase', (key) => {
    expect(key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/);
  });

  it.each(entries)('%s: label and help exist in English and Bengali', (_key, spec) => {
    for (const k of [spec.labelKey, spec.helpKey].filter((x): x is string => Boolean(x))) {
      expect(lookup(messages.en, k), `en ${k}`).toBeTruthy();
      expect(lookup(messages.bn, k), `bn ${k}`).toBeTruthy();
    }
    expect(lookup(messages.en, `groups.${spec.group}`)).toBeTruthy();
    expect(lookup(messages.bn, `groups.${spec.group}`)).toBeTruthy();
  });

  it.each(entries)('%s: versions are sane', (_key, spec) => {
    expect(Number.isInteger(spec.version) && spec.version >= 1).toBe(true);
    expect(spec.since ?? spec.version).toBeLessThanOrEqual(spec.version);
    expect(spec.version).toBeLessThanOrEqual(registryVersion(registry));
  });

  it.each(entries)('%s: schema converts to JSON Schema for the admin form', (key, spec) => {
    expect(constraintsOf(key, spec)).toHaveProperty('$schema');
    expect(() => definitionColumns(key, spec, messages)).not.toThrow();
  });

  it("owner data ships without a value: the owner's own data has no default (PR 509)", () => {
    for (const [key, spec] of entries) if (spec.isOwnerData) expect(spec.default, key).toBeNull();
  });

  it('money rule (CLAUDE.md rule 6): every money setting and every owner decision ships empty and needs his OK', () => {
    for (const [key, spec] of entries) {
      if (spec.valueType === 'MONEY_MINOR') expect(spec.requiresOwnerOk, key).toBe(true);
      if (spec.requiresOwnerOk) {
        // An owner decision is the owner's own data (real prices and charges are owner data, App. B.4 #13).
        expect(spec.isOwnerData, key).toBe(true);
        expect(spec.default, key).toBeNull();
      }
    }
    expect(entries.filter(([, s]) => s.valueType === 'MONEY_MINOR').map(([k]) => k)).toEqual(
      expect.arrayContaining(['delivery.freeOverMinor', 'ai.monthlyCapMinor']),
    );
  });

  it('holds no vault references yet (keys live in the vault, PR 493)', () => {
    for (const [, spec] of entries) expect(spec.valueType).not.toBe('SECRET_REF');
  });

  it('PR 509: every key under an owner prefix is declared as owner data', () => {
    for (const [key, spec] of entries) if (underOwnerPrefix(key)) expect(spec.isOwnerData, key).toBe(true);
    expect(ownerSettingKeys(registry)).toEqual(
      expect.arrayContaining(['store.name', 'brand.logo', 'contact.phone', 'legal.dbid', 'social.facebook', 'payment.bank.accounts']),
    );
  });

  it('PR 508: policy texts default to both languages and only name their own {tokens}', () => {
    const exchange = registry['policy.exchange.summary'];
    expect(tokensOf(exchange.default.en)).toEqual(['windowHours']);
    expect(tokensOf(exchange.default.bn)).toEqual(['windowHours']);
    expect(exchange.schema.safeParse({ en: 'Within {windowHours} hours', bn: '{windowHours} ঘণ্টা' }).success).toBe(true);
    expect(exchange.schema.safeParse({ en: 'Pay {chargeInside}', bn: 'x' }).success).toBe(false);
    expect(registry['policy.orderEdit.summary'].schema.safeParse(registry['policy.orderEdit.summary'].default).success).toBe(true);
  });

  it('validates phones, links and wallet numbers', () => {
    expect(registry['contact.phone'].schema.safeParse('+8801000000000').success).toBe(true);
    expect(registry['contact.phone'].schema.safeParse('017 not a number').success).toBe(false);
    expect(registry['social.facebook'].schema.safeParse('https://example.com/page').success).toBe(true);
    expect(registry['social.facebook'].schema.safeParse('http://example.com/page').success).toBe(false);
    expect(registry['payment.wallet.numbers'].schema.safeParse([{ provider: 'mock', number: '+8801000000000', kind: 'merchant' }]).success).toBe(true);
    expect(registry['theme.preset'].schema.safeParse('noir').success).toBe(true);
    expect(registry['theme.preset'].schema.safeParse('neon').success).toBe(false);
  });

  it('validates locale, time zone, currency and host', () => {
    expect(registry['store.locale'].schema.safeParse('en-GB').success).toBe(true);
    expect(registry['store.locale'].schema.safeParse('not a locale').success).toBe(false);
    expect(registry['store.timeZone'].schema.safeParse('Europe/London').success).toBe(true);
    expect(registry['store.timeZone'].schema.safeParse('Mars/Olympus').success).toBe(false);
    expect(registry['store.currency'].schema.safeParse('USD').success).toBe(true);
    expect(registry['store.currency'].schema.safeParse('usd').success).toBe(false);
    expect(registry['store.currency'].schema.safeParse('XYZ').success).toBe(false);
    expect(registry['system.stagingHost'].schema.safeParse('preview.example.com').success).toBe(true);
    expect(registry['system.stagingHost'].schema.safeParse('https://preview.example.com/').success).toBe(false);
  });
});
