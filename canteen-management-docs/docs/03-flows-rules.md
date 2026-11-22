# Canteen Menu and Queue Management System — Flows, Rules, and Tests

This document defines how students, counter staff, kitchen staff, and administrators use the application. Implement these rules consistently across every screen.

## 1. Main flow: online student order

1. Student opens Home (`/`) and selects View Menu.
2. Student browses `/menu`, searches or filters items, and adds available items to the cart.
3. Student signs in with email and password if needed, opens `/cart`, checks quantities and total, then continues to `/checkout`.
4. Student provides required student name and email and submits the order.
5. The backend checks that the canteen is Open, re-validates item availability and prices, and uses a safe database transaction to create the order as Placed, assign a unique date-prefixed daily token, record source as `online`, and add it to incoming orders awaiting acceptance. A retried submission uses the same request identity to avoid duplicate creation.
6. Student is sent to `/orders/:orderId` and sees the token and current status.
7. Staff reviews the new order and accepts or rejects it.
8. If accepted, the backend records `accepted_at` and kitchen staff sees it in the Accepted column.
9. Kitchen staff start the oldest Accepted order by `accepted_at ASC, queue_sequence ASC` when no other order is Preparing, then mark it Ready when finished.
10. Student sees Ready, pays at the counter during collection, and receives the order.
11. Authorized staff marks the order Collected after handover. It leaves the active queue, remains in order history, and its stored total contributes to sales statistics.

## 2. Main flow: walk-in/counter order

1. Student visits the canteen counter and tells staff the requested items.
2. Staff opens `/staff` and selects Add Walk-in Order.
3. Staff enters a customer name or counter reference, selects available items and quantities, reviews the total, and creates the order.
4. The backend validates the order and creates it with source `walk_in` and status Placed, allocates a date-prefixed token from the same daily sequence through the shared safe transaction, and adds it to incoming orders awaiting acceptance. A retried creation request must not create a duplicate order.
5. Staff gives the token to the customer (printed or spoken; printing is not required for the MVP).
6. Staff explicitly accepts the Placed order, recording `accepted_at`. Creating a walk-in order does not automatically accept it.
7. Kitchen staff process it through Accepted → Preparing → Ready using the same `accepted_at ASC, queue_sequence ASC` priority and single Preparing slot as online orders.
8. The customer pays during collection. Staff marks the order Collected after handing it over.
9. The order remains in history and contributes to collected-order sales statistics.

## 3. Main flow: menu management

1. Admin signs in and opens `/admin`.
2. Admin adds or edits food categories and food items with name, description, category, price, image (optional), and availability.
3. The system validates the data and saves it.
4. The menu reflects the change for future orders.
5. If an item becomes unavailable, students cannot add it to a cart or submit an order containing it.
6. Existing orders retain the item name and unit price captured when the order was created.
7. Archiving a food item or category preserves all historical orders and their item snapshots. Collected, Cancelled, and Rejected orders remain in the database.

## 4. Order statuses and allowed transitions

Primary status flow:

`Placed → Accepted → Preparing → Ready → Collected`

Alternative terminal outcomes:
- `Placed → Rejected`
- `Placed → Cancelled`
- `Accepted → Cancelled` only if preparation has not started and authorized staff permits it.
- `Preparing → Cancelled` is not allowed in the MVP; staff must resolve it operationally rather than silently removing it.
- `Ready → Collected`

Rules:
- Status must never move backwards.
- `Rejected`, `Cancelled`, and `Collected` are terminal statuses.
- Only staff/admin may Accept or Reject a Placed order.
- Both online and walk-in orders are created as Placed. Acceptance is an explicit staff/admin action for either source.
- Only kitchen staff/admin may move Accepted → Preparing → Ready.
- Starting preparation must atomically check that the order is the oldest Accepted order by `accepted_at ASC, queue_sequence ASC` and that no other order is Preparing.
- Authorized staff/admin may mark Ready → Collected after handing over the order. Ready orders remain visible until this transition is recorded.
- A student may request cancellation only while status is `Placed`. If accepted before the request is processed, cancellation is no longer available to the student.
- Every status change records who changed it and when.
- Staff rejection and cancellation require a reason. Payment is made at the counter during collection. Sales statistics count stored totals of Collected orders only.
- Do not allow two users to overwrite each other's status changes silently; use a database update that checks the current status.

## 5. Queue and token rules

1. Online and walk-in orders use one shared queue.
2. Each successfully created order receives a mandatory date-prefixed daily token, for example `20261118-041`. Use the full token consistently across screens and retained history.
3. The numeric sequence restarts for each canteen business day. Its timezone and cutoff remain open in section 12. The backend determines the business date.
4. Both sources allocate tokens through one safe database transaction. Concurrent requests must never produce duplicate full tokens. Order creation, item snapshots, and token allocation succeed together.
5. A full date-prefixed token is never reassigned after collection, cancellation, rejection, or a business-day change. Database uniqueness must enforce this. The numeric suffix can repeat on a different business date.
6. Preparation queue order is FIFO among Accepted orders by `accepted_at ASC, queue_sequence ASC`.
7. Rejected and cancelled orders do not occupy an active queue position.
8. Collected orders are removed from the active queue but remain in history.
9. Staff filters (Online, Walk-in, status) must not change the underlying queue order.
10. The MVP does not provide a priority queue. If the college later requires priority handling, document and approve that rule before implementation.
11. Staff acceptance records a trusted `accepted_at` timestamp, which is preserved afterward. The earliest acceptance timestamp has priority, with `queue_sequence` resolving ties. Placed orders await staff review and have no preparation queue position.
12. The kitchen processes one order at a time. At most one order may have Preparing status across all kitchen sessions. Ready orders do not occupy the preparation slot, so the next eligible order may start before collection.
13. Enforce the single Preparing slot and oldest-Accepted check atomically in the database/backend. Two concurrent Start Preparing requests must not start two orders or bypass an older Accepted order.

## 6. Estimated waiting time

- Show an estimate only for active orders.
- Initially show an approximate queue-based wait using eligible orders ahead and a simple preparation-time baseline, with preparation capacity fixed at one order at a time. The baseline and detailed treatment of Placed orders remain open in section 12.
- Item-specific preparation estimates are optional for later refinement. Do not present false precision. If the baseline cannot be used or data is unavailable, show “Wait time unavailable” as an error/fallback state.
- Label the value clearly: “Estimated wait — may change.”
- Recalculate when orders are accepted, started, marked ready, cancelled, rejected, or collected.
- The estimate is informational and is not a guaranteed pickup time.
- Ready orders show Ready for collection and no remaining preparation wait. Collected, Cancelled, and Rejected orders show no active waiting estimate.

## 7. Menu and pricing rules

Phase 6 implements public browsing and an in-memory cart only. Active categories determine public catalogue visibility even for an administrator; unavailable foods remain visible. Catalogue refresh retains cart quantities and saved prices, flags price changes, and marks hidden/out-of-stock lines. Add/increase actions validate against the latest successfully fetched catalogue and pause while reads are pending/failed. Decrease/removal remain available. No order/checkout logic or realtime catalogue subscription is introduced. Backend checkout revalidation below remains mandatory for its future phase.

- Only available items can be added to a cart or submitted.
- Quantity must be a positive whole number.
- Price must be non-negative.
- The server/database is the source of truth for price and availability at checkout.
- The order stores a snapshot of item name, unit price, and quantity at order time.
- Later menu edits must not change the total of an already-created order.
- Food item/category archiving must never delete historical orders or order item snapshots. Avoid cascading deletion from catalogue data into order history.
- If an item becomes unavailable while it is in a student's cart, checkout must stop and identify the unavailable item.
- The cart cannot be submitted when empty.

## 8. User access and privacy rules

- Use Supabase Auth email/password authentication. Students can register with required name, email, and password.
- Every newly registered account receives only the Student role by default. Self-registration and user-editable profile data must never grant staff, kitchen, or admin permissions.
- Online orders require student name and email and belong to the authenticated student. Walk-in orders require a customer name or counter reference and can exist without a student account.
- Students can read public menu data and only their own private order details.
- Staff can access operational order data needed to process orders.
- Kitchen staff can view order contents and update preparation statuses, but cannot manage menu prices or user roles.
- Only an authorized admin can manage menu items, categories, canteen Open/Closed status, staff account creation, and elevated role assignments.
- Staff account creation uses a secure admin-authorized server-side operation. Use Supabase Auth for credentials and never expose stored passwords or privileged credentials. Initial administrator setup and staff onboarding details remain open in section 12.
- Public queue display must show tokens and statuses only; do not show phone numbers, email addresses, or unnecessary personal data.
- Enforce permissions in database policies/server operations, not only in the frontend.
- Never store passwords in application tables or expose credentials in source code.
- Keep service-role secrets on the server; never expose them in browser code.

## 9. Error and edge-case rules

- Duplicate submit: disable the submission action while creating an online or walk-in order and use a safe unique request/idempotency strategy so double-clicks and retries do not create duplicate orders.
- Concurrent token creation: allocate the daily sequence and date-prefixed token using a database-safe transaction and uniqueness constraint shared by both order sources.
- Concurrent preparation: atomically enforce the oldest-Accepted check and single Preparing slot. A conflicting action retains the stored order state and returns a useful retry/refresh message.
- Canteen closed: admin manually controls Open/Closed status. The backend blocks new online orders while Closed and explains the reason. The closed-state walk-in policy remains open in section 12.
- Item becomes unavailable: revalidate at checkout and prevent submission.
- Network loss: show a connection/error message; do not claim an order succeeded until the server confirms it.
- Student loses the tracking page: allow them to reopen the order from My Orders after signing in.
- Staff action fails: retain the current status and show a retryable error.
- Unauthorized access: show an access-denied page and do not reveal protected order details.
- Empty queue: show a friendly message rather than a blank dashboard.

## 10. Test checklist

### Student and menu tests
- [ ] Student can register and sign in with email/password and required name/email.
- [ ] Every self-registered account receives only Student access, including when elevated role data is submitted maliciously.
- [ ] Home page loads and shows canteen status.
- [ ] Menu shows item names, categories, prices, and availability.
- [ ] Search returns matching items.
- [ ] Category filter shows only items in that category.
- [ ] Unavailable item cannot be added to cart.
- [ ] Cart quantity and total update correctly.
- [ ] Empty cart cannot be checked out.
- [ ] Checkout rejects missing required student details.
- [ ] Checkout requires student name and email.
- [ ] Admin setting Closed blocks new online orders in the backend, including direct submission requests.
- [ ] Checkout rechecks current price and availability.
- [ ] Successful online order gets one unique token.
- [ ] Tokens include the business-date prefix and daily sequence, for example `20261118-041`.
- [ ] Double-clicking Place Order does not create duplicate orders.
- [ ] Student can view their own order status.
- [ ] Student cannot view another student's private order.

### Staff, kitchen, and queue tests
- [ ] Staff can create a walk-in order.
- [ ] Walk-in creation requires customer name or counter reference and produces Placed status.
- [ ] Walk-in orders require explicit acceptance before kitchen preparation.
- [ ] Retrying the same online or walk-in creation request returns one order and one token.
- [ ] Walk-in order receives a token from the same sequence as online orders.
- [ ] Accepted online and walk-in orders appear in one FIFO preparation queue ordered by `accepted_at ASC, queue_sequence ASC`.
- [ ] Staff can accept a Placed order.
- [ ] Staff can reject a Placed order with a reason.
- [ ] Kitchen can move Accepted → Preparing → Ready.
- [ ] Start Preparing selects the oldest Accepted order by `accepted_at ASC, queue_sequence ASC`, including when acceptance order differs from creation order.
- [ ] Equal acceptance timestamps use `queue_sequence ASC` as the stable tie-breaker.
- [ ] Placed orders have no preparation queue position and do not block the oldest Accepted order.
- [ ] Concurrent kitchen actions cannot produce more than one Preparing order.
- [ ] A Ready order can await collection while the next eligible order starts preparation.
- [ ] Ready orders remain visible until authorized staff/admin records Collected after handover.
- [ ] Invalid backward status transition is blocked.
- [ ] Student, staff, kitchen, and public display show consistent status.
- [ ] Collected order leaves active queue but remains in history.
- [ ] Cancelled/rejected orders do not occupy active queue positions.
- [ ] Queue display does not reveal student contact details.
- [ ] Concurrent order creation does not generate duplicate tokens.
- [ ] A new business day restarts the numeric sequence with a new date prefix and preserves all previous tokens.
- [ ] Collected, Cancelled, and Rejected orders never have their full tokens reassigned.
- [ ] Approximate queue-based waiting time is labelled as changeable and updates after queue/status changes.

### Admin, responsive, and deployment tests
- [ ] Admin can add and edit a menu item.
- [ ] Admin can add, edit, and manage/archive categories.
- [ ] Archiving a food item or category preserves Collected, Cancelled, and Rejected orders and their snapshots.
- [ ] Admin can manually set Open/Closed status and public screens reflect the change.
- [ ] Only an authorized admin can create staff accounts and assign elevated roles.
- [ ] Staff management never reveals stored passwords or privileged credentials.
- [ ] Sales sum stored totals of Collected orders only. All other statuses contribute no sales, and retrying collection cannot double-count an order.
- [ ] Admin can change availability and unavailable items disappear/disable in ordering.
- [ ] Existing order price remains unchanged after a menu price edit.
- [ ] Student cannot access staff, kitchen, or admin actions.
- [ ] Staff cannot access admin-only menu/role management.
- [ ] Student menu and checkout work on a phone-sized screen.
- [ ] Staff dashboard works on a tablet/desktop.
- [ ] Queue display is readable on a large screen.
- [ ] Loading, empty, and error states are understandable.
- [ ] Deployed app works using its public URL, not only localhost.

## 11. Definition of done

The MVP is ready for demonstration when:
1. Online and walk-in orders both work.
2. Both order sources share one queue and one token-generation mechanism.
3. The main order status flow works end to end.
4. Students can track their own orders.
5. Staff and kitchen dashboards update the same order records.
6. Admin can manage menu items, categories, availability, Open/Closed status, and secure staff account/role management.
7. Role permissions and public-display privacy rules are enforced.
8. The test checklist has been run, with failures documented and fixed or clearly disclosed.
9. The deployed URL opens successfully on a phone.
10. Tokens use the agreed business-day boundary, daily sequence, mandatory date prefix, safe allocation transaction, and permanent uniqueness across history.
11. Both sources start as Placed, require explicit acceptance, and share FIFO preparation by `accepted_at ASC, queue_sequence ASC` with at most one Preparing order.
12. Approximate queue-based waits are clearly labelled as changeable. Sales count Collected orders only, and catalogue archiving preserves historical orders.

## 12. Remaining decisions and consistency review

The user approved the React + Vite + TypeScript + Tailwind CSS + Supabase architecture and product decisions on 18 November 2026. Application coding awaits a separate explicit approval after this documentation update.

The approved decisions resolve the earlier conflicts about optional date prefixes, walk-in acceptance, category-management scope, parallel preparation, and the Ready-to-history shortcut. The daily numeric suffix may repeat across dates. The full date-prefixed token is never reused. Completed orders mean Collected orders throughout these documents.

The user resolved preparation priority on 19 November 2026. Accepted orders use `accepted_at ASC, queue_sequence ASC`, with the earliest acceptance first. Placed orders await review and have no preparation queue position. This confirmed rule is stated consistently across the brief, screens, AGENTS.md, and database guide.

The following details remain unresolved and must not be silently treated as approved requirements.

| Detail | Remaining decision |
|---|---|
| Business day | Confirm the canteen timezone and the time at which its business day changes. Asia/Kolkata and midnight are possible choices, pending confirmation. |
| Closed-state walk-in orders | Decide whether staff/admin may create walk-in orders while Closed. Online order creation is already explicitly blocked. |
| Waiting-time baseline | Choose an approximate per-order preparation time and how to count Placed orders and partially prepared work in estimates. Capacity is fixed at one Preparing order. |
| First administrator | Choose a secure initial administrator provisioning process, since public registration grants only Student access. |
| Account onboarding | Existing hosted settings require email confirmation. Basic password recovery is implemented in `04-authentication.md`; completed live email flows require verification. Confirm SMTP delivery and how admin-created staff securely set their passwords. Passwords and privileged credentials must not be exposed. |
| Checkout price changes | Decide whether a changed price requires a revised-total confirmation before order creation. Backend price revalidation is mandatory. |
| Category archiving | Phase 6 hides archived categories and their items from the public catalogue. Decide whether future admin archiving must first require item reassignment. Historical orders always remain intact. |
| Sales reporting dates | Decide whether date-filtered sales use collection date or creation date. Only Collected orders contribute to sales in either case. |
| Uncollected and overnight orders | Define handling of Ready orders left at closing or across the business-day boundary. Their recorded full tokens remain unique and retained. |
| Optional interface details | Confirm order notes, menu-image upload workflow, featured-item selection, and whether operating hours are editable. These are not newly approved features. |

No unresolved contradiction was found among the approved rules after this update. The table records remaining specification gaps. Before application coding, obtain the user's requested next approval and resolve any gap required for the implementation task at hand.
