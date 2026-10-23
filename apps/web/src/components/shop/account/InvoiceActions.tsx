'use client';
// PR 136 — the invoice's two buttons (demo 52-thanks.js inv-dl / inv-print, R16): "Download invoice" is a plain link to
// the file (works with no script at all), and "Print / Save as PDF" opens the browser's own print of this page. A
// browser that never opens a print window (some in-app browsers) throws nothing, so the button listens for it and,
// when it does not come, says so under the buttons and points at the download — never a silent tap.
import { useState } from 'react';
import { Icon } from '../Icon';

/** How long to wait for a print window before saying none opened (a dialog that blocks counts as opened). */
const PRINT_WAIT_MS = 1200; // hardcode-ok: technical wait for the browser's print window, not a policy

export function InvoiceActions({ downloadHref, words }: { downloadHref: string | null; words: { download: string; print: string; note: string } }) {
  const [note, setNote] = useState(false);
  const print = () => {
    let shown = false;
    const seen = () => {
      shown = true;
    };
    window.addEventListener('beforeprint', seen, { once: true });
    const t0 = Date.now();
    try {
      window.print();
    } catch {
      // some in-app browsers have no print at all: the note below says so
    }
    if (Date.now() - t0 > 400) shown = true;
    window.setTimeout(() => {
      window.removeEventListener('beforeprint', seen);
      setNote(!shown);
    }, PRINT_WAIT_MS);
  };
  return (
    <>
      {note ? (
        <p className="inv-note" role="status" data-testid="invoice-print-note">
          <Icon name="info" size={15} />
          <span>{words.note}</span>
        </p>
      ) : null}
      <div className={`inv-btns${downloadHref ? '' : ' one'}`}>
        {downloadHref ? (
          <a className="btn btn-primary btn-block" href={downloadHref} download data-testid="invoice-download">
            <Icon name="share" size={17} />
            {words.download}
          </a>
        ) : null}
        <button type="button" className={`btn ${downloadHref ? 'btn-secondary' : 'btn-primary'} btn-block`} onClick={print} data-testid="invoice-print">
          <Icon name="doc" size={17} />
          {words.print}
        </button>
      </div>
    </>
  );
}
