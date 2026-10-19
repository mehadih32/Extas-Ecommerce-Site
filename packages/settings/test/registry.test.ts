// Pure checks on the registry: no database.
import { describe, expect, it } from 'vitest';
import { constraintsOf, definitionColumns, lookup, messages, registry, registryVersion } from '../src';

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

  it('holds no business numbers or secrets (nothing priced, no vault references yet)', () => {
    for (const [key, spec] of entries) {
      expect(['MONEY_MINOR', 'SECRET_REF']).not.toContain(spec.valueType);
      expect(spec.requiresOwnerOk ?? false, key).toBe(false);
    }
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
