# Skill — "Walk-out" side-canvas video (owner request, 19 Oct 2026 · PR 596 + S24/S25)

*Owner: Gyani জ্ঞানী (studio S24/S25). Used by the side canvas (PR 596) and the AI motion templates. Load this before generating any walk-out asset.*

## What it is
A model walks forward from deep inside the page towards the viewer, as if stepping out of the website, wearing **our** garments (e.g. EXTAS polo + denim + shoes). Seen in a gentle 3D view. Plays in the left/right desktop gutter, blended into the page background — no frame, no border, no visible picture edge.

## Before generating — reuse first
1. Look in the AI asset library (`ST.aiAssets` in the demo; media library in the real build) for the same template + products + colours. If found, **reuse it** — no token cost.
2. Only generate when nothing matches or the owner asks for a new one. Log cost, size and inputs.

## Inputs
- Garments: product IDs + colours (top, bottom, shoes; optional cap/jacket). Use the shop's own product photos (flat lay / ghost mannequin) as the garment reference; never invent logos or change colours.
- Model: the brand's approved model profile (or faceless/stylised figure if no approved model). **Never** a real person's likeness without written consent; no celebrity look-alikes.
- Page background colour (hex) from the theme token where the zone sits.
- Zone aspect ratio (portrait, typically 1:3 to 1:4) and the 1440 reference size.

## Shot specification
- Camera: fixed, eye level slightly below chest, 35–50 mm equivalent; optional slow orbit ≤ 8° across the clip for depth.
- Motion: natural walk cycle, 3–4 steps from far (≈30% height) to near (≈90% height), stops, small turn (¾), returns to start for a seamless loop.
- Lighting: soft key from the content side (so the model "faces" the products), soft fill, gentle floor shadow only.
- Background: flat, exactly the page background colour; edges feather to transparent/background (≥ 40 px fade). No horizon line, no studio props.
- Wardrobe accuracy: colours, fit, collar, placket, stitching, denim wash and shoe shape must match the product references; garment must not morph between frames.
- Duration 4–6 s, loop point invisible (first and last frame match).

## Output
- MP4 (H.264) + WebM, muted, 24–30 fps, ≤ 1.5 MB, plus a poster PNG/WebP ≤ 150 KB and a transparent-edge version if the pipeline supports alpha.
- Sizes: 1440-reference and a 2× version; the site scales between them.
- Metadata: template "walk-out", product IDs, colours, background hex, duration, size, cost.

## Quality checklist (fail = regenerate, never publish)
- [ ] Garments match references (colour ΔE small, fit, details) in every frame
- [ ] No extra limbs/fingers, no face distortion, no flicker, no garment morphing
- [ ] Background matches the page colour; no visible box edge when placed on the page
- [ ] Loop is seamless; no jump at the loop point
- [ ] Within size budget; poster frame looks good on its own (reduced-motion users see only the poster)
- [ ] No text, watermark or third-party logo added by the model

## Common failures and fixes
- **Garment colour drift** → lock colour with the product reference image per frame; shorten the clip.
- **Background halo/box** → regenerate on exact hex; widen the feather; use the alpha version.
- **Jerky loop** → generate a symmetric walk (out and back) or crossfade the last 6 frames.
- **Too heavy** → lower resolution of the far part, cut to 4 s, raise compression; never exceed the budget.

## Where it shows
Side canvas (PR 596) zones, desktop only, loaded after the main content, paused off-screen, never covering content. Phones and tablets never load it.
