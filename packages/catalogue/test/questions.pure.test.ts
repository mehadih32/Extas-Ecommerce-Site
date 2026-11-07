// PR 66 follow-up 184 — the questions screen's lists and moves, without a database.
import { describe, expect, it } from 'vitest';
import { moveOf, whereOfView } from '../src/questions';

describe('product question moves (follow-up 184)', () => {
  const open = { status: 'PENDING' as const, archived: false, answer: null };
  it('publishing needs an answer, so an unanswered question never reaches the product page', () => {
    expect(moveOf(open, 'publish')).toEqual({ refused: 'NO_ANSWER' });
    expect(moveOf({ ...open, answer: '   ' }, 'publish')).toEqual({ refused: 'NO_ANSWER' });
    expect(moveOf({ ...open, answer: 'Yes, 100% cotton.' }, 'publish')).toEqual({ status: 'APPROVED', archive: null });
  });
  it('hide and back to the queue change the state only', () => {
    expect(moveOf({ ...open, status: 'APPROVED', answer: 'x' }, 'hide')).toEqual({ status: 'HIDDEN', archive: null });
    expect(moveOf({ ...open, status: 'HIDDEN' }, 'restore')).toEqual({ status: 'PENDING', archive: null });
  });
  it('archive keeps the row; bring back puts it in the queue to be checked again', () => {
    expect(moveOf({ ...open, status: 'APPROVED', answer: 'x' }, 'archive')).toEqual({ status: 'APPROVED', archive: true });
    const gone = { status: 'APPROVED' as const, archived: true, answer: 'x' };
    expect(moveOf(gone, 'publish')).toEqual({ refused: 'ARCHIVED' });
    expect(moveOf(gone, 'unarchive')).toEqual({ status: 'PENDING', archive: false });
    expect(moveOf(open, 'unarchive')).toEqual({ refused: 'NOT_ARCHIVED' });
  });
  it('each list reads its own rows of this store only', () => {
    expect(whereOfView(3, 'open')).toEqual({ storeId: 3, archivedAt: null, status: 'PENDING' });
    expect(whereOfView(3, 'published')).toEqual({ storeId: 3, archivedAt: null, status: 'APPROVED' });
    expect(whereOfView(3, 'hidden')).toEqual({ storeId: 3, archivedAt: null, status: { in: ['HIDDEN', 'REJECTED'] } });
    expect(whereOfView(3, 'archived')).toEqual({ storeId: 3, archivedAt: { not: null } });
  });
});
