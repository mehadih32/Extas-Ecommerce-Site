// @extas/media — the image pipeline and the media library (S01 · PR 22, 23, 24, 25, 37; Blueprint A2.9.7, C7.11).
//   process.ts    standardisation with sharp (5 sizes × AVIF/WebP/JPEG at 4:5, quality, dominant colour)
//   naming.ts     the naming convention (descriptive, hashed, never overwritten)
//   jobs.ts       render / regenerate as worker jobs (inline until the image worker runs)
//   library.ts    upload, search, reuse, archive/restore, orphan clean-up, product galleries
//   photos.ts     the minimum photo set (front, back, detail, on-model)
//   delivery.ts   <picture>/srcset sources (pure; the storefront component uses it)
//   serve.ts      rendition files, picture data, the watermarked download copy
//   watermark.ts  the watermark, on download only
export * from './config';
export * from './errors';
export * from './naming';
export * from './process';
export * from './watermark';
export * from './deps';
export * from './jobs';
export * from './references';
export * from './photos';
export * from './library';
export * from './delivery';
export * from './serve';
export * from './runtime';
