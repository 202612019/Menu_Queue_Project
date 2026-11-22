# Phase 7 hosted preflight checklist — prepared, NOT performed

This is a read-only comparison plan for the existing Phase 4 database, not
permission to contact hosted Supabase or apply a migration. No hosted state has
been inspected in this follow-up. Obtain separate approval before running the
report against the existing project. Do not run seed/test fixtures on hosted data.

`preflight_phase7.sql` contains only catalog/aggregate SELECTs inside a READ ONLY
transaction. It does not call checkout/token functions, simulate identities, change
settings or create orders. It reports evidence, not an automatic pass/fail verdict.
Successful execution alone does not certify readiness. If a prerequisite differs,
stop and review; do not silently repair or rerun the original migration.

## Before any hosted connection

- [ ] Select the existing intended Supabase project; compare its project reference
      with the configured frontend URL without copying keys into reports.
- [ ] Confirm a trusted migration owner will apply the reviewed new file. A browser
      role must not own the private schema, tables or security-definer functions.
- [ ] Confirm the Phase 4 initial migration was applied once. If it was run manually,
      reconcile CLI history before any later CLI push; do not let tooling replay it.
- [ ] Review/retain the database backup or recovery point appropriate to the project.
- [ ] Confirm authorization is for read-only preflight only. Migration application
      and real order testing remain separate approvals.

## Compare the read-only report with Phase 4

Reference: `migrations/20261119000100_initial_schema.sql`. Compare definitions, not
just table counts or object names. Unrelated platform objects need not be removed.

| Area | Expected prerequisite / stop condition |
|---|---|
| Eight public tables | `profiles`, `categories`, `menu_items`, `orders`, `order_items`, `order_status_history`, `daily_token_counters`, `canteen_settings` exist with RLS enabled and trusted owners. |
| Student profile | UUID `id` linked to Auth; `full_name`, `email`, protected text `role`; role check permits student/staff/kitchen/admin. Auth synchronization assigns Student and never trusts metadata roles. |
| Catalogue | UUID item/category IDs; `category_id` FK; `is_active`/`is_available` booleans; nonblank names; `price numeric(12,2)` nonnegative/non-NaN. |
| Orders | UUID owner/order IDs, source/name/status fields, `business_date`, positive `token_number`, full `token`, identity `queue_sequence`, `total_amount numeric(14,2)`, acceptance/creation/update timestamps. Match defaults, nullability and checks exactly. |
| Snapshots/history | `order_items` snapshot fields, positive integer quantity, generated decimal subtotal and unique `(order_id,menu_item_id)`; status-history old/new status, actor, reason and wall-clock timestamp. |
| Counters/settings | Counter date PK and nonnegative last number; singleton settings `id=1` with `is_open`. Missing settings blocks ordering; do not open or change the canteen during preflight. |
| Foreign keys | All eight Phase 4 relationships remain validated. Catalogue/order/history deletion restrictions preserve existing history; online orders require owners. |
| Token/queue indexes | Unique full token, date/number and identity sequence; `orders_accepted_time_idx` orders Accepted candidates by `(accepted_at,queue_sequence)`; partial unique `orders_single_preparing`. Do not replace with creation-time priority. |
| Triggers | Five updated-at triggers, `orders_initialize`, `orders_guard_update`, `orders_record_status`, and Auth's `canteen_auth_profile_sync` are enabled with the original function definitions. Extra order triggers require review for side effects. |
| Private dependencies | All seven original private helpers exist with the same signatures, owners, security modes and empty search paths. Inspect allocator, initialization and history bodies: transactional counter UPSERT, full token formatting, Placed-only creation and `auth.uid()` audit actor. |
| RLS | Compare all existing policy roles, commands and expressions with Phase 4. Owner-scoped Student reads remain; staff/kitchen/admin reads retain their intended scope. No anonymous write or direct authenticated order/item/history/counter write path. |
| Effective grants | `anon`/`authenticated` cannot directly write orders, lines, history or counters; neither can delete/truncate historical tables. Authenticated users may update only their own profile name, never email/role. Public menu/settings SELECT and RLS-controlled admin catalogue/settings updates remain intentional. |
| Service role | Trusted backend grants from Phase 4 remain: orders SELECT/INSERT/UPDATE, item SELECT/INSERT, history SELECT and sequence USAGE; no direct counter access, audit writes or deletion grants. It must not gain execution of the new checkout RPCs/helpers. Never expose its credential. |
| Foundation helper execution | Of the original private helpers, only `current_app_role()` is executable by `authenticated` for RLS. None is executable by `anon`/`service_role`. The allocator is not directly callable. |
| Built-ins/version | Required UUID and SHA-256 built-ins exist. Compare the hosted PostgreSQL version with the tested local version; do not assume a version from the table count. |
| New names absent | `canteen_private.order_requests` and all eight Phase 7 function names are absent, including conflicting overloads. Existing targets mean this is not a clean first apply: inspect history/drift instead of dropping objects. |
| Inheritance/default ACL | Browser roles are not members of trusted owner/BYPASSRLS roles. Inspect default grants for the applying owner; review any unexpected custom grantees not covered by the migration's explicit revocations. |
| Exposure/timeouts | Keep `canteen_private` outside Data API exposed schemas. A NULL database `pgrst.db_schemas` setting requires dashboard verification. Owner-session timeouts in the report are not necessarily PostgREST role timeouts; inspect those separately, without changing them. |
| Existing data | Save aggregate order/item/history counts. Counter-behind-order count should be zero; existing token uniqueness/history constraints remain valid. Existing orders are allowed and must not be cleared or reset. |

The new migration creates one private table and eight functions (three public RPCs
and five private helpers). It does not recreate any Phase 4 public table, change
existing policies, open the canteen, or create/backfill orders. If the prerequisites
match, apply only `20261122000100_student_checkout.sql` after separate approval.

## Prepared post-apply read-only verification (also not performed)

- [ ] Compare order/item/history baselines; applying the migration creates no orders.
- [ ] Verify the new table's PK `(user_id,request_id)`, unique order reference,
      deferred order FK, profile FK and RLS; no client policies or table/column grants.
- [ ] Inspect owners, definitions and empty search paths for all eight new functions.
- [ ] Verify effective EXECUTE for `anon`, `authenticated`, `service_role`:

| Function group | anon | authenticated | service_role |
|---|---|---|---|
| Three public checkout RPCs | Denied | Allowed; body must check Student identity | Denied |
| Five new private helpers | Denied | Denied | Denied |
| Existing `current_app_role()` | Denied | Allowed intentionally for RLS | Denied |
| Other six original private helpers | Denied | Denied | Denied |

- [ ] Confirm PUBLIC has no EXECUTE grant on these functions, including through
      defaults; inspect inheritance so direct revocations cannot be bypassed.
- [ ] Compare original table policies, direct-write restrictions and token/audit
      triggers again. No relaxation is expected.
- [ ] Confirm Data API function discovery without invoking creation. A missing RPC
      must not be worked around with direct browser inserts.
- [ ] Stop before live checkout: real JWT/API/browser order tests require approval.

## Rate-policy options — no policy selected or implemented

The current 20/50 limits are per order. A fresh UUID represents a new submission,
so idempotency alone does not limit intentional repeated orders. Possible choices:

| Option | Effect and tradeoff |
|---|---|
| Per-Student rolling window or token bucket | Limits new successful orders over time, optionally allowing a short burst. Helps against floods but may block legitimate repeat purchases. Window, allowance and burst size need agreement. |
| Maximum active orders per Student | Counts Placed/Accepted/Preparing/Ready; terminal orders no longer count. Controls outstanding work but can block a second purchase until collection, even after preparation finishes. |
| Combined time and active-order limits | Covers both rapid bursts and accumulated uncollected work. More restrictive, with more states and operational exceptions to explain. |
| Edge/IP request throttle | Can protect preview and malformed-request load as well as creation. Shared college Wi-Fi/NAT can penalize unrelated students; it should not replace user-based rules. Requires separately approved infrastructure/settings. |

If selected later, enforce the rule atomically on the server. Replays and result
lookups for an already committed request must still work without consuming a new
order quota. Decide separately whether rejected attempts count, which active states
count, whether privileged overrides exist, and how legitimate group purchases work.
Use a new reviewed additive migration for any database policy; leave existing
historical orders and RLS intact. This follow-up adds no limits or hosted settings.
