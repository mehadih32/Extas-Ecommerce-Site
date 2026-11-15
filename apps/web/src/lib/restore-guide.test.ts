// PR 852 — the Restore guide (PDF): the same steps in both languages, in the order of the real two-step restore, and a real PDF comes out.
import { boxText, readPdf } from '@extas/documents/test-kit';
import { describe, expect, it } from 'vitest';
import bn from '../../messages/admin-backups.bn.json';
import en from '../../messages/admin-backups.en.json';
import { RESTORE_GUIDE, restoreGuideDocument, restoreGuidePdf } from './restore-guide';

const head = { name: 'Sample Shop', address: 'Sample Road, Dhaka', phone: '+8801000000000' };

describe('Restore guide (PR 852)', () => {
  it('has as many Bengali steps as English ones, and each step is one row of two languages', () => {
    expect(RESTORE_GUIDE.bn.steps.length).toBe(RESTORE_GUIDE.en.steps.length);
    const doc = restoreGuideDocument(head, '15 Nov 2026', 150);
    expect(doc.rows).toHaveLength(RESTORE_GUIDE.en.steps.length);
    expect(doc.rows[0]?.cells).toEqual(['1', RESTORE_GUIDE.en.steps[0], RESTORE_GUIDE.bn.steps[0]]);
    expect(doc.columns).toHaveLength(3);
    expect(doc.foot).toContain('15 Nov 2026');
  });

  it('quotes the real buttons of the restore card (check copy first, then the live shop with RESTORE)', () => {
    const e = en as unknown as { restore: { stage: string; goLive: string } };
    const b = bn as unknown as { restore: { stage: string; goLive: string } };
    const all = (steps: string[]) => steps.join('\n');
    expect(all(RESTORE_GUIDE.en.steps)).toContain(`“${e.restore.stage}”`);
    expect(all(RESTORE_GUIDE.en.steps)).toContain(`“${e.restore.goLive}”`);
    expect(all(RESTORE_GUIDE.bn.steps)).toContain(`“${b.restore.stage}”`);
    expect(all(RESTORE_GUIDE.bn.steps)).toContain(`“${b.restore.goLive}”`);
    expect(all(RESTORE_GUIDE.en.steps)).toContain('RESTORE');
  });

  it('makes a real A4 PDF with at least one page', async () => {
    const pdf = await restoreGuidePdf(head, '15 Nov 2026', 100, boxText());
    const read = readPdf(pdf);
    expect(read.xrefOk).toBe(true);
    expect(read.pages.length).toBeGreaterThanOrEqual(1);
    expect(Math.round(read.pages[0]!.mediaBox[2]!)).toBe(595); // A4 width in points
  });
});
