# Phase 7 — Student checkout and orders

This phase is implemented locally after explicit approval. The new migration has NOT been applied to hosted Supabase. No hosted order, SQL, canteen-setting change or deployment is authorized by this implementation. Existing hosted menu/auth configuration is preserved. Do not perform live order tests until separately approved.

## Confirmed rules

- Business date uses Asia/Kolkata with a midnight boundary, derived from the server clock at order insertion. Browser dates are not accepted.
- Maximum 20 units per item and 50 total units, enforced in the cart and RPC.
- Current prices must be explicitly reviewed. A later price/menu-detail change rejects creation and requires another review.
- Online orders are owned by the verified Student, start `placed`, and await explicit staff acceptance.
- Only Accepted orders enter preparation priority: `accepted_at ASC, queue_sequence ASC`. No preparation position or invented wait is shown for Placed orders.
- Payment is made at the counter on collection. There is no payment gateway or student cancellation in Phase 7.

## Database implementation

`supabase/migrations/20261122000100_student_checkout.sql` is additive. The applied initial migration, seed, existing grants/policies and token/status triggers remain unchanged.

| RPC | Inputs and result |
|---|---|
| `preview_online_order(p_items jsonb)` | Item UUIDs and quantities; returns database-priced lines, decimal total and review fingerprint. No order or token is created. |
| `place_online_order(p_request_id uuid, p_items jsonb, p_review_fingerprint text)` | Creates or replays one order; returns order ID, token, current status, saved total and submitted IDs/quantities. |
| `check_online_order_request(p_request_id uuid)` | Returns the caller's committed receipt, or null. Null does not prove that an overlapping uncommitted request failed. |

These public functions have restricted EXECUTE privileges for `authenticated` only. Their security-definer bodies independently verify `auth.uid()` and the current protected Student role. Internal helpers are not executable by clients. All objects are schema-qualified under an empty search path. The private request table has RLS enabled, no client table grants/policies, and remains outside exposed API schemas. Browser table inserts, updates and deletes are still forbidden for orders/items/history/counters.

New order validation requires the current profile's nonblank name/email. The customer name is copied from that locked profile. Email is validated through the Auth-synchronized profile and is not newly stored in orders. Recovery/replay still works for an existing order if the Student's display details later become incomplete; identity and Student role remain required.

Selections are canonicalized by UUID, reject duplicate IDs and unknown fields, and accept only positive whole-number quantities within the confirmed limits. Prices, totals, source, status, owner and date are not accepted from the browser. The review fingerprint is a comparison against a newly computed server quote, never an authoritative price or authorization credential.

For a new order, the RPC locks the Student profile, reserves the request, and takes shared locks on settings, menu rows and categories. Menu/category rows are locked in UUID order, with menu rows before categories. It then rechecks Open status, all requested items, current availability and active membership, and computes exact decimal line prices and totals. Shared locks conflict with administrative updates, so validation remains consistent until commit. Reassignment to an archived category is checked after the current menu row is locked.

`canteen_private.order_requests` has a primary key on `(user_id, request_id)`, canonical selection, review fingerprint and unique order ID. Its deferred foreign key requires a resulting order by commit. Concurrent identical requests wait on the same reservation and return the same committed receipt. Different contents under the same key fail with `REQUEST_CONFLICT`. The replay path precedes current canteen/catalogue checks, so a committed success stays successful after closing, archiving or repricing. Historical request records are retained and must not be reset to allow key reuse.

The existing order trigger allocates the date-prefixed daily token through the shared transactional counter, initializes creation time and writes the initial status history with `auth.uid()` as actor. Item snapshots come from the same locked server quote. The RPC checks both inserted line count and subtotal sum. Order, lines, audit, request record and counter update commit together or all roll back. Identity-sequence gaps after rollback are harmless; queue sequence is a stable tie-breaker, not the preparation priority or a gap-free token sequence.

## Frontend implementation

App remains mounted and owns cart, catalogue and checkout request state. Existing homepage/cart styling and all authentication callbacks/session/recovery logic are preserved. Cart growth is capped at 20/50, with server limits authoritative. Menu refresh also runs while checkout or the cart is open.

- Existing modal cart adds Continue to checkout; there is no duplicate cart state or new standalone `/cart` screen.
- `/checkout` uses the existing profile-ready route guard with Student role. Guests get a checkout-only internal login return destination; arbitrary return URLs are rejected. Ordinary login still opens Account, and recovery still opens Reset Password.
- Checkout automatically requests only a read/validation preview. It shows name/email, saved-versus-current price differences, current lines/total, counter-payment instructions and a required review checkbox. Place Order is an explicit button action. No React effect creates or retries orders.
- Known server validation failures preserve the cart, release the rejected request and allow review/retry. Price changes trigger a fresh preview and reset the checkbox.
- Before sending creation, the hook saves a frozen request to tab-local sessionStorage. It contains user ID, request UUID, item UUIDs/quantities, fingerprint and local cart-draft ID. No tokens, passwords or privileged keys are stored. Storage failures fail closed before submission.
- Transport timeouts, malformed receipts, request conflicts and unknown outcomes retain the same request ID and frozen input. Cart edits pause. Check order result performs a read-only lookup. A negative lookup keeps the request pending; Retry same submission reuses its original ID and contents. Both actions require an explicit click.
- Only a confirmed, matching receipt clears the submitted quantities. Later-added units remain. Account-scoped pending records and current-user checks prevent late results from changing another user's UI. A different account's cart draft is never cleared by an older request. Full reload still resets the browsing cart; pending request metadata remains recoverable in that tab and is never automatically sent.

`/my-orders` reads the caller's active orders and pages terminal history in groups of 20. `/orders/:orderId` reads the caller's order, saved line snapshots and status history. Explicit owner filters supplement RLS, and no current-menu join is needed for archived foods. Loading, empty, not-found, read failure, retry/refresh and timeouts are handled. Requests are aborted on navigation; late responses cannot expose the previous user's data. Status refresh is manual in this phase; realtime publications, ETA/queue-position APIs, staff/kitchen actions and cancellation remain future work.

## Files

- `src/lib/orders.js`: existing-client RPC calls, safe errors, exact monetary mapping and owner-filtered history reads.
- `src/hooks/useCheckout.js`, `src/utils/pendingOrder.js`: user-bound submission state, tab persistence, duplicate prevention and recovery.
- `src/pages/OrderPages.jsx`, `src/content/orders.js`: checkout/history/detail pages and centralized interface text.
- App/cart/grid/home/header: navigation, quantity guards and shared mounted state. The existing collapsed navigation now extends through tablet widths so the added My orders link does not crowd the header.
- `src/auth/returnTo.js`, route guard and LoginPage: allow only the internal checkout return path; AuthProvider, SDK configuration and recovery logic remain unchanged.
- `supabase/tests/checkout_checks.sql`, `checkout_concurrent.sql`, and local runner: actual RPC validation, rollback, roles, ownership, concurrent duplicates and controlled administrative races.
- `tests/checkout.test.jsx`, `tests/order-service.test.js`: component flows, pending recovery, API payload boundaries and snapshot reads. Existing 71 tests remain intact.
- `vitest.config.js`, `tests/setup.js`: bound JSDOM workers to two and asynchronous UI waits to three seconds to avoid CPU/memory contention during routing/session-restoration tests. Existing assertions are preserved.

No runtime dependencies, second client, frontend service-role credential, direct order inserts or existing-policy edits were introduced.

## Local verification

Run from the existing project folder:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
node supabase/tests/run-local.mjs
```

The PostgreSQL runner creates its own temporary loopback-only cluster and applies migrations in filename order. It uses fake users and simulated authenticated identities, runs original foundation checks, then actual checkout functions and concurrent transactions. Local fixtures change canteen/menu/profile values only inside that isolated cluster. Its server is stopped in a finally block. Windows may require running this test outside Codex's restricted token sandbox because PostgreSQL initdb cannot initialize there.

Verification results and remaining limitations are recorded after final checks. Hosted JWT/PostgREST behavior, real-browser visual layout, and live order placement are not claimed from these local SQL/JSDOM tests. The hosted project must receive this separately reviewed migration before live checkout is available; missing hosted RPCs show a safe Ordering is not available message without table-write fallbacks.

### Passed — 22 November 2026

- Full frontend suite: 94 tests in eight files, including all 71 original tests and 23 new checkout/service cases. Coverage includes required explicit review/no effect submission, known rejection/cart preservation, uncertain lookup and same-ID retry, reload recovery without automatic POST, double-click suppression, 20/50 UI limits, guest login return with the mounted App preserved, wrong-role guarding, late account-switch responses, storage failure, historical snapshot display, read errors/empty states, history pagination, and subtraction of only submitted units after later additions. Service cases check minimal RPC payloads, exact money conversion, safe error classification, stalled-transport timeout, user-bound storage validation and explicit owner filters without menu joins.
- Standalone TypeScript checks passed during implementation; the final production build reran both TypeScript projects and passed. Main JavaScript is approximately 545.30 kB minified / 157.10 kB gzip. Vite's existing non-fatal 500 kB chunk warning remains.
- Final isolated PostgreSQL suite passed the original schema, repeatable-seed, RLS, acceptance-priority, history-retention and mixed-source token tests, plus the new actual RPC checks. These include decimal arithmetic, valid 20/50 boundaries, over-limit/invalid selections, hidden/unavailable items, explicit price-review rejection, own-history isolation, different users sharing a request UUID without leakage, Student-only authorization (Staff/Kitchen/Admin rejected), missing identity/profile details, replay after closing/catalogue/profile-detail edits, no direct browser writes/private-table reads and forced post-header item-insert rollback.
- Eight concurrent local clients made 40 distinct actual Student requests, followed by 40 calls sharing two additional request IDs. Exactly 42 complete RPC orders, 42 unique tokens, 42 item rows and 42 initial audit rows resulted. The older mixed-source fixture additionally created 20 online/20 walk-in orders with shared unique tokens.
- Six controlled overlapping mutations passed: canteen closing, availability loss, repricing, category archiving, reassignment into an archived category, and Student-role revocation. The runner observed each actual RPC waiting on a database row lock before releasing the mutation. Each was then rejected with its expected safe error. Final counts proved that those rejections left no request/order/item/audit rows or consumed tokens.
- `git diff --check` passed. Source/Git review confirmed the applied initial migration, seed, verify SQL, existing AuthProvider/auth service/Supabase client, package files and existing RLS remain unchanged. There is one production client factory and no frontend direct order inserts or privileged key additions.

### Failed during development, resolved

The first local PostgreSQL attempt could not initialize under Windows' restricted sandbox token; the permitted outside-sandbox run used only an isolated local cluster and passed. An initial TypeScript nullable-client closure error was corrected. Two new component fixtures were corrected to use the existing access-denied text and a failure response consistent across StrictMode replays. Full-suite runs under concurrent database/JSDOM load exposed default one-second wait failures in existing auth callback tests; bounded workers/three-second asynchronous waits resolved them without changing those assertions or AuthProvider behavior. No test is skipped to hide a failure.

The existing real-SDK initialization-retry fixture may print a multiple-GoTrueClient warning because it intentionally simulates a fresh document owner. It passes with synthetic credentials and mocked HTTP; the production application still constructs one client.

### Unverified / not performed

- Hosted migration application, hosted settings, real order creation and live payment/collection were not attempted. They need separate approval.
- Full browser rendering/responsiveness, browser-network integration of the new RPCs, actual hosted JWT/PostgREST authorization and a browser-to-database end-to-end checkout were not verified. Component tests use JSDOM/mocked service boundaries; database tests use real PostgreSQL with local Auth stubs, not a hosted JWT gateway.
- Staff acceptance, preparation, collection, realtime subscriptions, queue-position/ETA calculation and cancellation are not Phase 7 features. They are not claimed as implemented or tested here.

No outstanding failed local check remains. Stop at this local checkpoint and obtain approval before applying the new migration or testing live orders.

## Security-review follow-up — local test expansion

The read-only review found no Critical/High defect and conditionally approved the
additive migration against its original Phase 4 prerequisites. This follow-up adds
test coverage, not new ordering behavior or rate limits. See
[`supabase/hosted-preflight.md`](../../supabase/hosted-preflight.md) for the prepared
read-only comparison and possible rate policies. It has NOT been performed on the
hosted project. Its companion SELECT-only report was executed on the isolated
local Phase 4 baseline before applying the unchanged Phase 7 migration.

`checkout_privileges.sql` covers all fifteen application functions: three public
RPCs, five Phase 7 private helpers and seven Phase 4 private helpers. It checks all
45 effective EXECUTE combinations for anon/authenticated/service_role, rejects
PUBLIC execution, verifies security mode/owner/empty search_path, and checks every
private helper is represented. The existing `current_app_role()` remains the one
intentional authenticated-only private execution grant for RLS; it returns only
the caller's role. All other private helpers are denied. Direct permission probes
verify 42501 for prohibited callable helpers/public RPCs; trigger-only helpers are
checked through their ACL because ordinary SQL is not a valid trigger context.
Private idempotency-table checks cover table and column privileges, RLS/no-policy
state, and denied SELECT/INSERT/UPDATE/DELETE for all three roles, including the
BYPASSRLS service role. No service key is used.

`checkout_idempotency.sql` first creates one successful fixture request and records
the full persisted order/items/history/request/counter snapshot. Identical input
and reordered-but-equivalent input must return its exact original receipt. Changed
quantities, replacement item IDs, removed lines and added lines must all fail with
REQUEST_CONFLICT using either the old fingerprint or a valid new server quote.
Changed fingerprints are rejected as well. Subsequent recovery/original replay
must still return the original order. Exact persisted snapshot equality and
explicit counts prove one order/token/request, two original lines and one initial
history entry, without a counter increment or mutation. The original concurrent
tests and controlled races remain in the complete suite.

No rate or active-order limit has been selected. The checklist compares rolling
windows/token buckets, active-order caps, combined rules and IP/edge throttling,
including legitimate repeat-purchase/shared-Wi-Fi effects. Any later rule must
preserve successful replay/recovery without charging another order quota. The
existing 20-per-item/50-total caps remain unchanged.

Follow-up results on 22 November 2026:

- Complete isolated PostgreSQL suite passed on the first expanded run, including
  the read-only report on the original Phase 4 baseline, all privilege/idempotency
  checks, original schema/RLS/history/token tests, 40 distinct + 40 duplicate RPC
  calls (42 complete orders), mixed-source allocation and six controlled row-lock
  races. The temporary server stopped afterward. No hosted project was contacted.
- All 94 frontend tests in eight files passed; both TypeScript projects passed
  standalone checks and the production build. No frontend assertions were removed
  or changed for this follow-up. The existing non-fatal 545.30 kB bundle-size
  warning and synthetic SDK-retry fixture warning remain; neither is a failure.
- SHA-256 hashes for both migrations, seed and original verify SQL exactly match
  the pre-follow-up hashes. The reviewed Phase 7 migration remains
  `90E727661FBB3A590A9A6114356BC369ACE1F26819CEED50BC51B442C25122E1`.
  No genuine security defect required changing migration behavior or RLS.
- `git diff --check` passed. No rate limit, application change, dependency, remote,
  deployment, hosted setting, live order or real Auth request was introduced.

Failed local checks: none in this follow-up. Unverified: actual hosted schema,
owners/default grants/role inheritance/API exposure/version and browser-to-hosted
JWT/PostgREST ordering. The prepared checklist is evidence to collect after
authorization, not a claim that those hosted checks already passed.
