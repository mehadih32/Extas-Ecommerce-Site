'use client';
// S28 · PR 689 (admin prototype v5, Reports › Downloads & report packs) — every file of the Reports section in one place: the four
// packs (period, PDF on the letterhead or Excel with a sheet per part, Download / Preview / Print / Schedule) and the single
// reports (Excel / PDF / Print, for the period picked in the period bar). Words: messages/admin-reports-library.*.json
// (`reportsLibrary.dl.*`). Read-only: a file reads the same figures as the library and changes nothing.
import Link from 'next/link';
import { useState } from 'react';
import { fileUrl, type FileFormat, type FilePeriod } from '@/lib/report-file-links';
import { t, type Dict } from '@/lib/i18n';

const PACKS = ['monthly', 'bank', 'stock', 'sales'] as const;
const SINGLES = ['figures', 'products', 'timing', 'review'] as const;
const PACK_PERIODS = ['lastmonth', 'month', 'last3m', 'last6m', 'last12m'] as const;
/** The period each pack opens with. */
const PACK_FIRST: Record<(typeof PACKS)[number], (typeof PACK_PERIODS)[number]> = { monthly: 'lastmonth', bank: 'last12m', stock: 'month', sales: 'lastmonth' };

/** Opens a PDF in a hidden frame and prints it; when the browser will not, the PDF opens in a new tab. */
export function printPdf(url: string, onFail: () => void): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, '_blank', 'noopener');
      onFail();
    }
    setTimeout(() => frame.remove(), 60_000); // hardcode-ok: the frame is kept a minute so the print dialog can finish
  };
  document.body.appendChild(frame);
}

export function DownloadsPanel(p: { dict: Dict; lang: string; period: FilePeriod }) {
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `reportsLibrary.dl.${k}`, vars);
  const [per, setPer] = useState<Record<string, string>>(() => ({ ...PACK_FIRST }));
  const [fmt, setFmt] = useState<Record<string, FileFormat>>({});
  const [said, setSaid] = useState<string | null>(null);
  const format = (pack: string): FileFormat => fmt[pack] ?? 'pdf';
  const print = (url: string) => printPdf(url, () => setSaid(c('printFail')));

  return (
    <section className="a2-card" id="rep-downloads" data-testid="lib-downloads">
      <h2 className="a2-h3">{c('title')}</h2>
      <p className="a2-cs">{c('sub')}</p>
      <div className="w4-packs a2-mt12">
        {PACKS.map((id) => {
          const f = format(id);
          const period = { preset: per[id] ?? PACK_FIRST[id] };
          return (
            <div key={id} className="w4-kpi" data-testid={`dl-pack-${id}`}>
              <b>{c(`packs.${id}.name`)}</b>
              <span className="a2-xs a2-mute">{c(`packs.${id}.d`)}</span>
              <label className="a2-xs a2-mute">
                {c('period')}
                <select className="a2-inp" value={per[id]} onChange={(e) => setPer({ ...per, [id]: e.target.value })} data-testid={`dl-per-${id}`}>
                  {PACK_PERIODS.map((x) => (
                    <option key={x} value={x}>
                      {c(`periods.${x}`)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="w4-row" role="group" aria-label={c('format')}>
                {(['pdf', 'xlsx'] as const).map((x) => (
                  <button key={x} type="button" className={`a2-btn sm${f === x ? ' pri' : ''}`} aria-pressed={f === x} onClick={() => setFmt({ ...fmt, [id]: x })} data-testid={`dl-fmt-${id}-${x}`}>
                    {c(x === 'pdf' ? 'fmtPdf' : 'fmtXlsx')}
                  </button>
                ))}
              </div>
              <div className="w4-row">
                <a className="a2-btn sm pri" href={fileUrl(id, f, period, p.lang, { download: true })} data-testid={`dl-get-${id}`}>
                  {c('download')}
                </a>
                <a className="a2-btn sm" href={fileUrl(id, 'pdf', period, p.lang)} target="_blank" rel="noreferrer" data-testid={`dl-preview-${id}`}>
                  {c('preview')}
                </a>
                <button type="button" className="a2-btn sm" onClick={() => print(fileUrl(id, 'pdf', period, p.lang))} data-testid={`dl-print-${id}`}>
                  {c('print')}
                </button>
                <Link className="a2-btn sm" href="/admin/reports/packs" data-testid={`dl-schedule-${id}`}>
                  {c('schedule')}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      <h3 className="a2-h4 a2-mt12">{c('single.title')}</h3>
      <p className="a2-cs">{c('single.sub')}</p>
      <ul className="w4-list a2-mt6">
        {SINGLES.map((id) => (
          <li key={id} className="w4-li" data-testid={`dl-single-${id}`}>
            <span className="w4-grow">
              <b>{c(`single.${id}`)}</b>
            </span>
            <a className="a2-btn sm" href={fileUrl(id, 'xlsx', p.period, p.lang)} data-testid={`dl-single-${id}-xlsx`}>
              {c('excel')}
            </a>
            <a className="a2-btn sm" href={fileUrl(id, 'pdf', p.period, p.lang, { download: true })} data-testid={`dl-single-${id}-pdf`}>
              {c('pdf')}
            </a>
            <button type="button" className="a2-btn sm" onClick={() => print(fileUrl(id, 'pdf', p.period, p.lang))} data-testid={`dl-single-${id}-print`}>
              {c('print')}
            </button>
          </li>
        ))}
      </ul>
      {said ? (
        <p className="a2-sm bk-warn a2-mt6" role="alert">
          {said}
        </p>
      ) : null}
    </section>
  );
}
