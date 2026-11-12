// S15 · PR 306 — one prompt and one parser per draft kind (SEO, campaign, article), shared by every live provider
// (live.ts) so a model only ever answers one small JSON object; the facts, the limits and the "say only what you
// were given" rule are the same whichever company's API reads them. A model that answers with anything else (prose,
// a missing field, an empty body) is a `BAD_ANSWER`-shaped `AdapterError`, never a guess dressed up as a draft.
import { z } from 'zod';
import { AdapterError } from '../define';
import { cutTo, type AiArticleDraft, type AiArticleInput, type AiCampaignDraft, type AiCampaignInput, type AiSeoDraft, type AiSeoInput, type AiSupportReplyDraft, type AiSupportReplyInput } from './shared';

export interface Prompt {
  system: string;
  user: string;
  maxTokens: number;
}

const SYSTEM_RULE = 'Write only from the facts given. Never invent a fact, a price, a claim or a number that is not in the input. Reply with exactly one JSON object and nothing else: no code fence, no heading, no explanation before or after it.';

/** Finds the first JSON object in a reply (a model sometimes wraps it in a ```json fence or a sentence). */
function firstJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new AdapterError('the model did not answer with JSON');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new AdapterError('the model did not answer with valid JSON');
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 221 — search title and meta description
// ---------------------------------------------------------------------------------------------------------------------

export function seoPrompt(input: AiSeoInput): Prompt {
  const f = input.facts;
  const facts = Object.entries({ name: f.name, brand: f.brand, category: f.category, colours: f.colours?.join(', '), fit: f.fit, fabric: f.fabric, shop: f.shop })
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const lang = input.locale === 'bn' ? 'Bengali (বাংলা)' : 'English';
  return {
    system: SYSTEM_RULE,
    user: `Write a search-engine title and meta description for this ${input.subject} page, in ${lang}.\n\nFacts:\n${facts}\n\nLimits: title at most ${input.max.title} characters; description at most ${input.max.description} characters.\n\nReply as {"title": "...", "description": "..."}.`,
    maxTokens: 400,
  };
}

const seoAnswer = z.object({ title: z.string(), description: z.string() });

export function parseSeoJson(text: string, input: AiSeoInput): AiSeoDraft {
  const parsed = seoAnswer.safeParse(firstJsonObject(text));
  if (!parsed.success) throw new AdapterError('the model did not answer with a title and a description');
  return { title: cutTo(parsed.data.title, input.max.title), description: cutTo(parsed.data.description, input.max.description), practice: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 293 — the offer campaign (SMS / e-mail)
// ---------------------------------------------------------------------------------------------------------------------

export function campaignPrompt(input: AiCampaignInput): Prompt {
  const words = input.words.length ? `You may use these placeholders exactly as written, braces included, and no others: ${input.words.map((w) => `{${w}}`).join(', ')}.` : 'Use no {placeholder} braces.';
  const voice = [input.voice.greeting && `greeting: ${input.voice.greeting}`, input.voice.signOff && `sign-off: ${input.voice.signOff}`, input.voice.style && `style: ${input.voice.style}`].filter(Boolean).join('; ');
  const lang = input.locale === 'bn' ? 'Bengali (বাংলা)' : 'English';
  const sms = input.channel === 'sms';
  const limits = sms ? `at most ${input.max.body} characters, no subject line` : `subject at most ${input.max.subject} characters, body at most ${input.max.body} characters`;
  const shape = sms ? '{"body": "..."}' : '{"subject": "...", "body": "..."}';
  return {
    system: SYSTEM_RULE,
    user: `Write ${input.versions} different versions of this ${sms ? 'SMS' : 'e-mail'} offer, in ${lang}.\n\nWhat it is about: ${input.brief}\n${voice ? `Owner's voice — ${voice}.\n` : ''}${words}\nLimits: ${limits}.\n\nReply as {"versions": [${shape}, ...]}, exactly ${input.versions} items.`,
    maxTokens: 900,
  };
}

const campaignAnswer = z.object({ versions: z.array(z.object({ subject: z.string().optional(), body: z.string() })).min(1) });

export function parseCampaignJson(text: string, input: AiCampaignInput): AiCampaignDraft {
  const parsed = campaignAnswer.safeParse(firstJsonObject(text));
  if (!parsed.success || !parsed.data.versions.length) throw new AdapterError('the model did not answer with any version');
  // Only the words asked for may stand in braces; any other brace is dropped rather than shown to a customer.
  const keep = input.words.length ? new RegExp(`\\{(?!(?:${input.words.join('|')})\\})[^}]*\\}?`, 'gu') : /\{[^}]*\}?/gu;
  const n = Math.min(3, Math.max(2, input.versions));
  const versions = parsed.data.versions.slice(0, n).map((v) => ({
    ...(input.channel === 'sms' ? {} : { subject: cutTo((v.subject ?? '').replace(keep, ''), input.max.subject) }),
    body: cutTo(v.body.replace(keep, ''), input.max.body),
  }));
  return { versions, practice: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 243 — a journal article's first draft from its brief
// ---------------------------------------------------------------------------------------------------------------------

export function articlePrompt(input: AiArticleInput): Prompt {
  const lang = input.locale === 'bn' ? 'Bengali (বাংলা)' : 'English';
  const outline = input.outline.length ? input.outline.map((h) => `- ${h}`).join('\n') : '(no fixed outline — choose headings that fit the brief)';
  const links = input.links.filter((l) => /^\/(?!\/)\S*$/u.test(l));
  return {
    system: SYSTEM_RULE,
    user: [
      `Write a first draft of a journal article, in ${lang}, about ${input.wordCount} words, for a reader whose intent is "${input.intent}".`,
      '',
      `Title: ${input.title}`,
      `Search phrase: ${input.query ?? '(none)'}`,
      `Keywords, the first one leading: ${input.keywords.join(', ')}`,
      `Outline:\n${outline}`,
      input.mustInclude ? `Facts it must carry, each its own line:\n${input.mustInclude}` : '',
      links.length ? `Shop paths it must link to, as [words](path): ${links.join(', ')}` : '',
      input.notes ? `Note for the writer: ${input.notes}` : '',
      '',
      'Body format: "## " before each heading, "- " before a bulleted fact, "[words](/path)" for a shop link.',
      '',
      'Reply as {"excerpt": "...", "body": "..."}.',
    ].filter(Boolean).join('\n'),
    maxTokens: Math.min(4000, Math.max(600, input.wordCount * 3)),
  };
}

const articleAnswer = z.object({ excerpt: z.string(), body: z.string() });

export function parseArticleJson(text: string): AiArticleDraft {
  const parsed = articleAnswer.safeParse(firstJsonObject(text));
  if (!parsed.success || !parsed.data.body.trim()) throw new AdapterError('the model did not answer with an article');
  return { excerpt: cutTo(parsed.data.excerpt, 300), body: parsed.data.body.trim(), practice: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// S15 · PR 325 — the support agent's own job: a warmer rephrasing of the rule-based draft (never a new fact)
// ---------------------------------------------------------------------------------------------------------------------

const FACT_RULE = 'Keep every fact in the draft exactly as given — never add, remove or change an order number, status, tracking code, size, price, policy or promise. If the draft asks the customer for more information, keep asking for the same thing.';

export function supportReplyPrompt(input: AiSupportReplyInput): Prompt {
  const lang = input.locale === 'bn' ? 'Bengali (বাংলা)' : 'English';
  const f = input.facts;
  const facts = Object.entries({ intent: f.intent, complaint: f.complaint, orderNumber: f.orderNumber, orderStatus: f.orderStatus, courier: f.courier, tracking: f.tracking, late: f.late ? 'yes' : undefined, size: f.size, customerName: f.customerName })
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return {
    system: SYSTEM_RULE,
    user: `A customer wrote to a Bangladeshi menswear shop's support chat, in ${lang}:\n"${input.question}"\n\nThe shop's own rule-based draft reply, already correct and complete, is:\n"${input.ruleBasedBody}"\n\nFacts behind that draft:\n${facts || '(none)'}\n\nRewrite the draft in a warmer, more natural ${lang} voice that a staff member could send as-is. ${FACT_RULE} At most ${input.max.body} characters.\n\nReply as {"body": "..."}.`,
    maxTokens: 500,
  };
}

const supportReplyAnswer = z.object({ body: z.string() });

export function parseSupportReplyJson(text: string, input: AiSupportReplyInput, usage?: { inputTokens: number; outputTokens: number }): AiSupportReplyDraft {
  const parsed = supportReplyAnswer.safeParse(firstJsonObject(text));
  if (!parsed.success || !parsed.data.body.trim()) throw new AdapterError('the model did not answer with a reply');
  return { body: cutTo(parsed.data.body, input.max.body), practice: false, ...(usage ? { usage } : {}) };
}
