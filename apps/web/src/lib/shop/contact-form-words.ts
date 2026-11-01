// PR 75 follow-up (go-live gate customer 360°, 1 Nov) — the words of the contact page's form, read on the server and
// handed to the form (components/shop/help/ContactForm). Its own words live under `helpPage.form.*`; the phone box
// shares the words every other phone box uses (the login page's example, the back-in-stock box's three problems), so a
// number is explained the same way everywhere.
export const CONTACT_FORM_OWN = ['title', 'name', 'phone', 'order', 'msg', 'send', 'sending', 'note', 'done', 'again', 'off', 'tooMany', 'tooLong', 'msgEmpty', 'err'] as const;

/** The shared phone words, by the key they come from. */
export const CONTACT_FORM_SHARED = {
  phonePh: 'account.login.phonePh',
  phoneEmpty: 'pdp.notify.empty',
  phoneShort: 'pdp.notify.short',
  phonePrefix: 'pdp.notify.prefix',
} as const;

export type ContactFormWords = Record<(typeof CONTACT_FORM_OWN)[number] | keyof typeof CONTACT_FORM_SHARED, string>;

/** Every word of the form, in the page's language. */
export function contactFormWords(t: (key: string) => string): ContactFormWords {
  return {
    ...Object.fromEntries(CONTACT_FORM_OWN.map((k) => [k, t(`helpPage.form.${k}`)])),
    ...Object.fromEntries(Object.entries(CONTACT_FORM_SHARED).map(([k, key]) => [k, t(key)])),
  } as ContactFormWords;
}
