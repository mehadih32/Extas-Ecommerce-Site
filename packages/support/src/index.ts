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
// PR 427: identity resolution.
//   identity.ts   who wrote a message (resolveIdentity, in receiveMessage), the person's other chats (personOf), and
//                 the team's corrections: set the number, unlink the customer, "not the same person"
//
// PR 429: selling from the chat.
//   catalogue.ts  the drawer's product search (chatCatalogue), one product sent as a card with its tracked link
//                 (shareProduct, kept with its message), the customer's first click on it (openShare)
//
// PR 430: orders from the chat.
//   chat-cart.ts  the chat's own bag (chatBag, changeChatBag: the shop's prices and combos), the checkout priced for the
//                 typed details with the owner's fraud gate (quoteChatOrder), and "Create order" / "Take advance"
//                 (createChatOrder: the checkout's own placeOrder, the chat's channel as source, the pay link sent)
//
// PR 431: ticketing.
//   tickets.ts    one ticket per customer question: opened by their message (ticketOnCustomerMessage), its owner,
//                 first answer and status following the chat; its timers (clockOf, clocksOf, ticketOf) and the late
//                 chats for a person's notifications (lateChats)
// PR 432: EXTAS AI's draft answers.
//   drafts.ts     the draft answer to the customer's latest question (supportDraft): what it is about, the chat's order
//                 and parcel, Find My Size, the store's own words; a person sends it. drafts-pure.ts: the rules.
// PR 433: follow-ups on chats that did not become an order.
//   followups.ts  the rule-capped sweep (sweepFollowUps: the bag left, products sent and not ordered, a cancelled
//                 order), the follow-up waiting on a chat (chatFollowUp) and a person's Send or Skip; followups-pure.ts:
//                 the rules.
//
// PR 434: privacy and the block list.
//   privacy.ts    the reader's lens (own chats only, numbers in messages masked, the block list on) and putting a chat's
//                 person on the support block list or taking them off (support.block; nothing deleted)
//   push.ts       PR 435: the support app's push notifications — who is told on which device, with what words
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
// PR 427 — who is writing: one person across channels.
export * from './identity';
// PR 429 — the catalogue drawer: a product sent in the chat with its tracked link, the customer's click.
export * from './catalogue';
// PR 430 — orders from the chat: the chat's bag, the fraud gate, the order with its channel.
export * from './chat-cart';
// PR 431 — ticketing: status, owner, the first-answer and solution timers, how long it took, late chats in the bell.
export * from './tickets';
// PR 432 — EXTAS AI's draft answers (a person sends them).
export * from './drafts-pure';
export * from './drafts';
// PR 433 — follow-ups on chats without an order (rule-capped; a person sends).
export * from './followups-pure';
export * from './followups';
// PR 434 — privacy inside support and the support block list.
export * from './privacy';
// PR 435 — the support app's push notifications (a new message, a chat given to someone).
export * from './push';
