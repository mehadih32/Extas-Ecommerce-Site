// S11 · PR 230 — the answer-engine pack (Blueprint C4.3): /llms.txt, the shop's summary for AI assistants, in the
// llms.txt shape (a `#` name, a `>` summary, `##` sections of `- [name](address): line`). Pure: what the shop already
// shows goes in — its name, the owner's own summary, the collections with their own search lines, the shop rules
// pages with what each says, and the contact details that are filled in — and nothing is made up: an empty field is
// left out. The route (app/llms.txt) answers it only while the shop is open to search engines on its own domain.

export interface LlmsLink {
  name: string;
  /** The page's path on the shop. */
  href: string;
  /** Its own line (a collection's search line), or null. */
  line?: string | null;
}

export interface LlmsPage {
  title: string;
  href: string;
  /** What the page says, one short line each (a rule's line, a question). */
  lines: readonly string[];
}

export interface LlmsFacts {
  name: string;
  /** The shop's own origin (https://…). */
  origin: string;
  /** The owner's own summary (`seo.answerPack.summary`); empty: left out. */
  summary: string;
  currency: string;
  /** The Bengali twin of the shop is on (`/bn`). */
  bengali: boolean;
  collections: ReadonlyArray<LlmsLink & { children: readonly LlmsLink[] }>;
  pages: readonly LlmsPage[];
  contact: { phone: string | null; whatsapp: string | null; email: string | null; hours: string | null; address: string | null };
}

/** At most so many lines under one page (a long FAQ is linked, not copied whole). */
export const LLMS_PAGE_LINES = 8;

/** One line of text: no line breaks, no markdown link brackets that would break the list. */
const one = (s: string) => s.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim();

export function llmsTxt(f: LlmsFacts): string {
  const at = (href: string) => new URL(href, f.origin).toString();
  const item = (l: LlmsLink) => `- [${one(l.name)}](${at(l.href)})${l.line?.trim() ? `: ${one(l.line)}` : ''}`;
  const out: string[] = [`# ${one(f.name)}`, ''];
  if (f.summary.trim()) out.push(`> ${one(f.summary)}`, '');
  out.push(`Online shop: ${at('/')}. Prices in ${f.currency}.${f.bengali ? ` Also in Bengali: ${at('/bn')}.` : ''}`);
  const cols = f.collections.filter((c) => c.name.trim());
  if (cols.length) {
    out.push('', '## Collections', '');
    for (const c of cols) {
      out.push(item(c));
      for (const k of c.children) if (k.name.trim()) out.push(`  ${item(k)}`);
    }
  }
  const pages = f.pages.filter((p) => p.title.trim());
  if (pages.length) {
    out.push('', '## Shop rules and help', '');
    for (const p of pages) {
      const lines = p.lines.map(one).filter(Boolean).slice(0, LLMS_PAGE_LINES);
      out.push(`- [${one(p.title)}](${at(p.href)})${lines.length ? `: ${lines.join('; ')}` : ''}`);
    }
  }
  const c = f.contact;
  const contact = [c.phone && `Phone: ${one(c.phone)}`, c.whatsapp && `WhatsApp: ${one(c.whatsapp)}`, c.email && `E-mail: ${one(c.email)}`, c.hours && `Hours: ${one(c.hours)}`, c.address && `Address: ${one(c.address)}`].filter(
    (x): x is string => Boolean(x),
  );
  if (contact.length) out.push('', '## Contact', '', ...contact.map((x) => `- ${x}`));
  return `${out.join('\n')}\n`;
}
