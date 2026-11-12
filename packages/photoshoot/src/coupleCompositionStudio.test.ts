// S24 · PR 479 — pure tests for the unisex/couple composition engine's member vocabulary, the match-dimension
// checklist, the "never invent" plan, the member-tag round trip, and the plain-language "ask for the missing
// member" message (no database — the recorder itself is covered by coupleCompositionStudio.db.test.ts).
import { describe, expect, it } from 'vitest';
import {
  COUPLE_COMPOSITION_MATCH_DIMENSIONS,
  COUPLE_COMPOSITION_MEMBERS,
  COUPLE_COMPOSITION_STUDIO_TAG,
  coupleCompositionMemberTag,
  coupleCompositionMembersFromTags,
  coupleCompositionMissingMemberMessage,
  coupleCompositionMissingMemberRequests,
  isCoupleCompositionMember,
  missingCoupleCompositionMembers,
  planCoupleComposition,
  type CoupleCompositionMemberCandidate,
} from './coupleCompositionStudio';

describe('COUPLE_COMPOSITION_MEMBERS', () => {
  it("is C7.13's own two named models, with no duplicates", () => {
    expect(COUPLE_COMPOSITION_MEMBERS).toEqual(['male', 'female']);
    expect(new Set(COUPLE_COMPOSITION_MEMBERS).size).toBe(COUPLE_COMPOSITION_MEMBERS.length);
  });
});

describe('isCoupleCompositionMember', () => {
  it('accepts male and female and refuses anything else', () => {
    expect(isCoupleCompositionMember('male')).toBe(true);
    expect(isCoupleCompositionMember('female')).toBe(true);
    expect(isCoupleCompositionMember('kid')).toBe(false);
    expect(isCoupleCompositionMember(7)).toBe(false);
    expect(isCoupleCompositionMember('')).toBe(false);
  });
});

describe('COUPLE_COMPOSITION_MATCH_DIMENSIONS', () => {
  it("is C7.13's own compositing checklist, verbatim and in order, with no duplicates", () => {
    expect(COUPLE_COMPOSITION_MATCH_DIMENSIONS).toEqual(['lighting', 'scale', 'ground_plane', 'shadow']);
    expect(new Set(COUPLE_COMPOSITION_MATCH_DIMENSIONS).size).toBe(COUPLE_COMPOSITION_MATCH_DIMENSIONS.length);
  });
});

describe('planCoupleComposition', () => {
  const bothReady: CoupleCompositionMemberCandidate[] = [
    { member: 'male', hasRender: true },
    { member: 'female', hasRender: true },
  ];

  it('is ready once a member already has a real render on file', () => {
    expect(planCoupleComposition(bothReady)).toEqual([
      { member: 'male', ready: true },
      { member: 'female', ready: true },
    ]);
  });

  it('names each missing member separately, never only the first — the couple shot needs BOTH', () => {
    const maleOnly: CoupleCompositionMemberCandidate[] = [
      { member: 'male', hasRender: true },
      { member: 'female', hasRender: false },
    ];
    expect(planCoupleComposition(maleOnly)).toEqual([
      { member: 'male', ready: true },
      { member: 'female', ready: false, reason: 'NO_FEMALE_RENDER' },
    ]);

    const neither: CoupleCompositionMemberCandidate[] = [
      { member: 'male', hasRender: false },
      { member: 'female', hasRender: false },
    ];
    expect(planCoupleComposition(neither)).toEqual([
      { member: 'male', ready: false, reason: 'NO_MALE_RENDER' },
      { member: 'female', ready: false, reason: 'NO_FEMALE_RENDER' },
    ]);
  });
});

describe('missingCoupleCompositionMembers', () => {
  it('lists only the members still missing a real render', () => {
    const femaleMissing: CoupleCompositionMemberCandidate[] = [
      { member: 'male', hasRender: true },
      { member: 'female', hasRender: false },
    ];
    expect(missingCoupleCompositionMembers(femaleMissing)).toEqual(['female']);
  });

  it('lists nothing once both members already have a render', () => {
    const both: CoupleCompositionMemberCandidate[] = [
      { member: 'male', hasRender: true },
      { member: 'female', hasRender: true },
    ];
    expect(missingCoupleCompositionMembers(both)).toEqual([]);
  });

  it('lists both when neither has a render yet', () => {
    const neither: CoupleCompositionMemberCandidate[] = [
      { member: 'male', hasRender: false },
      { member: 'female', hasRender: false },
    ];
    expect(missingCoupleCompositionMembers(neither)).toEqual(['male', 'female']);
  });
});

describe('coupleCompositionMemberTag / coupleCompositionMembersFromTags — round trip', () => {
  const maleId = '55555555-5555-5555-5555-555555555555';
  const femaleId = '66666666-6666-6666-6666-666666666666';

  it('reads a finished row’s own male and female renders straight back off its tags', () => {
    const tags = [COUPLE_COMPOSITION_STUDIO_TAG, coupleCompositionMemberTag('male', maleId), coupleCompositionMemberTag('female', femaleId)];
    expect(coupleCompositionMembersFromTags(tags)).toEqual({ maleRenderAssetId: maleId, femaleRenderAssetId: femaleId });
  });

  it('is null unless BOTH members are tagged', () => {
    expect(coupleCompositionMembersFromTags([coupleCompositionMemberTag('male', maleId)])).toBeNull();
    expect(coupleCompositionMembersFromTags([])).toBeNull();
  });

  it('ignores every unrelated tag', () => {
    const tags = ['some_other_tag', coupleCompositionMemberTag('male', maleId), 'couple', coupleCompositionMemberTag('female', femaleId)];
    expect(coupleCompositionMembersFromTags(tags)).toEqual({ maleRenderAssetId: maleId, femaleRenderAssetId: femaleId });
  });
});

describe('coupleCompositionMissingMemberMessage / coupleCompositionMissingMemberRequests — "ask for the missing member"', () => {
  it('names the exact member missing, in plain words', () => {
    expect(coupleCompositionMissingMemberMessage('male')).toMatch(/male model/);
    expect(coupleCompositionMissingMemberMessage('female')).toMatch(/female model/);
  });

  it('says plainly that nothing is invented', () => {
    expect(coupleCompositionMissingMemberMessage('male')).toMatch(/never invented/);
  });

  it('coupleCompositionMissingMemberRequests lists only the members still missing a render, each with its own message', () => {
    const femaleMissing: CoupleCompositionMemberCandidate[] = [
      { member: 'male', hasRender: true },
      { member: 'female', hasRender: false },
    ];
    const requests = coupleCompositionMissingMemberRequests(femaleMissing);
    expect(requests.map((r) => r.member)).toEqual(['female']);
    expect(requests[0]!.message).toMatch(/female model/);
  });

  it('is empty once both members already have a render', () => {
    const both: CoupleCompositionMemberCandidate[] = [
      { member: 'male', hasRender: true },
      { member: 'female', hasRender: true },
    ];
    expect(coupleCompositionMissingMemberRequests(both)).toEqual([]);
  });
});
