# Tirondaj · Learning loop — what to do when stuck or when the platforms change

*PR 579 + PR 585 · how a new ads tip becomes a skill · as of October 2026*

```
STUCK / NEW QUESTION / PLATFORM CHANGE
        │
        ▼
1. Define the question in one line + the metric it affects (dCPA, delivered rate, spend pace)
        │
        ▼
2. Search the source types in this order (in parallel where possible)
   a. Official: Meta for Developers + Meta Business Help, Google Ads Help + Merchant Center Help,
      TikTok Business Help Center, platform changelogs / API version notes
   b. Industry news: PPC Land, Search Engine Land, Search Engine Journal
   c. Practitioner blogs: Jon Loomer (Meta), Common Thread Collective, Smart Marketer, Demand Curve,
      agency test write-ups (e.g. Seer Interactive)
   d. Community: r/PPC, r/FacebookAds, r/googleads, r/ecommerce, r/shopify (read via search results
      or public mirrors); LinkedIn/Facebook posts from named specialists if public
   e. Video: YouTube tutorials (transcript/description), incl. South-Asian COD-market channels
   f. Local: Bangladeshi news (Daily Star, TBS, Prothom Alo, Financial Express) for payments, VAT, seasons
        │
        ▼
3. Cross-check (quality gate, PR 585)
   RULE        = official docs say it, OR two independent good sources agree
   COMMUNITY   = anything else → tag "community tip — test before use"
   REJECT      = vendor stats with no source, single anecdote with no numbers, contradicts official docs
        │
        ▼
4. Test small
   - Sandbox simulator first (PR 322); then a live test inside existing guardrails:
     test-lab budget, max 2 × CPA cap per arm, pre-registered metric and stop date
   - No increase of total spend for a test without owner approval
        │
        ▼
5. Write the skill (proposed version)
   - Rule text + when to use + EXTAS example
   - Source URLs (with type), date read, confidence tag [OFFICIAL] [2-SRC] [HOUSE] [COMMUNITY]
   - Test result (numbers, dates, campaign IDs)
        │
        ▼
6. Approval + log
   - Proposal to the owner/lead (PR 420 gate); approved → new version, old kept for rollback (PR 321)
   - Work-log line: date · question · sources · test · result · skill version
   - If a test contradicts a rule → flag the rule, open a lesson, re-run quarterly exam item
```

## Triggers that force a loop run
- A platform renames/retires a feature (e.g. ASC → Advantage+ Sales, VAC → Demand Gen, attribution redefinitions).
- dCPA above cap for 7 days with no obvious cause.
- An owner correction (becomes a lesson within 24 h).
- Quarterly re-exam: every rule older than 6 months is re-checked against current docs.

## Search query patterns that work
- `"<feature name>" site:developers.facebook.com` · `"<feature>" support.google.com google-ads` · `<topic> ads.tiktok.com help`
- `site:reddit.com r/FacebookAds <topic> 2026` (if reddit pages are blocked, use search-result mirrors and note it)
- `ppc.land <feature>` for dated change notes.

## Honest limits
- Some official pages (Meta Business Help, Meta Ads Guide) and many YouTube pages cannot be fetched by our tools; record "not verified" rather than guessing.
- Platform UI names change monthly — always confirm in the live account before writing a step-by-step.
