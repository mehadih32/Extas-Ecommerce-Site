// Follow-up 618: a size setting above the edge's upload limit is named; nothing is named when the limit is not known.
import { describe, expect, it } from 'vitest';
import { edgeUploadMaxBytes, uploadLimitProblems } from './upload-limit';

const MB = 1024 * 1024;

describe('follow-up 618: the upload settings against the edge limit', () => {
  it('reads the limit the server passes, and nothing else', () => {
    expect(edgeUploadMaxBytes({ EXTAS_UPLOAD_MAX_MB: '30' })).toBe(30 * MB);
    expect(edgeUploadMaxBytes({ EXTAS_UPLOAD_MAX_MB: ' 12.5 ' })).toBe(12.5 * MB);
    for (const v of [undefined, '', '0', '-5', 'thirty', '30MB']) expect(edgeUploadMaxBytes({ EXTAS_UPLOAD_MAX_MB: v })).toBeNull();
  });

  it('as shipped (25 MB media, 10 MB support, 30 MB edge) nothing is over; a raised setting is named with both sizes', () => {
    expect(uploadLimitProblems({ mediaMaxBytes: 25 * MB, supportMaxMb: 10 }, 30 * MB)).toEqual([]);
    expect(uploadLimitProblems({ mediaMaxBytes: 30 * MB, supportMaxMb: 30 }, 30 * MB)).toEqual([]);
    expect(uploadLimitProblems({ mediaMaxBytes: 40 * MB + 1, supportMaxMb: 31 }, 30 * MB)).toEqual([
      { key: 'media.upload.maxBytes', settingMb: 41, edgeMb: 30 },
      { key: 'support.attachments', settingMb: 31, edgeMb: 30 },
    ]);
    expect(uploadLimitProblems({ mediaMaxBytes: 200 * MB, supportMaxMb: null }, null)).toEqual([]);
  });
});
