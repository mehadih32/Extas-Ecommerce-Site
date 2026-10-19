# Doot · Learning loop — when stuck or when Google/Meta change something

*PR 579 + PR 585 · as of October 2026*

```
QUESTION / DROP / CHANGE (e.g. pages fall out of the index, a core update, a new Search Console report)
        │
        ▼
1. One-line question + the metric (indexed pages, impressions, clicks, organic orders, sends/reach, opt-out rate)
        │
        ▼
2. Search source types (parallel)
   a. Official: Google Search Central docs + blog + Search Status Dashboard; Search Console help;
      Meta newsroom / Transparency Center; Instagram @creators / Mosseri; WhatsApp developer docs; BTRC notices
   b. Academies: Google Skillshop, Semrush Academy, Ahrefs Academy, HubSpot Academy, Moz Beginner's Guide
   c. Industry news: Search Engine Roundtable, Search Engine Land, Search Engine Journal, PPC Land
   d. Practitioner blogs: Ahrefs, Moz, Semrush, Backlinko, Go Fish Digital, Aleyda Solis-type specialists
   e. Community: r/SEO, r/bigseo, r/TechSEO, r/ecommerce, r/shopify, Shopify Community, Google Search
      Central Help Community; LinkedIn/Facebook posts by named specialists when public
   f. Video: Google Search Central YouTube (office hours), South-Asian SEO/e-commerce channels (via transcripts)
   g. Local: Bangladeshi news and e-CAB for market facts
        │
        ▼
3. Quality gate
   RULE = official doc OR two independent good sources · COMMUNITY = "test before use" · REJECT = unsourced numbers,
   vendor stats without method, contradicts Google docs
        │
        ▼
4. Test small
   - Staging first (Prohori's staging checks); then one page / one template / one category as the test arm,
     a comparable group as control; minimum 4 weeks for SEO changes (28-day Search Console windows)
   - For social: 4 posts per format before judging; for CRM: A/B on ≥ 500 opted-in recipients
        │
        ▼
5. Write the skill (proposed version): rule · when to use · EXTAS example · sources with type · date read ·
   confidence tag · test result
        │
        ▼
6. Approval (PR 420 gate) → library version (old kept for rollback, PR 321) → work-log line
```

## Triggers
- Google core/spam update announced (Search Status Dashboard) → check our Search Console the following 2–3 weeks before changing anything.
- Indexed pages drop > 10% week on week.
- An owner correction → lesson within 24 h.
- Quarterly: re-check every rule older than 6 months against current docs.

## Honest limits
Our tools could not fetch some Google pages directly (permission prompts), YouTube pages, or Reddit itself — such
gaps are written as "not verified", never guessed.
