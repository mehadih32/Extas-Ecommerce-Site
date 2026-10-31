// PR 425 — where the channels plug in. A channel (a Messenger page, a WhatsApp number, the site's chat …) is a
// SupportChannel row of its store; its connector (PR 426) does two things with the core:
//   in:  its webhook calls `receiveMessage` (inbound.ts) for every message a customer sends;
//   out: it registers a SupportChannelAdapter for its kind, which `replyToConversation` calls to send a reply.
// ~~No connector is built here, so `channels` is empty~~ (PR 426: connectors.ts gives the adapters). A kind with no
// adapter keeps its reply in the conversation with the status NOT_SENT and the reason CHANNEL_NOT_CONNECTED, and the
// screen says so. Meta's rules (the reply window, templates outside it,
// B4.10) belong to the connector; the core never sends anything by itself.

/** The channel kinds a store can connect (B4.2; Instagram and e-mail join with their connectors). */
export const CHANNEL_KINDS = ['whatsapp', 'messenger', 'livechat', 'instagram', 'email'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const isChannelKind = (k: string): k is ChannelKind => (CHANNEL_KINDS as readonly string[]).includes(k);

/** A reply for a channel to send. Files are our stored copies (media asset ids); the connector reads them itself. */
export interface OutgoingSupportMessage {
  storeId: number;
  conversationId: string;
  messageId: string;
  channel: { id: string; kind: string; externalId: string };
  contact: { externalId: string; phone: string | null };
  text: string | null;
  files: { attachmentId: string; assetId: string; fileName: string | null; contentType: string | null }[];
}

/** A refusal with `notSent` (PR 426: Meta's reply window, files on a channel that takes none, the chat switched off) keeps
 *  the reply as NOT_SENT with that reason; any other `ok: false` is the provider's own failure (FAILED). */
export type ChannelSendResult = { ok: true; externalMessageId: string } | { ok: false; error: string; notSent?: boolean };

export interface SupportChannelAdapter {
  kind: ChannelKind;
  send(m: OutgoingSupportMessage): Promise<ChannelSendResult>;
}

/** The adapters by channel kind. */
export type ChannelAdapters = Partial<Record<ChannelKind, SupportChannelAdapter>>;

/** Why a reply did not go out. */
export const NOT_SENT_REASONS = ['CHANNEL_NOT_CONNECTED', 'CHANNEL_OFF', 'OUTSIDE_WINDOW', 'FILES_NOT_SENT', 'LIVE_CHAT_OFF'] as const;
