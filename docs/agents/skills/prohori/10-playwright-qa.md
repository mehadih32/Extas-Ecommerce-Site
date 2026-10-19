# R10 · QA automation with Playwright — device matrix, history and scroll tests, flaky-test control

*Prohori প্রহরী · A360-02 · module 10 of 11 · level: Post-graduate · version 1.0 · as of October 2026*

Existing assets: `qa/device-matrix.js` (15 phone sizes 320×640 → 440×956), `qa/devices.json`, `qa/ECOMMERCE-CHECKLIST.md`.

---

## 1. What Playwright emulation is — and isn't

- Emulation sets **user agent, screen size, viewport, `deviceScaleFactor`, `isMobile` (respects meta viewport + touch events), `hasTouch`**, locale/timezone, colour scheme/media, geolocation, offline; device profiles come from `playwright.devices` (e.g. "iPhone 13") **[OFFICIAL — Playwright docs]**.
- It **simulates a browser on a device**; it is not the device **[OFFICIAL framing]**.
- WebKit in Playwright is **desktop WebKit, not iPhone Safari**: mobile Safari's scrolling and fixed-positioning quirks, real multi-touch, toolbars and gestures aren't reproduced; a vendor reports a grid that rendered 2 columns in emulation and 1 on a real iPhone **[COMMUNITY — TestDino blog]**.
- **So [HOUSE]:** Playwright gates layout, logic and regressions on every build; **a real-iPhone pass (Shilpi U08 §6 script)** is required before calling any iOS-specific bug fixed — the profile's "WebKit/iPhone-faithful gesture testing" skill is still *learning*, and this is why.

## 2. The device matrix [HOUSE]

```js
// playwright.config.ts (sketch)
projects: [
  ...require('./qa/devices.json').map(d => ({ name: `phone-${d.w}x${d.h}`,
     use: { browserName: 'chromium', viewport: { width: d.w, height: d.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } })),
  { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },         // WebKit engine smoke
  { name: 'tablet-portrait', use: { ...devices['iPad Mini'] } },         // add sizes from the registry, record source
  { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
]
```
- Layout gate (owner's rules) runs on all 15 phone sizes; journeys run on 3 representative phones + WebKit + desktop to keep time down.
- Each run also with `reducedMotion: 'reduce'` on one phone project (Shilpi U06).

## 3. Journeys every build [HOUSE]
1. Home → category → PDP → choose colour/size → Add to bag → bag → checkout → COD order (sandbox) — in **each delivery band** (DHAKA_CITY, SUB_AREA, REST_OF_BD).
2. Combo builder → bag; never leaves to a single PDP.
3. Search with Banglish terms → results.
4. Account: OTP login (test number), orders list, invoice download (ownership check — R06 example).
5. Payment sandbox: success, cancel, fail, **tampered amount** (R07 tests).
6. Admin: login, change stock, see it on PDP.

## 4. History and scroll tests (owner lessons R15 7.1, 12.2) [HOUSE]

```ts
test('back returns to same page and scroll', async ({ page }) => {
  await page.goto('/men/polo-shirts');
  await page.mouse.wheel(0, 2400);
  const y = await page.evaluate(() => scrollY);
  await page.getByRole('link', { name: /pique polo/i }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/men\/polo-shirts/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y - 40); // within 40 px
  await expect(page.locator('main')).not.toBeEmpty();                          // never blank
});
```
Also: sheet open → `goBack()` closes the sheet and stays on the PDP; deep link to PDP → back leaves the site (no fake Home); bag count fresh after back (`pageshow` persisted path — Shilpi U08).

## 5. Flaky-test control

- Retries are **off by default**; with retries a test that fails then passes is reported **"flaky"**, distinct from passed/failed; after a failure Playwright **discards the worker and browser** and starts fresh; `testInfo.retry` tells a test it's a retry; `test.describe.configure({ retries })` per group; **serial mode re-runs the whole group** — isolated tests are preferred **[OFFICIAL — Playwright docs]**.
- **EXTAS rules [HOUSE]:**
  1. CI `retries: 2`, but **flaky ≠ pass**: any flaky test is listed in the report and opens a ticket; > 3 flakes in a week → quarantine tag + fix within 7 days, or delete if worthless.
  2. No `waitForTimeout` sleeps; use web-first assertions (`expect(locator).toBeVisible()`) and role/text locators.
  3. Each test creates its own data (fresh cart, test customer); no order between tests.
  4. Trace + video **on first retry** only (keeps artefacts small, gives evidence for every flake).
  5. Network to third parties (Pixel, GTM, WhatsApp widget) stubbed in CI so their slowness can't fail our tests.
  6. A test that fails on WebKit only is **not** dismissed — it goes to the real-iPhone check.

## 6. Accessibility in the same run
- `@axe-core/playwright`: `new AxeBuilder({ page }).analyze()` → assert `violations` is empty; `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` limits to WCAG A/AA rules; `include()` scopes (open the sheet first, or axe misses it); `exclude()`/`disableRules()` sparingly; snapshot a **fingerprint** (rule id + targets) for known issues instead of full results **[OFFICIAL — Playwright docs]**.
- Playwright's own warning: **automated tests catch only some WCAG violations** — combine with manual checks **[OFFICIAL]**. Add `wcag22aa` tags if the installed axe version supports them **[HOUSE — check version]**.
- Run on home, category, PDP (with size chart open), bag, checkout; contrast results feed Shilpi's token records (U04/U05).

## 7. Report (goes to Telegram and the audit page)
`✅ 212 passed · ⚠️ 3 flaky · ❌ 1 failed (iphone-webkit: checkout bottom bar covers Continue)` + links to traces + the device-gate summary (0/240 or failures with screenshots).

---

**Sources** (type in brackets):
- [Official — Playwright docs] Emulation: https://playwright.dev/docs/emulation
- [Official — Playwright docs] Test retries: https://playwright.dev/docs/test-retries
- [Official — Playwright docs] Accessibility testing: https://playwright.dev/docs/accessibility-testing
- [Vendor blog] TestDino, Playwright mobile testing — real devices vs emulators: https://www.testdino.com/blog/playwright-mobile-testing
- [Internal] qa/device-matrix.js, qa/devices.json, lessons/ALL.md, master register PR 550 (bands)

*As of October 2026.*
