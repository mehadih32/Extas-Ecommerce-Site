// PR 1208 — the line a page shows while a feature is on only because practice mode is on.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PracticeShownNote } from './PracticeShownNote';

describe('PracticeShownNote (PR 1208)', () => {
  it('draws its one line in English or Bengali, and nothing when not needed', () => {
    expect(renderToStaticMarkup(<PracticeShownNote lang="en" show />)).toContain('Practice mode shows this');
    expect(renderToStaticMarkup(<PracticeShownNote lang="bn" show />)).toContain('প্র্যাকটিস মোডে');
    expect(renderToStaticMarkup(<PracticeShownNote lang="en" show={false} />)).toBe('');
  });
});
