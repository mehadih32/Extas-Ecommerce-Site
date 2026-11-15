// PR 864 — Team report: a practice customer's chat is not counted while practice mode is off (their orders are already left out).
import { describe, expect, it } from "vitest";
import { withoutPracticeChats } from "./team";

const m = (id: string, customerId: string | null) => ({
  id,
  conversation: { customerId },
});

describe("withoutPracticeChats", () => {
  const msgs = [
    m("a", "real"),
    m("b", "practice"),
    m("c", null),
    m("d", "practice"),
  ];
  it("drops the replies in a practice customer's chat and keeps the rest, including a chat with no customer", () => {
    expect(
      withoutPracticeChats(msgs, new Set(["practice"])).map((x) => x.id),
    ).toEqual(["a", "c"]);
  });
  it("keeps everything when practice mode is on (no practice customers to drop)", () => {
    expect(withoutPracticeChats(msgs, new Set())).toHaveLength(4);
  });
});
