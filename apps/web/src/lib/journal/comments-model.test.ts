// S12 · PR 251 — the pure rules of a reader's comment: what it may hold, the name it is shown with, a move and its Undo.
import { describe, expect, it } from 'vitest';
import { cleanBody, cleanName, moved, shownName } from './comments-model';

describe('comments model (PR 251)', () => {
  it('keeps a comment trimmed, without control characters and long gaps; too short or too long is refused', () => {
    expect(cleanBody('  Great tip, thanks!\r\n\r\n\r\n\r\nWill try.\u0007  ', 600)).toBe('Great tip, thanks!\n\nWill try.');
    expect(cleanBody('x', 600)).toBeNull();
    expect(cleanBody('a'.repeat(41), 40)).toBeNull();
    expect(cleanBody('ধন্যবাদ', 7)).toBe('ধন্যবাদ');
    expect(cleanBody(42, 600)).toBeNull();
  });

  it('a guest name is one line, at most 60 characters; nothing given = null', () => {
    expect(cleanName('  Rafi \n Ahmed ')).toBe('Rafi Ahmed');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('n'.repeat(80))).toHaveLength(60);
  });

  it('shows only the first word of a name, else the fallback', () => {
    expect(shownName('Rafi Ahmed Khan', 'Reader')).toBe('Rafi');
    expect(shownName(null, 'Reader')).toBe('Reader');
    expect(shownName('  ', 'পাঠক')).toBe('পাঠক');
  });

  it('a move keeps what it replaced, so Undo puts it back; a move to the same status changes nothing', () => {
    expect(moved('PENDING', null, 'APPROVED')).toEqual({ status: 'APPROVED', prevStatus: 'PENDING' });
    expect(moved('APPROVED', 'PENDING', 'back')).toEqual({ status: 'PENDING', prevStatus: 'APPROVED' });
    expect(moved('APPROVED', 'PENDING', 'HIDDEN')).toEqual({ status: 'HIDDEN', prevStatus: 'APPROVED' });
    expect(moved('PENDING', null, 'back')).toBeNull();
    expect(moved('HIDDEN', 'APPROVED', 'HIDDEN')).toBeNull();
  });
});
