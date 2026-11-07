// PR 66 follow-up 184 — the buttons a question card offers from each place.
import { describe, expect, it } from 'vitest';
import { movesOf } from './QuestionActions';

describe('question card moves (follow-up 184)', () => {
  it('an unanswered question offers no Publish, an answered one does', () => {
    expect(movesOf('PENDING', false, false)).toEqual(['hide', 'archive']);
    expect(movesOf('PENDING', false, true)).toEqual(['publish', 'hide', 'archive']);
  });
  it('published, hidden and archived each have their way back', () => {
    expect(movesOf('APPROVED', false, true)).toEqual(['hide', 'archive']);
    expect(movesOf('HIDDEN', false, true)).toEqual(['publish', 'restore', 'archive']);
    expect(movesOf('APPROVED', true, true)).toEqual(['unarchive']);
  });
});
