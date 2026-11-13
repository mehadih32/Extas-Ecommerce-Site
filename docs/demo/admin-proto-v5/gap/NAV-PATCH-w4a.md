# NAV-PATCH-w4a — menu changes lane w4a needs (PR 680-685)

The lane may not edit `sections.ts`, `lumen-nav.ts` or `admin-shell.*.json`. The coordinator applies these.

## PR 682 — Products › FAQs
- New page `/admin/products/faqs` (guide `products/faqs`, help row already in `help-pages.json`).
- Add it to the **Products** section next to Questions, in `sections.ts`:
  `{ href: '/admin/products/faqs', perm: 'catalogue.read', keys: ['productFaqs'] }`
  (page label en "FAQs", bn "FAQ"; the prototype puts it as the "FAQs" tab of Reviews & questions).
- Until then the page opens under the "Questions" place (it passes `productQuestions` to `PageHead` and `SectionTabs`).
  After the patch, change `KEY` in `apps/web/src/app/admin/products/faqs/page.tsx` to `productFaqs`.
- Shell messages: `shell.page.productFaqs` en "FAQs" / bn "FAQ".
