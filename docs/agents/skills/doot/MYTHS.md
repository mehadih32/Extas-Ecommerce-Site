# Doot · Doesn't work / myths (SEO, content, social, CRM)

*Myth → evidence → what Doot does instead. As of October 2026.*

| # | Myth | Evidence | Do instead |
|---|---|---|---|
| 1 | "FAQ schema will get us FAQ snippets in Google." | Since Aug 2023 FAQ rich results only for well-known authoritative government/health sites (Google post, reported by Search Engine Roundtable). Ahrefs' 2022 category guide still recommends FAQ markup — outdated. **The EXTAS blueprint C4.2 says FAQ "is what Google shows" — correct this.** | Keep FAQ content for users/AI; don't promise a snippet. |
| 2 | "We need llms.txt / special AI schema to appear in AI answers." | Google: no additional requirements and no special AI text files or schema needed for AI Overviews/AI Mode. | Normal SEO; keep the file as a harmless low-priority extra for other assistants. |
| 3 | "Google can't index JavaScript sites at all." | Google renders JS (crawl → render → index) but recommends SSR/pre-rendering; fragment (#) URLs are the real killer. | SSR/SSG with real URLs (D01). |
| 4 | "Request indexing every day makes us rank faster." | Unpublished quota; indexing ≠ ranking; sitemaps with accurate lastmod for scale. | Request a few key URLs; fix internal links and quality. |
| 5 | "priority/changefreq in the sitemap matter." | Google ignores both; lastmod only if accurate. | Accurate lastmod only. |
| 6 | "Long SEO text at the bottom of category pages ranks." | Mueller (quoted by Ahrefs): "maybe 90%, 95% of that text is unnecessary"; two practitioner sources recommend 30–100-word intros. | Short intro + useful FAQ/guide. |
| 7 | "Canonicalise page 2, 3… to page 1." | Google: don't; each paginated page self-canonical. | Self-canonical + sequential links. |
| 8 | "noindex page 2+ of categories." | Practitioner advice (SEJ) conflicts with Google's pagination doc, which doesn't ask for it. | Follow Google. |
| 9 | "Block facets with robots.txt AND noindex them." | If Google can't crawl, it can't see noindex. | Pick one per URL pattern (D04 §4). |
| 10 | "City pages for every district help local SEO." | Doorway abuse in Google's spam policy. | One honest delivery/coverage page. |
| 11 | "We can list a Google Business Profile at our office / courier hub." | GBP requires in-person customer contact; online-only businesses aren't eligible. | GBP only with a real customer-facing location. |
| 12 | "Gift a product to a blogger in return for a dofollow link." | Named as link spam unless the link is rel="sponsored"/nofollow. | Gift with disclosure + rel="sponsored"; value = audience. |
| 13 | "AI content is penalised." / "AI content is fine at any volume." | Both wrong: Google judges quality and purpose; scaled low-value generation is spam. | AI drafts + human facts + first-hand evidence; quality gate. |
| 14 | "Core Web Vitals are a big ranking factor." | Google: Search shows the most relevant content even if page experience is sub-par. | Speed for conversion first; still meet thresholds. |
| 15 | "Instagram: sends are weighted 3–5× likes / reposts get you banned after 10." | No primary source found; only "sends per reach is one of the most important signals" is attributable to Mosseri. | Design for sends/saves/watch time; don't quote made-up multipliers. |
| 16 | "WhatsApp is free so we can message everyone." | Per-message pricing since July 2025; opt-in required; blocks lower quality and pause templates. | Opt-in, utility-first, frequency caps (D09). |
| 17 | "Masking SMS is fine for promotions because it looks professional." | Promotions belong on non-masking routes with NDNC filtering; misclassification is monitored (Telerivet, Jan 2026). | Masking only for transactional. |
| 18 | "Title tag must contain every keyword variant." | Keyword stuffing is a named spam behaviour; long titles get rewritten more often (Ahrefs data). | One main phrase, readable, ≤ ~60 chars where possible. |
| 19 | "Product descriptions need at least 150 words for SEO." | One 2019 South-Asian vendor post, no source; Google has no word-count rule (D10 §4). | Write what helps the buyer choose. |
| 20 | "South-Asian YouTube SEO courses teach something Google's docs don't." | The e-commerce SEO syllabi found (Hindi playlists) match D02/D04 topics; no new verifiable rule found (D10). | Use them as staff study lists; Google's docs stay the authority. |

Sources: see D01–D10 source lists (Google Search Central pages, Search Engine Roundtable, Ahrefs, Go Fish Digital, SEJ, Meta/WhatsApp developer docs, 360dialog, Telerivet, Influencer Marketing Hub, Dataslayer).
