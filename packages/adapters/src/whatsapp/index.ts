// PR 148, 292 — the WhatsApp senders (Blueprint A1.3, B2.5; CN-019). The practice sender (`mockWhatsApp`) serves every
// store until the owner connects the WhatsApp Business Platform (`whatsappCloud`, PR 292) in Keys & connections and its
// test passes; `createConnections({ adapters: messageAdapters })` falls back to the practice sender while no WhatsApp
// connection is on. The contract and the practice outbox are in contract.ts, the provider in cloud.ts.
import { z } from 'zod';
import { AdapterError, defineAdapter } from '../define';
import { whatsappCloudAdapter } from './cloud';
import { mockWhatsAppSender, type WhatsAppSender } from './contract';

export * from './contract';
export * from './cloud';

export const mockWhatsAppAdapter = defineAdapter<WhatsAppSender, Record<string, never>>({
  kind: 'WHATSAPP',
  provider: 'mockWhatsApp',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no WhatsApp provider is connected yet; the mock serves until its key is entered');
  },
  async mock() {
    return mockWhatsAppSender();
  },
  async test() {
    return { ok: true, message: 'mock WhatsApp: nothing leaves the server' };
  },
});

export const whatsappAdapters = [mockWhatsAppAdapter, whatsappCloudAdapter] as const;

/** PR 292: the WhatsApp providers with a LIVE mode (Keys & connections lists them; the practice sender is not one). */
export const liveWhatsAppAdapters = [whatsappCloudAdapter] as const;
