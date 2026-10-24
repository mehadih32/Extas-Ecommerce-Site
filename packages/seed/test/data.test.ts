// Pure checks on the default pack (PR 508), the sample catalogue (PR 14) and the owner-data check (PR 509). No database.
import { describe, expect, it } from 'vitest';
import { loadSchema } from '@extas/db';
import { ownerDataRegister, registry, type RegistryShape } from '@extas/settings';
import {
  builtInDetectors,
  checkOwnerData,
  defaultPack,
  detect,
  guardDetectors,
  parsePack,
  parseSample,
  sampleCatalogue,
  sampleSku,
  type CheckInput,
} from '../src';

const schema = loadSchema();
const detectors = guardDetectors()!;
const base: CheckInput = { registry, register: ownerDataRegister, schema, pack: defaultPack, sample: sampleCatalogue, detectors };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const rules = (input: Partial<CheckInput>) => checkOwnerData({ ...base, ...input }).map((f) => f.rule);

describe('general default pack (PR 508)', () => {
  it('is valid and holds the structure the demo needs', () => {
    expect(defaultPack.key).toBe('general');
    expect(defaultPack.categories.map((c) => c.slug)).toEqual(['polos', 'tshirts', 'shirts', 'panjabi', 'trousers', 'hoodies', 'extras']);
    expect(defaultPack.deliveryBands.map((b) => b.key)).toEqual(['dhaka-city', 'dhaka-sub-area', 'outside-dhaka']);
    // B1.16 (decided): inside Dhaka 24–48 h, outside 48–72 h; the sub-area follows its mode, which the owner picks.
    expect(defaultPack.deliveryBands[0]).toMatchObject({ hoursMin: 24, hoursMax: 48 });
    expect(defaultPack.deliveryBands[2]).toMatchObject({ hoursMin: 48, hoursMax: 72 });
    expect(defaultPack.deliveryBands[1]).not.toHaveProperty('mode');
  });

  it('every category ships hidden (it shows once it has products)', () => {
    for (const c of defaultPack.categories) expect(c.isVisible ?? false, c.slug).toBe(false);
  });

  it('carries no money: a band with a charge or a COD limit is rejected', () => {
    const withCharge = clone(defaultPack) as unknown as { deliveryBands: Record<string, unknown>[] };
    withCharge.deliveryBands[0]!.chargeMinor = 6000;
    expect(() => parsePack(withCharge)).toThrow(/chargeMinor/);
    const withCod = clone(defaultPack) as unknown as { deliveryBands: Record<string, unknown>[] };
    withCod.deliveryBands[0]!.codLimitMinor = 1;
    expect(() => parsePack(withCod)).toThrow(/codLimitMinor/);
  });

  it('templates follow the 2 SMS + 1 WhatsApp rule (B2.5): later steps exist, off', () => {
    const on = defaultPack.notificationTemplates.filter((t) => t.enabled && t.locale === 'bn').map((t) => `${t.channel}:${t.key}`);
    expect(on.sort()).toEqual(['EMAIL:order.placed', 'SMS:order.placed', 'SMS:order.processing', 'WHATSAPP:order.processing']);
    const off = defaultPack.notificationTemplates.filter((t) => !t.enabled).map((t) => t.key);
    // PR 146: the two-size question (WhatsApp and SMS) waits for the owner too
    expect(new Set(off)).toEqual(new Set(['order.pickedUp', 'order.outForDelivery', 'order.delivered', 'order.twoSize']));
    for (const t of defaultPack.notificationTemplates) {
      expect(defaultPack.notificationTemplates.some((o) => o.key === t.key && o.channel === t.channel && o.locale !== t.locale), `${t.key} in both languages`).toBe(true);
    }
  });

  it('templates name only known tokens, never a typed-in amount', () => {
    const bad = clone(defaultPack);
    bad.notificationTemplates[0]!.body = 'Delivery {chargeInside}';
    expect(() => parsePack(bad)).toThrow(/tokens/);
  });

  it('checks references: unknown garment type, parent after child, duplicates', () => {
    const a = clone(defaultPack);
    a.categories[0]!.garmentType = 'cape';
    expect(() => parsePack(a)).toThrow(/unknown garment type/);
    const b = clone(defaultPack);
    b.categories[0]!.parent = 'hoodies';
    expect(() => parsePack(b)).toThrow(/must come before/);
    const c = clone(defaultPack);
    c.categories.push(clone(c.categories[0]!));
    expect(() => parsePack(c)).toThrow(/twice/);
  });
});

describe('sample catalogue (PR 14)', () => {
  it("holds the demo's catalogue: 17 products in the pack's categories, every colour and size known", () => {
    expect(sampleCatalogue.products).toHaveLength(17);
    // follow-up 75: a product may sit in a sample sub-category of a pack category
    const cats = new Set([...defaultPack.categories.map((c) => c.slug), ...sampleCatalogue.subCategories.map((c) => c.slug)]);
    for (const c of sampleCatalogue.subCategories) expect(defaultPack.categories.some((k) => k.slug === c.parent)).toBe(true);
    for (const p of sampleCatalogue.products) expect(cats.has(p.category), p.slug).toBe(true);
    const variants = sampleCatalogue.products.reduce((n, p) => n + p.colours.length * p.sizes.length, 0);
    expect(variants).toBeGreaterThan(200);
    expect(sampleCatalogue.colours).toHaveLength(17);
  });

  it('every SKU says SAMPLE and is unique', () => {
    const skus = sampleCatalogue.products.flatMap((p) => p.colours.flatMap((c) => p.sizes.map((s) => sampleSku(p.code, c, s))));
    expect(new Set(skus).size).toBe(skus.length);
    for (const s of skus) expect(s.startsWith('SAMPLE-')).toBe(true);
  });

  it('rejects a broken sample (unknown colour, stock not one number per size)', () => {
    const a = clone(sampleCatalogue);
    a.products[0]!.colours.push('ultraviolet');
    expect(() => parseSample(a)).toThrow(/unknown colour/);
    const b = clone(sampleCatalogue);
    b.products[0]!.stock.navy = [1];
    expect(() => parseSample(b)).toThrow(/one number per size/);
  });
});

describe('owner-data check (PR 509)', () => {
  it('passes on the shipped registry, register, pack and sample data', () => {
    expect(checkOwnerData(base)).toEqual([]);
  });

  it('uses the hardcode guard patterns (one list for code and data)', () => {
    expect(detectors.map((d) => d.id)).toEqual(expect.arrayContaining(['owner-domain', 'owner-brand', 'phone-bd', 'email', 'secret-github']));
    expect(detect('call 01712345678', detectors)?.id).toBe('phone-bd');
    expect(detect('write to someone@example.com', detectors)).toBeUndefined();
    expect(detect('write to owner@shop.example.bd', builtInDetectors)?.id).toBe('email');
  });

  it("fails when owner data ships with a default, or a key under an owner prefix isn't owner data", () => {
    const withDefault: RegistryShape = { ...registry, 'store.name': { ...registry['store.name'], default: 'A shop' } };
    expect(rules({ registry: withDefault })).toContain('owner-default');
    const sneaky: RegistryShape = { ...registry, 'contact.fax': { ...registry['store.locale'], group: 'contact', isOwnerData: false } };
    expect(rules({ registry: sneaky })).toContain('owner-prefix');
  });

  it('fails when money is not empty and protected (rule 6)', () => {
    const priced: RegistryShape = {
      ...registry,
      'delivery.freeOverMinor': { ...registry['delivery.freeOverMinor'], requiresOwnerOk: false },
      'ai.monthlyCapMinor': { ...registry['ai.monthlyCapMinor'], isOwnerData: false },
    };
    expect(rules({ registry: priced })).toEqual(expect.arrayContaining(['money-unprotected', 'decision-default']));
  });

  it("fails when a default, the pack or the sample carries the owner's values", () => {
    const texted: RegistryShape = {
      ...registry,
      'policy.returns.summary': { ...registry['policy.returns.summary'], default: { en: 'EXTAS returns', bn: 'x' } },
    };
    expect(rules({ registry: texted })).toContain('default-owner-brand');
    const pack = clone(defaultPack);
    pack.categories[0]!.introEn = 'Call 01712345678 for polos';
    expect(rules({ pack })).toContain('pack-phone-bd');
    const sample = clone(sampleCatalogue);
    sample.products[0]!.descriptionEn = 'See new.extas.com.bd';
    expect(rules({ sample })).toContain('sample-owner-domain');
  });

  it('fails when a sample row in an owner table is not plainly sample data', () => {
    const sample = clone(sampleCatalogue);
    sample.customer.name = 'Rahim Uddin';
    sample.customer.phone = '+8801812345678';
    sample.customer.email = 'rahim@mail.example.bd';
    sample.store.name = 'Dhaka Menswear';
    expect(rules({ sample })).toEqual(expect.arrayContaining(['sample-unmarked', 'sample-phone', 'sample-email', 'sample-phone-bd']));
  });

  it('PR 66: a sample question that does not say "Sample" fails', () => {
    const sample = clone(sampleCatalogue);
    expect(rules({ sample })).not.toContain('sample-unmarked');
    sample.questions![0]!.question = 'Does this polo shrink?';
    expect(rules({ sample })).toContain('sample-unmarked');
  });

  it('fails when the register names what the schema lacks, or the export could read a register table', () => {
    const register = {
      ...ownerDataRegister,
      tables: [...ownerDataRegister.tables, { target: 'NoSuchTable', reason: 'records' as const }],
      columns: [...ownerDataRegister.columns, { target: 'Store.nickname', reason: 'brand' as const }],
    };
    expect(rules({ register })).toEqual(expect.arrayContaining(['register-unknown-table', 'register-unknown-column']));
    expect(rules({ exportReads: { Customer: '*', Store: ['name'] } })).toEqual(
      expect.arrayContaining(['export-reads-owner-table', 'export-reads-owner-column']),
    );
  });
});
