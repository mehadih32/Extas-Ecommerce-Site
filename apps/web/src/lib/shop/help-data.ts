// PR 75 — what the help pages read, on the server: the settings, the store's details and the live Smart Rules' texts
// (lib/rules-public: without a database, or when it is slow, a rule simply says nothing and its page may say
// "Coming soon"). Every page is worked out, so the help centre lists only the pages that have something to say.
import type { HelpSlug, PagesHelpSettings } from '@extas/settings';
import { placeTexts, policyFiller, ruleText } from '../rules-public';
import { readPageSettings, type ShopContext } from './context';
import { fillPagesText, HELP_SLUGS, helpModel, type HelpFacts, type HelpModel, type RuleWords } from './help-pages';

export interface HelpData {
  set: PagesHelpSettings;
  models: Record<HelpSlug, HelpModel>;
  facts: HelpFacts;
  /** PR 75 follow-up — the contact page's "Send us a message" form (`pages.contactForm`, off as shipped). */
  form: { on: boolean; maxChars: number };
}

export async function loadHelp(c: ShopContext): Promise<HelpData> {
  const s = await readPageSettings(['pages.help', 'pages.text', 'contact.address', 'legal.registeredName', 'pages.contactForm'] as const, c.storeId);
  const set = s['pages.help'];
  const pick = (l: { en: string; bn: string } | null | undefined) => (l ? (c.lang === 'bn' ? l.bn : l.en) || l.en : null);
  const facts: HelpFacts = {
    whatsapp: c.s['contact.whatsapp'],
    phone: c.s['contact.phone'],
    email: c.s['contact.email'],
    address: pick(s['contact.address']),
    hours: pick(c.s['contact.hours']),
    registeredName: s['legal.registeredName'],
    tradeLicence: c.s['legal.tradeLicence'],
    dbid: c.s['legal.dbid'],
    waText: c.t('footer.waMessage', c.vars),
  };
  const words = async (key: string): Promise<RuleWords> => {
    const [short, full] = await Promise.all([
      ruleText({ storeId: c.storeId, key, slot: 'short', locale: c.lang }),
      ruleText({ storeId: c.storeId, key, slot: 'full', locale: c.lang }),
    ]);
    return { key, short, full };
  };
  const placed = placeTexts({ storeId: c.storeId, placement: 'faq', locale: c.lang }).then((l) => l.map((r) => ({ key: r.key, short: r.texts.short ?? null, full: r.texts.full ?? null })));
  const rules = await Promise.all(
    HELP_SLUGS.map(async (slug) => {
      const listed = await Promise.all(set.pages[slug].rules.map(words));
      if (slug !== 'faq') return listed;
      const onFaq = await placed;
      return [...onFaq, ...listed.filter((r) => !onFaq.some((x) => x.key === r.key))];
    }),
  );
  // PR 384: the owner's `{rule-key.param}` tokens read the live rules; a line that cannot be filled is left out
  const text = fillPagesText(s['pages.text'], await policyFiller({ storeId: c.storeId, locale: c.lang }));
  const models = Object.fromEntries(HELP_SLUGS.map((slug, i) => [slug, helpModel({ slug, set, text, lang: c.lang, t: c.t, rules: rules[i]!, facts })])) as Record<HelpSlug, HelpModel>;
  const form = { on: s['pages.contactForm'].enabled, maxChars: s['pages.contactForm'].maxChars };
  // PR 75 follow-up: the form is something true to say, so a shown contact page with it is never "Coming soon"
  if (form.on && set.pages.contact.on && models.contact.soon) models.contact = { ...models.contact, soon: false };
  return { set, models, facts, form };
}
