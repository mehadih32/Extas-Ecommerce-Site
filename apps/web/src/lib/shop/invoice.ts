// PR 136 — the customer's invoice (Blueprint B2.1, B2.4; demo 52-thanks.js §53 inv_sheet / inv_doc / INV_CSS, V12.2):
// one sheet drawn from the order as it is stored, written once as HTML so the page shows exactly what the downloaded
// file and the print hold. Nothing here works a price out: every amount arrives already written (from the order's
// stored lines and totals) and every word arrives from the shop dictionary or the owner's settings (invoice-view.ts).
// Black-and-white safe (B2.4): nothing depends on colour to be read; the table's head repeats on every printed page.
// Pure: no request, no database — the page, the download and the tests all call the same functions.
// PR 605: a gift whose sender asked to hide the prices (`prices: false`) has no price columns and no money table.
// PR 407: the issued invoice's own number (made once, kept for life), its revision mark when the order was edited, and
// the courier's consignment id for the printed copy's barcode (packages/documents invoice.ts draws the printed copy).

import { invoiceNumberOf } from '@extas/orders/pure';

/** One line of the sheet: what was bought, as stored. */
export interface InvoiceRow {
  no: string;
  name: string;
  /** Small lines under the name: colour · size, the stock code, the set's saving. */
  subs: string[];
  /** Marks beside the name: "added to parcel", "set price". */
  marks: string[];
  qty: string;
  unit: string;
  amount: string;
}

export interface InvoiceTotal {
  label: string;
  value: string;
  kind?: 'disc' | 'total';
}

/** A block of the customer's side: billed to, the delivery address, the courier. */
export interface InvoiceParty {
  label: string;
  /** Shown bold first (the customer's name). */
  strong?: string;
  lines: string[];
}

/** Everything the sheet shows, every word already in the page's language. */
export interface InvoiceView {
  lang: 'en' | 'bn';
  invoiceNo: string;
  docTitle: string;
  /** The shop's wordmark (its name). */
  brand: string;
  /** The shop's own lines under the wordmark (slogan, contacts, address); empty ones are left out before this. */
  shopLines: string[];
  heading: string;
  /** The invoice number, the order number, the date. */
  meta: string[];
  parties: InvoiceParty[];
  cols: { no: string; item: string; qty: string; unit: string; amount: string };
  rows: InvoiceRow[];
  totals: InvoiceTotal[];
  payment: { title: string; lines: string[] } | null;
  /** The owner's own note, in a box above the footer. */
  note: string[];
  footer: string[];
  /** PR 605: false — a gift with its prices hidden (no unit and amount columns, no totals). Absent: shown. */
  prices?: boolean;
  /** PR 407: a later version of the issued invoice (the order was edited): its mark, e.g. "REVISED 2". Absent: version 1. */
  stamp?: string;
  /** PR 407: the courier's consignment id and its caption, for the printed copy's barcode. Absent: no parcel booked yet. */
  courierCode?: { value: string; caption: string };
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text made safe to sit inside HTML (every word on the sheet passes through here). */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (ch) => ESC[ch]!);

/**
 * The invoice number from the order's (the owner's pattern, `account.invoice.number`): `{number}` is the order number
 * as it is, `{digits}` only its digits (EX-10042 → 10042; an order number with no digit keeps itself).
 */
export function invoiceNumber(pattern: string, orderNumber: string): string {
  return invoiceNumberOf(pattern, orderNumber);
}

/** The file name the download saves as: the invoice number with only safe characters. */
export function invoiceFileName(invoiceNo: string): string {
  return `${invoiceNo.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'}.html`;
}

/**
 * The sheet's styles, written once (demo INV_CSS). `@R` is the root (body in the file, .inv-doc on the page) and `@ `
 * prefixes every other rule, so the same look is used in both without leaking either way. Greys only: black-and-white
 * safe. The Bengali faces fall back to the phone's own Bengali font.
 */
const SHEET_CSS = [
  '@ *{box-sizing:border-box}',
  "@R{margin:0;padding:24px;background:#F4F3F0;color:#171715;text-align:left;font:14px/1.5 'Instrument Sans','Hind Siliguri','Noto Sans Bengali',system-ui,-apple-system,'Segoe UI',sans-serif}",
  '@ .sheet{max-width:760px;margin:0 auto;background:#fff;border:1px solid #E6E3DE;padding:28px}',
  '@ .top{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;border-bottom:2px solid #171715;padding-bottom:16px}',
  "@ .brand{font:800 26px/1 Archivo,'Hind Siliguri',system-ui,sans-serif;letter-spacing:.14em;color:#171715;min-width:0;overflow-wrap:anywhere}",
  "@ .brand small{display:block;font:500 11.5px/1.5 'Instrument Sans','Hind Siliguri',system-ui,sans-serif;letter-spacing:.03em;color:#54504A;margin-top:8px}",
  '@ .tt{text-align:right}',
  "@ .tt h1{font:800 19px/1.2 Archivo,'Hind Siliguri',system-ui,sans-serif;margin:0 0 5px;letter-spacing:normal;color:#171715}",
  '@ .tt div{font-size:12.5px;color:#54504A}',
  '@ .cols{display:flex;gap:28px;flex-wrap:wrap;margin:18px 0 4px}',
  '@ .cols>div{flex:1 1 210px;min-width:0;overflow-wrap:anywhere}',
  '@ .lbl{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#5E584F;margin-bottom:4px}',
  '@ table{width:100%;border-collapse:collapse;margin-top:16px;background:none}',
  '@ thead{display:table-header-group}',
  '@ tr{break-inside:avoid}',
  '@ th{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#5E584F;text-align:left;font-weight:700;border-bottom:1px solid #BDB7AD;padding:0 8px 7px;background:none}',
  '@ td{padding:10px 8px;border-bottom:1px solid #E6E3DE;vertical-align:top;color:#171715;background:none;overflow-wrap:anywhere}',
  '@ td.n,@ th.n{text-align:center;width:34px}',
  '@ td.r,@ th.r{text-align:right;white-space:nowrap}',
  '@ .sub{font-size:12px;color:#54504A;margin-top:2px}',
  '@ .pill{display:inline-block;font-size:10.5px;font-weight:700;border:1px solid #8C867C;color:#171715;border-radius:3px;padding:0 6px;margin-left:4px;vertical-align:1px;white-space:nowrap}',
  '@ .sum{margin-left:auto;margin-top:14px;width:300px;max-width:100%}',
  '@ .sum td{border:0;padding:4px 0;font-size:13.5px}',
  "@ .sum tr.tot td{border-top:2px solid #171715;padding-top:10px;font:800 18px/1.2 Archivo,'Hind Siliguri',system-ui,sans-serif}",
  '@ .pay{margin-top:18px;border:1px solid #BDB7AD;padding:12px 14px;font-size:13px}',
  '@ .notes{margin-top:14px;font-size:12.5px;color:#54504A;border:1px dashed #BDB7AD;padding:10px 12px}',
  '@ .foot{margin-top:22px;border-top:1px solid #E6E3DE;padding-top:12px;font-size:11.5px;color:#5E584F;line-height:1.6}',
  '@media(max-width:560px){@R{padding:10px}@ .sheet{padding:16px}@ .brand{font-size:21px}@ .tt{text-align:left}@ .top{flex-direction:column;gap:10px}' +
    '@ .cols{gap:14px;margin-top:14px}@ .cols>div{flex:1 1 100%}@ th,@ td{padding-left:0;padding-right:6px}@ td.r,@ th.r{padding-left:8px;padding-right:0}' +
    '@ td.n,@ th.n{width:22px}@ .sum{width:100%}}',
  '@media print{@R{background:#fff;padding:0}@ .sheet{border:0;max-width:none;padding:0}}',
].join('\n');

/** The sheet's styles for a root (`body` in the file, `.inv-doc` on the page) and a prefix for every other rule. */
export function invoiceCss(root: string, prefix: string): string {
  return SHEET_CSS.replace(/@R/g, root).replace(/@ /g, prefix);
}

const lines = (xs: readonly string[]) => xs.map(esc).join('<br>');

/** The sheet itself: no <html>, no styles. */
export function invoiceSheetHtml(v: InvoiceView): string {
  const brand = `<div class="brand">${esc(v.brand)}${v.shopLines.length ? `<small>${lines(v.shopLines)}</small>` : ''}</div>`;
  const tt = `<div class="tt"><h1>${esc(v.heading)}</h1>${v.meta.map((m) => `<div>${esc(m)}</div>`).join('')}</div>`;
  const parties = v.parties
    .map((p) => `<div><div class="lbl">${esc(p.label)}</div>${p.strong ? `<b>${esc(p.strong)}</b>` : ''}${p.lines.map((l, i) => `<div${p.strong || i ? ' class="sub"' : ''}>${esc(l)}</div>`).join('')}</div>`)
    .join('');
  const priced = v.prices !== false;
  const money = (unit: string, amount: string, cell: 'th' | 'td') =>
    priced ? (cell === 'th' ? `<th class="r" scope="col">${esc(unit)}</th><th class="r" scope="col">${esc(amount)}</th>` : `<td class="r">${esc(unit)}</td><td class="r"><b>${esc(amount)}</b></td>`) : '';
  const head = `<tr><th class="n" scope="col">${esc(v.cols.no)}</th><th scope="col">${esc(v.cols.item)}</th><th class="n" scope="col">${esc(v.cols.qty)}</th>${money(v.cols.unit, v.cols.amount, 'th')}</tr>`;
  const rows = v.rows
    .map(
      (r) =>
        `<tr><td class="n">${esc(r.no)}</td><td><b>${esc(r.name)}</b>${r.marks.map((m) => `<span class="pill">${esc(m)}</span>`).join('')}${r.subs.map((s) => `<div class="sub">${esc(s)}</div>`).join('')}</td>` +
        `<td class="n">${esc(r.qty)}</td>${money(r.unit, r.amount, 'td')}</tr>`,
    )
    .join('');
  const sum = v.totals.map((t) => `<tr${t.kind === 'total' ? ' class="tot"' : ''}><td>${esc(t.label)}</td><td class="r">${esc(t.value)}</td></tr>`).join('');
  return (
    `<div class="sheet" lang="${v.lang}">` +
    `<div class="top">${brand}${tt}</div>` +
    (parties ? `<div class="cols">${parties}</div>` : '') +
    `<table><thead>${head}</thead><tbody>${rows}</tbody></table>` +
    (sum ? `<table class="sum"><tbody>${sum}</tbody></table>` : '') +
    (v.payment ? `<div class="pay"><b>${esc(v.payment.title)}</b>${v.payment.lines.length ? `<br>${lines(v.payment.lines)}` : ''}</div>` : '') +
    (v.note.length ? `<div class="notes">${lines(v.note)}</div>` : '') +
    (v.footer.length ? `<div class="foot">${lines(v.footer)}</div>` : '') +
    '</div>'
  );
}

/** The downloadable file: one self-contained HTML document with its own styles (opens anywhere, prints the same). */
export function invoiceDocumentHtml(v: InvoiceView): string {
  return (
    `<!doctype html><html lang="${v.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${esc(v.docTitle)}</title><style>${invoiceCss('body', '')}</style></head>` +
    `<body>${invoiceSheetHtml(v)}</body></html>`
  );
}
