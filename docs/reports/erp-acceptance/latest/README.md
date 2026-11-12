# ERP acceptance — demo ERP

**সারকথা:** এবার ডেমো ERP-এর পরীক্ষা চালানো যায়নি (দোকানের ডেটাবেস পড়া যায়নি); কোনো পরীক্ষা ফেল ধরা হয়নি। পরের রানে আবার চলবে।

- 2026-11-12T13:53:33.139Z: not run. the shop's database could not be read: Error in connector: Error querying the database: FATAL: server login has been failing, cached error: connect failed (server_login_retry). Nothing was called; nothing failed.
- The practice ERP runs every check in CI (packages/adapters/test/erp-acceptance.test.ts, the books drills).
