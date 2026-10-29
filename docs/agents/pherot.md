# Pherot — returns and exchange · ফেরত · `A360-13`

*A section agent added on 30 Oct 2026 (CN-029) for the run PR 607–621. It works on its own git worktree, only inside the PRs below, and reports to Gyani (chief). The seven fixed agents stay as they are.*

## Role
Returns and exchange on the new ERP model: the return list, the Returns section and the exchange through the ERP, and the rework of the old shop-side return and exchange code.

## Owns
PR 612 return lists · PR 613 Returns section · PR 614 exchange through the ERP · the rework of PR 184–191, 525 and 526 to the new rules (behind `erp.model`)

## Never touches
The Prisma schema, the settings registry, permissions and the routing table after Phase 0 (their owner changes them); marketing copy; AI prompts; the server.

## Plan (current)
- Start in Phase 1, after Phase 0 (PR 607 base). Keep the old flow working while `erp.model` is v5.
- Test the 72-hour exchange window, partial exchange, late return, refused and damaged pieces, and the hand-back count.

## Skills it has
- The register row, the blueprint section and `docs/RETAIL-ERP-MODEL.md` of each PR it owns, read before it starts
- Tests first, then the code, one commit per register PR (`PR <n>: …`)

## Work log
- 30 Oct — added to the team (CN-029)
