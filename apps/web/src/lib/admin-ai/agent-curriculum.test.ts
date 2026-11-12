// S15 · PR 579 — the pure parts of the curriculum reader: turning docs/agents/CURRICULUM.md into every agent's
// syllabus and "taught so far" facts (no Postgres needed, unlike agent-curriculum.db.test.ts's end-to-end coverage
// of the live curriculum levels and the owner's own status changes).
import { describe, expect, it } from 'vitest';
import { agentDocsDir } from './agent-profile';
import { parseCurriculumDoc, readCurriculumDoc } from './agent-curriculum';

const SAMPLE = `# Agent curriculum — the degree path for each of the six (PR 579)

Some intro text that is not a bullet.

## প্রহরী Prohori — systems, security, reliability, audit
- **Graduate:** operating systems & networks, Linux administration.
- **Post-graduate:** Site Reliability Engineering, application security.
- **PhD level:** threat modelling for e-commerce/payment flows.

## ভান্ডারী Bhandari — catalogue, inventory, logistics, documents
- **Graduate:** product information management, size grading & charts.
- **Post-graduate:** inventory theory (EOQ, safety stock, reorder points).
- **PhD level:** stochastic inventory models for seasonal fashion.

## Taught so far

| Agent | Modules written | Extra files | Exam | Level earned |
|---|---|---|---|---|
| প্রহরী Prohori A360-02 | 11 (wave 2) — R01 … R11 | MYTHS (15), README | 25 items, pass 22 | none yet |
| ভান্ডারী Bhandari A360-03 | 8 (wave 2) — B01 … B08 | MYTHS (12), README | 22 items, pass 19 | none yet |
`;

describe('parseCurriculumDoc', () => {
  it("reads one agent's three-level syllabus and its taught-so-far row by its own code", () => {
    const out = parseCurriculumDoc(SAMPLE);
    expect(out.prohori).toEqual({
      graduate: 'operating systems & networks, Linux administration.',
      postGraduate: 'Site Reliability Engineering, application security.',
      phd: 'threat modelling for e-commerce/payment flows.',
      modulesWritten: '11 (wave 2) — R01 … R11',
      exam: '25 items, pass 22',
      levelEarnedNote: 'none yet',
    });
    expect(out.bhandari.graduate).toBe('product information management, size grading & charts.');
    expect(out.bhandari.modulesWritten).toBe('8 (wave 2) — B01 … B08');
  });

  it('an agent the document does not (yet) cover reads as the honest empty syllabus, never thrown', () => {
    const out = parseCurriculumDoc(SAMPLE);
    expect(out.tirondaj).toEqual({ graduate: '', postGraduate: '', phd: '', modulesWritten: '', exam: '', levelEarnedNote: '' });
    expect(out.gyani).toEqual({ graduate: '', postGraduate: '', phd: '', modulesWritten: '', exam: '', levelEarnedNote: '' });
  });

  it('never reads past the next heading', () => {
    const out = parseCurriculumDoc(SAMPLE);
    expect(out.prohori.phd).not.toContain('product information');
  });

  it('a bare markdown string with no sections reads as every agent empty', () => {
    const out = parseCurriculumDoc('# Nothing here\n');
    for (const key of ['gyani', 'prohori', 'bhandari', 'sawdagor', 'shilpi', 'doot', 'tirondaj'] as const) {
      expect(out[key]).toEqual({ graduate: '', postGraduate: '', phd: '', modulesWritten: '', exam: '', levelEarnedNote: '' });
    }
  });
});

describe('readCurriculumDoc', () => {
  it('is honestly empty when no docs folder is given, never throwing', () => {
    const out = readCurriculumDoc(null);
    expect(out.gyani).toEqual({ graduate: '', postGraduate: '', phd: '', modulesWritten: '', exam: '', levelEarnedNote: '' });
  });

  it('reads the real repository docs/agents/CURRICULUM.md when run from the repo (agentDocsDir finds it)', () => {
    const dir = agentDocsDir();
    if (!dir) return; // not every CI working directory sits inside the repo checkout; honestly skip rather than fail
    const out = readCurriculumDoc(dir);
    expect(out.gyani.graduate.length).toBeGreaterThan(0);
    expect(out.gyani.phd.length).toBeGreaterThan(0);
    expect(out.prohori.modulesWritten.length).toBeGreaterThan(0);
    // Tirondaj's own degree-path section (Graduate/Post-graduate/PhD) is added later by PR 581; the "Taught so
    // far" table may already name it (wave 1 ad modules), but its syllabus text stays honestly empty until then.
    expect(out.tirondaj.graduate).toBe('');
    expect(out.tirondaj.postGraduate).toBe('');
    expect(out.tirondaj.phd).toBe('');
  });
});
