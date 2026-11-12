// S15 · PR 306 (C1.5) — turns any provider's plain-text completion into the three `AiWriter` drafts (draftSeo,
// draftCampaign, draftArticle): one prompt-and-parse per draft kind (prompts.ts), shared by every live provider so
// Anthropic, OpenAI, Google and OpenRouter write to exactly the same shape, the same limits and the same "only the
// facts given" rule. A provider only has to answer `complete({system, user, maxTokens}) -> {text}` (anthropic.ts,
// openai-compatible.ts, google.ts); everything about what to ask and how to read the answer lives here once.
import type { TestResult } from '../define';
import { approvalExplainPrompt, articlePrompt, campaignPrompt, competitorStepPrompt, fraudReviewPrompt, guideQaPrompt, parseApprovalExplainJson, parseArticleJson, parseCampaignJson, parseCompetitorStepJson, parseFraudReviewJson, parseGuideQaJson, parseProductDescriptionJson, parseSeoJson, parseSizeAdviceJson, parseSocialReelCaptionJson, parseStockAlertJson, parseStudioDetailJson, parseSupportReplyJson, productDescriptionPrompt, seoPrompt, sizeAdvicePrompt, socialReelCaptionPrompt, stockAlertPrompt, studioDetailPrompt, supportReplyPrompt } from './prompts';
import type { AiApprovalExplainDraft, AiApprovalExplainInput, AiArticleDraft, AiArticleInput, AiCampaignDraft, AiCampaignInput, AiCompetitorStepDraft, AiCompetitorStepInput, AiFraudReviewDraft, AiFraudReviewInput, AiGuideQaDraft, AiGuideQaInput, AiProductDescriptionDraft, AiProductDescriptionInput, AiSeoDraft, AiSeoInput, AiSizeAdviceDraft, AiSizeAdviceInput, AiSocialCaptionDraft, AiSocialCaptionInput, AiStockAlertDraft, AiStockAlertInput, AiStudioDetailDraft, AiStudioDetailInput, AiSupportReplyDraft, AiSupportReplyInput, AiWriter } from './shared';

export interface CompleteInput {
  system: string;
  user: string;
  maxTokens: number;
}

export interface CompleteResult {
  text: string;
  /** PR 325 — the provider's own real token counts, when its answer carried them (every live provider reports
   * these today; absent only for a provider that someday does not). Never guessed when missing. */
  usage?: { inputTokens: number; outputTokens: number };
}

/** What every live provider gives: one plain-text completion. The rest — prompts, JSON, limits — is shared here. */
export type Completer = (input: CompleteInput) => Promise<CompleteResult>;

/** Builds a real `AiWriter` from any provider's `Completer` (PR 306). Every draft it returns is `practice: false`. */
export function liveAiWriter(complete: Completer): AiWriter {
  return {
    async draftSeo(input: AiSeoInput): Promise<AiSeoDraft> {
      const { system, user, maxTokens } = seoPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseSeoJson(text, input, usage);
    },
    async draftCampaign(input: AiCampaignInput): Promise<AiCampaignDraft> {
      const { system, user, maxTokens } = campaignPrompt(input);
      const { text } = await complete({ system, user, maxTokens });
      return parseCampaignJson(text, input);
    },
    async draftArticle(input: AiArticleInput): Promise<AiArticleDraft> {
      const { system, user, maxTokens } = articlePrompt(input);
      const { text } = await complete({ system, user, maxTokens });
      return parseArticleJson(text);
    },
    async draftSupportReply(input: AiSupportReplyInput): Promise<AiSupportReplyDraft> {
      const { system, user, maxTokens } = supportReplyPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseSupportReplyJson(text, input, usage);
    },
    async draftProductDescription(input: AiProductDescriptionInput): Promise<AiProductDescriptionDraft> {
      const { system, user, maxTokens } = productDescriptionPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseProductDescriptionJson(text, input, usage);
    },
    async draftSizeAdvice(input: AiSizeAdviceInput): Promise<AiSizeAdviceDraft> {
      const { system, user, maxTokens } = sizeAdvicePrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseSizeAdviceJson(text, input, usage);
    },
    async draftFraudReviewNote(input: AiFraudReviewInput): Promise<AiFraudReviewDraft> {
      const { system, user, maxTokens } = fraudReviewPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseFraudReviewJson(text, input, usage);
    },
    async draftApprovalExplainNote(input: AiApprovalExplainInput): Promise<AiApprovalExplainDraft> {
      const { system, user, maxTokens } = approvalExplainPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseApprovalExplainJson(text, input, usage);
    },
    async draftSocialReelCaption(input: AiSocialCaptionInput): Promise<AiSocialCaptionDraft> {
      const { system, user, maxTokens } = socialReelCaptionPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseSocialReelCaptionJson(text, input, usage);
    },
    async draftStudioDetailNote(input: AiStudioDetailInput): Promise<AiStudioDetailDraft> {
      const { system, user, maxTokens } = studioDetailPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseStudioDetailJson(text, input, usage);
    },
    async draftStockAlertNote(input: AiStockAlertInput): Promise<AiStockAlertDraft> {
      const { system, user, maxTokens } = stockAlertPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseStockAlertJson(text, input, usage);
    },
    async draftGuideQaAnswer(input: AiGuideQaInput): Promise<AiGuideQaDraft> {
      const { system, user, maxTokens } = guideQaPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseGuideQaJson(text, input, usage);
    },
    async draftCompetitorStep(input: AiCompetitorStepInput): Promise<AiCompetitorStepDraft> {
      const { system, user, maxTokens } = competitorStepPrompt(input);
      const { text, usage } = await complete({ system, user, maxTokens });
      return parseCompetitorStepJson(text, input, usage);
    },
  };
}

/** The Test button's one cheap round trip, shared by every live provider: a real SEO draft from one sample fact. */
export async function testLiveAiWriter(api: AiWriter): Promise<TestResult> {
  try {
    const d = await api.draftSeo({ subject: 'product', locale: 'en', facts: { name: 'Sample Pique Polo' }, max: { title: 60, description: 155 } });
    return { ok: Boolean(d.title.trim()), message: d.title.trim() ? 'the model answered' : 'the model answered with no title' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
