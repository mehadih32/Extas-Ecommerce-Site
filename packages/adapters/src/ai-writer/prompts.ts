// S15 · PR 306 — one prompt and one parser per draft kind (SEO, campaign, article), shared by every live provider
// (live.ts) so a model only ever answers one small JSON object; the facts, the limits and the "say only what you
// were given" rule are the same whichever company's API reads them. A model that answers with anything else (prose,
// a missing field, an empty body) is a `BAD_ANSWER`-shaped `AdapterError`, never a guess dressed up as a draft.
import { z } from 'zod';
import { AdapterError } from '../define';
import {
  cutTo,
  type AiApprovalExplainDraft,
  type AiApprovalExplainInput,
  type AiArticleDraft,
  type AiArticleInput,
  type AiCampaignDraft,
  type AiCampaignInput,
  type AiFraudReviewDraft,
  type AiFraudReviewInput,
  type AiProductDescriptionDraft,
  type AiProductDescriptionInput,
  type AiSeoDraft,
  type AiSeoInput,
  type AiSizeAdviceDraft,
  type AiSizeAdviceInput,
  type AiSupportReplyDraft,
  type AiSupportReplyInput,
} from './shared';

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

export function parseSeoJson(text: string, input: AiSeoInput, usage?: { inputTokens: number; outputTokens: number }): AiSeoDraft {
  const parsed = seoAnswer.safeParse(firstJsonObject(text));
  if (!parsed.success) throw new AdapterError('the model did not answer with a title and a description');
  return { title: cutTo(parsed.data.title, input.max.title), description: cutTo(parsed.data.description, input.max.description), practice: false, ...(usage ? { usage } : {}) };
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

// ---------------------------------------------------------------------------------------------------------------------
// S15 · PR 326 — the product content agent's own job: a shop-facing description from a product's own attributes
// ---------------------------------------------------------------------------------------------------------------------

const ATTRS_RULE = 'Write only from the attributes given. Never invent a size, colour, material, fit, feature, price or claim that is not listed; never promise a discount, shipping time or policy.';

export function productDescriptionPrompt(input: AiProductDescriptionInput): Prompt {
  const f = input.facts;
  const facts = Object.entries({ name: f.name, brand: f.brand, category: f.category, colours: f.colours?.join(', '), sizes: f.sizes?.join(', '), fabric: f.fabric, care: f.care, shop: f.shop })
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const lang = input.locale === 'bn' ? 'Bengali (বাংলা)' : 'English';
  return {
    system: `${SYSTEM_RULE} ${ATTRS_RULE}`,
    user: `Write a shop-facing description for this menswear product, in ${lang}, that a customer would read on its page.\n\nAttributes:\n${facts}\n\nAt most ${input.max.body} characters.\n\nReply as {"body": "..."}.`,
    maxTokens: 500,
  };
}

const productDescriptionAnswer = z.object({ body: z.string() });

export function parseProductDescriptionJson(text: string, input: AiProductDescriptionInput, usage?: { inputTokens: number; outputTokens: number }): AiProductDescriptionDraft {
  const parsed = productDescriptionAnswer.safeParse(firstJsonObject(text));
  if (!parsed.success || !parsed.data.body.trim()) throw new AdapterError('the model did not answer with a description');
  return { body: cutTo(parsed.data.body, input.max.body), practice: false, ...(usage ? { usage } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// S15 · PR 328 — the size advice agent's own job: one warm sentence on why Find My Size gave that size
// ---------------------------------------------------------------------------------------------------------------------

const SIZE_RULE = 'Write only from the measurements given. Never invent a measurement, a body signal or a reason that is not listed; never suggest a different size than sizeLabel, and never ask the shopper a question.';

export function sizeAdvicePrompt(input: AiSizeAdviceInput): Prompt {
  const f = input.facts;
  const facts = Object.entries({
    recommendedSize: f.sizeLabel,
    nextSizeUp: f.nextSizeLabel,
    measure: f.fieldLabel,
    thatSizesMeasureInches: f.valueInch,
    neededInches: f.needInch,
    bodyEstimateInches: f.bodyInch,
    easeAddedInches: f.easeInch,
    sizeCoversTheNeed: f.covered ? 'yes' : 'no (this is the largest size, it may still feel close)',
    garmentType: f.garment,
    heightInches: f.heightIn,
    weightKg: f.weightKg,
  })
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const lang = input.locale === 'bn' ? 'Bengali (বাংলা)' : 'English';
  return {
    system: `${SYSTEM_RULE} ${SIZE_RULE}`,
    user: `A Bangladeshi menswear shop's Find My Size tool already worked out a shopper's size from the measurements below. Write one short, warm sentence, in ${lang}, explaining why that size fits — plain enough for someone who does not know sewing terms.\n\nMeasurements:\n${facts}\n\nAt most ${input.max.body} characters.\n\nReply as {"body": "..."}.`,
    maxTokens: 300,
  };
}

const sizeAdviceAnswer = z.object({ body: z.string() });

export function parseSizeAdviceJson(text: string, input: AiSizeAdviceInput, usage?: { inputTokens: number; outputTokens: number }): AiSizeAdviceDraft {
  const parsed = sizeAdviceAnswer.safeParse(firstJsonObject(text));
  if (!parsed.success || !parsed.data.body.trim()) throw new AdapterError('the model did not answer with a size explanation');
  return { body: cutTo(parsed.data.body, input.max.body), practice: false, ...(usage ? { usage } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// S15 · PR 329 — the fraud review agent's own job: one plain paragraph on why a review alert fired, never a decision
// ---------------------------------------------------------------------------------------------------------------------

const FRAUD_RULE =
  'Write only from the reasons, matches and history given. Never invent a reason, a signal, an order or a number that is not listed. Never propose, recommend or hint at a decision — not to approve, cancel, hold, block, merge or anything else; a person decides that, not you. Only explain, in plain words, why this order was raised for a person to review.';

export function fraudReviewPrompt(input: AiFraudReviewInput): Prompt {
  const f = input.facts;
  const sections = [
    f.severity ? `severity: ${f.severity}` : null,
    f.why.length ? `why it was raised:\n${f.why.map((w) => `- ${w}`).join('\n')}` : null,
    f.matches.length ? `orders it matched:\n${f.matches.map((w) => `- ${w}`).join('\n')}` : null,
    f.history.length ? `this customer's history:\n${f.history.map((w) => `- ${w}`).join('\n')}` : null,
  ]
    .filter((s): s is string => Boolean(s))
    .join('\n\n');
  const lang = input.locale === 'bn' ? 'Bengali (বাংলা)' : 'English';
  const kind = f.kind === 'risk' ? 'risk review' : 'possible-duplicate review';
  return {
    system: `${SYSTEM_RULE} ${FRAUD_RULE}`,
    user: `A Bangladeshi menswear shop's order system raised a ${kind} on one order. Write one short, plain paragraph, in ${lang}, explaining why — for a staff member who is about to read the order and decide. Never suggest what they should decide.\n\n${sections}\n\nAt most ${input.max.body} characters.\n\nReply as {"body": "..."}.`,
    maxTokens: 400,
  };
}

const fraudReviewAnswer = z.object({ body: z.string() });

export function parseFraudReviewJson(text: string, input: AiFraudReviewInput, usage?: { inputTokens: number; outputTokens: number }): AiFraudReviewDraft {
  const parsed = fraudReviewAnswer.safeParse(firstJsonObject(text));
  if (!parsed.success || !parsed.data.body.trim()) throw new AdapterError('the model did not answer with a review explanation');
  return { body: cutTo(parsed.data.body, input.max.body), practice: false, ...(usage ? { usage } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// S15 · PR 330 — the growth marketing agent's own job: one plain paragraph explaining an approval-queue item, never a
// decision
// ---------------------------------------------------------------------------------------------------------------------

const APPROVAL_EXPLAIN_RULE =
  'Write only from the title and reasons given. Never invent a reason, a figure, a campaign, a product or a district that is not listed. Never propose, recommend or hint at a decision — not to approve, reject, pause a campaign, raise or lower a budget, or anything else; a person decides that, not you. Only explain, in plain words, why the system is asking.';

export function approvalExplainPrompt(input: AiApprovalExplainInput): Prompt {
  const f = input.facts;
  const sections = [`title: ${f.title}`, f.why.length ? `why:\n${f.why.map((w) => `- ${w}`).join('\n')}` : null].filter((s): s is string => Boolean(s)).join('\n\n');
  const lang = input.locale === 'bn' ? 'Bengali (বাংলা)' : 'English';
  return {
    system: `${SYSTEM_RULE} ${APPROVAL_EXPLAIN_RULE}`,
    user: `A Bangladeshi menswear shop's admin system is asking its owner to decide one item in its approval queue. Write one short, plain paragraph, in ${lang}, explaining why the system is asking — for the owner about to decide. Never suggest what they should decide.\n\n${sections}\n\nAt most ${input.max.body} characters.\n\nReply as {"body": "..."}.`,
    maxTokens: 250,
  };
}

const approvalExplainAnswer = z.object({ body: z.string() });

export function parseApprovalExplainJson(text: string, input: AiApprovalExplainInput, usage?: { inputTokens: number; outputTokens: number }): AiApprovalExplainDraft {
  const parsed = approvalExplainAnswer.safeParse(firstJsonObject(text));
  if (!parsed.success || !parsed.data.body.trim()) throw new AdapterError('the model did not answer with an approval explanation');
  return { body: cutTo(parsed.data.body, input.max.body), practice: false, ...(usage ? { usage } : {}) };
}
