// PR 297 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// tags and internal notes — "#tag" puts a tag on the person (one tag per name, whatever its case), taking it off archives
// the link and putting it back clears that; notes pinned first, put away never deleted; a merged profile shows the
// person's tags and notes; reading needs customers.read, writing customers.notes; every change audited. Every value is a
// made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addNoteOrTag, archiveNote, pinNote, tagsAndNotes, untagCustomer } from './notes';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700002971', b: '+8801700002972' };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('customer tags and notes on PostgreSQL (PR 297)', () => {
  let f: CustomersFixture;
  let a: string;
  let b: string;

  beforeAll(async () => {
    f = await setUpCustomers('customers-notes');
    a = await f.profile({ phone: N.a, name: 'Tagged' });
    b = await f.profile({ phone: N.b, name: 'Merged In' });
    await f.t.prisma.customer.update({ where: { id: b }, data: { mergedIntoId: a, mergedAt: f.clock.now } });
  });
  afterAll(async () => f?.t.drop());

  it('"#tag" puts one tag on the person; off is archived, back on clears it', async () => {
    const d = f.customersDeps();
    const r = await addNoteOrTag(d, f.manager, b, { text: '#Follow up' });
    expect(r).toMatchObject({ kind: 'tag', tag: { name: 'Follow up' } });
    // the same name in another case is the same tag, on the survivor
    await addNoteOrTag(d, f.manager, a, { text: '#follow  UP' });
    expect(await f.t.prisma.customerTag.count({ where: { storeId: f.S } })).toBe(1);
    expect(await f.t.prisma.customerTagLink.count({ where: { customerId: a } })).toBe(1);
    await addNoteOrTag(d, f.manager, a, { text: '#VIP' });
    expect((await tagsAndNotes(d, f.viewer, b)).tags.map((t) => t.name)).toEqual(['Follow up', 'VIP']);
    const vip = (await tagsAndNotes(d, f.viewer, a)).tags.find((t) => t.name === 'VIP')!;
    expect(await untagCustomer(d, f.manager, a, vip.id)).toEqual({ removed: 1 });
    expect((await tagsAndNotes(d, f.viewer, a)).tags.map((t) => t.name)).toEqual(['Follow up']);
    expect(await f.t.prisma.customerTagLink.findFirst({ where: { customerId: a, tagId: vip.id } })).toMatchObject({ archivedAt: expect.any(Date) });
    await expect(untagCustomer(d, f.manager, a, vip.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await addNoteOrTag(d, f.manager, a, { text: '#vip' });
    expect((await tagsAndNotes(d, f.viewer, a)).tags.map((t) => t.name)).toEqual(['Follow up', 'VIP']);
    await expect(addNoteOrTag(d, f.manager, a, { text: '#' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(addNoteOrTag(d, f.manager, a, { text: `#${'x'.repeat(41)}` })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect((await tagsAndNotes(d, f.viewer, a)).storeTags.map((t) => t.name)).toEqual(['Follow up', 'VIP']);
  });

  it('notes: pinned first, then newest; put away is archived; a reader cannot write', async () => {
    const d = f.customersDeps();
    const first = await addNoteOrTag(d, f.manager, a, { text: 'Prefers a call after 6 pm' });
    f.clock.now = new Date(f.clock.now.getTime() + 60_000);
    const second = await addNoteOrTag(d, f.manager, b, { text: 'Asked about the Eid set' });
    if (first.kind !== 'note' || second.kind !== 'note') throw new Error('notes expected');
    let s = await tagsAndNotes(d, f.manager, a);
    expect(s.notes.map((n) => n.body)).toEqual(['Asked about the Eid set', 'Prefers a call after 6 pm']);
    expect(s.notes[0]!.by).toBe('Customers Staff');
    expect(s.canWrite).toBe(true);
    expect(await pinNote(d, f.manager, a, first.note.id, true)).toEqual({ pinned: true });
    s = await tagsAndNotes(d, f.manager, a);
    expect(s.notes.map((n) => [n.body, n.pinned])).toEqual([
      ['Prefers a call after 6 pm', true],
      ['Asked about the Eid set', false],
    ]);
    expect(await archiveNote(d, f.manager, a, second.note.id)).toEqual({ archived: true });
    expect((await tagsAndNotes(d, f.manager, a)).notes.map((n) => n.body)).toEqual(['Prefers a call after 6 pm']);
    expect(await f.t.prisma.customerNote.findUniqueOrThrow({ where: { id: second.note.id } })).toMatchObject({ body: 'Asked about the Eid set', archivedAt: expect.any(Date) });
    await expect(archiveNote(d, f.manager, a, second.note.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await tagsAndNotes(d, f.viewer, a)).canWrite).toBe(false);
    await expect(addNoteOrTag(d, f.viewer, a, { text: 'no' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const actions = (await f.t.prisma.auditLog.findMany({ where: { storeId: f.S, action: { startsWith: 'customer.' } }, select: { action: true } })).map((x) => x.action);
    for (const x of ['customer.tag.add', 'customer.tag.remove', 'customer.note.add', 'customer.note.pin', 'customer.note.archive']) expect(actions).toContain(x);
  });
});
