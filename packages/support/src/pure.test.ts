// PR 425 — the support rules without a database: the list's first words and what a file really is.
import { describe, expect, it } from 'vitest';
import { cleanFileName, fileKindOf, previewOf, sniffFile } from './pure';

const bytes = (...parts: (number[] | string)[]) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe('PR 425 · support rules (pure)', () => {
  it('folds spaces and cuts the first words with an ellipsis', () => {
    expect(previewOf('  hello\n\n there  ', 120)).toBe('hello there');
    expect(previewOf('abcdefghij', 6)).toBe('abcde…');
    expect(previewOf('   ', 10)).toBeNull();
  });

  it('reads a file by its first bytes, never its name', () => {
    expect(sniffFile(bytes([0xff, 0xd8, 0xff, 0xe0]))?.contentType).toBe('image/jpeg');
    expect(sniffFile(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.extension).toBe('png');
    expect(sniffFile(bytes('RIFF', [0, 0, 0, 0], 'WEBP'))?.contentType).toBe('image/webp');
    expect(sniffFile(bytes('%PDF-1.7'))?.kind).toBe('pdf');
    expect(sniffFile(bytes([0, 0, 0, 0x18], 'ftypisom'))?.contentType).toBe('video/mp4');
    expect(sniffFile(bytes([0, 0, 0, 0x14], 'ftypqt  '))?.extension).toBe('mov');
    expect(sniffFile(bytes([0, 0, 0, 0x18], 'ftypheic'))).toBeNull();
    expect(sniffFile(bytes('MZ', [0x90, 0]))).toBeNull();
    expect(sniffFile(bytes('<html>'))).toBeNull();
  });

  it('maps stored kinds to the settings kinds and cleans file names', () => {
    expect(fileKindOf('IMAGE')).toBe('image');
    expect(fileKindOf('AUDIO')).toBeNull();
    expect(cleanFileName('C:\\Users\\a\\photo "1".jpg')).toBe('photo 1.jpg');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('   ')).toBeNull();
  });
});
