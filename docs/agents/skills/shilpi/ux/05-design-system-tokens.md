# U05 · Design systems and design tokens

*Shilpi শিল্পী · A360-05 · ux module 5 of 10 · level: Post-graduate → PhD · version 1.0 · as of October 2026*

---

## 1. The standard (new, stable, use it)

- **Design Tokens Format Module 2025.10** — first **stable** version, published by the W3C Design Tokens Community Group on **28 Oct 2025** **[OFFICIAL — DTCG]**.
- Supports theming/modes (light/dark, brand themes) without duplicate files, modern colour spaces (Display P3, OKLCH, all CSS Color 4 spaces), aliases, multi-file token sets **[OFFICIAL]**.
- Reference implementations: **Style Dictionary, Tokens Studio, Terrazzo**; also supported or in progress in Figma, Penpot, Sketch, Framer, Supernova, zeroheight and others **[OFFICIAL — announcement]**.

### Syntax essentials [OFFICIAL — spec]
- A token = an object with **`$value`**; optional `$type`, `$description`, `$extensions`, `$deprecated`.
- `$type` can be set on a group and is inherited; tools **must not guess** a missing type.
- Names: case-sensitive; may not start with `$` or contain `{`, `}`, `.`.
- Aliases: `"{color.brand.ink}"` (curly braces) resolve to the target's `$value`; JSON-Pointer `$ref` reaches sub-values; circular references are errors.
- Simple types: `color`, `dimension` (px or rem), `fontFamily`, `fontWeight`, `duration` (ms/s), `cubicBezier`, `number`. Composite: `strokeStyle`, `border`, `transition`, `shadow`, `gradient`, `typography`.
- Files: JSON, extension **`.tokens` / `.tokens.json`**, media type `application/design-tokens+json`.

## 2. EXTAS token architecture [HOUSE]

Three tiers — never skip a tier in components:

```
primitive  (raw values)      color.ink.900 = #111 · space.4 = 16px · radius.2 = 8px
   ↓ alias
semantic   (meaning)         color.text.primary = {color.ink.900} · color.action.buy.bg = {color.brand.600}
   ↓ alias
component  (one place)       pdp.buyBar.button.bg = {color.action.buy.bg} · sizeBox.minHit = {size.target.min}
```

Rules:
1. **Nothing hardcoded** in components — only component/semantic tokens (owner standing rule; Prohori's CI hardcode guard PR 494 can lint for raw hex/px in component CSS).
2. **Owner-editable values are semantic tokens** exposed in the admin (Add-to-Bag shade options, promise-strip colour, footer band colour). The admin writes the token file; the build regenerates CSS variables. Each edit = a versioned change with rollback.
3. **Accessibility is enforced at the token layer:** every text/background semantic pair has a recorded contrast ratio; the build fails if a pair drops below U04's table.
4. **Modes:** `light` now; `dark` only if the owner asks — the structure is ready.
5. **Bengali/Latin** typography are separate composite tokens (U03 §5) switched by `:lang()`.
6. **Target sizes, safe-area paddings, bar heights, motion durations** are tokens too (`size.target.min = 44px`, `motion.duration.short = 150ms`, `layout.bar.bottom = 64px`).

### Minimal EXTAS example (`extas.tokens.json`)
```json
{
  "color": {
    "$type": "color",
    "ink":   { "900": { "$value": "#111111" } },
    "brand": { "600": { "$value": "#0B5FFF", "$description": "placeholder — owner sets real brand colour" } },
    "text":  { "primary": { "$value": "{color.ink.900}" } },
    "action":{ "buy": { "bg": { "$value": "{color.brand.600}" } } }
  },
  "size":   { "$type": "dimension", "target": { "min": { "$value": { "value": 44, "unit": "px" } } } },
  "motion": { "$type": "duration",  "short":  { "$value": { "value": 150, "unit": "ms" } } }
}
```
(Colour values are placeholders; dimension/duration object form follows the 2025.10 spec — check against the spec when the build tool is chosen.)

## 3. Component contract (what every EXTAS component documents)

| Field | Example (size box) |
|---|---|
| Purpose | choose one size |
| Anatomy | box, label, strike for OOS, selected ring + tick |
| Tokens used | `sizeBox.*` only |
| States | default, hover (desktop), focus, selected, out-of-stock, disabled |
| AUTO ADJUST steps | full label → short label → hide measurement line |
| A11y | radio group semantics, 44 px hit, not colour-only |
| Gate | 15 sizes, 0 failures |

## 4. Decision tree — new visual need

```
Is there a semantic token that means this?
├─ yes → use it
└─ no  → Is it a one-off for one component?
         ├─ yes → component token aliasing an existing semantic token
         └─ no  → propose a new semantic token (PR + contrast check + owner sees picture if visible change)
```

## 5. Common mistakes
- Naming tokens by look (`blue-button`) instead of meaning (`action.buy.bg`) — the owner changes the colour, the name lies.
- Components reading primitives directly — breaks theming and the admin editor.
- Tokens without contrast records.

---

**Sources** (type in brackets):
- [Official — W3C DTCG] Design Tokens specification reaches first stable version (28 Oct 2025): https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/
- [Official — W3C DTCG] Design Tokens Format Module 2025.10: https://w3c.github.io/cg-reports/design-tokens/CG-FINAL-format-20251028/
- [Internal] master register PR 493/494 (vault, hardcode guard); lessons/ALL.md ("nothing hardcoded")

*As of October 2026.*
