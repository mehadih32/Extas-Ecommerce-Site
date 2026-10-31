// S21 · PR 423 — the pill colour of each severity and status on the Customer problems pages (the shell's a2-pill tones).
export const SEV_PILL = {
  URGENT: 'bad',
  IMPORTANT: 'warn',
  CAN_WAIT: 'line',
} as const;
export const STATUS_PILL = {
  NEW: 'gold',
  FIXING: 'warn',
  FIXED: 'ok',
  COULD_NOT_FIX: 'line',
  NEEDS_OWNER: 'bad',
  WAITING_OWNER_CHECK: 'warn',
} as const;
