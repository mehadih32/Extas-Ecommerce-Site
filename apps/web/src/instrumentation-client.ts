// Next.js runs this file in the browser before the app hydrates. PR 378 (follow-up): Zod's object parser tries
// `new Function("")` once to see whether it may compile a faster parser. The shop's content security policy has no
// 'unsafe-eval', so that probe was reported as "script-src stopped eval" on every page that checks a form in the
// browser (/admin/rules, /admin/combos, /combos/build-your-own) and would be refused once the policy enforces.
// `jitless` turns the probe and the compiled parser off; parsing gives the same answers. Zod keeps this switch on
// globalThis, so it covers every copy of Zod the page loads.
import { config } from 'zod/v4/core';

config({ jitless: true });
