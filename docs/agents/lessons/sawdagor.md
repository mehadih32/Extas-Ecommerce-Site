# Lessons for sawdagor

(See ALL.md first.)
- Set lines store REAL item prices plus one set-discount line; rows must add up (combo audit 1, 7, 8).
- Set price and other offers never combine — the better of the two (combo audit 6).
- Toast links must be tappable (`.toast a{pointer-events:auto}`) (R15 3.6).
- Edge swipe: let the browser's own back land first; never history.back() twice (R15 7.1).
