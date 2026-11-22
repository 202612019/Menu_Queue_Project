# Phase 6 — Live menu integration

The Phase 6 implementation and verification below are historical. Phase 7 adds local checkout/history and quantity limits, documented in `06-checkout-orders.md`; its additive migration is not yet applied to hosted Supabase. Saved cart prices still never silently change on catalogue refresh. Current server prices are separately reviewed at checkout.

The user approved this implementation after inspection. Application files remain JSX/JavaScript, checked by TypeScript. Existing homepage structure, responsive grid, hero, header/footer, authentication, and mounted App/cart are preserved. This phase introduces no orders, checkout, database writes, hosted configuration changes, or deployment.

## Data and mapping

`src/lib/menu.js` imports the existing singleton from `src/lib/supabase.js`. It reads explicit public columns from `categories` and `menu_items`. Categories are filtered by `is_active = true`; foods are not filtered by availability. Results are ordered by name because the schema has no display-order column. The adapter also filters item membership in active categories, so administrator read permissions cannot reveal archived categories in the public homepage. Existing RLS permits anonymous/authenticated reads of active categories and their foods, including unavailable foods. No policies changed.

| Database field | Frontend field / use |
|---|---|
| `categories.id` (UUID) | Category filter ID; joins to food `category_id`. |
| `categories.name` | Category chip text and food category label. |
| `categories.is_active` | Public catalogue membership. |
| `menu_items.id` (UUID) | Card key and cart identity. |
| `menu_items.category_id` | `categoryId`; resolves display `category`. |
| `menu_items.name` | `name`, name search, generated image alternative text. |
| `menu_items.description` | `description`. |
| `menu_items.price` (`numeric(12,2)`, rupees) | Parsed once into integer `pricePaise`. |
| `menu_items.image_url` (nullable) | `image`; resolved by shared image component. |
| `menu_items.is_available` | `available`; Out of stock label and disabled Add. |

There is no database `image_alt`, item archive flag, or sort-order column. A food is hidden when absent from the returned catalogue or under an inactive category. `is_available = false` means visible but out of stock. Foreign keys and historical order snapshots remain unchanged.

Decimal price strings/numbers are parsed into whole rupees and two fractional digits. Invalid, negative, over-precision, and unsafe values reject the read rather than inventing a price. `0.29` becomes 29 paise, `47.50` becomes 4750, and the schema maximum remains within JavaScript's safe integer range. Card/cart formatting and totals consume paise; they never reconvert catalogue prices. The existing formatter may display `₹47.5` rather than `₹47.50`.

HTTP/HTTPS image URLs remain absolute, leading-slash paths remain origin-relative, and ordinary relative paths resolve against Vite's base URL rather than the current route. Missing, unsupported-scheme, and failed images show a neutral placeholder with the original image space. Shared handling applies to cards and cart. Photos remain illustrative.

## Loading and cart rules

`useMenu` owns one catalogue in the stable App. It loads on entering the homepage, refreshes when that page regains browser focus/visibility, and supports Refresh menu/Retry. A 15-second timeout produces a retryable error. Superseded/unmounted requests are aborted; late results cannot replace a newer response, including StrictMode effect replay. Cached cards remain visible if refresh fails, with an error and disabled additions.

The HomePage retains its name search, trimming and case-insensitive matching. Search and category-ID conditions must both match. Clear filters restores All and empty search. An archived selected category falls back to All. Empty catalogue, empty category, and no matching search have distinct messages. The five seeded category chips plus All and all eight seeded cards are supported; Veg Burger stays visible but unavailable.

Cart lines hold snapshots keyed by database UUID. New lines use the current fetched item, not a stale card's submitted price/availability. Existing line quantities and saved unit prices survive catalogue refresh and client navigation. A different current price produces a warning showing both prices; additions to an existing line keep its saved price and warning. No automatic repricing or line deletion occurs. To select the current price, a user may remove the old line and add it again. Totals remain provisional; ordering is unavailable.

Both Add and quantity increase check current catalogue membership/availability. All additions/increases pause while loading or after an error; decrease and confirmed removal remain possible. Hidden/out-of-stock lines retain their saved totals and show warnings. Full document reload still clears the in-memory cart. Authentication persistence behavior is unchanged.

Latest fetched data is not a guarantee against a concurrent database edit. No realtime subscription is added; the future order backend must check current availability, active-category membership, and prices atomically at checkout. Checkout price-change confirmation and other future MVP decisions remain open.

## File map

- `src/lib/menu.js`: public read queries and fixed, safe error messages.
- `src/lib/menuModel.js`: field mapping, active-category membership, exact price parsing, JSDoc types.
- `src/hooks/useMenu.js`: shared asynchronous state, refresh, cancellation, retry, timeout.
- `src/utils/menuImage.js`, `src/components/MenuImage.jsx`: shared URL handling and image fallback.
- App, HomePage, CategoryFilter, FoodGrid, FoodCard, CartPanel: connect existing design and cart to the shared catalogue.
- `src/content/home.js`: centralized menu/loading/cart-warning text.
- `tests/menu-service.test.js`, `tests/menu.test.jsx`, `tests/fixtures/menu.js`: menu boundary and interaction regressions.
- Existing auth component/SDK tests: isolate menu reads with deterministic catalogue fixtures so they do not contact hosted services.

`src/content/foodItems.js` remains as the original labelled Phase 3 fixtures/shared JSDoc definitions; the production homepage no longer imports its hardcoded dishes. The development-only connection test remains intentionally availability-filtered (five categories/seven available items), separate from the production menu's eight items.

## Verification — 22 November 2026

Read-only execution of the actual `readMenu` function through Vite's module loader successfully fetched five categories and eight items from hosted Supabase using the existing client and public configuration. Veg Burger returned unavailable at 6500 paise; the other seven foods returned available with their expected prices. No browser session, email, privileged key, database write, migration, seed, policy, or hosted setting was used/changed by this check. An initial sandbox-network attempt failed; the permitted read-only retry succeeded.

All 71 frontend tests across six files passed: the existing 43 authentication/homepage regressions plus 28 menu service/interaction cases. Coverage includes all five categories/eight foods, unavailable Veg Burger, trimmed case-insensitive search and combined filtering, quantity bounds/totals/removal, the exact mounted App node across navigation, changed-price warnings without repricing, hidden/out-of-stock quantity blocking, cached-data errors and Retry, initial loading/failure, empty catalogue/category/search, image resolution/fallback, decimal precision, active-category filtering, stale responses, StrictMode cancellation, focus refresh, and stalled-request timeout/retry. Fixtures simulate changes and failures without editing hosted data. Existing authentication regressions continue to use simulated HTTP/credentials only.

The first run passed 69/70 cases; a new test incorrectly expected two fixed decimal places from the unchanged currency formatter. Its assertion was corrected to the existing display format. A subsequent run passed 70/71 but hit the default five-second timeout in the long cart/navigation scenario under parallel test load. The two multi-action integration scenarios now have a 15-second per-test allowance; no application behavior was changed to hide a failure. The final complete run passed 71/71.

Standalone TypeScript checks passed during implementation. The final production build reran both TypeScript projects successfully and built all assets. The existing non-fatal bundle warning remains: main JavaScript about 524.32 kB minified / 151.64 kB gzip. No packages were added. Source review and Git diff confirmed a single production client factory in the unchanged `src/lib/supabase.js`, no authentication-source changes, and no migration/seed/RLS/package-file changes. `git diff --check` passed.

Chrome inspection was attempted using the computer-use skill. The tool stopped because it could not determine the current browser URL confidently enough to enforce its policy. No subsequent browser input was attempted. Therefore full-browser layout/responsive behavior, live browser request delivery, and real-browser cart navigation/refresh/error interactions remain unverified in this phase; JSDOM interactions and the separate live service read are not substitutes for that verification. Prior Phase 3 browser observations are historical, not new Phase 6 results.

The local development server started at `http://127.0.0.1:5173/`. HTTP checks returned 200 for the homepage, transformed HomePage/useMenu/menu modules, and the Veg Burger image, with no Vite compilation-error response. These are delivery checks, not browser-rendering checks.

Run `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run build`. Start locally with `npm.cmd run dev`; use the Local URL printed by Vite. No new packages are required.
