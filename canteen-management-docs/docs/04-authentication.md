# Basic authentication implementation

Phase 7 extends the protected routes with local checkout and order history. The only authentication-routing addition is an allow-listed `/checkout` return destination after ordinary login. SDK settings, AuthProvider, email callbacks, password recovery and role assignment are unchanged. Registration/email-confirmation full reloads still reset the in-memory browsing cart; pending checkout metadata is separate and user/tab-bound. See `06-checkout-orders.md` for the new local scope and tests.

The user approved basic authentication on 20 November 2026. This document supplements the original product requirements and records the implemented scope. Application components remain JSX and JavaScript, checked by the existing TypeScript configuration.

## Scope and routes

Implemented routes: `/login`, `/register`, `/auth/callback`, `/forgot-password`, `/reset-password`, and `/account`. The existing homepage, demo menu, category/search behavior, and demo cart remain available. React Router wraps the application once. The main App owns cart state and stays mounted as its child route changes. Header, footer, and cart navigation use Router links. Full page reloads still reset the demo cart.

Registration requires a full name, valid email, a password of at least eight characters, and matching password confirmation. Supabase may enforce a stronger server password policy. There is no role selector. Only full_name is supplied as user metadata; the existing Auth trigger creates the profile with Student regardless of submitted role metadata. The frontend does not insert profiles or update roles.

The account page displays the protected profile's name, email, and mapped role. Missing profiles, unsupported roles, session restoration failures, and profile-loading errors deny protected content. Retry is available. An explicit own-user filter supplements RLS. Profile requests are aborted on session changes, and late results cannot replace the current user's data. Route guards control interface access; RLS remains authoritative for data access.

Staff provisioning, first-admin setup, role changes, orders, queues, dashboards, and deployment are outside this implementation. Existing database migrations and policies are unchanged. Existing trusted administrator procedures still apply to elevated accounts.

## Session and email handling

The shared client uses only the public publishable/legacy anon key and retains the SDK's browser implicit flow. Session persistence, automatic refresh, and URL detection are enabled explicitly. The SDK alone handles credential-bearing confirmation/recovery URL fragments; there are no manual code-exchange calls. Application code captures only safe link flags and renders fixed messages. The callback consumes AuthProvider's settled state and starts no SDK request of its own. An error-bearing link is rejected. A cleaned callback can resume a previously established recovery session, while an ordinary cached login cannot turn a missing link into recovery access.

The provider restores the session, listens synchronously for auth events, and loads profiles in a separate effect. In-flight restoration is shared across StrictMode effect replays. For an incoming recovery link, restoration also waits for the SDK's PASSWORD_RECOVERY event, which may arrive after SDK initialization resolves. A URL type hint cannot establish recovery. Subscriptions are cleaned up for StrictMode and unmounts. Old restoration results cannot overwrite a newer sign-in event. Logout uses local scope, clearing this session rather than every device. Private profile state is hidden immediately when the current user changes or signs out.

Callback errors distinguish a missing link, invalid link, expired/reused link, unsupported PKCE-format link, and temporary initialization/session failure. No PKCE exchange is attempted with the implicit configuration. Temporary session-read failures retry through the provider. Initialization failures are cached by the installed SDK, so Retry reloads the same document and preserves the unconsumed callback URL for a fresh SDK initialization. The app does not exchange URL credentials. This reload has the existing full-refresh behavior of resetting the demo cart. Root-to-callback navigation also preserves URL credentials until the SDK consumes them, so it does not break a pending initialization retry.

Email confirmation is enabled in the existing hosted project's public Auth settings. Registration may therefore return a user without a session, which displays confirmation instructions instead of protected content. Confirmation resend is available. Recovery requests use a generic response that does not reveal account existence. Unknown server errors are not copied into the UI.

An existing confirmed account can receive a neutral signup/resend response without a new confirmation email. The UI therefore does not promise delivery or reveal whether a particular address is registered. It offers Sign in and Forgot your password actions for everyone. Signing up again does not replace an existing account's password. In the earlier authorized live test, the test address was already confirmed; that account needs password recovery to choose a new password if its original generated test password is unavailable. The UI cannot establish email delivery from a successful API response alone.

After a recovery request succeeds, the form changes to a Check your email screen with instructions to use the newest message. The Send button is removed so clicking or pressing Enter again cannot accidentally send another request. Use a different email restores an empty form without making a request. Rate-limit failures explain that an already received email can be used and that repeated requests do not bypass the server limit. No retry countdown is promised because the actual remaining project quota is unknown. These interface changes do not bypass Supabase's per-user or project email limits.

Only a validated PASSWORD_RECOVERY event establishes recovery state. A marker in sessionStorage contains the user ID, JWT session_id, and expiry, never passwords or tokens. The session identifier is extracted only to bind the marker, not to validate credentials; the SDK/server remains responsible for authentication. The marker lasts up to 15 minutes and supports refresh in the same tab/origin for the same authenticated session. Another login, including one by the same user with a different session ID, cannot reuse it. Duplicate notifications do not extend the expiry. Old user-only markers, missing session identities and expired records fail closed. If storage is blocked, an in-memory marker works only until document reload. The marker is cleared after a successful password update or logout. It controls interface flow only; Supabase's authenticated endpoint authorizes password changes.

Callback URLs are constructed from the application's current origin. A callback sent to the project Site URL can also be routed to the callback page. Hosted Site URL, redirect allow-list, email templates, SMTP, and password policy were not changed. Production hosting must serve index.html for client routes. Keep the same origin when using email links; localhost and 127.0.0.1 do not share browser storage. The earlier Supabase guide documents SMTP and administrator setup limitations.

## Files

| File | Purpose |
|---|---|
| `src/main.jsx` | BrowserRouter and AuthProvider around the stable App. |
| `src/app/App.jsx` | Child routes, existing cart state, route navigation effects, development-only menu test. |
| `src/lib/supabase.js` | Existing public configuration validation plus explicit SDK auth defaults and early recovery-event tracking. |
| `src/auth/AuthProvider.jsx` | Session, profile loading, recovery state, logout and retries. |
| `src/auth/AuthGuards.jsx` | Authenticated/profile-ready/role checks and recovery guard. |
| `src/auth/authService.js` | Auth API calls, own-profile read, validation and safe error mapping. |
| `src/auth/authLinks.js` | Capture initial link flags before the SDK removes URL credentials. |
| `src/auth/recoveryState.js` | User-bound recovery marker with no credentials. |
| `src/components/AuthLayout.jsx` | Accessible shared auth layout, labelled fields and status/error messages. |
| `src/pages/AuthPages.jsx` | Login, registration, callback, recovery-request and reset forms. |
| `src/pages/AccountPage.jsx` | Read-only profile summary and logout. |
| `src/content/auth.js` | Centralized auth interface text. |
| Header, footer, cart panel and connection-test page | Client-side navigation that preserves App. |
| `tests/auth.test.jsx` | Component interaction, routing, state and security-boundary regressions with a simulated SDK boundary. |
| `tests/auth-sdk.test.jsx` | Recovery URL integration through the real SDK with simulated HTTP responses. |
| `tests/auth-sdk-retry.test.js` | Real SDK initialization-failure caching and a simulated document retry, with fake HTTP only. |
| `tests/auth-links.test.js` | Safe flags for implicit, clean, PKCE-format and expired-error fixture URLs. |
| `tests/setup.js`, `vitest.config.js` | JSDOM test environment and browser API shims. |
| `package.json`, `package-lock.json` | React Router dependency, test-only dependencies and test commands. |
| README and project documentation | Run instructions, implementation details and verification record. |

## Verification on 20 November 2026

- All 24 automated tests passed after the duplicate-request follow-up. The suite checks homepage/search/cart functionality, cart preservation while the same App DOM node stays mounted, registration validation and metadata, confirmation states, login failures, session restoration, logout, missing profiles, role guards, stale profile requests, recovery access, rate-limit errors, duplicate recovery-request prevention, and real-SDK recovery URL processing with simulated HTTP.
- Both TypeScript checks and the production build passed. The initial build reported a non-fatal JavaScript chunk-size warning (about 517 kB minified before gzip).
- The unchanged isolated PostgreSQL suite passed: default Student assignment, malicious metadata rejection, blocked self-promotion, actual cross-account profile/order isolation, schema/status/queue rules, repeatable seeding and concurrent token allocation. Its server stopped afterward. It did not contact hosted Supabase.
- With the user's explicitly authorized inbox, a live test registration was accepted. Supabase subsequently confirmed the email. Live password login, own-profile read, Student assignment, session restoration through the SDK, and local logout passed. A live role-update attempt was denied with 42501 and the role remained Student. No privileged credential was used.
- Hosted recovery email request was accepted. Further email attempts in the browser were rate-limited, as shown in the user's screenshot of `/forgot-password`. The app displayed the expected safe rate-limit message. Sending tests stopped rather than changing hosted limits. A completed live password reset and subsequent login with the new password were not verified.
- The user encountered an unreachable localhost page and then an already-used/expired confirmation link. Live server checks showed that the email had already been confirmed. The user subsequently confirmed that the homepage loaded after IPv4 loopback access was made available. The supplied screenshot confirms the forgot-password form and rate-limit display render in Chrome. Completed recovery, browser refresh persistence and the user's final password login remain unverified because the live recovery flow was blocked.
- Browser-control tools were unavailable. Component tests run in JSDOM, not a full Chrome browser. Visual layout, real-browser persistence, and completed email recovery are not claimed as directly inspected by the assistant.

The test account remains an ordinary Student. Its initial generated test password was held only in the temporary local verification process and never printed or committed. That process was stopped after the email-limit blocker was identified. The user should choose their own password through recovery when email sending is available. Test email addresses and credentials are omitted from repository documentation. No hosted settings were changed and nothing was deployed.

## Callback-fix verification

The callback fix was approved after a read-only investigation. The earlier invalid-link message combined URL recognition, used/expired links, and temporary initialization failures. The current implicit configuration had no manual PKCE exchange; the app's URL-only gate was brittle. The fix preserves SDK ownership, waits for provider/event restoration, and allows a cleaned callback to resume only a matching recovery session.

Automated regressions cover delayed PASSWORD_RECOVERY delivery, cleaned callback refresh, rejection of ordinary logins and different sessions for the same user, explicit and SDK-reported expired links, unsupported PKCE-format links, one shared StrictMode initialization, temporary session-read retry, SDK initialization retry via reload, marker expiry/legacy rejection, and cleanup after password update/logout. The real-SDK fixtures intercept every HTTP request and use synthetic credentials. No recovery email or live link was used. Full Chrome reload/retry, a new live recovery callback, and a completed live password change remain unverified for this fix.

Final result: all 42 frontend tests across four files passed, including a regression that another auth event cannot end callback initialization early. The standalone TypeScript checks and production build passed. The existing non-fatal bundle-size warning remains (approximately 521 kB minified main JavaScript). The initial migration and existing RLS-test SHA-256 hashes match their pre-fix values. No dependencies, hosted settings, database policies, or migration files changed in this callback fix.

The subsequent existing-account registration wording/link follow-up passed all 43 frontend tests, TypeScript checks and the production build. It added coverage for a neutral existing-account response with Sign in and Forgot Password actions and no automatic resend. No live email was sent or delivery claimed.
