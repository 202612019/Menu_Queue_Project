# Menu_Queue_Project

College Canteen is a college canteen menu and queue management project. The app includes the student homepage, searchable demo food menu, interactive cart, and basic Supabase email/password authentication. React components use JavaScript `.jsx` files and data uses `.js` files. The existing TypeScript checker checks JavaScript through `allowJs` and `checkJs`. The homepage still uses its existing demo data; a separate development page tests public Supabase menu reads.

## Run the project

Open a terminal in `D:\My Folder\Menu_Queue_Project` and use Node.js 22.12 or later. The setup was developed with Node.js 24.14.0.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Local URL printed by Vite, usually `http://localhost:5173`. Vite updates the browser as you save source files. Press `Ctrl+C` in the terminal to stop the server.

`npm.cmd` works in Windows PowerShell when the `npm.ps1` wrapper is blocked by the execution policy. In other terminals, the equivalent commands are `npm install` and `npm run dev`.

## Check and build

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
```

- `typecheck` checks the JSX application and TypeScript files for errors without creating output files. `allowJs` and `checkJs` in `tsconfig.json` enable checking of JavaScript components.
- `build` runs the TypeScript checks and creates the production website in `dist/`.
- `preview` serves the existing production build locally, usually at `http://localhost:4173`. Run `build` first.
- `npm.cmd ci` installs the exact dependency versions in `package-lock.json` for a fresh checkout.

## Important files

| File or folder | Purpose |
|---|---|
| `package.json` | Lists packages and commands used by the project. |
| `package-lock.json` | Records the resolved package versions for repeatable installs. |
| `index.html` | The HTML page where React starts. It sets the browser title and page description. |
| `src/main.jsx` | Loads the local fonts and stylesheet, then starts React. |
| `src/app/App.jsx` | Owns the shared cart state and assembles the page and cart panel. |
| `src/components/SiteHeader.jsx` | Home/Menu/About links, search shortcut, live cart count, and mobile navigation. |
| `src/components/HeroSection.jsx` | Main heading, food photo, and Explore Menu link. |
| `src/components/CategoryFilter.jsx` | Category buttons and their selected state. |
| `src/components/FoodCard.jsx` | One food item's image, details, price, availability, and Add to cart action. |
| `src/components/FoodGrid.jsx` | Maps matching items to cards and shows the empty-search message. |
| `src/components/CartPanel.jsx` | Native modal dialog with cart items, quantities, removal confirmation, and total. |
| `src/components/SiteFooter.jsx` | Quick links, clearly labelled sample hours, placeholder contact details, and copyright. |
| `src/components/Icons.jsx` | Shared cart, search, menu, and close icons. |
| `src/pages/HomePage.jsx` | Owns search/category state and assembles hero, menu, and about sections. |
| `src/content/home.js` | Centralized interface text for future localization, moved from the Phase 2 `home.ts` file. |
| `src/content/foodItems.js` | Eight labelled demo dishes and the categories derived from them. |
| `src/utils/currency.js` | Formats integer paise as Indian rupees consistently across cards and cart totals. |
| `src/styles/index.css` | Tailwind import, theme colors, typography, and base styles. |
| `public/images/` | Local illustrative food photography served directly by Vite. |
| `vite.config.ts` | Enables the React and Tailwind Vite plugins. |
| `tsconfig.json` | TypeScript rules for the React application. |
| `tsconfig.node.json` | TypeScript rules for the Vite configuration. |
| `.gitignore` | Excludes installed packages, build output, local environment files, and logs from Git. |
| `canteen-management-docs/` | Existing requirements, project instructions, and chronological prompt log. |

Tailwind uses the Vite plugin `@tailwindcss/vite` and `@import "tailwindcss"` in the stylesheet, following the supported Vite installation method. [Tailwind documentation](https://tailwindcss.com/docs/installation/using-vite)

The homepage uses a locally bundled DM Sans font and local illustrative food photos. Home, Menu, and About navigate to sections within the same page. The food menu uses sample data, prices, and availability. Veg Burger is deliberately out of stock so its disabled action can be demonstrated.

The cart lives in React state and resets on page refresh. It supports adding available food, increasing/decreasing quantities, and confirmed removal. Quantity cannot decrease below one. Its badge counts all units, including repeated additions of the same dish. Selecting a category or searching preserves the cart.

Homepage database integration, order submission, tracking, queue management, staff provisioning, dashboards, and deployment remain future work. Online payments are excluded from the MVP. Basic authentication uses Supabase Auth and React Router. Staff roles are assigned through the existing trusted administrator process.

The existing Git repository is connected through `origin` to `https://github.com/202612019/Menu_Queue_Project.git`. Inspect the connection with `git remote -v` and local changes with `git status --short`.

## Image credit

The illustrative South Indian thali photograph comes from the WordPress Photo Directory. It represents sample food imagery. [Photo source](https://wordpress.org/photos/photo/506682de30/)

The original Phase 2 photo is retained. The homepage uses a smaller local copy for faster loading. All menu photos are illustrative and some include side dishes. The WordPress Photo Directory releases its photos under CC0. [Directory license](https://wordpress.org/photos/license/)

| Demo food | Original photo |
|---|---|
| Veg Sandwich | [Vegetable sandwich](https://pd.w.org/2026/05/1146a0852b5f0e273.07037886.jpeg) |
| Masala Dosa | [Dosa with sambar and chutney](https://pd.w.org/2026/06/1106a246ae1179ac6.28566534.jpg) |
| Veg Burger | [Vegetable patty burger](https://pd.w.org/2026/05/7876a14272666dac6.68949251.jpeg) |
| Samosa | [Samosa on a blue plate](https://pd.w.org/2026/11/9366ae9824c5df583.13353923.jpg) |
| Paneer Rice Bowl | [Illustrative paneer and rice meal](https://pd.w.org/2026/06/5036a390f6b517340.64420176.jpg) |
| Cold Coffee | [Chilled coffee](https://pd.w.org/2025/04/248680f57a248a911.52356013.jpg) |
| Fresh Lime Soda | [Illustrative citrus cooler](https://pd.w.org/2026/05/5469f7661614b724.41577373.jpeg) |
| Gulab Jamun | [Gulab jamun](https://pd.w.org/2024/01/62165b3e93524c481.39702004.jpg) |

## How the React pieces work

`useState` gives a component a value that React remembers and a setter that updates it. `HomePage` remembers the selected category and search text. `App` remembers cart lines and whether the cart is open. `SiteHeader` remembers whether mobile navigation is expanded.

Props pass information from parent to child. For example, `App` passes `cartCount` to `SiteHeader`, and `HomePage` passes `visibleItems` to `FoodGrid`. `FoodGrid` maps those items into `FoodCard` components, with a stable item ID as each React key.

Functions can also be props. `App` passes `addItem` as `onAdd` through `HomePage` and `FoodGrid` to each `FoodCard`. Clicking Add to cart calls that function with the selected item. App updates the cart, and React re-renders the header count and panel from the new state. CartPanel receives similar callbacks for quantity changes and removal.

Category filtering uses `filter()` to keep an item when the category matches or All is selected. Search compares lower-case names with the trimmed lower-case search text. Both conditions must be true, which makes category and search work together. Clear filters restores All and an empty search.

Adding the same dish updates its quantity instead of creating a duplicate line. Functional setters such as `setCartItems(previous => ...)` read the most recent cart during rapid clicks. `map()` updates a matching line, `filter()` removes a line, and `reduce()` calculates the badge count and total. Array changes create new arrays so React can recognize the update.

Prices are stored in integer paise. A ₹45 dish stores `4500`, and the cart adds `pricePaise * quantity`. `formatPrice()` converts the final amount to rupee text for display. Counts and totals are calculated from cart lines rather than stored separately.

The JSDoc comments describe props for the existing checker while keeping components as JavaScript. CartPanel uses `useRef` to reach the native dialog and `useEffect` to synchronize its open/closed state with React. The browser handles modal background interaction and restores focus when the panel closes.

## Phase 3 browser checks

| Check | Observed result |
|---|---|
| All six category buttons | Correct matching dishes, with all eight restored by All. |
| Search and categories together | Extra spaces and uppercase search matched Cold Coffee. Selecting Breakfast with that search showed the empty state. Clear filters restored eight dishes. |
| Unavailable food | Veg Burger's Add to cart button was disabled. |
| Repeated additions | Two Veg Sandwiches and one Cold Coffee produced three units and ₹140. |
| Quantity changes | A third sandwich changed the total to ₹185. Reducing to one sandwich plus coffee produced ₹95. Decrease was disabled at one. |
| Removal | Keep item preserved the line. Confirmed removal updated the total and badge. Removing the last item showed the empty state and ₹0. |
| Cart keyboard behavior | Escape closed the dialog and returned focus to its opener. |
| Mobile interactions | Navigation expanded and collapsed, the search shortcut focused the input, and mobile search/add/cart showed a lime soda total of ₹35. |
| Refresh | Reloading reset the demo cart to zero. |
| Responsive layout | 320px and 375px phone presets, 768px tablet, and 1440px desktop were checked. A fixed body minimum width causing scrolling at 320px was removed. Retesting showed no horizontal overflow, with one, two, or four card columns as appropriate. |
| Images and console | All nine displayed images loaded. No browser console errors were recorded during testing. |

Run `npm.cmd run typecheck` and `npm.cmd run build` for the existing source checks and production build. Browser verification screenshots are local generated files under the ignored `.phase3-preview.local/` folder.

## Phase 4 database preparation

Database migrations, the repeatable demo seed, security policies, and setup instructions are in [supabase/README.md](supabase/README.md). The guide explains how to select a Supabase project, apply the SQL, inspect the tables, and run isolated local PostgreSQL checks. Hosted deployment requires the manual dashboard steps described there.

## Temporary Supabase connection test

The user reports that the hosted migration, seed, and SQL verification are complete. To check frontend reads, keep your project URL and publishable key in the ignored `.env.local`, using the variable names shown in [.env.example](.env.example). The existing name `VITE_SUPABASE_ANON_KEY` accepts a publishable key or a legacy anon key. Never put a secret or service-role key in a `VITE_` variable; Vite makes these values available to the browser. Restart Vite after changing environment values.

Run `npm.cmd run dev` and open `/supabase-test` at the Local URL printed by Vite, usually `http://localhost:5173/supabase-test`. This separate development page shows loading, a safe error message with a retry button, or the returned categories and available food with names and rupee prices. Empty results have their own explanation because RLS can hide rows even when a request succeeds. Requests time out after 15 seconds and are cancelled when the page unmounts.

The test makes only SELECT requests against `categories` and `menu_items`, filtering food by `is_available = true`. The existing public RLS policies still apply. With the unchanged seed and active categories, expect five categories and seven available food items. The eighth seeded item, Veg Burger, is unavailable and is excluded. The test does not create accounts, place orders, or change the database.

Implementation: `src/lib/supabase.js` validates the public configuration, `src/lib/menuConnectionTest.js` contains the two read queries and safe error mapping, `src/content/connectionTest.js` holds interface text, and `src/pages/SupabaseConnectionTest.jsx` displays the results. `src/app/App.jsx` now lazy-loads this page only in development. The normal `/` homepage is preserved. Production builds omit the diagnostic page. To remove the test later, remove the three test-specific files and their route/import in `src/app/App.jsx`; keep the shared Supabase client and authentication routing.

Connection-only verification on 20 November 2026, before authentication was added: the shared query function successfully read five categories and seven available foods from the hosted project using the publishable key. Both GET requests returned HTTP 200 with CORS allowing the local development origin. Empty-response, availability-filter, safe-error, loading-markup, and HTTP-delivery checks passed. At that stage production omitted both the diagnostic page and unused Supabase configuration. Basic authentication now uses the public client configuration in production as intended; privileged credentials are never included. Browser-control tools were unavailable for visual inspection.

## Basic authentication

Run `npm.cmd run dev`, then open the Local URL printed by Vite. The following routes are implemented:

| Route | Purpose |
|---|---|
| `/login` | Email/password sign-in and confirmation-email resend. |
| `/register` | Student registration with name, email, password, and password confirmation. |
| `/auth/callback` | Confirmation/recovery link result after Supabase validates the session. |
| `/forgot-password` | Request a password-recovery email. |
| `/reset-password` | Save a password during a valid recovery session. |
| `/account` | Protected display of the authenticated user's database profile. |

`App` remains mounted across these routes, keeping the demo cart in memory. A full browser refresh still resets that demo cart, while Supabase restores the sign-in session. Header/footer links use client-side navigation. Mobile account access is in the navigation menu. The public homepage remains available without sign-in.

Supabase creates profiles through the existing database trigger. Registration sends only `full_name` metadata; the database assigns Student. Role and profile data come from the protected `profiles` table. Missing profiles and loading errors block protected content with Retry and Sign out actions. No new migrations, RLS policies, elevated credentials, or staff-provisioning backend were added.

The existing browser session flow is explicit in the client: persistence, automatic refresh, URL detection, and the SDK's implicit flow. Email URL credentials are handled only by the SDK and removed from the address. The callback waits for AuthProvider restoration instead of starting another SDK request. A PASSWORD_RECOVERY event creates a 15-minute, tab-local marker containing only the user ID, session ID, and expiry. It supports refreshing a cleaned callback/reset page for that same session and is cleared on logout/password update. An ordinary login does not qualify. Application messages never print raw server payloads or tokens. The marker controls UI flow; Supabase authorizes the actual password change.

The callback distinguishes missing, invalid/expired, unsupported-flow, and temporary restoration errors. A temporary session-read error can be retried in place. An SDK initialization error requires reloading the current callback URL because the SDK caches its initialization result; Retry does that without sending another email or manually exchanging credentials. A reload still resets the demo cart as documented. Older recovery markers without a session ID are ignored. The callback fix has automated coverage; it has not been tested with a new live recovery email.

The app requires at least eight password characters and matching confirmation fields; the server may enforce a stronger configured policy. Email confirmation is enabled in the existing hosted project. Verify the configured Site URL, allowed callback URLs, email templates, and SMTP before deployment. Nothing in this implementation changes hosted settings or deploys the app. Use the same development origin as the email callback (`localhost` and `127.0.0.1` have separate browser storage). A one-use email verification link may show `otp_expired` if opened again after it was consumed.

Tests:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
node supabase/tests/run-local.mjs
```

`npm.cmd test` uses Vitest, Testing Library, and JSDOM. It exercises the homepage/cart and authentication behavior without a real browser. One test uses the actual Supabase SDK with simulated HTTP responses to verify recovery URL processing. The PostgreSQL suite uses an isolated local database to test actual RLS and cross-account access. It must not be applied to hosted Supabase.

See [authentication implementation and verification](canteen-management-docs/docs/04-authentication.md) for the file map, security boundaries, and recorded results.
