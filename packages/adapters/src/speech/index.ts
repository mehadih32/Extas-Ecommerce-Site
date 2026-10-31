// CN-020 (4) · PR 117 follow-up (SIM-F-047) — speech to text for the checkout's voice address, on browsers whose phone
// has no speech engine of its own (Chrome on Android reads it on the phone). The recording goes to Google Cloud
// Speech-to-Text (`speech:recognize`, an API key from Google Cloud → APIs & Services → Credentials, restricted to the
// Speech-to-Text API) in the store's speech language; the words and the engine's confidence come back.
//
// Until the key is in and its Test passes, the mock answers: it hears nothing (no words, no confidence), so the order is
// flagged "voice — please call" and the team listens to the recording (A1.3). It never makes words up. The key is part
// of the address (`?key=`), so no error, message or log line ever carries the address: every failure is said in words.
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';

export const SPEECH_PROVIDER = 'googleSpeech';

const API = 'https://speech.googleapis.com/v1/speech:recognize';
/** The longest the server waits for the words (the customer waits too). */
const TIMEOUT_MS = 20_000;

export interface SpeechInput {
  audio: Uint8Array;
  /** The recording's type as the browser made it (audio/webm;codecs=opus, audio/ogg, audio/wav …). */
  contentType: string;
  /** BCP 47, the store's speech language (`checkout.voice.speechLang`). */
  lang: string;
}

export interface SpeechResult {
  /** The words heard, or null when nothing was heard (the mock always). */
  text: string | null;
  /** 0–1, or null when the engine did not say. */
  confidence: number | null;
  /** The mock's answer (no engine connected). */
  practice: boolean;
}

export interface SpeechToText {
  transcribe(input: SpeechInput): Promise<SpeechResult>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Google's name for the recording's encoding (null: one it cannot read). */
export function encodingOf(contentType: string): string | null {
  const t = contentType.toLowerCase();
  if (t.startsWith('audio/webm')) return 'WEBM_OPUS';
  if (t.startsWith('audio/ogg')) return 'OGG_OPUS';
  if (t.startsWith('audio/wav') || t.startsWith('audio/x-wav') || t.startsWith('audio/wave')) return 'LINEAR16';
  if (t.startsWith('audio/flac')) return 'FLAC';
  if (t.startsWith('audio/mpeg') || t.startsWith('audio/mp3')) return 'MP3';
  return null;
}

/** The mock: no engine, no words (the team listens to the recording). */
export const mockSpeechToText: SpeechToText = {
  async transcribe() {
    return { text: null, confidence: null, practice: true };
  },
};

interface GoogleAnswer {
  results?: { alternatives?: { transcript?: string; confidence?: number }[] }[];
}

/** The live reader (Google Cloud Speech-to-Text v1). */
export function googleSpeechToText(apiKey: string, doFetch: Fetch = fetch): SpeechToText {
  return {
    async transcribe(input) {
      const encoding = encodingOf(input.contentType);
      if (!encoding) throw new AdapterError('this kind of recording cannot be read');
      let r: Response;
      try {
        r = await doFetch(`${API}?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ config: { encoding, languageCode: input.lang, enableAutomaticPunctuation: true }, audio: { content: Buffer.from(input.audio).toString('base64') } }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new AdapterError('the speech service did not answer');
      }
      if (r.status === 400) throw new AdapterError('the speech service could not read this recording');
      if (r.status === 401 || r.status === 403) throw new AdapterError('the speech service refused the key');
      if (!r.ok) throw new AdapterError(`the speech service answered ${r.status}`);
      const body = (await r.json().catch(() => ({}))) as GoogleAnswer;
      const parts = (body.results ?? []).map((x) => x.alternatives?.[0]).filter((a): a is { transcript?: string; confidence?: number } => !!a);
      const text = parts.map((a) => (a.transcript ?? '').trim()).filter(Boolean).join(' ');
      const scores = parts.map((a) => a.confidence).filter((c): c is number => typeof c === 'number');
      // the least sure part decides: one unclear stretch of the address is enough to call
      const confidence = scores.length ? Math.max(0, Math.min(1, Math.min(...scores))) : null;
      return { text: text || null, confidence: text ? confidence : null, practice: false };
    },
  };
}

/** A short silence (a WAV header with 0.1 s of 16 kHz mono samples): the Test button's one cheap round trip. */
export function silentWav(): Uint8Array {
  const samples = 1600;
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples * 2, 40);
  return new Uint8Array(b);
}

export const speechConfig = z.object({
  /** The language the Test reads in; the checkout uses the store's own `checkout.voice.speechLang`. */
  lang: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
    .optional(),
});
type Config = z.infer<typeof speechConfig>;

/** The Test's language when none is given (the shop's default speech language). */
const TEST_LANG = 'bn-BD';

export const googleSpeech = defineAdapter<SpeechToText, Config>({
  kind: 'SPEECH',
  provider: SPEECH_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: speechConfig,
  async create(ctx) {
    return googleSpeechToText(await requireSecret(ctx, 'apiKey'));
  },
  async mock() {
    return mockSpeechToText;
  },
  async test(api, ctx) {
    await api.transcribe({ audio: silentWav(), contentType: 'audio/wav', lang: ctx.config.lang ?? TEST_LANG });
    return { ok: true, message: 'the speech service answered' };
  },
});

export const speechAdapters = [googleSpeech] as const;
