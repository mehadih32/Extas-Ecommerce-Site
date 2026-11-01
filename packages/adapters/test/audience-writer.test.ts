// S13 · PR 263 / 264 — the audience writer: what each platform would be sent (hashes only, a value beside each for a
// value-based list, members replaced when the list exists), the lookalike's spec, and the practice writer that sends
// nothing and refuses a lookalike the owner has not sized yet.
import { beforeEach, describe, expect, it } from 'vitest';
import { EXCLUSION_MARK, googleAudiencePayload, googleLookalikePayload, lookalikeReady, metaAudiencePayload, metaLookalikePayload, mockAudienceOutbox, practiceAudienceWriter, tiktokAudiencePayload, tiktokLookalikePayload, type AudienceUpload } from '../src';

const m = (n: number, value: number | null = null) => ({ ph: `h${n}`, phPlus: `p${n}`, value });
const upload = (o: Partial<AudienceUpload> = {}): AudienceUpload => ({ externalId: null, name: 'Seed', members: [m(1, 1200), m(2, 450)], valueBased: false, ...o });
const spec = { percent: 2, size: 'narrow' as const, countries: ['BD'] };

beforeEach(() => mockAudienceOutbox.clear());

describe('payloads', () => {
  it('Meta: phone hashes, a value beside each only for a value-based list, no create when it exists', () => {
    expect(metaAudiencePayload(upload()).users.payload).toEqual({ schema: ['PHONE_SHA256'], data: [['h1'], ['h2']] });
    const v = metaAudiencePayload(upload({ valueBased: true }));
    expect(v.users.payload).toEqual({ schema: ['PHONE_SHA256', 'LOOKUP_VALUE'], data: [['h1', 1200], ['h2', 450]] });
    expect(v.create).toMatchObject({ is_value_based: true, subtype: 'CUSTOM' });
    expect(metaAudiencePayload(upload({ externalId: '99' })).create).toBeNull();
    expect(JSON.parse(metaLookalikePayload({ seedExternalId: '99', name: 'LAL', spec }).lookalike_spec)).toEqual({ type: 'custom_ratio', ratio: 0.02, location_spec: { geo_locations: { countries: ['BD'] } } });
  });

  it('Google and TikTok take the +country hash; an existing list is replaced', () => {
    const g = googleAudiencePayload(upload({ externalId: 'ul/1' }));
    expect(g.create).toBeNull();
    expect(g.job.removeAll).toBe(true);
    expect(g.job.operations[0]).toEqual({ create: { userIdentifiers: [{ hashedPhoneNumber: 'p1' }] } });
    expect(googleLookalikePayload({ seedExternalId: 'ul/1', name: 'L', spec }).lookalikeUserList.expansionLevel).toBe('NARROW');
    expect(tiktokAudiencePayload(upload())).toMatchObject({ action: 'CREATE', file: 'p1\np2' });
    expect(tiktokLookalikePayload({ seedExternalId: 't1', name: 'L', spec }).lookalike_spec).toEqual({ source_audience_id: 't1', location_codes: ['BD'], audience_size: 'NARROW' });
  });

  it('a lookalike needs the owner’s country and size (Meta: 1–10 %)', () => {
    expect(lookalikeReady('meta', spec)).toBe('ok');
    expect(lookalikeReady('meta', { ...spec, percent: null })).toBe('size');
    expect(lookalikeReady('meta', { ...spec, percent: 11 })).toBe('size');
    expect(lookalikeReady('google', { ...spec, size: null })).toBe('size');
    expect(lookalikeReady('tiktok', { ...spec, countries: [] })).toBe('country');
  });
});

describe('PR 264 exclusion list', () => {
  it('is marked on Meta and Google when it is made, and carries hashes only', () => {
    expect(metaAudiencePayload(upload({ exclusion: true })).create).toMatchObject({ description: EXCLUSION_MARK, is_value_based: false });
    expect(metaAudiencePayload(upload()).create).not.toHaveProperty('description');
    expect(googleAudiencePayload(upload({ exclusion: true })).create).toMatchObject({ description: EXCLUSION_MARK });
    expect(googleAudiencePayload(upload({ exclusion: true, externalId: 'ul/9' })).create).toBeNull();
    expect(tiktokAudiencePayload(upload({ exclusion: true })).file).toBe('p1\np2');
  });
});

describe('practice writer', () => {
  it('sends nothing, keeps what it would have sent, keeps an existing id', async () => {
    const w = practiceAudienceWriter('meta');
    expect(w.practice).toBe(true);
    const a = await w.upload(upload({ valueBased: true }));
    expect(a.ok && a.value.sent).toBe(2);
    const b = await w.upload(upload({ externalId: 'keep-me' }));
    expect(b.ok && b.value.externalId).toBe('keep-me');
    expect(mockAudienceOutbox.all().map((s) => [s.platform, s.what, s.members])).toEqual([
      ['meta', 'list', 2],
      ['meta', 'list', 2],
    ]);
    expect(JSON.stringify(mockAudienceOutbox.all())).not.toMatch(/\+?8801/);
  });

  it('refuses a lookalike without a size', async () => {
    const w = practiceAudienceWriter('tiktok');
    expect(await w.lookalike({ seedExternalId: 's', name: 'L', spec: { ...spec, size: null } })).toEqual({ ok: false, error: 'no lookalike size' });
    expect((await w.lookalike({ seedExternalId: 's', name: 'L', spec })).ok).toBe(true);
    expect(mockAudienceOutbox.all()).toHaveLength(1);
  });
});
