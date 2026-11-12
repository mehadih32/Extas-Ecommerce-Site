// S15 · PR 577 — the pure parts of the 360° profile: turning one agent's own docs/agents/<key>.md into its
// structural catalogue (no Postgres needed, unlike agent-profile.db.test.ts's end-to-end coverage of the live
// profile, edits, rewards and assignments).
import { describe, expect, it } from 'vitest';
import { agentDocsDir, parseAgentCatalogue, readAgentCatalogue } from './agent-profile';

const SAMPLE = `# Sample — one of the fixed agents · নমুনা · \`A360-09\`

## Role
Tests things.

## Owns
S99 testing

## Never touches
Real customer data

## Plan (current)
- Finish its open items.
- Keep its skills up to date.

## Skills it has
- Reading markdown
- Writing tests

## Skills it is learning
- Juggling

## Work log
- 19 Oct — wrote this file
`;

describe('parseAgentCatalogue', () => {
  it('reads every section into its own field', () => {
    expect(parseAgentCatalogue(SAMPLE)).toEqual({
      role: 'Tests things.',
      owns: 'S99 testing',
      neverTouches: 'Real customer data',
      plan: ['Finish its open items.', 'Keep its skills up to date.'],
      skillsHas: ['Reading markdown', 'Writing tests'],
      skillsLearning: ['Juggling'],
    });
  });

  it('never reads past the next heading, and a missing heading is an empty value', () => {
    const noLearning = SAMPLE.replace(/## Skills it is learning\n- Juggling\n\n/, '');
    const c = parseAgentCatalogue(noLearning);
    expect(c.skillsLearning).toEqual([]);
    expect(c.skillsHas).toEqual(['Reading markdown', 'Writing tests']); // not swallowed into the next section
  });

  it('reads a bare markdown string with no sections as the honest empty catalogue', () => {
    expect(parseAgentCatalogue('# Nothing here\n')).toEqual({ role: '', owns: '', neverTouches: '', plan: [], skillsHas: [], skillsLearning: [] });
  });
});

describe('readAgentCatalogue', () => {
  it('is honestly empty when no docs folder is given, never throwing', () => {
    expect(readAgentCatalogue('gyani', null)).toEqual({ role: '', owns: '', neverTouches: '', plan: [], skillsHas: [], skillsLearning: [] });
  });

  it('reads the real repository docs/agents/gyani.md when run from the repo (agentDocsDir finds it)', () => {
    const dir = agentDocsDir();
    if (!dir) return; // not every CI working directory sits inside the repo checkout; honestly skip rather than fail
    const c = readAgentCatalogue('gyani', dir);
    expect(c.owns).toContain('S15 AI 360 Control Room');
    expect(c.plan.length).toBeGreaterThan(0);
  });
});
