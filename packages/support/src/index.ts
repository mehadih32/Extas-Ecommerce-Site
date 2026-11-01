// @extas/support — the support core (S22; Blueprint B4.2, B4.4, B4.8, B4.12; docs/ADMIN-ARCHITECTURE.md §4.7).
//
// PR 425: one inbox for every channel. A conversation is one person on one channel (SupportContact, SupportChannel)
// with its messages in order: the customer's (IN), the shop's replies (OUT) and internal notes the customer never sees
// (NOTE), each with its files. Every message carries the sender's name as it was; every arrival, reply, note,
// assignment and status change is a line in the who-did-what log (ConversationEvent, append-only at the database).
// A conversation is OPEN (the customer waits), WAITING (the shop answered) or SOLVED, and belongs to one employee or
// to nobody. The views: open, waiting, mine, not taken, solved, all.
//
//   inbound.ts  receiveMessage — what a channel's webhook calls (PR 426 builds the webhooks)
//   inbox.ts    supportInbox, supportThread, supportFile — what the team reads
//   actions.ts  replyToConversation, assignConversation, setConversationStatus, supportStaff — what the team does
//   channels.ts the adapter a channel registers to send replies; a kind with none keeps its reply NOT_SENT
//   settings.ts the Support settings cards
//
// PR 426: the connectors.
//   connectors.ts Messenger and WhatsApp webhooks into the inbox (receiveFromChannel), the reply adapters with Meta's
//                 reply window (supportChannelAdapters), and the channels list of Support settings (add, rename,
//                 switch, put away; never deleted)
//   livechat.ts   the site's own chat: a visitor's thread and messages (off as it ships: support.liveChat)
//
// `./pure` holds the rules without a database (the screens use them).
export * from './context';
export * from './channels';
export * from './pure';
export * from './inbound';
export * from './inbox';
export * from './actions';
export * from './settings';
export * from './connectors';
export * from './livechat';
// CN-020 (3) — "Call me" at checkout: the call-back lands in the inbox.
export * from './callback';
// PR 75 follow-up — the contact page's form: the message lands in the inbox.
export * from './contact-form';
