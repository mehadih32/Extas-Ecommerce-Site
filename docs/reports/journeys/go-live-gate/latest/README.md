# Journeys — PASS

2026-11-01 11:37 (Asia/Dhaka) · https://new.extas.com.bd · run now · 98d378e6b4a0 · group go-live-gate

4 journeys (journey × screen), 0 failed; 60 steps, 8 skipped.

UI checks: off.

## gate-shop · phone — pass

- ok 1. open / (unless rules.eid.enabled / delivery.holiday.enabled) · SIM-F-019
- ok 2. open /bn · SIM-F-025, SIM-F-047
- ok 3. open /bn/search · SIM-F-025, SIM-F-047
- ok 4. open /bn/bag · SIM-F-025, SIM-F-047
- ok 5. open /bn/checkout · SIM-F-025, SIM-F-047
- ok 6. open /bulk-order → 404 (unless orders.bulkLane.enabled) · SIM-F-023
- skip 7. open /bulk-order (when orders.bulkLane.enabled) · SIM-F-023 (switch orders.bulkLane.enabled is off)
- ok 8. open /account/login · SIM-F-039
- ok 9. open / · SIM-F-035, SIM-F-046
- ok 10. follow a[href^='/collections/'] · SIM-F-035, SIM-F-046
- skip 11. follow a.pcard-lnk · SIM-F-035, SIM-F-046, SIM-F-034 (nothing matches a.pcard-lnk (the shop has none yet))

## gate-shop · desktop — pass

- ok 1. open / (unless rules.eid.enabled / delivery.holiday.enabled) · SIM-F-019
- ok 2. open /bn · SIM-F-025, SIM-F-047
- ok 3. open /bn/search · SIM-F-025, SIM-F-047
- ok 4. open /bn/bag · SIM-F-025, SIM-F-047
- ok 5. open /bn/checkout · SIM-F-025, SIM-F-047
- ok 6. open /bulk-order → 404 (unless orders.bulkLane.enabled) · SIM-F-023
- skip 7. open /bulk-order (when orders.bulkLane.enabled) · SIM-F-023 (switch orders.bulkLane.enabled is off)
- ok 8. open /account/login · SIM-F-039
- ok 9. open / · SIM-F-035, SIM-F-046
- ok 10. follow a[href^='/collections/'] · SIM-F-035, SIM-F-046
- skip 11. follow a.pcard-lnk · SIM-F-035, SIM-F-046, SIM-F-034 (nothing matches a.pcard-lnk (the shop has none yet))

## gate-admin · phone — pass

- ok 1. open /admin/messages/journey · SIM-F-011, SIM-F-013, SIM-F-025, SIM-F-052, SIM-F-053
- ok 2. open /admin/messages/templates · SIM-F-013, SIM-F-052, SIM-F-053
- ok 3. open /admin/orders · SIM-F-020
- ok 4. open /admin/orders/packing · SIM-F-006, SIM-F-010
- ok 5. open /admin/orders/returns · SIM-F-021, SIM-F-022
- ok 6. open /admin/orders/risk-rules/checkout · SIM-F-016, SIM-F-043
- ok 7. open /admin/reports/delivery · SIM-F-017, SIM-F-018, SIM-F-027
- ok 8. open /admin/support/rider-issues · SIM-F-017, SIM-F-054
- ok 9. open /admin/money · SIM-F-028, SIM-F-041
- ok 10. open /admin/money/refunds · SIM-F-041, SIM-F-054, SIM-F-056
- ok 11. open /admin/customers · SIM-F-054
- skip 12. follow [data-testid=cus-row] a[href^='/admin/customers/'] · SIM-F-054 (nothing matches [data-testid=cus-row] a[href^='/admin/customers/'] (the shop has none yet))
- skip 13. follow [data-testid=cus-wallet-open] · SIM-F-054 (step 12 found nothing)
- ok 14. open /admin/combos?tab=fixed · SIM-F-051
- ok 15. open /admin/delivery/settings · SIM-F-019, SIM-F-047, SIM-F-048
- ok 16. open /admin/support/settings · SIM-F-046
- ok 17. open /admin/rules/eid · SIM-F-019
- ok 18. open /admin?home=1 · SIM-F-032, SIM-F-034, SIM-F-057
- ok 19. open /admin/support · SIM-F-012, SIM-F-024, SIM-F-055

## gate-admin · desktop — pass

- ok 1. open /admin/messages/journey · SIM-F-011, SIM-F-013, SIM-F-025, SIM-F-052, SIM-F-053
- ok 2. open /admin/messages/templates · SIM-F-013, SIM-F-052, SIM-F-053
- ok 3. open /admin/orders · SIM-F-020
- ok 4. open /admin/orders/packing · SIM-F-006, SIM-F-010
- ok 5. open /admin/orders/returns · SIM-F-021, SIM-F-022
- ok 6. open /admin/orders/risk-rules/checkout · SIM-F-016, SIM-F-043
- ok 7. open /admin/reports/delivery · SIM-F-017, SIM-F-018, SIM-F-027
- ok 8. open /admin/support/rider-issues · SIM-F-017, SIM-F-054
- ok 9. open /admin/money · SIM-F-028, SIM-F-041
- ok 10. open /admin/money/refunds · SIM-F-041, SIM-F-054, SIM-F-056
- ok 11. open /admin/customers · SIM-F-054
- skip 12. follow [data-testid=cus-row] a[href^='/admin/customers/'] · SIM-F-054 (nothing matches [data-testid=cus-row] a[href^='/admin/customers/'] (the shop has none yet))
- skip 13. follow [data-testid=cus-wallet-open] · SIM-F-054 (step 12 found nothing)
- ok 14. open /admin/combos?tab=fixed · SIM-F-051
- ok 15. open /admin/delivery/settings · SIM-F-019, SIM-F-047, SIM-F-048
- ok 16. open /admin/support/settings · SIM-F-046
- ok 17. open /admin/rules/eid · SIM-F-019
- ok 18. open /admin?home=1 · SIM-F-032, SIM-F-034, SIM-F-057
- ok 19. open /admin/support · SIM-F-012, SIM-F-024, SIM-F-055

