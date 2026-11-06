// S12 · PR 242 — the cluster planner's pure rules: shop paths compared alike (Bengali prefix, query, slash), the links
// an article carries, the gaps of a cluster per rule, alike topics and their level, and the topic moves.
import { describe, expect, it } from 'vitest';
import { alikeLevel, closest, clusterGaps, linksOf, normPath, topicInputSchema, clusterInputSchema, topicNext, tokens } from './clusters-model';

const rules = { linkPillar: true, linkTarget: true, pillarLinksAll: true };

describe('links (PR 242)', () => {
  it('compares shop paths without the Bengali prefix, query, anchor or trailing slash; outside links are not shop paths', () => {
    expect(normPath('/bn/journal/how-to-wash/?x=1#top')).toBe('/journal/how-to-wash');
    expect(normPath('/bn')).toBe('/');
    expect(normPath('/Collections/Polos/')).toBe('/collections/polos');
    expect(normPath('https://example.com/a')).toBeNull();
    expect(normPath('//evil.example/a')).toBeNull();
  });
  it('reads the links of paragraphs, lists and boxes', () => {
    const body = 'See [the guide](/journal/polo-care).\n\n- [polos](/bn/collections/polos)\n\n> tip: [care](/journal/care#x)\n\n[out](https://example.com/x)';
    expect([...linksOf(body)].sort()).toEqual(['/collections/polos', '/journal/care', '/journal/polo-care']);
    expect(linksOf(null).size).toBe(0);
  });
  it('lists what each article of a cluster still lacks, per rule', () => {
    const pillar = { id: 'p', slug: 'polo-guide', title: 'Polo guide', body: 'Read [how to wash](/journal/wash-polo).', live: true };
    const ok = { id: 'a', slug: 'wash-polo', title: 'Wash a polo', body: '[guide](/journal/polo-guide) and [polos](/collections/polos)', live: true };
    const bare = { id: 'b', slug: 'fold-polo', title: 'Fold a polo', body: 'No links here.', live: true };
    const draft = { id: 'c', slug: 'iron-polo', title: 'Iron a polo', body: '[guide](/bn/journal/polo-guide/)', live: false };
    const g = clusterGaps({ pillarPostId: 'p', targetPath: '/collections/polos' }, [pillar, ok, bare, draft], rules);
    expect(g.has('a')).toBe(false);
    expect(g.get('b')?.map((x) => x.kind)).toEqual(['pillar', 'target']);
    expect(g.get('c')?.map((x) => x.kind)).toEqual(['target']);
    // the pillar must link to the shop page and to each live supporting article (not the draft)
    expect(g.get('p')?.map((x) => `${x.kind}:${x.path}`)).toEqual(['target:/collections/polos', 'support:/journal/fold-polo']);
    const off = clusterGaps({ pillarPostId: 'p', targetPath: '/collections/polos' }, [pillar, ok, bare, draft], { linkPillar: false, linkTarget: false, pillarLinksAll: false });
    expect(off.size).toBe(0);
    // no pillar and no shop page: nothing is required
    expect(clusterGaps({ pillarPostId: null, targetPath: null }, [bare], rules).size).toBe(0);
  });
});

describe('alike topics (PR 242)', () => {
  const pool = [
    { kind: 'post' as const, id: '1', title: 'How to wash raw denim', query: 'wash raw denim' },
    { kind: 'topic' as const, id: '2', title: 'Hoodie pilling: why it happens', query: 'hoodie pilling' },
    { kind: 'topic' as const, id: '3', title: 'পাঞ্জাবির সাইজ চার্ট', query: null },
  ];
  it('drops joining words and keeps Bengali words whole', () => {
    expect([...tokens('How to wash the Denim?')]).toEqual(['wash', 'denim']);
    expect([...tokens('পাঞ্জাবির সাইজ চার্ট')]).toEqual(['পাঞ্জাবির', 'সাইজ', 'চার্ট']);
  });
  it('finds the closest article or topic and its level', () => {
    const a = closest('Washing raw denim the right way', 'how to wash raw denim', pool);
    expect(a?.id).toBe('1');
    expect(alikeLevel(a, { dupNear: 40, dupWarn: 60 })).not.toBe('none');
    expect(closest('পাঞ্জাবির সাইজ চার্ট', null, pool)?.score).toBe(100);
    expect(closest('পাঞ্জাবির সাইজ চার্ট', null, pool, ['3'])).toBeNull();
    expect(alikeLevel({ score: 45, kind: 'post', id: '1', title: '' }, { dupNear: 40, dupWarn: 60 })).toBe('near');
    expect(alikeLevel({ score: 60, kind: 'post', id: '1', title: '' }, { dupNear: 40, dupWarn: 60 })).toBe('warn');
    expect(alikeLevel(null, { dupNear: 40, dupWarn: 60 })).toBe('none');
  });
});

describe('topics and clusters (PR 242)', () => {
  it('moves a topic only where the step applies', () => {
    const t = (status: string, postId: string | null = null, archived = false) => ({ status, postId, archived });
    expect(topicNext('approve', t('proposed'))).toBe('approved');
    expect(topicNext('approve', t('approved'))).toBeNull();
    expect(topicNext('reject', t('approved'))).toBe('rejected');
    expect(topicNext('reject', t('approved', 'post'))).toBeNull();
    expect(topicNext('reopen', t('rejected'))).toBe('proposed');
    expect(topicNext('start', t('approved'))).toBe('approved');
    expect(topicNext('start', t('proposed'))).toBeNull();
    expect(topicNext('archive', t('approved', 'post'))).toBeNull();
    expect(topicNext('approve', t('proposed', null, true))).toBeNull();
    expect(topicNext('restore', t('rejected', null, true))).toBe('rejected');
  });
  it('checks the inputs', () => {
    expect(topicInputSchema.safeParse({ title: 'Wash a polo', locale: 'en', clusterId: null, authorId: null }).success).toBe(true);
    expect(topicInputSchema.safeParse({ title: 'ab', locale: 'en' }).success).toBe(false);
    expect(topicInputSchema.safeParse({ title: 'Wash a polo', locale: 'fr' }).success).toBe(false);
    expect(clusterInputSchema.safeParse({ name: 'Polo care', targetPath: '/collections/polos' }).success).toBe(true);
    expect(clusterInputSchema.safeParse({ name: 'Polo care', targetPath: 'https://example.com' }).success).toBe(false);
    expect(clusterInputSchema.safeParse({ name: 'Polo care', targetPath: '' }).data?.targetPath).toBeNull();
  });
});
