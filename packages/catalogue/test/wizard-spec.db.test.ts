// S28 · PR 1030 — the wizard's own answers on a real PostgreSQL: who may read and change them, only a draft, a set's bottom
// piece, empty before the first save, the price on every kept variant (and not on the ones kept off the shop), the PIN-free
// core of the price step, store isolation, audited.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { readWizardColourNames, readWizardSpec, saveWizardSpec, setWizardColourName, setWizardPrice, type CatalogueDeps, type SettingsReader, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('wizard answers on PostgreSQL (PR 1030)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings });
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  let editor: Actor;
  let pricer: Actor;
  let reader: Actor;
  let draft = '';
  let bottom = '';
  let live = '';
  let other = '';
  let sizeS = '';
  let sizeM = '';
  let navy = '';
  let black = '';

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_wizard_spec');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    editor = await staff('ws-editor@example.com', ['catalogue.read', 'catalogue.write']);
    pricer = await staff('ws-pricer@example.com', ['catalogue.read', 'catalogue.write', 'catalogue.prices']);
    reader = await staff('ws-reader@example.com', ['catalogue.read']);
    const mk = (storeId: number, slug: string, status: 'DRAFT' | 'PUBLISHED') => t.prisma.product.create({ data: { storeId, slug, nameEn: slug, status }, select: { id: true } });
    draft = (await mk(A, 'ws-draft', 'DRAFT')).id;
    bottom = (await mk(A, 'ws-bottom', 'PUBLISHED')).id;
    live = (await mk(A, 'ws-live', 'PUBLISHED')).id;
    other = (await mk(B, 'ws-other', 'PUBLISHED')).id;
    sizeS = (await t.prisma.size.create({ data: { storeId: A, key: 'ws-s', label: 'S' }, select: { id: true } })).id;
    sizeM = (await t.prisma.size.create({ data: { storeId: A, key: 'ws-m', label: 'M' }, select: { id: true } })).id;
    navy = (await t.prisma.colour.create({ data: { storeId: A, key: 'ws-navy', nameEn: 'Navy', hex: '#1f2a44' }, select: { id: true } })).id;
    black = (await t.prisma.colour.create({ data: { storeId: A, key: 'ws-black', nameEn: 'Black', hex: '#111111' }, select: { id: true } })).id;
    for (const [i, colourId] of [navy, black].entries()) await t.prisma.productColour.create({ data: { storeId: A, productId: draft, colourId, sortOrder: i } });
    let n = 0;
    for (const colourId of [navy, black])
      for (const sizeId of [sizeS, sizeM])
        await t.prisma.productVariant.create({ data: { storeId: A, productId: draft, colourId, sizeId, sku: `WS-${(n += 1)}`, shopPriceMinor: 70_000 } });
  }, 300_000);
  afterAll(async () => t?.drop());

  it('reads as empty before the first save', async () => {
    const s = await readWizardSpec(deps(), as(reader), draft);
    expect(s).toMatchObject({ kind: null, bottomProductId: null, details: {}, hiddenSizeIds: [], finder: [], bGrade: false, priceConfirmedAt: null, inCombos: true });
  });

  it('lets only someone who may write change the answers', async () => {
    expect(await code(saveWizardSpec(deps(), as(reader), draft, { forWho: 'MEN' }))).toBe('FORBIDDEN');
    expect(await code(saveWizardSpec(deps(), as(editor), draft, { forWho: 'MEN' }))).toBe('ok');
  });

  it('keeps what was sent, changes only that, and writes the audit row', async () => {
    await saveWizardSpec(deps(), as(editor), draft, { kind: 'SINGLE', fit: 'SLIM', details: { fabric: 'Cotton piqué', gsm: '220' }, keyPoints: 'Rib collar · Machine wash cold' });
    const s = await saveWizardSpec(deps(), as(editor), draft, { sizesRun: 'LARGE', hiddenSizeIds: [sizeS], bGrade: true, inCombos: false, modelHeight: "5'10", modelWeightKg: 72, modelWears: 'M' });
    expect(s).toMatchObject({ kind: 'SINGLE', fit: 'SLIM', sizesRun: 'LARGE', hiddenSizeIds: [sizeS], bGrade: true, inCombos: false, modelHeight: "5'10", modelWeightKg: 72, modelWears: 'M' });
    expect(s.details).toEqual({ fabric: 'Cotton piqué', gsm: '220' });
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: draft }, select: { inCombos: true } })).inCombos).toBe(false);
    const audit = await t.prisma.auditLog.count({ where: { storeId: A, action: 'product.wizard.save', entityId: draft } });
    expect(audit).toBe(3);
  });

  it('clears an answer with null and refuses nonsense', async () => {
    const s = await saveWizardSpec(deps(), as(editor), draft, { details: null, finder: [{ size: 'S', h1: "5'2", h2: "5'5", w1: 50, w2: 58 }] });
    expect(s.details).toEqual({});
    expect(s.finder).toHaveLength(1);
    expect(await code(saveWizardSpec(deps(), as(editor), draft, { fit: 'TIGHT' as never }))).toBe('INVALID_INPUT');
    expect(await code(saveWizardSpec(deps(), as(editor), draft, { modelWeightKg: -1 }))).toBe('INVALID_INPUT');
  });

  it('takes a set\'s bottom piece only from this shop and never the product itself', async () => {
    expect(await code(saveWizardSpec(deps(), as(editor), draft, { kind: 'SET', bottomProductId: bottom, colourLink: 'SAME' }))).toBe('ok');
    expect(await code(saveWizardSpec(deps(), as(editor), draft, { bottomProductId: other }))).toBe('NOT_FOUND');
    expect(await code(saveWizardSpec(deps(), as(editor), draft, { bottomProductId: draft }))).toBe('INVALID_INPUT');
  });

  it('keeps answers only on a draft and never reads another shop\'s product', async () => {
    expect(await code(saveWizardSpec(deps(), as(editor), live, { forWho: 'MEN' }))).toBe('CONFLICT');
    expect(await code(readWizardSpec(deps(), as(editor), other))).toBe('NOT_FOUND');
  });

  it('prices every variant that is kept on the shop and not the ones kept off it', async () => {
    expect(await code(setWizardPrice(deps(), as(editor), draft, { priceMinor: 120_000 }))).toBe('FORBIDDEN');
    await saveWizardSpec(deps(), as(editor), draft, { hiddenSizeIds: [sizeS], hiddenColourIds: [] });
    const r = await setWizardPrice(deps(), as(pricer), draft, { priceMinor: 120_000, compareAtMinor: 150_000 });
    expect(r).toMatchObject({ variants: 2, priceMinor: 120_000, compareAtMinor: 150_000 });
    const rows = await t.prisma.productVariant.findMany({ where: { productId: draft }, orderBy: { sku: 'asc' }, select: { sizeId: true, priceMinor: true, compareAtMinor: true } });
    expect(rows.filter((v) => v.sizeId === sizeM).every((v) => v.priceMinor === 120_000 && v.compareAtMinor === 150_000)).toBe(true);
    expect(rows.filter((v) => v.sizeId === sizeS).every((v) => v.priceMinor === null)).toBe(true);
    expect((await readWizardSpec(deps(), as(pricer), draft)).priceConfirmedAt).not.toBeNull();
  });

  it('refuses a price at or under the buying price, or a crossed-out price under the selling price', async () => {
    expect(await code(setWizardPrice(deps(), as(pricer), draft, { priceMinor: 70_000 }))).toBe('INVALID_INPUT');
    expect(await code(setWizardPrice(deps(), as(pricer), draft, { priceMinor: 100_000, compareAtMinor: 90_000 }))).toBe('INVALID_INPUT');
    expect(await code(setWizardPrice(deps(), as(pricer), live, { priceMinor: 100_000 }))).toBe('CONFLICT');
  });

  it('gives a colour its own name on this draft and takes it away again', async () => {
    expect(await code(setWizardColourName(deps(), as(reader), draft, { colourId: navy, name: 'Midnight' }))).toBe('FORBIDDEN');
    expect(await setWizardColourName(deps(), as(editor), draft, { colourId: navy, name: 'Midnight' })).toEqual({ colourId: navy, name: 'Midnight' });
    expect(await readWizardColourNames(deps(), as(reader), draft)).toEqual({ [navy]: 'Midnight' });
    // the colour list's own name, or an empty one, means "no own name"
    expect((await setWizardColourName(deps(), as(editor), draft, { colourId: navy, name: 'navy' })).name).toBeNull();
    await setWizardColourName(deps(), as(editor), draft, { colourId: black, name: 'Jet' });
    await setWizardColourName(deps(), as(editor), draft, { colourId: black, name: '' });
    expect(await readWizardColourNames(deps(), as(reader), draft)).toEqual({});
    expect((await t.prisma.colour.findUniqueOrThrow({ where: { id: navy } })).nameEn).toBe('Navy');
    expect(await code(setWizardColourName(deps(), as(editor), draft, { colourId: '019d0000-0000-7000-8000-000000000000', name: 'x' }))).toBe('NOT_FOUND');
  });
});
