// PR 852 — Settings › Backups & restore › "Restore guide (PDF)": the steps that bring the shop back from a backup, in Bengali and English
// side by side, on the shop's letterhead (the same paper list the handover sheet uses: the letters are shaped on the server, so the PDF
// reads the same on every phone and printer). The steps are the real two-step restore of this page (check copy first, then the live
// shop with RESTORE typed and the owner's PIN); nothing here restores anything.
import { listPdf, PAPER_MM, sharpText, type ListDocument, type TextEngine } from '@extas/documents';
import bn from '../../messages/admin-backups.bn.json';
import en from '../../messages/admin-backups.en.json';
import type { Letterhead } from '@/lib/admin-fulfil/handover';

type Guide = { title: string; summary1: string; summary2: string; colStep: string; colEn: string; colBn: string; page: string; foot: string; file: string; steps: string[] };
type RawGuide = Omit<Guide, 'steps'> & { steps: Record<string, string> };
/** The steps sit in the messages file as s1, s2, ... (a dictionary cannot hold a list); the guide reads them in order. */
const guideOf = (m: unknown): Guide => {
  const g = (m as { guide: RawGuide }).guide;
  const steps = Object.keys(g.steps).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((k) => g.steps[k]!);
  return { ...g, steps };
};

/** The guide's words in each language (from the page's own messages files). */
export const RESTORE_GUIDE = { en: guideOf(en), bn: guideOf(bn) } as const;

/** The file name the browser saves it as. */
export const RESTORE_GUIDE_FILE = 'restore-guide-bn-en.pdf';

/** The guide as the paper list's data: one row per step, the step number, the English words and the Bengali words. */
export function restoreGuideDocument(head: Letterhead, printedOn: string, dpi: number): ListDocument {
  const e = RESTORE_GUIDE.en;
  const b = RESTORE_GUIDE.bn;
  const [widthMm, heightMm] = PAPER_MM.a4;
  return {
    widthMm,
    heightMm,
    dpi,
    letterhead: [head.name, head.address, head.phone],
    logo: head.logo ?? null,
    title: `${e.title} · ${b.title}`,
    summary: [e.summary1, b.summary1, e.summary2, b.summary2],
    columns: [
      { title: `${e.colStep} / ${b.colStep}`, width: 1 },
      { title: e.colEn, width: 5 },
      { title: e.colBn, width: 5 },
    ],
    rows: e.steps.map((step, i) => ({ cells: [String(i + 1), step, b.steps[i] ?? ''] })),
    foot: `${e.foot.replace('{on}', printedOn)} · ${b.foot.replace('{on}', printedOn)}`,
    pageWords: e.page,
  };
}

/** The guide as a PDF. */
export async function restoreGuidePdf(head: Letterhead, printedOn: string, dpi: number, engine: TextEngine = sharpText()): Promise<Buffer> {
  const doc = restoreGuideDocument(head, printedOn, dpi);
  return listPdf(doc, engine, { title: doc.title });
}
