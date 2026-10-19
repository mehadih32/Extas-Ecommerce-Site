# Round 14 — the owner's points after Version 9

Reference devices he actually tested on: **440×956 (iPhone 16 Pro)**, **iPhone 15 Pro**,
**iPhone 15 Pro Max**, **375×667**. Version 9 was only ever proved at 440×956 — that is the gap.

## HOME — 2 points

| # | What |
|---|---|
| **14.1** | **"Shop sets" still has no background.** "Shop now" got one. Can "Shop sets" have one too? **Show him 2–4 background options as images first**, then he picks. |
| **14.2** | 🔴 **The language switch does not switch.** Clicking বাংলা turns the categories Bengali, but the switch itself stays as it was — it never shows that Bengali is now active. |

Everything else on home: checked by him, nothing catches the eye, fine.

## CATEGORY — 2 points

| # | What |
|---|---|
| **14.3** | **The lower filter row was never asked for.** "Set price / Under / Over / Regular fit / Slim fit" — he did not ask for those three price buttons, and there is already Filter + Recommended + On sale at the top. **Make the whole row optional from the backend:** one tick shows it, no tick shows nothing. When he ticks it, ask him **which** of them he wants. Fully dynamic — he can add a button, edit one, remove one. |
| **14.4** | **Filter / Recommended / On sale at the top must be customisable the same way.** |

## PRODUCT PAGE — 11 points. He is unhappy with this page.

> *"I became quite disappointed with the product page after testing a few screens."*

| # | What |
|---|---|
| **14.5** | **Question for Claude: was a "Find my size" entry removed from lower down the page?** There used to be one further down, inside an article or similar. Did it go? Answer him. |
| **14.6** | **The selected size letter is not bold.** Pick M or L and the letter must come out **bold** — it should be obvious which size was chosen. |
| **14.7** | **The dash is the same colour as the background.** When a size is selected the dash must take a **highlight colour** too, not blend in. |
| **14.8** | **The measurement line must rise 2–3 px more.** What was done is not enough. **On iPhone 15 Pro it cannot be seen at all**; on 15 Pro Max it can. |
| **14.9** | **The measurement line must carry every field the size chart has** — chest, length, shoulder, **sleeve**. Sleeve is missing and there is width to spare. |
| **14.10** | 🔴 **iPhone 15 Pro: the product page breaks.** "All 5 colours" falls to a second line and gets covered. |
| **14.11** | 🔴 **"All N colours" must auto-adjust and stay on the colour line.** As the colour count grows its type shrinks and it holds its place on the right of that line. **Design it against 6 colours first — that is the hardest case** — then 5 sits slightly larger, 4 larger still at standard size. Only if it genuinely cannot fit does it become a small "5 colours" icon that opens the same thing. Happens at 440×956 too, with 5 or 6 colours. |
| **14.12** | 🔴 **375×667: "Choose your size" breaks.** The Size Chart button does not shrink, so the size label is pushed to the line below. **The Size Chart button must shrink itself** and the size must stay on the same line. His diagnosis: *"you have fixed that button's size in the backend — fixed means something else breaks."* |
| **14.13** | **The ৳ amount / bar / free home delivery line has no spacing.** It should read: amount · **space** · `|` · **space** · free home delivery. The bar is glued to the amount; on some products there is a space after the bar and not before. Inconsistent across products. |
| **14.14** | **Six questions is too many — he asked for two or three.** Keep all six, **show three**, and put a button that opens the rest. The extra ones appear as **questions only**; tapping the `+` on one reveals that answer. |
| **14.15** | **Test on every one of these: 440×956, iPhone 15 Pro, iPhone 15 Pro Max, 375×667.** Open `essential-pique-polo` on iPhone 15 Pro and fix what is seen there. |

## THE STANDING PRINCIPLE — he repeated it three times and asked how else to say it

> **AUTO ADJUST.** Nothing is fixed. Whatever the screen, everything adjusts itself and settles into
> place; the main focus stays correct. **Alignment must never break.** If something truly cannot fit by
> adjusting, **it hides** — it never falls to another line and it never covers anything.
>
> *"This applies not only to this one item, but to everything."*
> *"How else can I explain it so you understand? I really don't know."*

**This is now a build rule for every page and every element, not a fix for one line.**
