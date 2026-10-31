// CN-020 (4) · SIM-F-047 — the speech-to-text adapter: the mock hears nothing (never made-up words), the live reader
// sends the recording in the store's language and keeps the least sure part's confidence, and no failure carries the
// key (it is part of the address). The network is a stub.
import { describe, expect, it } from 'vitest';
import { encodingOf, googleSpeech, googleSpeechToText, mockSpeechToText, silentWav, speechAdapters, SPEECH_PROVIDER } from '../src';

const KEY = 'sample-key-123';
const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('speech to text (CN-020 (4))', () => {
  it('the mock hears nothing and says it is practice', async () => {
    expect(await mockSpeechToText.transcribe({ audio: silentWav(), contentType: 'audio/wav', lang: 'bn-BD' })).toEqual({ text: null, confidence: null, practice: true });
    expect(googleSpeech.provider).toBe(SPEECH_PROVIDER);
    expect(googleSpeech.secrets).toEqual(['apiKey']);
    expect(speechAdapters).toContain(googleSpeech);
  });

  it('reads the encodings browsers make, and refuses others', () => {
    expect(encodingOf('audio/webm;codecs=opus')).toBe('WEBM_OPUS');
    expect(encodingOf('audio/ogg; codecs=opus')).toBe('OGG_OPUS');
    expect(encodingOf('audio/wav')).toBe('LINEAR16');
    expect(encodingOf('audio/mp4')).toBeNull();
  });

  it('sends the recording in the asked language; the words joined, the least sure confidence kept', async () => {
    let sent: { url: string; body: { config: { languageCode: string; encoding: string }; audio: { content: string } } } | null = null;
    const api = googleSpeechToText(KEY, async (url, init) => {
      sent = { url, body: JSON.parse(String(init?.body)) };
      return answer(200, { results: [{ alternatives: [{ transcript: 'বাড়ি ৪, রোড ৫', confidence: 0.92 }] }, { alternatives: [{ transcript: 'ধানমন্ডি', confidence: 0.41 }] }] })();
    });
    const r = await api.transcribe({ audio: new Uint8Array([1, 2, 3]), contentType: 'audio/webm;codecs=opus', lang: 'bn-BD' });
    expect(r).toEqual({ text: 'বাড়ি ৪, রোড ৫ ধানমন্ডি', confidence: 0.41, practice: false });
    expect(sent!.body.config).toMatchObject({ languageCode: 'bn-BD', encoding: 'WEBM_OPUS' });
    expect(sent!.body.audio.content).toBe(Buffer.from([1, 2, 3]).toString('base64'));
    // nothing heard: no words and no confidence
    expect(await googleSpeechToText(KEY, answer(200, {})).transcribe({ audio: silentWav(), contentType: 'audio/wav', lang: 'bn-BD' })).toEqual({ text: null, confidence: null, practice: false });
  });

  it('says every failure in words, never with the key', async () => {
    const fail = async (f: Parameters<typeof googleSpeechToText>[1], contentType = 'audio/wav') => {
      try {
        await googleSpeechToText(KEY, f).transcribe({ audio: silentWav(), contentType, lang: 'bn-BD' });
        return 'ok';
      } catch (e) {
        return (e as Error).message;
      }
    };
    const msgs = [await fail(answer(403, { error: KEY })), await fail(answer(500, {})), await fail(async () => Promise.reject(new Error(`https://x?key=${KEY}`))), await fail(answer(200, {}), 'audio/mp4')];
    expect(msgs).toEqual(['the speech service refused the key', 'the speech service answered 500', 'the speech service did not answer', 'this kind of recording cannot be read']);
    for (const m of msgs) expect(m).not.toContain(KEY);
  });
});
