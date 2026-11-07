// Follow-up 609 (PR 15, 380) — the admin sign-in pause counted per network. Registry version 271. Labels:
// messages/settings.<lang>.json (`security.loginLockoutByNetwork`).
//
// - `security.loginLockoutByNetwork`: off as shipped (the pause counts wrong tries per e-mail, so anyone who knows an
//   e-mail can keep its owner paused). On: `security.loginMaxAttempts` wrong tries pause the e-mail only for the network
//   they came from (an IPv4 /24, an IPv6 /48), and `emailCeiling` wrong tries from any networks together still pause
//   it everywhere, so spreading guesses over many networks gains little. The pause lasts `security.loginLockoutMinutes`.
import { z } from 'zod';
import { setting } from './define';

const V = 271;

export const loginNetworkSchema = z
  .object({
    enabled: z.boolean(),
    emailCeiling: z.int().min(6).max(1_000),
  })
  .strict();
export type LoginNetworkSettings = z.output<typeof loginNetworkSchema>;

export const loginNetworkSettings = {
  'security.loginLockoutByNetwork': setting({
    scope: 'installation',
    schema: loginNetworkSchema,
    default: { enabled: false, emailCeiling: 50 },
    valueType: 'JSON',
    group: 'security',
    labelKey: 'security.loginLockoutByNetwork.label',
    helpKey: 'security.loginLockoutByNetwork.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 91,
    version: V,
  }),
} as const;
