# How to add a design to an admin page

> **বাংলায় এক লাইনে:** একটা কমান্ড (`pnpm admin:design dashboard B`) নতুন ডিজাইনের ফাইল আর রেজিস্ট্রির এক লাইন লিখে দেয়;
> তারপর ফাইলের ভেতরে পাতাটা আঁকুন — সেটিংস › অ্যাডমিনের চেহারা, "…" মেনু আর প্রিভিউ নিজে থেকেই নতুন ডিজাইন দেখায়।

PR 12 (CN-025). The admin look registry is `apps/web/src/components/admin/look/registry.ts`. Each page in it lists its
designs. A design is **one render module plus one registry line**. Nothing else changes:

- Settings → Admin look (`/admin/settings/look`) shows the new card with its picture, Preview and "Make team default".
- The page's "…" menu lists it under "Page design (just for you)".
- `PUT /api/admin/look` accepts its key.
- The page's one data loader reads only the parts the design lists.

## The one command

```sh
pnpm admin:design <page> <KEY> --en "English name" --bn "বাংলা নাম"
# e.g.
pnpm admin:design dashboard B --en "Classic cards" --bn "ক্লাসিক কার্ড"
```

It writes:

1. **`apps/web/src/components/admin/look/<page>/<KEY>.tsx`**: a working start. It has the page's shared header (`DashHead`:
   greeting, date, the date choice, CSV and the "…" menu) and the page's first figures, drawn from the loader's data.
2. **Its line in `registry.ts`**: the import, and `<page><KEY>,` just above the page's `// admin:design <page>` marker.

The command refuses, and writes nothing, when:

- the page already has that key;
- the key is not one capital letter;
- the page is not in the registry;
- the page's route does not draw through the registry yet. Today only the Dashboard does. Orders and Products get this
  with their redesign follow-ups (381, 382).

## Then

1. **Draw the page in the new module.**
   - Read figures from `p.data` only. List the parts you need in `parts` (`DASH_PARTS` in
     `lib/admin-look/dashboard-data.ts`). The loader reads only those parts, and only the ones the person may see.
   - Take words from the admin dictionary through `p.f.t('…')`. Add new words to `apps/web/messages/admin-shell.{en,bn}.json`
     under `dsh.*`. The hardcode guard refuses text between JSX tags.
   - Write numbers, money, percents and days with `p.f` (`n`, `money`, `short`, `pct`, `day`, `ago`).
   - Build with the pieces in `kit.tsx`: `Card`, `Tile`, `Spark`, `LineChart`, `BarsChart`, `Funnel`, `Heat`, `Delta`, `Pill`,
     `Empty`, and `Soon` (a figure whose store is not built yet names the stage that brings it; never a made-up number).
   - Colours are the `--a3-*` tokens in `app/admin/look.css`.
   - Keep the page's contract: the Dashboard keeps `data-testid="dash-kpi-sales"` (delivered orders only) and
     `dash-kpi-ordered` (never called sales).
2. **Give it a picture.** Add a sketch to `thumbs.tsx` (240 × 150, shapes only). An unknown key gets a neutral sketch.
3. **Check it.**
   - Open it with `?design=<KEY>` at 390, 768 and 1366 px, in English and Bengali.
   - Add the address and its controls to `docs/qa/device-gate.json`, and its figures to `docs/qa/smoke.json`.
   - Run `pnpm -s guard`, the typecheck and the tests (`tools/admin-look/new-design.test.mjs` covers the command).
4. **Update the guide.** Add the design to the page's guide in `docs/admin-guide/` and to `admin-look.md`.

## A new page in the registry

Add its block to `LOOK_PAGES`: `id`, `section`, `icon`, `preview` address, `standard` key, `designs: [ … , // admin:design <id>]`.
Then make its route pick the design with `pickDesign()` (`lib/admin-look/pick.ts`) and the person's `lookState()`, as
`app/admin/page.tsx` does. Finally, add the page's start to `STARTS` in `tools/admin-look/new-design.mjs`.
