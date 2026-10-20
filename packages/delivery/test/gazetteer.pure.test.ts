// PR 549 — the gazetteer without a database: the comparison forms, the file reader and its refusals, the index, and
// the shipped SAMPLE list (national: every division and district, the collisions present, no owner data).
import { describe, expect, it } from 'vitest';
import { asciiDigits, fold, GazetteerFileError, gazetteerFromCsv, gazetteerFromRows, nameKey, normalize, parentsFirst, parseCsv, readGazetteerCsv, words } from '../src';
import { sampleGazetteerRows } from '../src/sample';

const HEAD = 'code,level,parent,nameEn,nameBn,aliases,postcodes,cityCorporation,lat,lng';

describe('text forms', () => {
  it('normalizes Bengali digits, nukta letters, marks and case', () => {
    expect(asciiDigits('১২১৬')).toBe('1216');
    expect(normalize('  Masterpara,  GABTALI — Bogura!! ')).toBe('masterpara gabtali bogura');
    expect(normalize('বগুড়া')).toBe(normalize('বগুড়া'));
    expect(normalize("Cox's Bazar & Teknaf")).toBe('coxs bazar and teknaf');
    expect(nameKey('Nayanpur (Sreepur)')).toBe('nayanpur');
    expect(words('House 5, Road 3, Mirpur 10')).toEqual(['house', '5', 'road', '3', 'mirpur', '10']);
  });

  it('folds the spellings people type into one key, without merging different names', () => {
    expect(fold('gabtoli')).toBe(fold('gabtali'));
    expect(fold('sreepur')).toBe(fold('sripur'));
    expect(fold('narayangonj')).toBe(fold('narayanganj'));
    expect(fold('siddirganz')).toBe(fold('siddirganj'));
    expect(fold(normalize('গাবতলী'))).toBe(fold(normalize('গাবতলি')));
    expect(fold('badda')).not.toBe(fold('boda'));
    expect(fold('bogra')).not.toBe(fold('bogura')); // a different name: the gazetteer carries it as an alias
  });
});

describe('the gazetteer file', () => {
  it('reads quoted cells, lists and empty values', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\nx,,z\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['x', '', 'z'],
    ]);
    const rows = readGazetteerCsv(`${HEAD}\nbd.x,DIVISION,,X,এক্স,ex|eks,,,,\nbd.x.y,DISTRICT,bd.x,Y,,,1234|1235,DNCC,23.8,90.4\n`);
    expect(rows[1]).toEqual({ code: 'bd.x.y', level: 'DISTRICT', parent: 'bd.x', nameEn: 'Y', nameBn: null, aliases: [], postcodes: ['1234', '1235'], cityCorporation: 'DNCC', lat: 23.8, lng: 90.4 });
    expect(rows[0]!.aliases).toEqual(['ex', 'eks']);
  });

  it('refuses a broken file and names every broken line', () => {
    const bad = `${HEAD}\nbd.x,DIVISION,,X,,,,,,\nbd.x.y,DISTRICT,bd.nowhere,Y,,,12,,,\nbd.x,AREA,bd.x,Again,,,,,,\nBad Code,AREA,bd.x,Z,,,,,,\nbd.x.z,DISTRICT,,Z,,,,,,\nbd.x.w,TOWN,bd.x,W,,,,,,\nshort,line\n`;
    try {
      readGazetteerCsv(bad);
      throw new Error('should have failed');
    } catch (e) {
      expect(e).toBeInstanceOf(GazetteerFileError);
      const p = (e as GazetteerFileError).problems.map((x) => `${x.line}:${x.field ?? ''}`);
      expect(p).toEqual(expect.arrayContaining(['3:postcodes.0', '4:code', '5:code', '6:parent', '7:level', '8:', '4:parent']));
    }
    expect(() => readGazetteerCsv('name,level\n')).toThrow(GazetteerFileError);
    const loop = `${HEAD}\nbd.a,DIVISION,,A,,,,,,\nbd.a.b,DISTRICT,bd.a.c,B,,,,,,\nbd.a.c,DISTRICT,bd.a.b,C,,,,,,\n`;
    expect(() => readGazetteerCsv(loop)).toThrow(/circle/);
  });

  it('orders parents before children', () => {
    const rows = readGazetteerCsv(`${HEAD}\nbd.x.y.z,AREA,bd.x.y,Z,,,,,,\nbd.x.y,DISTRICT,bd.x,Y,,,,,,\nbd.x,DIVISION,,X,,,,,,\n`);
    expect(parentsFirst(rows).map((t) => t.map((r) => r.code))).toEqual([['bd.x'], ['bd.x.y'], ['bd.x.y.z']]);
  });
});

describe('the index', () => {
  const g = gazetteerFromCsv(
    `${HEAD}\nbd.r,DIVISION,,Rajshahi,রাজশাহী,,,,,\nbd.r.bogura,DISTRICT,bd.r,Bogura,বগুড়া,bogra,5800,,,\nbd.r.bogura.gabtali,UPAZILA,bd.r.bogura,Gabtali,গাবতলী,,5820,,,\nbd.d,DIVISION,,Dhaka,ঢাকা,,,,,\nbd.d.dhaka,DISTRICT,bd.d,Dhaka,ঢাকা,,1000,,,\nbd.d.dhaka.gabtoli,AREA,bd.d.dhaka,Gabtoli,গাবতলী,gabtoli bus terminal,1216,DNCC,,\n`,
  );

  it('finds a place by any spelling, exact or loose', () => {
    expect(g.lookup('gabtali').map((e) => e.code).sort()).toEqual(['bd.d.dhaka.gabtoli', 'bd.r.bogura.gabtali']);
    expect(g.lookup(normalize('গাবতলী')).length).toBe(2);
    expect(g.lookup('bogra').map((e) => e.code)).toEqual(['bd.r.bogura']);
    expect(g.withPostcode('5820').map((e) => e.code)).toEqual(['bd.r.bogura.gabtali']);
    expect(g.maxNameWords).toBe(3);
  });

  it('knows the chain above a place and labels it with its district', () => {
    const e = g.byCode('bd.d.dhaka.gabtoli')!;
    expect(g.ancestors(e).map((x) => x.code)).toEqual(['bd.d.dhaka', 'bd.d']);
    expect(g.district(e)?.code).toBe('bd.d.dhaka');
    expect(g.label(g.byCode('bd.r.bogura.gabtali')!, 'bn', ' · ')).toBe('গাবতলী · বগুড়া');
    expect(g.label(g.byCode('bd.r.bogura')!, 'en', ' · ')).toBe('Bogura · Rajshahi');
    expect(g.label(g.byCode('bd.r')!, 'en', ' · ')).toBe('Rajshahi');
  });

  it('lists names by prefix, never by similarity', () => {
    const names = [...g.prefixed('gab')].map((k) => k.entry.code);
    expect(new Set(names)).toEqual(new Set(['bd.d.dhaka.gabtoli', 'bd.r.bogura.gabtali']));
    expect([...g.prefixed('abtali')]).toEqual([]);
  });
});

describe('the shipped sample gazetteer (public names only)', () => {
  const rows = sampleGazetteerRows();
  const g = gazetteerFromRows(rows);
  const at = (code: string) => g.byCode(code);

  it('is national: 8 divisions, 64 districts, every district under its division, upazilas everywhere', () => {
    expect(rows.filter((r) => r.level === 'DIVISION')).toHaveLength(8);
    const districts = rows.filter((r) => r.level === 'DISTRICT');
    expect(districts).toHaveLength(64);
    for (const d of districts) expect(at(d.parent!)?.level).toBe('DIVISION');
    const withUpazila = new Set(rows.filter((r) => r.level === 'UPAZILA').map((r) => g.district(at(r.code)!)?.code));
    expect(withUpazila.size).toBe(64);
    expect(rows.length).toBeGreaterThan(1500);
  });

  it('carries the names that collide across the country', () => {
    const where = (name: string) => g.lookup(normalize(name)).map((e) => g.district(e)?.nameEn).sort();
    expect(where('Gabtoli')).toEqual(['Bogura', 'Dhaka']);
    expect(where('Gabtali')).toEqual(['Bogura', 'Dhaka']);
    expect(where('Sreepur')).toEqual(expect.arrayContaining(['Dhaka', 'Gazipur', 'Magura']));
    expect(where('Sripur')).toEqual(expect.arrayContaining(['Gazipur', 'Magura']));
    expect(where('Nawabganj')).toEqual(expect.arrayContaining(['Dhaka', 'Dinajpur']));
    expect(where('Kaliganj')).toEqual(expect.arrayContaining(['Gazipur', 'Jhenaidah', 'Lalmonirhat', 'Satkhira']));
    expect(where('Mirpur')).toEqual(expect.arrayContaining(['Dhaka', 'Kushtia']));
    // "Bogra" is Bogura — and also how Bhogra in Gazipur is written: the resolver has to tell them apart (PR 553).
    expect(where('Bogra')).toEqual(['Bogura', 'Gazipur']);
    expect(g.lookup('chapai nawabganj').map((e) => e.level)).toContain('DISTRICT');
  });

  it('tags Dhaka City areas with DNCC or DSCC and nothing outside Dhaka district', () => {
    const city = rows.filter((r) => r.cityCorporation);
    expect(city.length).toBeGreaterThan(250);
    for (const r of city) {
      expect(['DNCC', 'DSCC']).toContain(r.cityCorporation);
      expect(g.district(at(r.code)!)?.nameEn).toBe('Dhaka');
    }
    expect(at('bd.dhaka.dhaka.gabtoli')?.cityCorporation).toBe('DNCC');
    expect(at('bd.dhaka.dhaka.savar')?.cityCorporation).toBeNull();
  });

  it('puts the Savar, Gazipur and Narayanganj areas under their upazila', () => {
    expect(g.ancestors(g.lookup('hemayetpur')[0]!).map((e) => e.code)[0]).toBe('bd.dhaka.dhaka.savar');
    expect(g.lookup('kaoraid').map((e) => e.parentId)).toEqual(['bd.dhaka.gazipur.sreepur']);
    expect(g.lookup('siddhirganj').some((e) => g.ancestors(e).some((a) => a.code === 'bd.dhaka.narayanganj.narayanganj-sadar'))).toBe(true);
  });

  it('holds no owner data and no band: only places, spellings, postcodes and the public city map', () => {
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/(\+?880|\b0)1[3-9]\d{8}/);
    expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(text).not.toMatch(/৳|\bTk\b/);
    expect(Object.keys(rows[0]!)).toEqual(['code', 'level', 'parent', 'nameEn', 'nameBn', 'aliases', 'postcodes', 'cityCorporation', 'lat', 'lng']);
  });
});
