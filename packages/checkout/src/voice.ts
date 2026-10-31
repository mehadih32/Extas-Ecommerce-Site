// CN-020 (4) · PR 117 follow-up (SIM-F-047) — the voice address: what the checkout's mic sends. One recording of the
// customer saying his address, with the words his phone's own speech engine heard (Chrome on Android), or without
// them: then the speech-to-text connection reads the recording on the server (its mock hears nothing until the key is
// in). The recording is kept in the library when the owner keeps them (`checkout.voice.keepRecording`). The answer is
// the words for the address box, and whether the reading was unsure (below `minConfidence`, or nothing heard): the
// order placed with it is then flagged "voice — please call" (place.ts). Off as shipped (NOT_OPEN). Nothing is sent to
// anyone and no order changes here.
import { z } from 'zod';
import { CheckoutError, checkStoreId, nowOf, parse, setting, type CheckoutDeps } from './context';

/** Who read the words: the phone, the server's speech connection, or nobody (the team listens). */
export const VOICE_ENGINES = ['BROWSER', 'SERVER', 'NONE'] as const;
export type VoiceEngine = (typeof VOICE_ENGINES)[number];
/** The recordings the checkout takes (what phones' recorders make). */
export const VOICE_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav'] as const;
/** The transcript's longest length (an address said aloud). */
const TEXT_MAX = 2_000;
const KB = 1024;
const HOUR = 3_600_000;

/** What the app hands the voice service: where recordings are kept, and the speech-to-text connection. */
export interface VoiceHooks {
  /** Keeps a recording in the library; its asset id. */
  keep(storeId: number, body: Uint8Array, contentType: string): Promise<string>;
  /** The speech-to-text connection of the store (its mock until the key is in). */
  transcribe(storeId: number, input: { audio: Uint8Array; contentType: string; lang: string }): Promise<{ text: string | null; confidence: number | null }>;
}

export const voiceInputSchema = z
  .object({
    storeId: z.int().min(1),
    visitorId: z.string().min(8).max(100),
    /** The words the phone heard, when it has its own speech engine. */
    transcript: z.string().trim().max(TEXT_MAX).optional(),
    /** The phone's confidence in them (0–1). */
    confidence: z.number().min(0).max(1).optional(),
    durationMs: z.int().min(0).max(HOUR).optional(),
    audio: z.object({ body: z.instanceof(Uint8Array), contentType: z.string().max(100) }).optional(),
  })
  .strict();
export type VoiceInput = z.input<typeof voiceInputSchema>;

export interface VoiceAnswer {
  id: string;
  /** The words for the address box (null: nothing heard; the team listens to the recording). */
  transcript: string | null;
  confidence: number | null;
  engine: VoiceEngine;
  /** Unsure or nothing heard: the order will be flagged "voice — please call". */
  low: boolean;
  /** The recording was kept with the order. */
  kept: boolean;
}

const baseType = (t: string) => t.split(';')[0]!.trim().toLowerCase();

/** One press of the mic, finished. */
export async function saveVoiceAddress(deps: CheckoutDeps, hooks: VoiceHooks | null, input: VoiceInput): Promise<VoiceAnswer> {
  const d = parse(voiceInputSchema, input, 'voice address');
  checkStoreId(d.storeId);
  const cfg = await setting(deps, d.storeId, 'checkout.voice');
  if (!cfg.enabled) throw new CheckoutError('NOT_OPEN', 'the voice address is switched off');
  if (!d.transcript && !d.audio) throw new CheckoutError('INVALID_INPUT', 'nothing was said', ['audio']);
  if (d.audio) {
    if (!d.audio.body.byteLength) throw new CheckoutError('INVALID_INPUT', 'the recording is empty', ['audio']);
    if (d.audio.body.byteLength > cfg.maxKb * KB) throw new CheckoutError('INVALID_INPUT', 'the recording is too long', ['audio', `max:${cfg.maxKb}`]);
    if (!(VOICE_TYPES as readonly string[]).includes(baseType(d.audio.contentType))) throw new CheckoutError('INVALID_INPUT', 'this kind of recording is not taken', ['audio']);
  }
  const now = nowOf(deps);
  const recent = await deps.db.checkoutVoice.count({ where: { storeId: d.storeId, visitorId: d.visitorId, createdAt: { gte: new Date(now.getTime() - HOUR) } } });
  if (recent >= cfg.maxPerHour) throw new CheckoutError('TOO_MANY', 'enough recordings from this browser for now', [], { perHour: cfg.maxPerHour });

  let transcript = d.transcript || null;
  let confidence = transcript ? (d.confidence ?? null) : null;
  let engine: VoiceEngine = transcript ? 'BROWSER' : 'NONE';
  if (!transcript && d.audio && hooks) {
    try {
      const heard = await hooks.transcribe(d.storeId, { audio: d.audio.body, contentType: d.audio.contentType, lang: cfg.speechLang });
      transcript = heard.text?.trim().slice(0, TEXT_MAX) || null;
      confidence = transcript ? heard.confidence : null;
      engine = 'SERVER';
    } catch {
      // the speech service failed: the recording is still kept and the team listens to it
      engine = 'NONE';
    }
  }
  const assetId = cfg.keepRecording && d.audio && hooks ? await hooks.keep(d.storeId, d.audio.body, baseType(d.audio.contentType)) : null;
  const row = await deps.db.checkoutVoice.create({
    data: { storeId: d.storeId, visitorId: d.visitorId, transcript, confidence, engine, lang: cfg.speechLang, durationMs: d.durationMs ?? null, assetId, createdAt: now },
    select: { id: true },
  });
  return { id: row.id, transcript, confidence, engine, low: isLow(transcript, confidence, cfg.minConfidence), kept: assetId !== null };
}

/** Unsure: nothing heard, no confidence given, or below the owner's line. */
export const isLow = (transcript: string | null, confidence: number | null, min: number): boolean => !transcript || confidence === null || confidence < min;
