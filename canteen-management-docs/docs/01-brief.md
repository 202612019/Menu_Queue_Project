# Canteen Menu and Queue Management System — Project Brief

## 1. Project overview

The Canteen Menu and Queue Management System is a responsive web application for a college canteen. It allows students to browse the food menu, place online orders, receive a token, and track order progress. Students who order directly at the counter are also entered into the same queue by canteen staff.

The application gives canteen staff a shared view of incoming orders and gives kitchen staff a simple way to update preparation status. An administrator manages menu items, categories, prices, availability, canteen Open/Closed status, and staff accounts and roles.

The approved architecture uses React, Vite, TypeScript, Tailwind CSS, and Supabase for the database, email/password authentication, and live updates. Vercel remains the documented frontend deployment target. This documentation update precedes application development, which awaits the user's next explicit approval.

## 2. Problem statement

During busy college breaks, students may wait in long lines just to view the menu or place an order. They may not know whether an item is available or when their order will be ready. Canteen staff may also find it difficult to coordinate online and counter orders when they are recorded separately.

This project aims to centralize menu information and manage online and walk-in orders in one queue, with clear order tokens and status updates.

## 3. Project objectives

1. Make the current canteen menu, prices, categories, and item availability easy to view.
2. Let students place an order from a phone or computer.
3. Let staff enter walk-in orders from the counter.
4. Give every successfully created order a unique token.
5. Keep online and walk-in orders in one shared order queue.
6. Let staff and kitchen users update order statuses.
7. Let students see their order status and an estimated wait.
8. Give administrators tools to manage menu items, staff accounts, and basic order statistics.

## 4. Users and responsibilities

### Student
- Register and sign in using email and password. Newly registered accounts receive only the Student role by default.
- Browse menu items and their prices.
- Search or filter menu categories.
- Add available items to a cart and change quantities.
- Submit an order with required student name and email.
- Receive an order token and view order progress.
- View their recent orders.
- Cancel an order only while it is still in the allowed early state (see `03-flows-rules.md`).

### Canteen staff
- View incoming online orders.
- Create walk-in orders for students ordering at the counter.
- Accept or reject new orders.
- View the common queue and order details.
- Cancel an order when necessary, with a reason.
- See whether an order is online or walk-in.
- Explicitly accept walk-in orders, which initially have Placed status.
- Receive payment at the counter during collection and confirm Collected after handing over the order.

### Kitchen staff
- Prepare the oldest Accepted order by `accepted_at ASC, queue_sequence ASC`, with at most one order Preparing at a time.
- Mark an order as Preparing, then Ready.
- View token, items, quantities, and student notes if that optional feature is approved.
- Avoid changing menu prices or staff permissions.

### Administrator
- Manage menu categories and food items.
- Set item prices and availability.
- Create staff accounts securely and assign/manage appropriate staff, kitchen, and admin roles without exposing passwords or privileged credentials.
- Manually change canteen status between Open and Closed.
- View order counts and basic sales totals calculated from Collected orders only.
- View order history for operational purposes.

A user may have more than one staff capability only if an authorized administrator assigns the relevant role. Self-registration cannot grant elevated permissions. The application must enforce permissions in the data layer, not only by hiding buttons.

## 5. Must-have features (MVP)

1. **Menu catalogue:** categories, item name, description, image, price, and availability.
2. **Student cart:** add/remove items, change quantities, calculate subtotal and total.
3. **Online ordering:** submit an order and receive a unique token.
4. **Walk-in ordering:** staff can enter a counter order using a customer name or counter reference. The order starts as Placed and requires explicit acceptance.
5. **Common queue:** online and walk-in orders share one preparation queue ordered by acceptance time and one daily date-prefixed token sequence.
6. **Order tracking:** students can view token, current status, and approximate queue-based waiting time with a notice that it can change.
7. **Staff and kitchen dashboards:** staff manage incoming orders; kitchen updates preparation status.
8. **Admin management:** admin manages menu items, categories, availability, Open/Closed status, staff accounts and roles, order history, and basic statistics. Sales count Collected orders only.

## 6. Scope boundaries — do not build in the first version

- Online payment gateway or card processing.
- Delivery to classrooms or hostel rooms.
- Table reservations.
- Loyalty points, coupons, or complex discounts.
- Multiple campus branches.
- SMS or WhatsApp messaging.
- Supplier purchasing or advanced inventory accounting.
- Complex forecasting or AI-based recommendations.

For the MVP, payment is handled offline at collection (cash or the canteen's existing in-person payment method). Do not collect or store card, UPI PIN, or banking credentials.

## 7. Main operating assumptions

- There is one college canteen and one shared queue.
- Both online and walk-in orders are recorded in the same database.
- The shared preparation queue is first-in, first-out (FIFO) among Accepted orders by `accepted_at ASC`, with `queue_sequence ASC` as a stable tie-breaker. Rejected, Cancelled, and Collected orders leave active order lists.
- Both order sources initially have Placed status and require explicit staff/admin acceptance.
- Kitchen staff prepare the order accepted earliest. At most one order may be Preparing. Placed orders await staff acceptance and have no preparation queue position. Once an order becomes Ready, the kitchen can start the next eligible Accepted order while collection is pending.
- Tokens use a daily sequence with a mandatory date prefix, for example `20261118-041`. The sequence restarts on the next canteen business day. The full token is globally unique and is never reassigned. Both sources allocate tokens through the same safe database transaction.
- The business-day timezone and cutoff remain to be confirmed in `03-flows-rules.md`, section 12.
- An order is not considered ready until kitchen staff marks it Ready.
- Students pay and collect orders at the canteen counter. Staff marks Collected after handover. Only Collected order totals contribute to sales statistics.
- Admin manually sets Open/Closed status. New online orders are blocked by the backend while Closed. Closed-state walk-in policy remains to be confirmed.
- Initially show approximate waiting time based on the queue and single-order preparation capacity. Clearly state that the estimate can change. The preparation-time baseline remains to be confirmed.
- Completed (Collected), Cancelled, and Rejected orders remain in the database. Archiving food items or categories never deletes historical orders or their item snapshots.
- The first version uses English labels. Keep text centralized so another language can be added later if required.

## 8. Look and feel

Use a modern, professional college-canteen style: clean white or very light neutral backgrounds, a restrained green accent for availability/success, warm food photography, readable typography, clear category navigation, and simple cards. The interface should feel friendly and practical rather than like a luxury restaurant. Use responsive layouts: mobile-first for students, tablet/desktop for staff, and large high-contrast text for the queue display.

## 9. Success criteria

The project is successful when:
- A student can browse available food, submit an order, and see a token.
- Staff can add a walk-in order to incoming orders and explicitly accept it into the shared preparation queue.
- Both order sources start as Placed and receive unique date-prefixed daily tokens under concurrent submissions.
- Only the oldest Accepted order by `accepted_at ASC, queue_sequence ASC` can begin preparation, and concurrent kitchen actions cannot create two Preparing orders.
- Kitchen status changes are visible on the staff and student views without requiring a manual page refresh (real-time updates where supported).
- Unavailable items cannot be ordered.
- Role permissions prevent students from opening staff/admin actions.
- Self-registration grants only Student access. Admin can securely create staff accounts and manage roles.
- Admin can manage categories and manually set Open/Closed status. Closed blocks new online orders.
- Sales count Collected orders only, and menu/category archiving preserves order history.
- The application is usable on a phone and can be opened through a public deployed URL.
- The test checklist in `03-flows-rules.md` passes.
