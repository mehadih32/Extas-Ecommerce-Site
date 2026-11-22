# Geography map boundary pack: source, date and licence

S29, PR 750 (CN-054). Read and confirmed on 16 Nov 2026 from the source's own metadata files (kept beside this notice
in `source/`) before any shape entered the repository.

## What is here

| File | What | Shapes |
|---|---|---|
| `division.json` | the 8 divisions | 8 |
| `district.json` | the 64 districts | 64 |
| `upazila.json` | upazilas and thanas outside and inside Dhaka City, keyed by the gazetteer `code` | 507 |
| `dhakaThana.json` | Dhaka City thanas, keyed by the gazetteer thana or city-area `code` | 41 |
| `centroids.json` | the middle of every shape (`code` to `[lat, lng]`); fills `GeoArea.lat/lng` | all of the above |
| `unmatched.json` | shapes that did not match exactly one place, and places no shape claimed (the hand-fixing list) | |
| `hand-fixes.json` | the few spelling or renaming fixes done by hand (never a guess) | |

These are simplified, ready-drawn SVG paths in one shared viewBox. The pack is derived data ("adapted material"): the
boundary lines were simplified (Douglas-Peucker, about 140 m at the upazila level) and projected, small islands were
dropped, and every shape was matched to a gazetteer place. Rebuild: `pnpm --filter @extas/delivery geo:pack <folder>`.

## Source

geoBoundaries (William & Mary geoLab), Global Database of Political Administrative Boundaries, release `gbOpen`,
country BGD, simplified GeoJSON, built 12 Dec 2023.

- Project: https://www.geoboundaries.org/ and https://github.com/wmgeolab/geoBoundaries
- Files used: `releaseData/gbOpen/BGD/ADM1`, `ADM2` and `ADM3`, `geoBoundaries-BGD-ADMn_simplified.geojson`
- SHA-256 of the downloaded files: ADM1 `bb91b74c7a7d8a690122b916f5e2f99606d2ce2f18ff938f49d80f15b4ba6aea`,
  ADM2 `7dbdb186f3b8af10417147a99859196fcd89c619fb5c6ac3804251fb6b449b6a`,
  ADM3 `141dfd271206602793dd0b0af26d4db918be19cff56c1fac46b17dfeb0cbe006`

## Licence (per layer, as the source states it)

| Layer | Original source | Licence |
|---|---|---|
| ADM1 divisions (boundaryID BGD-ADM1-32408957, year 2015) | geoBoundaries, Wikimedia Commons | CC0 1.0 Universal, public domain |
| ADM2 districts (BGD-ADM2-16705992, year 2020) | Bangladesh Bureau of Statistics (BBS), OCHA ROAP | CC BY 3.0 IGO |
| ADM3 upazilas and thanas (BGD-ADM3-5055444, year 2020) | Bangladesh Bureau of Statistics (BBS), OCHA ROAP | CC BY 3.0 IGO |

The geoBoundaries project's own code and derivative works are CC BY 4.0 (`source/geoBoundaries-LICENSE.txt`). The two
BBS / OCHA ROAP layers stay under the licence of their original source, CC BY 3.0 IGO
(https://creativecommons.org/licenses/by/3.0/igo/), source dataset
https://data.humdata.org/dataset/administrative-boundaries-of-bangladesh-as-of-2015. All of these allow use, copying and
adaptation, also commercial, if the credit below is given, the licence is linked and changes are indicated. Nothing in
the files is GADM, OpenStreetMap or any source with a no-commercial or share-alike term. The full legal text of CC BY
3.0 IGO is at the link above (the build machine had no route to that site, so the text is linked, not copied; the
metadata files in `source/` hold what each layer states about itself).

## Credit (shown on the map's footer and written into every pack file as `attribution`)

> Boundaries: geoBoundaries (William & Mary geoLab), built from Bangladesh Bureau of Statistics / OCHA ROAP data
> (districts and upazilas, CC BY 3.0 IGO) and Wikimedia Commons (divisions, CC0). Simplified by Extas.

Changes made: simplified, projected, small islands dropped, shapes keyed to the Extas gazetteer. The credit is not an
endorsement by BBS, OCHA, geoBoundaries or their licensors.

## Known limits (shown on the map, never hidden)

- The shapes are the 2015 to 2020 administrative boundaries. A newer upazila or thana is missing from the map and
  stays in the table.
- Two shapes have no gazetteer place yet and are listed in `unmatched.json` (Chittagong Port, Dakshin Sunamganj).
- A gazetteer place with no shape (most thanas of divisional cities, the Dhaka City areas) is grey or a pin; the table
  always has its figures.
