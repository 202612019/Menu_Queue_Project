# Canteen Menu and Queue Management System — Screens and Features

This document defines the MVP screens, their routes, users, contents, interactions, responsive behaviour, and empty/error states. Build the screens as described here. Do not invent extra product features without updating the brief first.

Implemented Phase 6 scope: the approved existing homepage keeps its `/#menu` section and modal cart rather than adding the future standalone menu/cart/checkout screens. It reads active categories and all their foods from Supabase, uses name search and category-ID filters, and leaves out-of-stock cards visible with disabled Add buttons. Loading, error/retry, empty-catalogue, empty-category, and no-search-results states are distinct. See `05-live-menu.md`; the full MVP screen descriptions below remain the later target.

## Shared interface rules

- Use a consistent header with the canteen name/logo and clear navigation.
- Show prices in Indian rupees (₹).
- Clearly label item availability: Available or Out of stock.
- Use the same order status names throughout the application.
- Show a loading state during data requests and a useful error message if a request fails.
- Confirm destructive actions such as removing an item, cancelling an order, or rejecting an order.
- Do not show staff/admin navigation to students. Enforce access in the backend as well.
- Student screens must work on narrow mobile screens. Staff screens should work on tablets and desktops. The queue display must be readable from a distance.
- Display full date-prefixed tokens such as `20261118-041` consistently, including on the public display.

### Authentication and account access

- Provide email/password sign-in and student self-registration as supporting account interfaces for the eight screen groups.
- Registration requires student name, email, and password. Every newly registered account receives only the Student role by default.
- Students must sign in to access student-protected routes. Public menu browsing remains available.
- Only an authorized administrator can create staff accounts and assign elevated roles. A registration form must never offer a staff/admin role selector.
- Credentials are handled by Supabase Auth. Do not show stored passwords or privileged credentials. Basic email confirmation and password recovery are implemented as described in `04-authentication.md`. SMTP verification and staff onboarding remain open in `03-flows-rules.md`, section 12.

## Screen 1: Home (`/`)

**Users:** Students and visitors.  
**Purpose:** Introduce the canteen and provide a quick path to the menu.

### Layout, top to bottom
1. Header: canteen name/logo, Menu link, My Orders link (for signed-in students), and sign-in/account action.
2. Hero section: short welcome message and primary **View Menu** button.
3. Canteen status: Open or Closed, as manually set by admin. If closed, explain that new online orders are unavailable.
4. Featured/popular items: a small selection of available menu items with image, name, and price.
5. Category shortcuts: e.g. Snacks, Meals, Beverages. Categories must come from stored menu data rather than being permanently hard-coded.
6. Footer: basic canteen information and operating hours (admin-configurable only if that feature is implemented).

### Actions
- **View Menu** → `/menu`.
- Selecting a featured item → opens its menu item detail or menu listing.
- **My Orders** → `/my-orders`; ask the user to sign in if needed.

### Responsive behaviour
- Mobile: single-column hero and horizontally scrollable category chips.
- Desktop: wider hero and grid of featured items.

### Empty/error states
- No featured items: show “No featured items right now. Browse the full menu.”
- Menu load failure: show an error and Retry action.
- Canteen closed: show a clear closed message and disable new checkout.

## Screen 2: Food Menu (`/menu`)

**Users:** Students and visitors for browsing, with student account access for protected cart/checkout routes.  
**Purpose:** Browse and select food.

### Layout, top to bottom
1. Page title and search input.
2. Category filter chips or tabs.
3. Optional availability filter (Available only).
4. Food item grid/list. Each item shows:
   - Image (or neutral placeholder).
   - Item name.
   - Short description.
   - Category.
   - Price.
   - Available / Out of stock label.
   - Quantity or **Add to Cart** action.
5. Cart summary/count that links to `/cart`.

### Actions
- Search filters by item name/description.
- Category chip filters items.
- **Add to Cart** adds one unit if the item is available.
- Adding an unavailable item is blocked with a clear message.
- Cart count and subtotal update immediately.

### Responsive behaviour
- Mobile: one or two cards per row depending on available width; cart shortcut remains easy to reach.
- Desktop: three or four cards per row.

### Empty/error states
- No matching items: “No items match your search.”
- Category has no available items: explain that none are currently available.
- Menu load failure: Retry action.

## Screen 3: Cart and Checkout (`/cart` and `/checkout`)

Phase 7 keeps the existing modal cart and adds protected `/checkout`, `/my-orders` and `/orders/:orderId` locally. A dedicated `/cart` route remains a later interface choice. The submitted selection is frozen during uncertain recovery, with quantities capped at 20 per food and 50 total. Current prices require explicit review; only a confirmed receipt clears submitted quantities. See `06-checkout-orders.md`. Student cancellation and realtime queue/ETA interfaces are outside this phase, and hosted ordering is not yet enabled by this local implementation.

**Users:** Students.  
**Purpose:** Review selected items and submit an online order.

### Cart (`/cart`)
- List each selected item with image, name, unit price, quantity, and line total.
- Quantity increase/decrease controls.
- Remove item action.
- Subtotal and total.
- **Continue to Checkout** button.

### Checkout (`/checkout`)
- Required student name and email.
- Order summary with item quantities and total.
- Collection method text: “Collect at the canteen counter.”
- Payment note: “Pay at the counter when collecting.” No online payment gateway in the MVP.
- **Place Order** button.
- Clear notice that submitting creates a date-prefixed daily token and starts the order as Placed. Staff acceptance adds it to the shared preparation queue.

### Actions and validation
- Quantity must be at least 1.
- Cart cannot be submitted if it is empty.
- Validate required student name and email and require an authenticated student account.
- Re-check item availability and current prices on the server/database at submission time. Do not trust prices sent only by the browser.
- Disable duplicate submissions while an order is being created and use backend idempotency for safe retries.
- On success, clear the cart and navigate to `/orders/:orderId`.
- If an item becomes unavailable before submission, explain which item must be removed or changed.

### Responsive behaviour
- Mobile: stacked summary and full-width primary action.
- Desktop: item list beside an order summary.

### Empty/error states
- Empty cart: show “Your cart is empty” and a **Browse Menu** action.
- Submission failure: preserve the cart and show Retry.
- Canteen closed: prevent new online submissions in the interface and backend and explain why.

## Screen 4: My Orders / Order Tracking (`/my-orders` and `/orders/:orderId`)

**Users:** Students.  
**Purpose:** Show current and previous orders, token, queue information, and status.

### My Orders (`/my-orders`)
- Active orders first, then recent Collected, Cancelled, and Rejected orders. Historical orders remain stored in the database.
- Each card shows token, date/time, total, order source, and status.
- Selecting a card opens its details.

### Order detail (`/orders/:orderId`)
- Large token number.
- Order status and a simple progress indicator.
- Ordered items, quantities, and total.
- Order creation time.
- Preparation queue position for Accepted orders, calculated by `accepted_at ASC, queue_sequence ASC`. Placed orders show that they are awaiting acceptance.
- Approximate queue-based waiting time using single-order preparation capacity, with a note: “Estimated wait — may change.” Ready orders show Ready for collection. Timing baseline details remain open in `03-flows-rules.md`, section 12.
- Collection instruction: collect at the canteen counter when Ready.
- Cancel action only when allowed by the rules in `03-flows-rules.md`.

### Actions
- Refresh/live subscription updates the status and queue position.
- **Cancel Order** asks for confirmation and is available only in the permitted status.
- Students may view only their own orders.

### Responsive behaviour
- Mobile-first, with token and status visible near the top.
- Desktop uses a centered detail panel.

### Empty/error states
- No orders: show “You have not placed an order yet” and a Browse Menu action.
- Order not found or not owned by the signed-in student: show a safe not-found/access message.
- Live connection unavailable: show last updated time and allow manual refresh.

## Screen 5: Staff Dashboard (`/staff`)

**Users:** Authorized counter staff.  
**Purpose:** Manage incoming orders and enter walk-in orders.

### Layout
1. Header with staff identity and sign-out.
2. Summary counts: Placed, Accepted, Preparing, Ready.
3. Tabs/filters: All active, Online, Walk-in, History. History includes Collected, Cancelled, and Rejected orders.
4. Preparation queue table/list of Accepted orders sorted by `accepted_at ASC, queue_sequence ASC`. Incoming Placed orders are shown as awaiting staff review.
5. **Add Walk-in Order** action.

### Order row/card
- Token.
- Order source: Online or Walk-in.
- Student/customer name or counter reference.
- Items and quantities.
- Created time and total.
- Current status.
- Available actions based on status and permission: Accept, Reject, Cancel, Mark Collected, or View Details.

### Add Walk-in Order form
- Required customer name or counter reference.
- Optional contact only if needed by the canteen.
- Select available menu items and quantities.
- Show calculated total.
- **Create Walk-in Order** creates an order with source `walk_in` and status Placed, allocates a date-prefixed token from the shared daily sequence, and adds it to incoming orders for explicit acceptance. Backend validation and safe retry rules also apply to walk-in creation.
- Show the generated token clearly so staff can give it to the customer.

### Actions
- Accept a new online or walk-in order.
- Reject a new order with a required reason.
- Cancel an order with a reason and confirmation.
- Create a walk-in order.
- Explicitly accept a walk-in order after creation.
- Receive payment at collection and use **Mark Collected** on a Ready order after handing it over. This transition adds its stored total to collected-order sales statistics.
- Filters do not change queue order.

### Responsive behaviour
- Tablet/desktop: compact table with filters.
- Mobile: stacked order cards; do not require horizontal scrolling for essential actions.

### Empty/error states
- No new orders: “No new orders.”
- No active queue: “The queue is clear.”
- Failed action: show the reason if safe and keep the order state unchanged.

## Screen 6: Kitchen Dashboard (`/kitchen`)

**Users:** Authorized kitchen staff.  
**Purpose:** Prepare accepted orders and update their status.

### Layout
- Header with kitchen identity and sign-out.
- Columns or tabs: Accepted, Preparing, Ready.
- Cards sorted by `accepted_at ASC, queue_sequence ASC` within each stage.
- Each card shows token, order source, item names, quantities, notes (if supported), and elapsed time.

### Actions
- **Start Preparing** changes Accepted → Preparing only for the oldest Accepted order by `accepted_at ASC, queue_sequence ASC`, when no other order is Preparing. The backend enforces both checks atomically across kitchen sessions. Placed orders await staff acceptance and have no preparation queue position.
- **Mark Ready** changes Preparing → Ready.
- Ready orders remain visible until authorized staff/admin marks them Collected after handover. This recorded transition moves them to history.
- At most one card is Preparing. Once it becomes Ready, the next eligible Accepted order can start while previous Ready orders await collection.
- A status update must be visible on the student order page, staff dashboard, and queue display.

### Responsive behaviour
- Desktop/tablet: three-column kitchen board.
- Mobile: tabs or vertically stacked sections.

### Empty/error states
- No accepted orders: “No orders waiting for preparation.”
- No orders preparing: show a clear empty column.
- Update failure: keep the previous status visible and offer Retry.

## Screen 7: Live Queue Display (`/display`)

**Users:** Students and visitors viewing a canteen TV/large screen.  
**Purpose:** Make order progress and collection tokens easy to see.

### Layout
1. Canteen name and current Open/Closed state.
2. One large **Now Preparing** token, based on the kitchen's current Preparing order.
3. **Ready for Collection** section with large token numbers.
4. **Recently Completed** or **Next in Queue** section, depending on available space.
5. Small instruction: “Please collect your order when your token appears under Ready.”

### Actions
- No student account is required to view this public display.
- Data updates automatically where real-time updates are available.
- Do not display student phone numbers, email addresses, or other personal information.

### Responsive behaviour
- TV/large desktop: high-contrast, large typography and generous spacing.
- Tablet: two-column layout.
- Mobile: stacked sections.

### Empty/error states
- No orders: “No active orders right now.”
- No Ready orders: show “No orders ready for collection.”
- Connection lost: show “Reconnecting…” and last updated time.

## Screen 8: Admin Dashboard (`/admin`)

**Users:** Administrator only.  
**Purpose:** Manage the canteen menu, staff access, and basic operational statistics.

### Sections
1. Overview cards: orders today, active orders, Collected orders, and total sales from Collected orders only.
2. Menu management:
   - List items with image, name, category, price, and availability.
   - Add item.
   - Edit item.
   - Disable/enable availability.
   - Archive/disable items while preserving historical orders and their item/price snapshots. Never cascade an item archive into order deletion.
3. Category management, included in the MVP:
   - Add, edit, and manage/archive food categories.
   - Preserve historical orders when a category is archived.
   - Handling of active menu items in an archived category remains open in `03-flows-rules.md`, section 12.
4. Staff management:
   - View staff accounts and roles.
   - Create staff accounts through an admin-authorized secure server-side operation.
   - Assign or remove appropriate staff, kitchen, and admin role access. Users cannot elevate their own roles through self-registration.
   - Do not expose passwords or allow an admin to view them.
5. Order history with date/status filters, retaining Collected, Cancelled, and Rejected orders.
6. Canteen operating status control to manually set Open or Closed.

### Actions
- Validate item name, category, non-negative price, and required fields.
- Price/availability changes apply to future orders; existing order item snapshots must retain the original name and price.
- Only admins can access these actions.
- Changing the canteen to Closed blocks new online orders at the backend. Existing orders retain their recorded statuses. The walk-in policy while Closed remains open.
- Sales totals sum stored totals of Collected orders only. Placed, Accepted, Preparing, Ready, Cancelled, and Rejected orders contribute no sales.

### Responsive behaviour
- Desktop: sidebar navigation and tables.
- Tablet: collapsible navigation and stacked summary cards.
- Mobile: simplified cards and forms.

### Empty/error states
- No menu items: prompt admin to add the first item.
- No staff entries: show a helpful empty state.
- Failed save: preserve form values and show an error.

## Navigation and access summary

| Route | Access |
|---|---|
| `/` | Public |
| `/menu` | Public |
| `/cart` | Student |
| `/checkout` | Student |
| `/my-orders` | Student |
| `/orders/:orderId` | Owner student or authorized staff/admin |
| `/staff` | Staff or admin |
| `/kitchen` | Kitchen staff or admin |
| `/display` | Public, read-only |
| `/admin` | Admin only |

## Global design requirements

- Modern, professional college-canteen look.
- Responsive layouts for phone, tablet, desktop, and TV.
- Use consistent spacing, typography, button styles, and status colours.
- Use clear accessible labels; do not rely on colour alone to communicate status.
- Provide keyboard focus states and adequate touch target sizes.
- Use real menu data from the database; sample data is allowed during development but must be clearly identified as demo data.
