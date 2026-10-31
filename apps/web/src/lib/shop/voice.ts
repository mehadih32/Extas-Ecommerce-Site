// CN-020 (4) · SIM-F-047 — the voice address's wiring on the server: where recordings are kept (the media library,
// folder `voice`, through the storage connection) and the speech-to-text connection of the store (Keys & connections
// → "Speech to text"; its mock hears nothing until the key's test passes, so the team listens). Both are looked up
// through the connection layer (PR 18), cached like every connection.
import { createConnections, SPEECH_PROVIDER, speechAdapters, type SpeechToText } from '@extas/adapters';
import type { VoiceHooks } from '@extas/checkout';
import { getPrisma } from '@extas/db/client';
import { storeGeneratedFile } from '@extas/media';
import { createVault } from '@extas/vault';
import { mediaDeps } from '../media';
import { settingsResolver } from '../settings';

/** The library folder of the recordings (the order page plays them from here). */
export const VOICE_FOLDER = 'voice';

/** The file ending of a recording's type (the library names files by it). */
export function voiceExtension(contentType: string): string {
  const t = contentType.split(';')[0]!.trim().toLowerCase();
  if (t === 'audio/webm') return 'webm';
  if (t === 'audio/ogg') return 'ogg';
  if (t === 'audio/mp4' || t === 'audio/aac') return 'm4a';
  if (t === 'audio/mpeg') return 'mp3';
  return 'wav';
}

type Connections = ReturnType<typeof createConnections>;
const holder = globalThis as unknown as { __speechConnections?: Connections };
const MS = 1000;

async function speechFor(storeId: number): Promise<SpeechToText> {
  if (!holder.__speechConnections) {
    const settings = settingsResolver();
    const [cacheSeconds, testSeconds] = settings ? await Promise.all([settings.value('system.integrationKeyCacheSeconds'), settings.value('system.integrationTestTimeoutSeconds')]) : [0, 0];
    const key = process.env.VAULT_MASTER_KEY;
    const db = getPrisma();
    holder.__speechConnections = createConnections({
      db,
      vault: key && key.length >= 32 ? createVault(db, key) : { get: async () => null },
      adapters: speechAdapters,
      secretCacheMs: cacheSeconds * MS,
      testTimeoutMs: testSeconds * MS,
    });
  }
  return (await holder.__speechConnections.use<SpeechToText>('SPEECH', { storeId, provider: SPEECH_PROVIDER })).api;
}

/** The voice service's hooks, or null without a database (then nothing is kept and nothing is read). */
export function voiceHooks(): VoiceHooks | null {
  const media = mediaDeps();
  if (!media) return null;
  return {
    async keep(storeId, body, contentType) {
      const a = await storeGeneratedFile(media, { storeId, kind: 'AUDIO', body, contentType, name: 'voice address', extension: voiceExtension(contentType), folder: VOICE_FOLDER });
      return a.id;
    },
    async transcribe(storeId, input) {
      const r = await (await speechFor(storeId)).transcribe(input);
      return { text: r.text, confidence: r.confidence };
    },
  };
}
