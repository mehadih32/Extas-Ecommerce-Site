// PR 846 — how many days a customer's privacy request has left (setting `privacy.answerDays`). A request filed `answerDays` days ago has
// none left; past that the number goes negative and the page says how many days over. Whole days, counted from the moment filed.
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day

export function daysLeft(filedIso: string, nowIso: string, answerDays: number): number {
  const gone = Math.floor((new Date(nowIso).getTime() - new Date(filedIso).getTime()) / DAY_MS);
  return answerDays - Math.max(0, gone);
}
