// S11 · PR 221, S14 · PR 293, S12 · PR 243 — the practice AI writer: AI helpers stay off until the owner turns them
// on (CN-026: `ai.enabled`), and until a provider's key is entered and its Test passes, every draft comes from here —
// it writes nothing it was not given (the facts, the brief, the brief's own words, joined in order) and says so
// (`practice: true`). A draft is never used on a page until a person accepts it.
import { z } from 'zod';
import { AdapterError, defineAdapter, type AdapterContext } from '../define';
import { cutTo, type AiArticleDraft, type AiArticleInput, type AiCampaignDraft, type AiCampaignInput, type AiSeoDraft, type AiSeoInput, type AiWriter } from './shared';

/** The mock takes no settings; every live provider's `mock()` passes this when it falls back to practice text. */
export const emptyMockContext: AdapterContext<Record<string, never>> = { mode: 'MOCK', config: {}, storeId: null, async secret() { return null; } };

/** The mock's draft: only the facts it was given, in order. */
export function practiceDraft(input: AiSeoInput): AiSeoDraft {
  const f = input.facts;
  const list = (xs: (string | undefined)[], sep: string) => xs.map((x) => x?.trim()).filter((x): x is string => Boolean(x)).join(sep);
  const title = list([f.name, f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? f.brand : undefined, f.shop], ' | ');
  const description = list([list([f.name, f.category], ' · '), list(f.colours ?? [], ', '), f.fit, f.fabric, f.shop], '. ');
  return { title: cutTo(title, input.max.title), description: cutTo(description, input.max.description), practice: true };
}

/** The first sentence (or line) of a brief. */
const firstSentence = (text: string) => (text.trim().split(/(?<=[.!?।])\s+|\n+/u)[0] ?? '').trim();

/** PR 293 — the mock's versions: only the owner's own words, joined in a different order and length per version. */
export function practiceCampaign(input: AiCampaignInput): AiCampaignDraft {
  const has = (w: string) => input.words.includes(w);
  const brief = input.brief.trim().replace(/\s+/gu, ' ');
  const head = firstSentence(input.brief);
  const greet = input.voice.greeting.trim();
  const sign = input.voice.signOff.trim();
  const name = has('customerName') ? '{customerName}' : '';
  const link = has('link') ? '{link}' : '';
  const shop = has('storeName') ? '{storeName}' : '';
  const sms = input.channel === 'sms';
  const join = (parts: string[], sep: string) => parts.map((x) => x.trim()).filter(Boolean).join(sep);
  const hello = join([greet, name], ' ');
  const sep = sms ? ' ' : '\n\n';
  const shapes: ((b: string) => string)[] = [
    (b) => join([hello ? `${hello},` : '', b, link, sign], sep),
    (b) => join([b, link], sep),
    (b) => join([hello ? `${hello},` : '', b, link, join([sign, shop], sms ? ' ' : '\n')], sep),
  ];
  const texts = [brief, brief, head];
  // too long: the brief is cut (at a word) so the greeting, the link word and the sign-off stay whole
  const fit = (shape: (b: string) => string, b: string) => {
    const full = shape(b);
    if ([...full].length <= input.max.body) return full;
    const room = input.max.body - [...shape('')].length - sep.length;
    return room > 0 ? shape(cutTo(b, room)) : cutTo(full.replace(/\{[^}]*$/u, ''), input.max.body).replace(/\{[^}]*$/u, '').trim();
  };
  const subjects = [head, join([shop, head], ': '), join([name, head], ', ')];
  const n = Math.min(3, Math.max(2, input.versions));
  const versions = shapes.slice(0, n).map((shape, i) => ({
    ...(sms ? {} : { subject: cutTo(subjects[i] || head, input.max.subject).replace(/\{[^}]*$/u, '').trim() }),
    body: fit(shape, texts[i]!),
  }));
  // without a greeting or a sign-off two shapes can come out the same: each version once
  return { versions: versions.filter((v, i) => versions.findIndex((w) => w.body === v.body && w.subject === v.subject) === i), practice: true };
}

/**
 * PR 243 — the mock's article: only the brief's own words, in the editor's format — the search phrase (or title) as
 * the opening line, the facts, one heading per outline line, the shop links as a list, the keywords last.
 */
export function practiceArticle(input: AiArticleInput): AiArticleDraft {
  const clean = (x: string) => x.trim().replace(/\s+/gu, ' ');
  const lines = (xs: string[]) => xs.map(clean).filter(Boolean);
  const facts = lines((input.mustInclude ?? '').split(/\r?\n/u));
  const lead = clean(input.query ?? '') || clean(input.title);
  const parts: string[] = [lead];
  if (facts.length) parts.push(facts.map((f) => `- ${f}`).join('\n'));
  for (const h of lines(input.outline)) parts.push(`## ${h}`, lead);
  const links = lines(input.links).filter((l) => /^\/(?!\/)\S*$/u.test(l));
  if (links.length) parts.push(links.map((l) => `- [${l}](${l})`).join('\n'));
  const keys = lines(input.keywords);
  if (keys.length) parts.push(keys.join(' · '));
  if (input.notes?.trim()) parts.push(`> note: ${clean(input.notes)}`);
  return { excerpt: cutTo(lead, 300), body: parts.join('\n\n'), practice: true };
}

export const mockAiWriterAdapter = defineAdapter<AiWriter, Record<string, never>>({
  kind: 'AI_PROVIDER',
  provider: 'mockAiWriter',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no AI provider is connected yet; the practice writer serves until its key is entered');
  },
  async mock() {
    return {
      async draftSeo(input) {
        if (!input.facts.name.trim()) throw new AdapterError('a draft needs the page name');
        return practiceDraft(input);
      },
      async draftCampaign(input) {
        if (!input.brief.trim()) throw new AdapterError('a campaign draft needs what the message is about');
        return practiceCampaign(input);
      },
      async draftArticle(input) {
        if (!input.title.trim() || !input.keywords.length || !(input.wordCount > 0)) throw new AdapterError('an article draft needs its brief');
        return practiceArticle(input);
      },
    };
  },
  async test() {
    return { ok: true, message: 'practice AI writer: nothing leaves the server' };
  },
});
