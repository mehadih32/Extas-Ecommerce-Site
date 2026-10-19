# U03 · Typography for Bengali + Latin (Hind Siliguri, Noto Sans Bengali, Archivo)

*Shilpi শিল্পী · A360-05 · ux module 3 of 10 · level: Post-graduate · version 1.0 · as of October 2026*

---

## 1. Facts about the fonts

| Font | Facts | Tag |
|---|---|---|
| **Hind Siliguri** | Indian Type Foundry, designer Jyotish Sonowal, 2015; **SIL OFL 1.1**; Bengali + Latin in one family; **5 static weights 300/400/500/600/700**, normal style only (no italic); built for UI (humanist, near-monolinear, open apertures); subsets on Fontsource: bengali, latin, latin-ext | [OFFICIAL — Fontsource/Google Fonts listing] |
| **Noto Sans Bengali** | listed as a **variable** font with 9 weights on Fontsource | [OFFICIAL — Fontsource] |
| **Archivo** | the prototype's current Latin display/body font (proto CSS) | [HOUSE — measured in proto-backup] |

Unknowns: exact file sizes per subset and the Bengali `unicode-range` were **not shown** on the pages read — measure our own built files before setting budgets.

## 2. What the W3C says about Bengali text (and what it doesn't)

- Sentence end is the **danda । (U+0964)**; it **must never wrap alone** to a new line; double danda uses its own character ॥ **[OFFICIAL — W3C Bengali Layout Requirements]**.
- Bengali has **native digits ০–৯**; conjuncts are **one unit** for editing and selection **[OFFICIAL — W3C beng-lreq]**.
- **Underlines are not traditional** in Bengali; browsers break or move underlines where vowel signs hang above/below **[OFFICIAL — W3C beng-lreq + gap analysis #90]**.
- **`letter-spacing` breaks half-form conjuncts in all three engines (Gecko, Blink, WebKit) and cannot be worked around** **[OFFICIAL — W3C Bengali gap analysis #117]**.
- Bengali counter styles for lists are supported in all engines (gap #93 fixed) **[OFFICIAL]**.
- The W3C documents **do not give a line-height number** for Bengali (section is empty). Any number below is house practice, to be checked on screenshots.

## 3. EXTAS type rules

1. **Font stacks [HOUSE]:**
   - Bengali UI text: `"Hind Siliguri", "Noto Sans Bengali", system-ui, sans-serif`
   - Latin UI text: `"Archivo", system-ui, sans-serif` — or Hind Siliguri's Latin if the owner wants one family (decision in README).
   - Set `lang="bn"` on Bengali blocks and `lang="en"` on English so the browser picks the right shaping and fallback.
2. **Never `letter-spacing` on Bengali** (not even on buttons or "ALL CAPS" styles) **[OFFICIAL basis — gap #117]**. Tracking styles must be scoped to `:lang(en)`.
3. **No underline as the only link cue in Bengali** — use colour + weight, or `text-underline-offset` large enough to clear descenders, checked on screenshots **[HOUSE, from W3C #90]**.
4. **No fake italics in Bengali** (Hind Siliguri has no italic; browsers would slant it). Emphasis = weight 600 **[HOUSE, from font facts]**.
5. **Line height [HOUSE — test before locking]:** Bengali body ≥ 1.5, Bengali headings ≥ 1.3; mixed EN/বাংলা lines use the Bengali value so vowel signs above/below are not clipped. Clipping check: any `overflow: hidden` one-line label must show full ি ী ু ূ ৃ marks at all gate sizes.
6. **Bengali at the same px size reads smaller than Latin** in many fonts — on a mixed line, raise Bengali ~1 step or let the toggle switch sizes **[COMMUNITY — test before use]**.
7. **Danda never orphans:** join the last word and । with no break (`&nbsp;` before । or no space) **[OFFICIAL basis]**.
8. **Digits:** prices may show Bengali digits in Bengali mode (৳১,২৫০) but every input accepts both and stores ASCII (U09) **[HOUSE]**.
9. **Inputs ≥ 16 px** or iOS zooms on focus (U08) **[2-SRC]**.
10. **Real text, never text in images** (search, translation, accessibility) **[HOUSE; Doot D03]**.

## 4. Loading without hurting speed

- Self-host WOFF2; split by subset (bengali / latin); preload only the **one** weight used above the fold (e.g. 600 for the price line); `font-display: swap` **[HOUSE — measure LCP before/after]**.
- Ship 3 weights max (400, 600, 700) unless a design needs 500 **[HOUSE]**.
- Bengali subset loads only on pages/toggles that use Bengali text (`unicode-range` does this automatically if the CSS declares it).

## 5. Type scale (tokens, see U05)

| Token | Latin | Bengali | Use |
|---|---|---|---|
| `type.price` | 18/1.2 600 | 19/1.35 600 | price line — one line, AUTO ADJUST |
| `type.title` | 16/1.3 600 | 17/1.4 600 | product title, line one fills |
| `type.body` | 14/1.5 400 | 15/1.6 400 | descriptions |
| `type.input` | 16/1.4 400 | 16/1.5 400 | every form field (≥ 16 px) |
| `type.label` | 12/1.3 500 | 13/1.4 500 | chips, badges — never below 12 px |

(Values are a starting proposal; lock after screenshots on the 15-size gate.)

## 6. Worked example — the Bengali "Add to Bag" button

- Bug: designer applied `letter-spacing: .08em; text-transform: uppercase` to all buttons → "ব্যাগে যোগ করুন" shows broken conjunct ্য.
- Fix: `.btn:lang(en){letter-spacing:.08em;text-transform:uppercase}`; Bengali gets weight 600, no tracking; height stays 48 px; label one line at 320 px (shorten to "ব্যাগে নিন" via AUTO ADJUST step-down if needed — wording change = owner/Sawdagor approval).

---

**Sources** (type in brackets):
- [Official — font listing] Fontsource, Hind Siliguri (about): https://fontsource.org/fonts/hind-siliguri/about
- [Official — font listing] Fontsource, Hind Siliguri (CDN, subsets): https://fontsource.org/fonts/hind-siliguri/cdn
- [Official — font listing] Fontsource, Noto Sans Bengali: https://fontsource.org/fonts/noto-sans-bengali/cdn
- [Official — W3C] Bengali Layout Requirements (2024): https://www.w3.org/TR/2024/DNOTE-beng-lreq-20240709
- [Official — W3C] Bengali Gap Analysis (2024): https://www.w3.org/TR/2024/DNOTE-beng-gap-20240704/
- [Practitioner blog] Rick Strahl, iOS input auto-zoom under 16 px: https://weblog.west-wind.com/posts/2023/Apr/17/Preventing-iOS-Textbox-Auto-Zooming-and-ViewPort-Sizing
- [Internal] proto-backup CSS (Archivo), lessons/ALL.md (one-line rules)

*As of October 2026.*
