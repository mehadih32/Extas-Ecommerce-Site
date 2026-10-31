# Independent security review — before real money flows (PR 381, B6.1)

> **সংক্ষেপে:** আসল টাকা (bKash/কার্ড গেটওয়ের লাইভ চাবি) চালু করার আগে যে বানায়নি এমন কেউ সাইটের নিরাপত্তা নিচের লিস্ট ধরে
> পরীক্ষা করবে। সব "জরুরি" আর "বেশি" সমস্যা ঠিক না হওয়া পর্যন্ত আর নিচের সই না পড়া পর্যন্ত গেটওয়ে লাইভ হবে না।

## When and why
- **Gate:** the payment gateways' live keys (S19, PR 391 and the go-live acceptance list PR 393) are typed in only after
  this review is **signed off** below. Until then every gateway stays on its mock or sandbox (A1.3).
- **Independent** means: not the session or person who built the part under review. The minimum is a fresh review
  session that did not write the code, working from this file; the owner may also hire an outside tester
  (see `BLOCKED.md`, PR 381). The automated checks below run on every PR and every night either way.
- The review is done again after any change to sign-in, payments, the vault or the edge (proxy, Caddy, Cloudflare).

## Automated, on every PR and every night (must be green)
| Check | Where | Fails on |
|---|---|---|
| Dependency vulnerabilities (`pnpm audit`, shipped and build-only) | `tools/dep-audit.mjs`, CI job `deps` (part of `web`) | high+ in what ships, critical in the build tools, unless accepted in `tools/dep-audit.json` with a reason and an end date (max 90 days) |
| No hardcoded values or keys | `tools/hardcode-guard.mjs` (PR 494) | any literal the guard knows |
| Every API route behind the same-origin gate, every exemption with its own proof | `apps/web/src/lib/security/route-review.test.ts` (PR 378) | a new route the gate does not cover |
| Security headers and the page CSP | the same test; `infra/stack/caddy/Caddyfile` | a missing header |
| Owner data never in an export or the repo | `pnpm --filter @extas/seed owner-data:check` (PR 509) | an owner value in defaults |
| The append-only audit log and history tables | CI `db` job (CN-022 guards) | UPDATE/DELETE allowed to the app role |

## The review list (each line: what to try, where it is built)
| # | Area | What the reviewer tries | Built in |
|---|---|---|---|
| R1 | Sign-in | brute force (pause after `security.loginMaxAttempts`), password reuse, session after password change, cookie flags (`__Host-`, Secure, HttpOnly, SameSite=Strict) | staff sign-in (S00), PR 380 |
| R2 | 2FA | skip the second step, replay a code, reset by someone who is not the owner | staff sign-in (S00), PR 380 |
| R3 | Permissions | every admin API with a role that lacks its key (403), store isolation (one store's staff reads another's) | roles (S00), every admin PR |
| R4 | CSRF | a cross-site POST to every `/api/*` and `/erp-api/*` (403 `cross-site-request`), the exempt list's proofs (signature, token) | PR 378 |
| R5 | Rate limits | sign-in, OTP and checkout floods per address (observe → enforce) | PR 378 |
| R6 | Injection | SQL (Prisma raw queries), stored XSS in names, reviews, notes, the CSP report-only log | all |
| R7 | Money paths | order totals recomputed on the server, coupon and advance tampering, a payment callback replayed or forged, refund without approval | checkout and payments PRs, books PR 615–616 |
| R8 | Secrets | vault encryption at rest, keys never in a response, log or backup in clear | PR 493 |
| R9 | Customer data | order lookup by guessing, address/phone exposure, the IP/GPS purge, erasure requests | PR 382 |
| R10 | Admin address list | spoofed `X-Forwarded-For` (only Cloudflare/Caddy may set it), the break-glass switch | PR 380 |
| R11 | Edge | the origin reachable only through Cloudflare, WAF rules, DDoS settings | PR 386 |
| R12 | Backups | an attacker with the app's keys cannot delete or overwrite backups (immutability) | PR 385 |
| R13 | Uploads | file type and size checks, no script served from uploads | media PRs |
| R14 | Dependencies | the accepted advisories in `tools/dep-audit.json` still hold | PR 381 |

Severity: **critical** (money or customer data at risk now) · **high** (an attacker can do it with some effort) ·
**medium** · **low**. Critical and high block the sign-off; medium gets a dated follow-up PR.

## Findings
| Date | # | Severity | What | Fix (PR) | Status |
|---|---|---|---|---|---|
| 2026-10-31 | R4 | high | `/api/fresh-start` (#64) had no same-origin check of its own | PR 378 central gate | fixed |
| 2026-10-31 | R14 | — | dev-only: tinypool (vitest 3) critical advisories; prod: deepmerge-ts (Prisma CLI) high | accepted until 2027-01-29; vitest 4 follow-up | accepted |

## Sign-off
| Reviewer | Independent of | Date | Scope (commit) | Result |
|---|---|---|---|---|
| — | — | — | — | not yet reviewed |
