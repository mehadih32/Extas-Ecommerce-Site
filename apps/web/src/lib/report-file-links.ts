// S28 · PR 689 — the address of a report file (the packs API serves packs and single reports on one path). Pure, so the screen and
// its test build the same link: the period is a preset or your own dates, the words follow the admin's language.
export type FileFormat = 'pdf' | 'xlsx' | 'csv';
export type FilePeriod = { preset: string } | { from: string; to: string };

export function fileUrl(report: string, format: FileFormat, period: FilePeriod | null, lang: string, opts: { download?: boolean } = {}): string {
  const q = new URLSearchParams({ format });
  if (period) {
    if ('preset' in period) q.set('period', period.preset);
    else {
      q.set('from', period.from);
      q.set('to', period.to);
    }
  }
  if (lang === 'bn') q.set('lang', 'bn');
  if (opts.download && format === 'pdf') q.set('download', '1');
  return `/api/admin/reports/packs/${encodeURIComponent(report)}?${q.toString()}`;
}
