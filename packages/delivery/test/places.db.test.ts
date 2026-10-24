// PR 502 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the owner's area admin — open a place, rename it
// (the old name stays a spelling), edit its spellings, add a place the list lacks (straight onto a band), merge two
// spellings of one place (archived, never deleted; the places under it and saved addresses follow; different bands on
// the list refused), and a later import that keeps the owner's names and never brings a merged place back. The
// sub-area band's own switch: off, its places go by the map. Every change needs `delivery.areas` and is audited.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { addPlace, forgetGazetteer, importGazetteer, listBands, loadBandMap, mergePlace, placeDetail, renamePlace, searchPlaces, setAreaBand, setPlaceAliases, updateBand, type Who } from '../src';
import { sampleGazetteerRows } from '../src/sample';
import { codeOf, setUp, type Fixture } from './fixture';

describe.skipIf(!HAS_TEST_DB)('the owner\'s area admin on PostgreSQL (PR 502)', () => {
  let f: Fixture;
  let viewer: Actor;
  let lister: Actor;
  let charger: Actor;
  const who = (actor: Actor): Who => ({ actor, storeId: f.A });
  const geo = (id: string) => f.t.prisma.geoArea.findUniqueOrThrow({ where: { id }, select: { nameEn: true, nameBn: true, aliases: true, archivedAt: true, parentId: true, ancestorIds: true, code: true, level: true } });

  beforeAll(async () => {
    f = await setUp('delivery_places');
    viewer = await f.staff('viewer@example.com', ['delivery.read'], f.A);
    lister = await f.staff('areas@example.com', ['delivery.read', 'delivery.areas'], f.A);
    charger = await f.staff('charges@example.com', ['delivery.read', 'delivery.charges'], f.A);
  });
  afterAll(async () => {
    forgetGazetteer();
    await f?.t.drop();
  });

  it('opens a place; renames it with the old name kept as a spelling; a same-name sibling is refused; the permission is checked', async () => {
    const kaliakair = await f.area('bd.dhaka.gazipur.kaliakair');
    const d = await placeDetail(f.deps(), who(viewer), kaliakair);
    expect(d).toMatchObject({ nameEn: 'Kaliakair', level: 'UPAZILA', ownerMade: false, listed: null, now: { bandKey: 'outside-dhaka' } });
    expect(await codeOf(renamePlace(f.deps(), who(viewer), kaliakair, { nameEn: 'Kaliakoir' }))).toBe('FORBIDDEN');
    expect(await codeOf(renamePlace(f.deps(), who(lister), kaliakair, { nameEn: 'Kapasia' }))).toBe('DUPLICATE_PLACE');
    expect(await codeOf(renamePlace(f.deps(), who(lister), kaliakair, {}))).toBe('INVALID_INPUT');
    const r = await renamePlace(f.deps(), who(lister), kaliakair, { nameEn: 'Kaliakoir Town' });
    expect(r.nameEn).toBe('Kaliakoir Town');
    expect(r.aliases).toContain('Kaliakair');
    expect((await searchPlaces(f.deps(), who(viewer), 'kaliakair')).map((p) => p.id)).toContain(kaliakair); // old addresses still find it
    expect(await f.t.prisma.auditLog.count({ where: { action: 'delivery.place.rename', entityId: kaliakair, actorId: lister.staffUserId } })).toBe(1);
  });

  it('replaces the spellings: tidied, each once, never one of its own names', async () => {
    const tongi = await f.area('bd.dhaka.gazipur.gazipur-sadar.tongi');
    const d = await setPlaceAliases(f.deps(), who(lister), tongi, { aliases: ['  tongee ', 'Tongee', 'Tongi', 'টঙ্গী', 'tongi bazar', ''] });
    expect(d.aliases).toEqual(['tongee', 'tongi bazar']);
    expect(await codeOf(setPlaceAliases(f.deps(), who(lister), tongi, { aliases: 'tongee' }))).toBe('INVALID_INPUT');
    expect((await searchPlaces(f.deps(), who(viewer), 'tongi baz')).map((p) => p.id)).toContain(tongi);
  });

  it('adds a place the list lacks, under its parent, straight onto a band; a second one of the same name is refused', async () => {
    const sreepur = await f.area('bd.dhaka.gazipur.sreepur');
    const sub = await f.band('dhaka-sub-area');
    expect(await codeOf(addPlace(f.deps(), who(lister), { parentId: sreepur, level: 'DISTRICT', nameEn: 'Nolkhola' }))).toBe('INVALID_INPUT');
    const made = await addPlace(f.deps(), who(lister), { parentId: sreepur, nameEn: ' Nolkhola ', nameBn: 'নলখোলা', aliases: ['nalkhola', 'Nolkhola'], bandId: sub });
    expect(made).toMatchObject({ nameEn: 'Nolkhola', nameBn: 'নলখোলা', level: 'AREA', ownerMade: true, code: null, aliases: ['nalkhola'], parentEn: 'Gazipur', listed: { bandKey: 'dhaka-sub-area', archived: false } });
    expect(await codeOf(addPlace(f.deps(), who(lister), { parentId: sreepur, nameEn: 'nolkhola' }))).toBe('DUPLICATE_PLACE');
    expect((await searchPlaces(f.deps(), who(viewer), 'nalkh')).map((p) => p.id)).toContain(made.id);
    expect((await geo(made.id)).ancestorIds.at(-1)).toBe(sreepur);
  });

  it('the sub-area band has its own switch: off, its places go by the map; on, they are in it; charged as the city it needs no charge', async () => {
    const tongi = await f.area('bd.dhaka.gazipur.gazipur-sadar.tongi');
    const sub = await f.band('dhaka-sub-area');
    await setAreaBand(f.deps(), who(lister), { areaId: await f.area('bd.dhaka.gazipur') });
    let map = await loadBandMap(f.deps(), f.A);
    expect(map.bandOf(map.gazetteer.get(tongi)!)).toMatchObject({ role: 'outside', via: 'outside' });
    expect(map.choices().map((b) => b.key)).toEqual(['dhaka-city', 'outside-dhaka']);
    expect(await codeOf(updateBand(f.deps(), who(charger), sub, { enabled: true }))).toBe('CHARGE_REQUIRED');
    expect(await updateBand(f.deps(), who(charger), sub, { enabled: true, mode: 'city' })).toMatchObject({ enabled: true, mode: 'city' });
    map = await loadBandMap(f.deps(), f.A);
    expect(map.bandOf(map.gazetteer.get(tongi)!)).toMatchObject({ role: 'subArea', chargedRole: 'city', via: 'owner-list' });
    await updateBand(f.deps(), who(charger), sub, { enabled: false, mode: 'own' });
    expect((await listBands(f.deps(), who(viewer))).find((b) => b.key === 'dhaka-sub-area')).toMatchObject({ enabled: false, listed: 2 });
  });

  it('merges two spellings of one place: archived, names kept as spellings, the places under it and saved addresses follow', async () => {
    const kapasia = await f.area('bd.dhaka.gazipur.kapasia');
    const kaliganj = await f.area('bd.dhaka.gazipur.kaliganj');
    const sreepur = await f.area('bd.dhaka.gazipur.sreepur');
    const mawna = await f.area('bd.dhaka.gazipur.sreepur.mawna');
    expect(await codeOf(mergePlace(f.deps(), who(lister), kapasia, { intoId: kapasia }))).toBe('INVALID_INPUT');
    expect(await codeOf(mergePlace(f.deps(), who(lister), mawna, { intoId: sreepur }))).toBe('LEVEL_MISMATCH');
    expect(await codeOf(mergePlace(f.deps(), who(viewer), kapasia, { intoId: kaliganj }))).toBe('FORBIDDEN');
    // different bands on the list: refused, nothing written
    await setAreaBand(f.deps(), who(lister), { areaId: kapasia, bandId: await f.band('dhaka-city') });
    await setAreaBand(f.deps(), who(lister), { areaId: kaliganj, bandId: await f.band('outside-dhaka') });
    expect(await codeOf(mergePlace(f.deps(), who(lister), kapasia, { intoId: kaliganj }))).toBe('BAND_CONFLICT');
    expect((await geo(kapasia)).archivedAt).toBeNull();
    await setAreaBand(f.deps(), who(lister), { areaId: kapasia, bandId: await f.band('outside-dhaka') });

    const child = (await f.t.prisma.geoArea.findFirstOrThrow({ where: { parentId: kapasia }, select: { id: true } })).id;
    const addr = await f.t.prisma.customerAddress.findFirst({ select: { id: true } });
    if (addr) await f.t.prisma.customerAddress.update({ where: { id: addr.id }, data: { areaId: kapasia } });
    const m = await mergePlace(f.deps(), who(lister), kapasia, { intoId: kaliganj });
    expect(m).toMatchObject({ mergedId: kapasia, movedChildren: 13 });
    expect(m.into.aliases).toEqual(expect.arrayContaining(['Kapasia', 'কাপাসিয়া', 'kapashia']));
    expect((await geo(kapasia)).archivedAt).not.toBeNull(); // archived, never deleted
    expect(await geo(child)).toMatchObject({ parentId: kaliganj });
    expect((await geo(child)).ancestorIds.at(-1)).toBe(kaliganj);
    if (addr) expect((await f.t.prisma.customerAddress.findUniqueOrThrow({ where: { id: addr.id }, select: { areaId: true } })).areaId).toBe(kaliganj);
    expect(await f.t.prisma.areaBand.findFirst({ where: { areaId: kapasia }, select: { archivedAt: true } })).toMatchObject({ archivedAt: expect.any(Date) });
    // an address that says "Kapasia" now finds Kaliganj
    expect((await searchPlaces(f.deps(), who(viewer), 'kapasia')).map((p) => p.id)).toEqual([kaliganj]);
    expect(await codeOf(placeDetail(f.deps(), who(viewer), kapasia))).toBe('NOT_FOUND');
  });

  it('a later import keeps the owner\'s names, adds the file\'s spellings, and never brings a merged place back', async () => {
    const kapasia = await f.area('bd.dhaka.gazipur.kapasia');
    const kaliganj = await f.area('bd.dhaka.gazipur.kaliganj');
    const kaliakair = await f.area('bd.dhaka.gazipur.kaliakair');
    const child = (await f.t.prisma.geoArea.findFirstOrThrow({ where: { code: { startsWith: 'bd.dhaka.gazipur.kapasia.' } }, select: { id: true } })).id;
    const report = await importGazetteer(f.t.prisma, sampleGazetteerRows(), { source: 'sample' });
    forgetGazetteer();
    expect(report.restored).toBe(0);
    expect((await geo(kapasia)).archivedAt).not.toBeNull();
    expect(await geo(child)).toMatchObject({ parentId: kaliganj });
    expect(await geo(kaliakair)).toMatchObject({ nameEn: 'Kaliakoir Town' });
    expect((await geo(kaliakair)).aliases).toEqual(expect.arrayContaining(['Kaliakair', 'kaliakoir']));
    // a second run changes nothing
    const again = await importGazetteer(f.t.prisma, sampleGazetteerRows(), { source: 'sample' });
    expect(again.updated + again.restored + again.created).toBe(0);
  });
});
