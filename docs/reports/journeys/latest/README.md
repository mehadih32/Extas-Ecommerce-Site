# Journeys — PASS

2026-11-06 06:23 (Asia/Dhaka) · https://new.extas.com.bd · run now · b5bbe1ad07ce

8 journeys (journey × screen), 0 failed; 58 steps, 4 skipped.

UI checks: off.

## customer · phone — pass

- ok 1. open /
- ok 2. follow a[href^='/collections/']
- skip 3. follow a.pcard-lnk (nothing matches a.pcard-lnk (the shop has none yet))
- skip 4. click .size-pill:not(.out):not([disabled]) (step 3 found nothing)
- ok 5. open /search
- ok 6. open /bag
- ok 7. open /checkout
- ok 8. open /account/orders/0
- ok 9. open /account/orders/0/invoice

## customer · desktop — pass

- ok 1. open /
- ok 2. follow a[href^='/collections/']
- skip 3. follow a.pcard-lnk (nothing matches a.pcard-lnk (the shop has none yet))
- skip 4. click .size-pill:not(.out):not([disabled]) (step 3 found nothing)
- ok 5. open /search
- ok 6. open /bag
- ok 7. open /checkout
- ok 8. open /account/orders/0
- ok 9. open /account/orders/0/invoice

## admin · phone — pass

- ok 1. open /admin?home=1
- ok 2. open /admin/products
- ok 3. open /admin/orders
- ok 4. open /admin/stock
- ok 5. open /admin/orders/packing
- ok 6. open /admin/reports/health
- ok 7. open /admin/reports/health/problems

## admin · desktop — pass

- ok 1. open /admin?home=1
- ok 2. open /admin/products
- ok 3. open /admin/orders
- ok 4. open /admin/stock
- ok 5. open /admin/orders/packing
- ok 6. open /admin/reports/health
- ok 7. open /admin/reports/health/problems

## accountant · phone — pass

- ok 1. open /admin/money/books
- ok 2. open /admin/money/books?view=payments
- ok 3. open /admin/orders/packing/invoices
- ok 4. open /admin/money/costs
- ok 5. PUT /api/admin/health → 403
- ok 6. POST /api/admin/health → 403
- ok 7. PUT /api/admin/edge → 403
- ok 8. POST /api/admin/auth/totp → 403

## accountant · desktop — pass

- ok 1. open /admin/money/books
- ok 2. open /admin/money/books?view=payments
- ok 3. open /admin/orders/packing/invoices
- ok 4. open /admin/money/costs
- ok 5. PUT /api/admin/health → 403
- ok 6. POST /api/admin/health → 403
- ok 7. PUT /api/admin/edge → 403
- ok 8. POST /api/admin/auth/totp → 403

## warehouse · phone — pass

- ok 1. open /admin/stock
- ok 2. open /admin/stock/counts
- ok 3. open /admin/orders/packing/picking
- ok 4. open /admin/orders/packing
- ok 5. open /admin/orders/returns

## warehouse · desktop — pass

- ok 1. open /admin/stock
- ok 2. open /admin/stock/counts
- ok 3. open /admin/orders/packing/picking
- ok 4. open /admin/orders/packing
- ok 5. open /admin/orders/returns

