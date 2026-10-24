// PR 550 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the owner's side of the band map — the bands
// ship off with no charge, a band goes on only with its charge, the mode is the sub-area band's alone, the sub-area
// list puts a place (and what is under it) in its band, taking it off archives the row, every change is audited and
// every action checks its permission in its store.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { listBands, listSubAreas, loadBandMap, removeAreaBand, searchPlaces, setAreaBand, updateBand, type Who } from '../src';
import { codeOf, setUp, SYSTEM, type Fixture } from './fixture';

describe.skipIf(!HAS_TEST_DB)('band mapping on PostgreSQL (PR 550)', () => {
  let f: Fixture;
  let viewer: Actor;
  let charger: Actor;
  let lister: Actor;
  let otherStore: Actor;
  const who = (actor: Actor, storeId = f.A): Who => ({ actor, storeId });

  beforeAll(async () => {
    f = await setUp('delivery_bands');
    viewer = await f.staff('viewer@example.com', ['delivery.read'], f.A);
    charger = await f.staff('charges@example.com', ['delivery.read', 'delivery.charges'], f.A);
    lister = await f.staff('areas@example.com', ['delivery.read', 'delivery.areas'], f.A);
    otherStore = await f.staff('elsewhere@example.com', ['delivery.read', 'delivery.charges', 'delivery.areas'], f.B);
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('shows the three bands as shipped: off, no charge, nothing listed', async () => {
    const bands = await listBands(f.deps(), who(viewer));
    expect(bands.map((b) => [b.key, b.role, b.enabled, b.listed])).toEqual([
      ['dhaka-city', 'city', false, 0],
      ['dhaka-sub-area', 'subArea', false, 0],
      ['outside-dhaka', 'outside', false, 0],
    ]);
    expect(bands[1]!.mode).toBe('own');
    expect(bands[0]!.mode).toBeNull();
    expect(await listSubAreas(f.deps(), who(viewer))).toEqual([]);
  });

  it('checks the permission in the store', async () => {
    const city = await f.band('dhaka-city');
    expect(await codeOf(updateBand(f.deps(), who(viewer), city, { hoursMin: 24 }))).toBe('FORBIDDEN');
    expect(await codeOf(updateBand(f.deps(), who(lister), city, { hoursMin: 24 }))).toBe('FORBIDDEN');
    expect(await codeOf(updateBand(f.deps(), who(otherStore), city, { hoursMin: 24 }))).toBe('FORBIDDEN');
    expect(await codeOf(setAreaBand(f.deps(), who(charger), { areaId: await f.area('bd.dhaka.gazipur') }))).toBe('FORBIDDEN');
    expect(await codeOf(listBands(f.deps(), who(otherStore)))).toBe('FORBIDDEN');
    // the other store's own (empty) delivery set-up is its own
    expect(await listBands(f.deps(), who(otherStore, f.B))).toEqual([]);
  });

  it('switches a band on only together with its charge, and keeps the hours in order', async () => {
    const city = await f.band('dhaka-city');
    expect(await codeOf(updateBand(f.deps(), who(charger), city, { enabled: true }))).toBe('CHARGE_REQUIRED');
    expect(await codeOf(updateBand(f.deps(), who(charger), city, { hoursMin: 72, hoursMax: 24 }))).toBe('INVALID_INPUT');
    expect(await codeOf(updateBand(f.deps(), who(charger), city, { chargeMinor: -1 }))).toBe('INVALID_INPUT');
    expect(await codeOf(updateBand(f.deps(), who(charger), city, { chargeMinor: 1.5 }))).toBe('INVALID_INPUT');
    expect(await codeOf(updateBand(f.deps(), who(charger), city, { colour: 'red' }))).toBe('INVALID_INPUT');
    expect(await codeOf(updateBand(f.deps(), who(charger), city, {}))).toBe('INVALID_INPUT');
    const on = await updateBand(f.deps(), who(charger), city, { enabled: true, chargeMinor: 7000, hoursMin: 24, hoursMax: 48 });
    expect(on).toMatchObject({ enabled: true, chargeMinor: 7000, hoursMin: 24, hoursMax: 48, chargedAs: { key: 'dhaka-city', enabled: true } });
    // once on, the charge can change by itself, and the band can go off again
    expect((await updateBand(f.deps(), who(charger), city, { chargeMinor: 8000 })).chargeMinor).toBe(8000);
    const log = await f.t.prisma.auditLog.findMany({ where: { action: 'delivery.band.update', entityId: city }, orderBy: { createdAt: 'asc' } });
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ storeId: f.A, actorId: charger.staffUserId });
  });

  it('lets only the sub-area band have a mode, and folds its charge by it', async () => {
    const city = await f.band('dhaka-city');
    const sub = await f.band('dhaka-sub-area');
    expect(await codeOf(updateBand(f.deps(), who(charger), city, { mode: 'own' }))).toBe('MODE_NOT_ALLOWED');
    expect(await codeOf(updateBand(f.deps(), who(charger), sub, { mode: 'elsewhere' }))).toBe('INVALID_INPUT');
    const folded = await updateBand(f.deps(), who(charger), sub, { mode: 'city' });
    expect(folded).toMatchObject({ mode: 'city', enabled: false, chargedAs: { key: 'dhaka-city', role: 'city', enabled: true } });
    await updateBand(f.deps(), who(charger), sub, { mode: 'own' });
  });

  it('puts a listed place and everything under it in the sub-area band; off the list = back to the map', async () => {
    const gazipur = await f.area('bd.dhaka.gazipur');
    const tongi = await f.area('bd.dhaka.gazipur.gazipur-sadar.tongi');
    expect(await codeOf(setAreaBand(f.deps(), who(lister), { areaId: '00000000-0000-4000-8000-000000000000' }))).toBe('NOT_FOUND');
    expect(await codeOf(setAreaBand(f.deps(), who(lister), { areaId: 'gazipur' }))).toBe('INVALID_INPUT');
    expect(await codeOf(setAreaBand(f.deps(), who(lister), { areaId: gazipur, bandId: await f.band('dhaka-city') }))).toBe('ok');
    // PR 502: the sub-area band's own switch — on, so its places are in it (off, they go by the map: places.db.test.ts)
    await updateBand(f.deps(), who(charger), await f.band('dhaka-sub-area'), { enabled: true, chargeMinor: 9000 });
    const listed = await setAreaBand(f.deps(), who(lister), { areaId: gazipur }); // the sub-area band unless named; moves
    expect(listed).toMatchObject({ id: gazipur, bandKey: 'dhaka-sub-area', archived: false, level: 'DISTRICT', parentEn: 'Dhaka' });
    let map = await loadBandMap(f.deps(), f.A);
    expect(map.bandOf(map.gazetteer.get(tongi)!)).toMatchObject({ role: 'subArea', via: 'owner-list', listedAreaId: gazipur });
    expect((await listBands(f.deps(), who(viewer))).find((b) => b.key === 'dhaka-sub-area')?.listed).toBe(1);

    expect(await removeAreaBand(f.deps(), who(lister), gazipur)).toEqual({ areaId: gazipur, archived: true });
    expect(await removeAreaBand(f.deps(), who(lister), gazipur)).toEqual({ areaId: gazipur, archived: true }); // twice = no-op
    expect(await codeOf(removeAreaBand(f.deps(), who(lister), tongi))).toBe('NOT_FOUND');
    map = await loadBandMap(f.deps(), f.A);
    expect(map.bandOf(map.gazetteer.get(tongi)!)?.role).toBe('outside');
    expect(await listSubAreas(f.deps(), who(viewer))).toEqual([]);
    const all = await listSubAreas(f.deps(), who(viewer), { includeArchived: true });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: gazipur, archived: true });
    expect(await f.t.prisma.areaBand.count()).toBe(1); // never deleted

    const back = await setAreaBand(f.deps(), who(lister), { areaId: gazipur });
    expect(back.archived).toBe(false);
    expect(await f.t.prisma.areaBand.count()).toBe(1); // the same row came back
    const actions = (await f.t.prisma.auditLog.findMany({ where: { entityType: 'AreaBand' }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['delivery.area.set', 'delivery.area.set', 'delivery.area.remove', 'delivery.area.set']);
    // setting the same place in the same band again writes nothing
    await setAreaBand(f.deps(), who(lister), { areaId: gazipur });
    expect(await f.t.prisma.auditLog.count({ where: { entityType: 'AreaBand' } })).toBe(4);
  });

  it('a list entry of a band that was archived no longer counts', async () => {
    const savar = await f.area('bd.dhaka.dhaka.savar');
    const extra = await f.t.prisma.deliveryBand.create({ data: { storeId: f.A, key: 'express', nameEn: 'Express', chargeMinor: 0, sortOrder: 99 } });
    await setAreaBand(f.deps(), who(lister), { areaId: savar, bandId: extra.id });
    let map = await loadBandMap(f.deps(), f.A);
    expect(map.bandOf(map.gazetteer.get(savar)!)?.band.key).toBe('express');
    await f.t.prisma.deliveryBand.update({ where: { id: extra.id }, data: { archivedAt: new Date() } });
    map = await loadBandMap(f.deps(), f.A);
    expect(map.bandOf(map.gazetteer.get(savar)!)?.band.key).toBe('outside-dhaka');
    await removeAreaBand(f.deps(), who(lister), savar);
  });

  it('searches places by prefix, each with the band it sits in now', async () => {
    const hits = await searchPlaces(f.deps(), who(viewer), 'gabto');
    const byCode = new Map(hits.map((h) => [h.code, h]));
    expect(byCode.get('bd.dhaka.dhaka.gabtoli')).toMatchObject({ bandKey: 'dhaka-city', via: 'city-map', spans: 1, parentEn: 'Dhaka' });
    expect(byCode.get('bd.rajshahi.bogura.gabtali')).toMatchObject({ bandKey: 'outside-dhaka', via: 'outside', parentEn: 'Bogura' });
    f.overrides.set('delivery.bands.searchLimit', 1);
    expect(await searchPlaces(f.deps(), who(viewer), 'gabto')).toHaveLength(1);
    f.overrides.delete('delivery.bands.searchLimit');
    expect(await searchPlaces(f.deps(), who(viewer), '')).toEqual([]);
    expect((await searchPlaces(f.deps(), who(viewer), 'dhaka')).find((h) => h.code === 'bd.dhaka.dhaka')?.spans).toBeGreaterThan(1);
    expect(await codeOf(searchPlaces(f.deps(), { actor: SYSTEM, storeId: 999 }, 'x'))).toBe('NOT_FOUND');
  });
});
