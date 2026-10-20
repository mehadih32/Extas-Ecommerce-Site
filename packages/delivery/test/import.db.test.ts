// PR 549 on a real PostgreSQL (a throwaway database with the real migrations, 0005_delivery_zones among them; skipped
// without TEST_DATABASE_ADMIN_URL): the sample gazetteer goes in, a second run changes nothing, a changed file updates
// only what changed, a place missing from a file stays unless archiving is asked for, an archived place comes back,
// rows made some other way are never touched, the chain above every place is stored, and the shared index reads it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { forgetGazetteer, importGazetteer, lastImportSource, loadGazetteer, readGazetteer, readGazetteerCsv, type GazetteerRow } from '../src';
import { sampleGazetteerRows } from '../src/sample';

const HEAD = 'code,level,parent,nameEn,nameBn,aliases,postcodes,cityCorporation,lat,lng';

describe.skipIf(!HAS_TEST_DB)('gazetteer import on PostgreSQL', () => {
  let t: TestDatabase;
  const sample = sampleGazetteerRows();
  beforeAll(async () => {
    t = await createTestDatabase('delivery_import');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('imports the sample, then a second run changes nothing', async () => {
    expect(await lastImportSource(t.prisma)).toBeNull();
    const first = await importGazetteer(t.prisma, sample, { source: 'sample' });
    expect(first).toMatchObject({ total: sample.length, created: sample.length, updated: 0, unchanged: 0, archived: 0 });
    expect(await t.prisma.geoArea.count()).toBe(sample.length);
    const second = await importGazetteer(t.prisma, sample);
    expect(second).toMatchObject({ created: 0, updated: 0, restored: 0, unchanged: sample.length });
    const logs = await t.prisma.auditLog.findMany({ where: { action: 'gazetteer.import' } });
    expect(logs).toHaveLength(1); // the run that changed nothing writes no audit row
    expect(await lastImportSource(t.prisma)).toBe('sample');
  });

  it('stores the parent and the chain above every place, top down', async () => {
    const gabtali = await t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.rajshahi.bogura.gabtali' } });
    const bogura = await t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.rajshahi.bogura' } });
    const rajshahi = await t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.rajshahi' } });
    expect(gabtali.parentId).toBe(bogura.id);
    expect(gabtali.ancestorIds).toEqual([rajshahi.id, bogura.id]);
    expect(gabtali.level).toBe('UPAZILA');
    expect(gabtali.postcodes).toEqual(['5820']);
  });

  it('updates only what changed; a place missing from the file stays unless archiving is asked for; it comes back', async () => {
    const edited: GazetteerRow[] = sample
      .filter((r) => r.code !== 'bd.rajshahi.bogura.gabtali')
      .map((r) => (r.code === 'bd.rajshahi.bogura' ? { ...r, aliases: [...r.aliases, 'bogoura'], lat: 24.85, lng: 89.37 } : r));
    const keep = await importGazetteer(t.prisma, edited);
    expect(keep).toMatchObject({ updated: 1, archived: 0, created: 0 });
    expect((await t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.rajshahi.bogura.gabtali' } })).archivedAt).toBeNull();
    const dry = await importGazetteer(t.prisma, edited, { archiveMissing: true, dryRun: true });
    expect(dry).toMatchObject({ archived: 1, updated: 0, dryRun: true });
    expect((await t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.rajshahi.bogura.gabtali' } })).archivedAt).toBeNull();
    const archive = await importGazetteer(t.prisma, edited, { archiveMissing: true });
    expect(archive).toMatchObject({ archived: 1, updated: 0 });
    expect((await t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.rajshahi.bogura.gabtali' } })).archivedAt).not.toBeNull();
    expect(await t.prisma.geoArea.count()).toBe(sample.length); // nothing deleted
    const back = await importGazetteer(t.prisma, sample);
    expect(back).toMatchObject({ restored: 1, updated: 1 });
    const bogura = await t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.rajshahi.bogura' } });
    expect(bogura.aliases).not.toContain('bogoura');
    expect(bogura.lat).toBeNull();
  });

  it('never touches a place made some other way, and builds new children of new parents in one run', async () => {
    const other = await t.prisma.geoArea.create({ data: { level: 'AREA', nameEn: 'Hand-made sample place' } });
    const more = readGazetteerCsv(`${HEAD}\nbd.sample,DIVISION,,Sample division,,,,,,\nbd.sample.a,DISTRICT,bd.sample,Sample district,,,,,,\nbd.sample.a.b,AREA,bd.sample.a,Sample area,,,9999,,,\n`);
    const r = await importGazetteer(t.prisma, [...sample, ...more], { archiveMissing: true, source: 'national.csv' });
    expect(r).toMatchObject({ created: 3, archived: 0 });
    expect(await lastImportSource(t.prisma)).toBe('national.csv'); // the deploy's sample run now leaves the list alone
    const area = await t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.sample.a.b' } });
    expect(area.ancestorIds).toHaveLength(2);
    expect((await t.prisma.geoArea.findUniqueOrThrow({ where: { id: other.id } })).archivedAt).toBeNull();
  });

  it('the shared index reads every place that is not archived, and notices a new import', async () => {
    forgetGazetteer();
    let clock = 0;
    const g = await loadGazetteer(t.prisma, { cacheSeconds: 60, now: () => clock });
    expect(g.byCode('bd.rajshahi.bogura.gabtali')).toBeDefined();
    expect(g.byCode('bd.sample.a.b')).toBeDefined();
    expect(await loadGazetteer(t.prisma, { cacheSeconds: 60, now: () => clock })).toBe(g); // kept
    await importGazetteer(t.prisma, sample, { archiveMissing: true }); // archives the three sample rows
    clock += 61_000;
    const fresh = await loadGazetteer(t.prisma, { cacheSeconds: 60, now: () => clock });
    expect(fresh).not.toBe(g);
    expect(fresh.byCode('bd.sample.a.b')).toBeUndefined();
    expect((await readGazetteer(t.prisma)).size).toBe(fresh.size);
    forgetGazetteer();
  });
});
