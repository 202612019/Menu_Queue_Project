# AGENTS.md — Canteen Menu and Queue Management System

## Project summary

Build a responsive college canteen web application. Students browse the menu, place online orders, receive tokens, and track status. Counter staff create walk-in orders. Online and walk-in orders share one FIFO queue. Kitchen staff prepare one order at a time. Admin manages menu items, categories, availability, canteen operating status, staff accounts and roles, and basic statistics.

## Read these documents first

- `docs/01-brief.md` — problem, users, MVP features, scope boundaries, assumptions.
- `docs/02-screens.md` — routes, screen layouts, interactions, responsive behaviour, empty/error states.
- `docs/03-flows-rules.md` — order flows, statuses, queue/token rules, access rules, and test checklist.
- `docs/04-authentication.md` — approved basic authentication implementation, security boundaries, and verification results.

These documents are the product requirements. If implementation appears to conflict with them, explain the conflict and ask before changing the requirement.

## Approved technology stack

- React + Vite.
- TypeScript.
- Tailwind CSS.
- Supabase for database, authentication, and real-time updates where appropriate.
- Vercel for frontend deployment.
- Use Supabase database policies (Row Level Security) and secure server-side operations for authorization and token generation.

Before adding packages or services, explain why they are needed. Prefer the simplest maintainable solution.

Architecture approval and the approved product decisions authorize the current documentation update. Application development requires the user's next explicit approval after reviewing these updated documents. Remaining decisions are tracked in `docs/03-flows-rules.md`, section 12.

Subsequent phase approvals authorize the existing homepage, Supabase connection test, and basic authentication implementation approved on 20 November 2026. Authentication uses JSX, the existing Student-profile trigger, and existing RLS. Preserve the stable App/cart during navigation. Do not deploy or change hosted Supabase settings without the user's approval. This does not authorize order placement or staff-provisioning interfaces.

## Design rules

- Modern, professional college-canteen style.
- Light neutral background, restrained green accent, warm food imagery, readable typography.
- Responsive and mobile-first for student screens.
- Tablet/desktop-friendly staff and kitchen dashboards.
- Large, high-contrast queue display for TV.
- Display currency in Indian rupees (₹).
- Use consistent status labels and visual styles.
- Use accessible labels, keyboard focus states, and comfortable touch targets.
- Keep UI text centralized so localization can be added later.
- Do not use a luxury salon/barber theme or salon-related wording.

## Core product rules

- Online and walk-in orders must use the same order table/queue and token-generation mechanism.
- Preparation queue order is FIFO among Accepted orders by `accepted_at ASC, queue_sequence ASC`.
- Kitchen staff start the order with the earliest acceptance timestamp, using `queue_sequence` to break ties. At most one order may be Preparing at a time. Placed orders await acceptance and have no preparation queue position. Ready orders can await collection while the next order is prepared.
- Tokens use a daily sequence and a required date prefix, for example `20261118-041`. Allocate them in a safe database transaction shared by both order sources. The numeric sequence restarts for each business day. The full date-prefixed token remains unique and is never reassigned, including after collection, cancellation, or rejection.
- Both online and walk-in orders start as Placed and require explicit staff/admin acceptance.
- Main status flow: Placed → Accepted → Preparing → Ready → Collected.
- Collected, Rejected, and Cancelled are terminal outcomes. Ready orders enter completed history through the Collected transition after handover.
- Do not permit backward status transitions.
- Revalidate item availability and prices at checkout.
- Save an item/price snapshot in each order so later menu edits do not change old orders.
- Students can see only their own order details.
- Use Supabase email/password authentication. Students can register. Every newly registered account receives only the Student role by default. Only an authorized admin may assign elevated staff, kitchen, or admin capabilities.
- Require student name and email for online orders. Walk-in orders require a customer name or counter reference.
- Admin manually controls Open/Closed status. The backend blocks new online orders while Closed. Closed-state walk-in policy remains unresolved.
- Show approximate queue-based waiting time with a clear notice that it can change. The preparation-time baseline still needs agreement.
- Public queue display must not reveal contact information.
- Enforce roles and permissions in the database/server, not only in React route guards.
- No online payment gateway in the MVP. Payment is made at the counter during collection. Staff confirms Collected after handing over the order. Sales statistics sum Collected orders only.
- Include category management in the MVP. Admin can add, edit, and archive/manage categories and create staff accounts through a secure server-side operation.
- Retain Collected, Cancelled, and Rejected orders. Archiving a food item or category must never delete historical orders or their item/price snapshots.

## How to work

1. Read `AGENTS.md` and all files in `docs/` before coding.
2. First summarize the requirements and list any contradictions or unanswered questions. The architecture and product decisions are approved. Update documentation first and wait for the user's next explicit approval before application coding.
3. Work in small tasks: one screen or one feature per task.
4. Before each task, state the files you expect to change.
5. Do not modify unrelated screens or features.
6. Use realistic demo menu data during development and label it as demo data.
7. After each task:
   - List changed files.
   - Explain what was implemented.
   - Give exact commands to run/test it.
   - Report test results honestly.
   - Mention known limitations.
8. Run the app and test the relevant flow after each meaningful change.
9. Do not claim a feature works unless it has been tested.
10. Do not silently remove requirements or add features from the “do not build” list.
11. Keep `prompts.md` updated with every prompt used, in chronological order, including unsuccessful prompts and follow-up fixes.
12. Commit working milestones to Git with clear commit messages when requested/when the repository is ready.

## Security and data handling

- Never put Supabase service-role keys, passwords, or private secrets in frontend code or Git.
- Use environment variables and provide an `.env.example` containing placeholders only.
- Do not store plaintext passwords.
- Use Supabase Auth for account credentials. Staff provisioning must not expose stored passwords or privileged credentials. Never grant elevated roles from a self-registration form or user-editable metadata.
- Configure Row Level Security for tables containing orders, profiles, staff roles, and menu management.
- Treat all client input as untrusted and validate important operations on the server/database.
- Do not expose student contact details on `/display`.

## Completion and deployment

- Follow the test checklist in `docs/03-flows-rules.md`.
- Confirm the production build succeeds.
- Check that no production code depends on `localhost`.
- Deploy the frontend to Vercel and configure required Supabase environment variables.
- Put the working live URL at the very top of `README.md`, immediately below the project title.
- Document any staff demo/test accounts safely; never publish real passwords or secrets.
