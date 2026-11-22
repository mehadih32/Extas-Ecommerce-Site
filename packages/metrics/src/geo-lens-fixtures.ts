// S29 · PR 758–760 — a small made-up place tree for the lens tests (no database): two divisions, a Bogura district with two
// upazilas, a Dhaka district with a Dhaka City thana and area and one upazila outside the city. Made-up ids only.
import type { LensPlace } from './geo-lens-base';

const p = (id: string, level: string, nameEn: string, parent: LensPlace | null, extra: Partial<LensPlace> = {}): LensPlace => ({
  id,
  level,
  parentId: parent?.id ?? null,
  ancestorIds: parent ? [...parent.ancestorIds, parent.id] : [],
  nameEn,
  nameBn: null,
  cityCorporation: null,
  ...extra,
});

export const RAJ = p('div-raj', 'DIVISION', 'Rajshahi', null);
export const BOGURA = p('dist-bogura', 'DISTRICT', 'Bogura', RAJ);
export const GABTALI = p('upz-gabtali', 'UPAZILA', 'Gabtali', BOGURA);
export const SHERPUR = p('upz-sherpur', 'UPAZILA', 'Sherpur', BOGURA);
export const DHK = p('div-dhk', 'DIVISION', 'Dhaka', null);
export const DHAKA = p('dist-dhaka', 'DISTRICT', 'Dhaka', DHK);
export const UTTARA = p('thn-uttara', 'THANA', 'Uttara', DHAKA, { cityCorporation: 'DNCC' });
export const SECTOR7 = p('area-sector7', 'AREA', 'Sector 7', UTTARA);
export const SAVAR = p('upz-savar', 'UPAZILA', 'Savar', DHAKA);

export const PLACES: ReadonlyMap<string, LensPlace> = new Map([RAJ, BOGURA, GABTALI, SHERPUR, DHK, DHAKA, UTTARA, SECTOR7, SAVAR].map((x) => [x.id, x]));
