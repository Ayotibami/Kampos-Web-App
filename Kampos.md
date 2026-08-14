# Kampos Web (Frontend) — Full Guide

This document explains everything happening inside the `kampos-web` frontend: what it is, how it's built, how every screen and feature works end to end, and how it talks to the backend. It's written so a new engineer (or a non-technical teammate) can read it and come away understanding how the app actually works under the hood.

Each section starts with a **plain-English explanation**, then follows with **technical details** for developers.

This app is the web counterpart to a Kampos mobile app (referenced throughout the code as "mobile" — most components/flows are explicitly "ported from mobile" to keep behavior/voice identical) and talks to the same backend documented in `KamposBackend/Kampos.md`.

---

## 1. What This App Is

**Plain-English:** This is the Kampos website — the place students sign up, log in, set up their profile, and use the actual app (posting "gists", reacting, commenting) in a browser. It's built to feel like a native app: swipeable card feed, bottom sheets, animated transitions, dark mode.

**Technical details:**
- **Framework:** Next.js **16.2.11** (App Router), React **19.2.4** / react-dom 19.2.4, TypeScript 5.
- **State management:** Zustand 5 (no Redux/Context-based state — every domain has its own store under `src/stores/`).
- **Styling:** Tailwind CSS v4 (`@tailwindcss/postcss`), with brand tokens defined via `@theme` in `src/app/globals.css` (see Section 8).
- **HTTP:** axios 1.18, one shared instance (`src/lib/api.ts`).
- **Animation:** Framer Motion 12 (`framer-motion`) everywhere — card stack swiping, modals, progress dots, reaction bursts.
- **Reactions:** `lottie-react` renders genuine animated emoji (Google's Noto Animated Emoji assets, self-hosted as JSON under `src/assets/lottie/`).
- **Icons:** `lucide-react` + `@phosphor-icons/react`, both re-exported through one abstraction file (`src/components/ui/icons.tsx`).
- **Package manager:** pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml` present).
- **Scripts** (`package.json`): `dev` (`next dev`), `build` (`next build`), `start` (`next start`), `lint` (`eslint`). No test script exists in this repo.
- **AGENTS.md** (root) is a generic Next.js-agent warning ("this version has breaking changes vs your training data, read `node_modules/next/dist/docs/`") — not project-specific guidance. `CLAUDE.md` just `@`-imports `AGENTS.md`.
- **`todo.md`** (root) is a running, informal punch list of known-unfinished work in the founder's own words (mobile UI polish, PAW, custom error/success modals after actions, sharing, "Amebo, level, major, school", illustrations, settings/profile screens, notifications, friendlier error display, edit/delete, kreator/admin gist card UI, T&C/PP/community-guidelines links, SEO/image optimization). Several of these are now done (edit/delete exists, sharing exists) but the file itself hasn't been pruned — treat it as a rough backlog, not a live spec.

### Why a same-origin `/api/v1` proxy exists (the single most important architectural fact)

The backend sets the session as an **httpOnly cookie** — JavaScript can never read it, by design. As long as the browser talks to the backend's own domain directly, that's fine: the browser attaches the cookie correctly to that origin. But this app's own server (Next.js Server Components, `middleware.ts`, Route Handlers) *also* needs to know "who is this?" before rendering a page — and a Node server can only see cookies belonging to *its own* domain. A cookie stamped by a totally different origin (the backend) never reaches this app's server at all, no matter what.

**The fix:** the browser never talks to the backend directly. Every request goes to this app's own `/api/v1/...` route (`src/app/api/v1/[...path]/route.ts`), which forwards it server-to-server to the real backend and relays the response — including `Set-Cookie` — back untouched. Because the browser only ever sees a response from *this app's own origin*, it stores the cookie as first-party to this app. From then on, both the browser's own requests **and** this app's Server Components (reading the same cookie via `next/headers`) see the exact same session.

This is why `src/lib/api.ts`'s axios instance has `baseURL: "/api/v1"` (not the backend's URL) and `withCredentials: true`.

---

## 2. Auth — Full Flow

**Plain-English:** You register with email/password (or the flow is scaffolded for OAuth later, though the actual OAuth buttons aren't wired up in this repo's UI), verify a 6-digit email code, then fill out a 5-step profile wizard, and you're in. The app remembers you're logged in via a cookie the browser can't see or touch directly — every page checks with the backend "who is this, really?" before deciding what to show.

### 2.1 The four/five auth states

`AuthGateState` (`src/stores/authStore.ts`) is the single vocabulary the whole app uses to decide what a visitor is allowed to see:

```
"unknown" | "guest" | "needs-otp" | "needs-profile" | "active"
```

Computed identically on both server and client from one endpoint, `GET /account/profile`:
- no `account` → `guest`
- `account` exists but `!account.is_otp_verified` → `needs-otp`
- account verified but `profiles.length === 0` → `needs-profile`
- otherwise → `active`

`destinationFor(state)` (`src/lib/authGate.ts`) is the **one place** that maps a state to where that visitor belongs (`guest`→`/login`, `needs-otp`→`/verify-otp`, `needs-profile`→`/setup-profile`, `active`→`/feed`). Both the server-side gate and every post-login/signup/verify redirect route through this function, so routing logic isn't duplicated per page.

### 2.2 How a Server Component knows who's logged in

Every page's `page.tsx` is an `async` Server Component that starts by calling `gateServer(allow: AuthGateState[])` (`src/lib/serverAuth.ts`):

1. `resolveServerAuthState()` reads the incoming request's cookies via `next/headers`' `cookies()`, forwards them verbatim in a server-to-server `fetch` to `${env.API_BASE}/account/profile` (`cache: "no-store"` — this is per-visitor, never cached), and derives the `AuthGateState` from the response, exactly like the client store does.
2. If the resolved state isn't in the page's `allow` list, `redirect(destinationFor(state))` fires **before any HTML for that page is ever sent** — no client-side flash, no spinner, no redirect-after-render.
3. The resolved `{ state, account, profiles }` is returned so the page can hand it straight to `<HydrateAuth>` (see below), avoiding a second, redundant client-side fetch of the same data.

Every single page in `src/app/` follows this exact pattern — call `gateServer([...])`, then render `<HydrateAuth ... />` followed by the page's real content. Which states are allowed varies intentionally per page (see Section 4's table).

### 2.3 How a Client Component knows who's logged in

`<HydrateAuth state account profiles>` (`src/components/auth/HydrateAuth.tsx`) is a tiny client component mounted once per page, right after the gate. On mount it calls `hydrateFromServer()` on `useAuthStore`, seeding the Zustand store from data the server already fetched — **no network call**. From then on, any client component can just do `useAuthStore((s) => s.user)`.

One extra wrinkle: the server gate only checks "does this account have a profile at all," not "does *this specific session* have one actively switched-to" (that detail lives inside the JWT, which the gate doesn't decode). So a session that owns a profile but never actually switched to one would look `"active"` from the server's point of view while every authenticated write (react/comment/post) still fails. `HydrateAuth` detects this specific case (`state === "active"`, profiles exist, but `avitag` is still null) and fires one client-side `resolveAuthState()` call to self-heal it.

### 2.4 The 15-minute access token problem, and why `middleware.ts` exists

The backend's access token is short-lived (15 min) on purpose, with a 30-day refresh token backing it up. On the **client**, `src/lib/api.ts`'s axios response interceptor already handles this silently: any `401` (except on `/auth/login`, `/auth/register`, `/auth/refresh` themselves) triggers exactly one shared `POST /auth/refresh` attempt (deduped via a module-level `refreshInFlight` promise so concurrent 401s don't each fire their own refresh), then retries the original request once.

But **Server Components can't write cookies** — only Route Handlers, Server Actions, and Middleware can. `resolveServerAuthState`'s plain `fetch` to `/account/profile` had no way to recover from a dead access token even with a perfectly valid refresh token sitting right there in the same request. That's the whole reason `src/middleware.ts` exists: it runs *before* any page's own server-side gate check, decodes the access token's JWT payload (without verifying its signature — this is only a "is it worth trying to refresh" heuristic, real verification always happens on the actual backend request) to check if it's expired or expiring within 15 seconds, and if so calls `/auth/refresh` itself, then rewrites **both** the incoming request's own headers (so the same request's later gate check sees the fresh token) **and** the outgoing response's `Set-Cookie` headers (so the browser gets the new cookies too). If the backend is unreachable, it just lets the request through as-is and the page's own gate falls back to "guest" — never throws.

Middleware's `matcher` excludes `/api`, `/_next/static`, `/_next/image`, `favicon.ico`, and any path with a file extension.

### 2.5 Register → verify → setup-profile → feed, step by step

1. **`POST /auth/register`** (via `useAuthStore.register`) — the backend sets the auth cookies directly on this response; there's no token in the body to store client-side anymore. The account is immediately "logged in," just unverified. `register()` then calls `resolveAuthState()` to derive the real state and returns it; the caller (`SignupForm`) does `router.replace(destinationFor(state))`, which lands on `/verify-otp`.
2. **`/verify-otp`** — `VerifyOtpForm` reads `user.email` from the store (guaranteed to exist because the gate only lets `needs-otp` visitors reach this page at all). No auto-send on mount — register/login already trigger a code send server-side, so sending again here would double every email. A 10-minute countdown mirrors the backend's real OTP TTL; resend is allowed after ~20s. On success, `verifyOtp()` doesn't get a new token back (the existing session cookie is already valid — only the DB's `is_otp_verified` flag changed), so it just re-runs `resolveAuthState()`, which naturally advances to `needs-profile`.
3. **`/signup-success`** (gated to `needs-profile`) — a one-off celebration screen with a "Set your profile" button to `/setup-profile`. Not part of the required flow (you can reach `/setup-profile` directly too).
4. **`/setup-profile`** — the 5-step wizard (Section 6). On success, `AvitagStep` calls `createStudentProfile()`, which internally also calls `switchProfile()` to bind the JWT to the new profile, then routes to `/feed`.
5. **`/feed`** — gated to `active` only.

### 2.6 Login

`LoginForm` → `useAuthStore.login()` → `POST /auth/login` (cookies set by the backend) → `resolveAuthState()` → `router.replace(destinationFor(state))`. If the account isn't verified yet, the backend automatically fires a fresh OTP and the resolved state naturally becomes `needs-otp`, landing the user back on `/verify-otp` — no special-casing needed client-side. `/login` itself allows both `guest` and `needs-otp` visitors (so an unverified user isn't bounced away from the login page just for showing up — only an actual login *attempt* reveals they're unverified and moves them on).

### 2.7 Logout and session death mid-use

`useAuthStore.logout()` calls `POST /auth/logout` (best-effort — if it fails, cookies may outlive the call, but the local store still treats the session as gone) and resets all auth state to guest.

`<SessionWatcher>` (mounted once in the root layout) listens for a custom `kampos:unauthorized` window event, fired by `api.ts`'s interceptor **only** when a 401 survives a refresh attempt (i.e. the refresh token itself is dead, not just the access token) — it resets the store to guest and `router.replace("/login")` immediately, rather than waiting for the next full page load's gate check to catch it.

Note the `skipUnauthorizedEvent` flag `resolveAuthState()` passes on its own `/account/profile` call — without it, the mere act of checking "am I logged in?" on a guest-only page (e.g. `/signup`) would itself look like a session dying mid-use and force a redirect loop.

### 2.8 Multi-profile switching

One account can hold multiple profiles (student/kreator/kompany/school/idiot — see backend doc). `useProfileStore.switchProfile(avitag)` calls `POST /auth/switch-profile`, which rotates the auth cookies server-side (a fresh token pair bound to the new active profile). There is **no UI anywhere in this repo that lets a user manually switch profiles** — the only caller of `switchProfile` is `createStudentProfile` (auto-switches into the profile you just created) and `resolveAuthState`'s own self-heal path. Multi-profile *switching as a user-facing feature* is not built.

### 2.9 Password reset

`/forgot-password` → `POST /auth/forgot-password` → redirects to `/reset-password?email=...`. `/reset-password` has two internal stages (not separate routes): `"code"` (OTP entry, `POST /auth/verify-reset-code` — this only *previews* whether the code is right, it doesn't consume it) then `"password"` (`POST /auth/reset-password`, which sends the code again and actually burns it). Both `/forgot-password` and `/reset-password` allow `guest` and `needs-otp` — being unverified has nothing to do with being able to reset your password.

---

## 3. State Management — Every Zustand Store

All stores live in `src/stores/`. None use Redux-style middleware beyond Zustand's own `persist`.

| Store | Owns | Persisted? |
|---|---|---|
| `authStore.ts` | `user`, `profiles`, `authState`, `avitag`, `profileType`, loading/error; all auth actions (register/login/verify/reset/logout/resolveAuthState) | Yes, but **only** `avitag`+`profileType` (`kampos.auth` in localStorage) — `user`/`profiles`/`authState` are deliberately *not* persisted since they're always re-derived from the backend; persisting them was "exactly what let ungated pages be reachable before" (per an inline comment referencing a past bug). |
| `gistStore.ts` | Gist CRUD, reactions, media attach/remove, view logging, `normalizeGist` (see Section 9) | No |
| `commentStore.ts` | Comments keyed by `gist_id` (`itemsByGist`), pagination state, live-highlight state for WS-delivered comments, reactions on comments | No (in-memory cache for the session) |
| `reactionStore.ts` | Generic reaction upsert/list/remove by entity — a thinner, more generic API than `gistStore`'s own optimistic `react`/`unreact`; largely superseded by those for gists but still the only path for arbitrary entity types | No |
| `profileStore.ts` | `switchProfile`, `createStudentProfile` (multipart upload to `/profiles/students`) | No |
| `setupProfileStore.ts` | The whole 5-step wizard's draft data, picked/uploaded avatar, `currentStep`, `hasHydrated` flag | Yes (`kampos.setup-profile`) — `data`, `imageUrl`, `currentStep` persisted; the in-memory `image` (object URL) deliberately excluded since it can't survive a reload |
| `referenceStore.ts` | Campuses/majors fetched from `/misc/campuses` and `/misc/majors`, cached after first load | No |
| `themeStore.ts` | The user's *preference* (`"light"`/`"dark"`) — does **not** itself touch the DOM | Yes, via raw `localStorage` (`kampos-theme` key, not Zustand's `persist` middleware) |
| `authPromptStore.ts` | Global "you need an account" modal open/close state + the action label shown | No |
| `unsavedChangesStore.ts` | A single registered guard function (`setGuard`) + `runGuardedNavigation()` — lets a dirty form (Profile Settings, Section 4b) intercept any navigation attempt (mobile back arrow, desktop rail links) and show a Save/Discard prompt instead of silently losing edits | No |

`setupProfileStore` and `authStore` both gate on a `hasHydrated`/mount check before trusting persisted values, since `localStorage` isn't available during SSR and a naive read would cause a hydration flash/mismatch.

---

## 4. Routing / Pages

Every route is a Server Component `page.tsx` that calls `gateServer([...allowed states])`, then renders `<HydrateAuth>` plus a client component with the real UI.

| Route | Allowed states | Notes |
|---|---|---|
| `/` (`src/app/page.tsx`) | `guest` | The onboarding carousel (`OnboardingCarousel.tsx`) — Kappy mascot intro, 3 slides. Skips straight to `/welcome` if `hasSeenOnboarding()` (localStorage flag) is already true. |
| `/welcome` | `guest` | Landing screen post-onboarding: "Hop in" / "Join Kampos" CTAs, `GistPreviewMarquee` on desktop. |
| `/login` | `guest`, `needs-otp` | |
| `/signup` | `guest`, `needs-otp` | |
| `/forgot-password` | `guest`, `needs-otp` | |
| `/reset-password` | `guest`, `needs-otp` | Two-stage inner flow (code → new password), wrapped in `<Suspense>` because it reads `useSearchParams()`. |
| `/verify-otp` | `needs-otp` only | |
| `/signup-success` | `needs-profile` only | |
| `/setup-profile` | `needs-profile` only | The 5-step wizard. |
| `/feed` | `active` only | The main app — the swipeable gist stack + comment panel. |
| `/[avitag]` | **No gate at all** | The public profile page — same reasoning as `/gist/[gistId]` below (a guest or share-preview crawler must see it with no login wall). Real, fully built — see Section 4a. Replaced the old `/profile` route entirely (see Section 15's Reserved-avitag entry for why `/profile` itself is now a reserved word, not a route). |
| `/settings`, `/settings/profile`, `/settings/account`, `/settings/legal`, `/settings/support` | `active` only | Real, fully built — see Section 4b. No longer a placeholder. |
| `/gist/[gistId]` | **No gate at all** | See below — the other deliberately ungated page. |
| `/api/v1/[...path]` | n/a | The auth proxy (Section 1). |
| `/api/og/[gistId]` | n/a | Dynamic OG image generation (Section 5). |

### The ungated `/gist/[gistId]` share route

This is architecturally the most interesting route. It's the page a shared gist link actually points to (`GistCard`'s `shareUrl` is `${origin}/gist/${gist.gist_id}`, not `window.location.href`). It deliberately calls `resolveServerAuthState()` directly instead of `gateServer(...)` — meaning it renders identically for a completely logged-out stranger, a link-preview crawler (WhatsApp/X/Facebook — none of which are ever logged in), and a real logged-in user. If it were gated, every shared link would just bounce a random visitor to a login wall before they ever saw the content it promised.

It fetches the target gist plus 15 chronological neighbors either side via `fetchGistContext()` (`src/lib/serverGist.ts`, hitting `GET /gists/:id/context`), and 404s (`notFound()`) if the gist genuinely doesn't exist. A `REJECTED` gist (removed by moderation) is the **one case** where this route's `target` can be a non-`APPROVED` gist at all — the backend's `getContext` makes a deliberate exception only for the specific shared gist, never its siblings — and `GistShareView`/`GistCard` render a dedicated "This gist has been removed" state for it in place of content, while comments show "Comments aren't available on a removed gist."

`generateMetadata()` on this route builds the actual Open Graph tags (title, description, `og:image`/`twitter:image` pointing at `/api/og/[gistId]`) — this is what makes shared links show a rich preview card in WhatsApp/iMessage/Slack/X.

Real actions (react/comment/report/share) all still render normally on this page for a guest — clicking one triggers the shared `requireAuth()` prompt (Section 2.6-equivalent gating pattern) instead of silently failing.

---

## 4a. The Public Profile Page (`/[avitag]`)

**Plain-English:** Every student has a public profile page — their own, or anyone else's, viewable by anyone including a completely logged-out visitor. It shows their picture, name, avitag, campus/major/level, bio, and every gist they've posted. If it's *your own* profile, you also get a Settings shortcut, the theme toggle, and a button to post a new gist right there. If it's someone else's, that same corner instead shows a small link back to your own profile. Scoped to students only for now — the other four profile types don't get a public page yet.

**Technical details:**
- **Route:** `src/app/[avitag]/page.tsx` — deliberately **not** gated via `gateServer` (same reasoning as `/gist/[gistId]`: the backend's `GET /profiles/students/:avitag` has no auth requirement, so a guest or a share-preview crawler must see this too). Calls `resolveServerAuthState()` directly, fetches the profile via `fetchStudentProfileByAvitag()` (`src/lib/serverProfile.ts`, wrapped in React's `cache()` so `generateMetadata()` and the page body's own fetch of the same avitag dedupe into one network round trip instead of two), and 404s (`notFound()`) if the avitag doesn't resolve to a real student profile.
- **`isOwnProfile`:** computed server-side by checking whether the route's avitag appears anywhere in the signed-in viewer's own `profiles` list — resolved before any HTML ships, so the owner-only chrome never flashes in/out post-hydration. This is a **UX decision, not a security boundary** — the profile data itself is fully public regardless, and every mutating endpoint (change password, update profile, etc.) independently re-checks real account ownership server-side.
- **`ProfileView.tsx`** (client component) renders both cases from one component:
  - **Header (top-right corner):** on your own profile — a brand-filled "+" compose button (opens `CreateGistSheet`, posts land at the top of the page's own gist list via `onPosted`), a Settings link, and `ThemeToggle`. On someone else's profile — if you're logged in, a small ringed avatar linking back to `/${myAvitag}` instead (a guest sees neither). A gist always posts as whichever profile is currently *active* in `authStore`, never as "whichever profile page happens to be open" — a deliberate, confirmed design choice, not a gap (see the note in Section 15).
  - **Identity block:** avatar (tap to open a full-size lightbox via the shared `Modal`, only when a real photo exists), display name, avitag, and three `InfoBoard` cards for Campus/Major/Level — **full joined names** (e.g. "University of Lagos", not the raw `unilag` tag), sourced from the backend's `campus_name`/`major_name` join (Section 9), each with a matching icon (`CampusIconFill`/`MajorIconFill`/`LevelIconFill`) and a one-time spring "jump in" entrance plus a small periodic re-bounce (`BOUNCE_INTERVAL_MS`, every 30s) via `useAnimationControls`. Smaller `ProfileTag` chips (short raw tags, e.g. `UNILAG`) sit right under the name as a compact echo of the same facts.
  - **Bio:** centered, flanked by em-dashes as a one-line "quote" for short bios (`BIO_DASH_MAX_CHARS`), a plain paragraph for longer ones.
  - **Gist list:** `ProfileGistCard` (not `GistCard` — see Section 5.3a), paginated via the same cursor pattern the feed uses (`byUser(avitag, { cursor })`), auto-fetching near the list's end via `IntersectionObserver` rather than a "Load more" button. **Visibility rule deliberately differs from the main feed**: someone viewing *your* profile sees your `SUBMITTED` and `APPROVED` gists (hiding only `REJECTED`), not the feed's stricter APPROVED-only rule — an explicit product decision (see `listByUser`'s doc comment in `KamposBackend/Kampos.md` Section 4), so a still-pending gist isn't invisible on the one page a curious visitor would actually go looking for it.
  - **Comments — desktop:** a sticky right-hand panel (reuses `CommentPanel`, the exact same component/width the `/gist/[gistId]` page uses), closed by default so the gist list keeps the full page width until a card's own comment button opens it. An `IntersectionObserver`-based "scrollspy" (`rootMargin: "-50% 0px -50% 0px"`) tracks whichever gist card is nearest the vertical center of the viewport as the list scrolls, and the panel follows it automatically — a small `ActiveGistStrip` above the panel names which gist it's currently showing (with its own close button, working regardless of which card originally opened the panel).
  - **Comments — mobile:** no room for a side panel, so the same comment button instead opens `CommentSheet` (a bottom sheet), mirroring the feed's own mobile comment trigger exactly.
- **Reserved avitags:** `RESERVED_AVITAGS` in `src/lib/validation.ts` (`login`, `signup`, `feed`, `settings`, `gist`, `api`, `profile`, `kampos`, `kappy`, `ceo`, `admin`, `test`) blocks a new avitag from colliding with this app's own top-level static routes, since a profile lives at `/avitag` with no prefix — a colliding avitag would be permanently unreachable behind the app's own routing. Mirrored server-side in the backend's `schemas/profile.ts` (the real enforcement point — see `KamposBackend/Kampos.md` Section 2).
- **Clickable identity everywhere:** a gist's poster (`GistCard.tsx`) and a comment's author (`CommentList.tsx`, when `avitag` is present) both link to `/${avitag}` now — this page is reachable from anywhere in the app that shows someone's name or avatar, not just by typing a URL.

---

## 4b. Settings (`/settings/*`)

**Plain-English:** A real Settings section — change your name/bio/level, change your password, deactivate your account, and read the real Privacy Policy/Terms/Community Guidelines and support contact options, all from inside the app. On a phone it's a single screen at a time with a back arrow, same as any native settings app; on desktop it's a persistent two-pane layout — a nav rail on the left that never remounts as you click between sections, content on the right.

**Technical details:**
- **`src/app/settings/layout.tsx`** is the shared frame for every subpage: runs the `gateServer(["active"])` auth gate once, wraps everything in `AppShell variant="panel"` (the same full-bleed, exactly-viewport-height, internally-scrolling desktop treatment the profile page uses — see Section 8), and renders `SettingsRail` beside `{children}`. Being a Next.js *layout* (not repeated per-page markup) is what lets the desktop rail stay mounted and merely re-highlight the active section as you navigate between `/settings/profile`, `/settings/account`, etc., instead of the whole rail flashing on every click.
- **`SettingsRail.tsx`** — desktop-only (`hidden md:flex`), a back-to-`/${avitag}` link, the four nav items (Profile/Account/Legal/Support), social links, `LogoutAction`, and a small version/credit footer ("Kampos 1.0.0"). Mobile has no persistent rail at all — `SettingsHub.tsx` (`/settings` itself) *is* the mobile nav, a plain list of `SettingsRow`s; on desktop, landing on bare `/settings` just bounces straight to `/settings/profile` (`useIsMobile` + a `router.replace`) since the rail already covers that navigation permanently.
- **`SettingsPageShell.tsx`** — the shared per-subpage frame: `SettingsHeader` (back arrow, mobile-only — desktop's rail is the way back) + a title, then a scrolling content lane. Scrolling and width-capping are deliberately split across two nested divs (the outer one owns `overflow-y-auto` and spans the full pane so the scrollbar sits at the real page edge; the inner one just centers/caps the content) — putting both jobs on one element made the scrollbar float in the middle of a wide desktop screen instead. A `wide` prop skips the width cap entirely for Legal/Support, whose card-grid content just needs the full pane width, not a narrow reading column.
- **Real endpoints, not placeholders:**
  - **Profile** (`ProfileSettingsForm.tsx`) — first/last name, level, bio, avatar (uploaded immediately on pick via `POST /profiles/avatar-preupload`, same pattern the setup wizard uses), all saved via `updateStudentProfile()`. Campus/major are shown (full joined names, School/Major fields — `min-w-0` is required alongside `flex-1 truncate` here or a long real name like "Electrical / Electronic Engineering (EEE)" overflows the box instead of truncating, a real bug hit and fixed on real seeded data) but **locked** (a `Lock` icon, not editable) — a one-time choice, changeable only by reaching out to support. An unsaved-changes guard (`unsavedChangesStore.ts`'s `runGuardedNavigation`) intercepts the mobile back arrow and the desktop rail's own links while the form is dirty, showing a Save/Discard modal instead of silently losing edits — also backed by a plain `beforeunload` listener for a hard refresh/tab-close, which can't have custom UI by browser design.
  - **Account** (`AccountManagementForm.tsx`) — avatar-initial circle + email (`break-all`, since an unbroken email string needs to wrap without a flex `min-w-0` trick) + member-since date, a Change Password section (`PasswordChecklist` live-validates the new password), and a Danger Zone (Deactivate Account, `ConfirmModal`-gated).
  - **Legal** (`/settings/legal`) and **Support** (`/settings/support`) — real FAQ/policy copy pulled **verbatim** from the marketing site (`Kampos-website`), not paraphrased, including a warning callout using real policy language ("breaking the Community Guidelines or Terms and Conditions can get your content removed or restricted, or your account suspended — or permanently terminated"). Links point at `env.TERMS_URL`/`PRIVACY_URL`/`COMMUNITY_GUIDELINES_URL`/`CONTACT_URL` etc. (Section 11), opening the marketing site in a new tab.
- **A real bug found and fixed along the way:** the backend's `ProfileType` enum is uppercase (`"STUDENT"`), but this app's own type/comparisons assumed lowercase everywhere — so the "is this a student profile" check silently failed for every real account, showing "Editing dey come soon for this profile type" to actual students. Fixed with `normalizeProfileType()` (`src/types/index.ts`), applied at every point `profileType` enters `authStore` from the API, not per call site (which is exactly how this bug slipped through the first time).
- **Dark-mode fix, same pass:** several input-bearing components (`TextInput`, `OtpInputs`, `FeedbackModal`, `AvitagStep`, `SearchSelectList`, `GiphyPicker`) had a hardcoded `bg-white` that ignored the `.dark` class entirely — swapped to the theme-aware `bg-surface-2` token.

---

## 5. The Gist Feature, End to End

**Plain-English:** A "gist" is a short post, optionally with photos/video/GIFs, that appears in a horizontally-swipeable card stack (like a cross between Tinder and Twitter). You react with one of 5 animated emoji, comment in a side panel, and can report/edit/delete/share.

### 5.1 Data flow and normalization

`gistStore.ts`'s `normalizeGist()` is a load-bearing function: the backend returns `reactions_count`/`comments_count`/`views_count`/`reports_count` as **flat fields directly on the gist row**, but the rest of the frontend (`GistCard` etc.) reads them nested under `gist.counts`. Without this normalization step (run on every `list`/`trending`/`byUser`/`get`/`getContext` call), every count would silently read as `undefined` → render as `0`, even though the raw data was right there under a different shape.

### 5.2 The card stack (`GistStack.tsx`)

The signature UI: gists render as an absolutely-positioned deck, with up to `WINDOW_AHEAD` (3) upcoming cards peeking behind at increasing rotation/offset/reduced opacity — only those are actually mounted (everything else returns `null`), keeping the DOM light regardless of feed length. `GistCard` is wrapped in `React.memo` — without it, every one of those mounted cards fully re-rendered on every single index step regardless of whether its own props actually changed, which read as the stack hanging mid-scroll.

**Desktop** (unchanged from before): front card draggable horizontally (Framer Motion `drag="x"`, threshold 90px or velocity 500), arrow keys, and horizontal wheel/trackpad gesture (vertical scroll is deliberately left alone so it scrolls a card's own content instead of switching cards).

**Mobile got its own, completely different navigation system**, after a long round of iteration on a live-drag-tracked version that kept surfacing new edge cases (a shared motion-value bug where a neighboring card froze mid-transition, freshly-revealed cards reacting to a foreign gesture's settle tail, two independent gesture detectors double-firing on one real swipe). The version that shipped is deliberately much simpler:
- **Horizontal drag is off entirely on mobile** (`drag={isFront && !isMobile ? "x" : false}`) — it was fighting the vertical gesture below for the same touch.
- **`useOverscrollNav`** (`src/lib/useOverscrollNav.ts`) is a plain distance/fast-flick swipe *detector*, not a live-tracked drag — it watches a touch, and once released, either calls `onNext`/`onPrev` once or does nothing; nothing moves on screen while the finger is still down. Still boundary-aware: a touch starting on genuinely scrollable content (a long paragraph, an expanded caption) only counts once that content is already at its scroll edge, so an ordinary reading-scroll is never hijacked; a touch starting on the card's header/footer chrome (or on content with nothing to scroll) counts immediately, since there's no reading-scroll to protect there. `GistCard`/`GistMediaStage` wire it into every scrollable-or-bare surface on the card; `GistStack` passes `next()`/`prev()` to the front card only.
- **The animation is independent of the gesture that triggered it**: once a swipe is confirmed, `AnimatePresence` plays a fixed enter/center/exit pose per card (`FALL_RISE_TRANSITION`, 180ms `easeOut` — tuned by feel: faster read as a snap, slower as sluggish under rapid swiping), both the outgoing and incoming card animating in parallel with nothing shared between them to fall out of sync.
- The header sits at `z-20` (bumped up from `z-10`) specifically so it always paints above a transitioning card's own z-index, which briefly needed to be higher than normal mid-exit.
- The one-time gesture tutorial (`SwipeHint`) has separate mobile (up/down chevrons, "Scroll to browse") and desktop (left/right) copy, matching whichever gesture that device actually uses.

`onNearEnd` fires (repeatedly, not once) whenever the front card is within `NEAR_END_THRESHOLD` (5) of the end of the loaded list — `FeedContent.tsx`'s `loadMore()` uses this for cursor pagination against `GET /gists?cursor=...`, tracking an `exhausted` flag once the backend returns an empty page so it stops re-firing. A newly-posted gist is spliced in right after whatever card is currently in view (not appended to the end of the loaded list), so posting while deep in the feed shows it on the very next swipe instead of requiring a scroll to the end.

A peeking card's right edge shows a genuine sliver of its first media item (image or video poster frame) during a desktop drag — a real content teaser baked into the swipe gesture itself, not a bolt-on affordance.

**`FeedScrollLock.tsx`** (mounted in the root layout, same pattern as `ThemeRouteSync`) toggles a `feed-locked` class (`html`/`body` `overflow: hidden` + `overscroll-behavior: none`) scoped to `/feed` only. Fixes a real iOS bug: a sub-pixel overflow anywhere in the nested `min-h-dvh` flex chain (easy to hit given iOS Safari's own `dvh` rounding) was enough to make the *document* technically scrollable by a few px, which is all iOS needs to hand a vertical touch over to its native whole-page rubber-band bounce instead of keeping it scoped to the card being touched.

**The feed header itself** (`FeedContent.tsx`) is two rows: avatar (left, links to `/${myAvitag}` — Section 4a) / wordmark (center) / a brand-filled compose "+" pill (right, opens `CreateGistSheet` with a freshly-picked typed placeholder prompt) on top, feed tabs below. Settings and the theme toggle **no longer live in the feed header at all** — they moved to the profile page's own top-right chrome (Section 4a), which is also where a create-gist entry point exists outside the feed now.

### 5.3 `GistCard.tsx` — the card itself

- **Header:** avatar, name/avitag/relative time (both avatar and name now link to `/${avitag}` — see Section 4a), campus/major/level tag pills (`CampusTag`/`MajorTag`/`LevelTag`, extracted into their own shared file, `src/components/gist/GistTags.tsx`, specifically so the profile page's `ProfileGistCard` — Section 5.3a — can reuse the exact same pills; each with a subtle staggered "dance" animation every few seconds), and a three-dot action menu (share / report for others' gists, edit+delete for your own). A Quote/repost action existed briefly but was deliberately removed — not planned for now.
- **Body:** short text-only gists (`SHORT_TEXT`, < 200 chars, no media) render as a bold colored "hero" card (`ShortGist`) using either the poster's own picked `color_key` (below) or, absent one, a deterministic per-gist color hashed from the gist id (`gistColorFor`, `src/lib/brand.ts` — an 8-color palette, trimmed from an original 12 for better at-a-glance distinctness). Sizing is shared with the compose sheet's own live preview via `src/lib/heroText.ts`: a length-driven **nominal** starting size (`nominalHeroTextRem` — a sqrt curve, so "hey" reliably renders bigger than a 15-char gist, not identically just because neither needs to shrink) plus a **measure-and-shrink** safety net (`fitHeroBlock`/`fitHeroTextarea`) that only kicks in if the real rendered box actually overflows (a long run of unusually long words, a narrow viewport) — a `ResizeObserver` re-runs it on rotation/resize. Longer text or gists with media get the full scrollable-text or media-panel treatment (Section 5.4).
- **Poster-picked hero color:** a palette button beside the compose sheet's char-count ring opens a swatch strip (only reachable while the colored hero treatment would actually render — short text, no media). The compose textarea itself previews it live once picked (background, centered text, avatar hidden, same shrink-to-fit sizing as the real posted card) — composing genuinely shows what posting will look like, not a blind guess. Creation-only for now; editing an existing gist's color isn't wired up (the edit `PATCH` route doesn't carry `color_key` through yet). Backend: nullable `gists.color_key`, whitelisted against `GIST_COLOR_KEYS` at both the Zod schema and controller layer (`KamposBackend/Kampos.md` Section 4) — falls back to the hash-based color when null, same as before this existed.
- **Reactions:** double-tap-anywhere (text-only cards only — media cards' tap gestures are already spoken for) triggers a LOVE reaction plus a big center-screen Lottie burst; the reaction row (`ReactionButton`) offers all 5 types (LIKE/LOVE/FIRE/SAD/LAUGH) with per-type counts, optimistic local deltas, and a shared `onReacted` callback so both entry points (double-tap and row-click) drive the same celebratory burst. **Mobile only** hides this row entirely in favor of `MobileReactionBadge` (Section 5.3a) — a wide 5-emoji row doesn't fit mobile's tighter footer.
- **Delete/Edit/Report:** all route through `useGistStore`; delete shows a `ConfirmModal`; edit reuses `CreateGistSheet` (pre-fills text+media and calls `update()`+media diffing instead of `create()`); report opens `ReportModal`; every action surfaces failures via `ErrorModal` instead of failing silently — an inline comment explicitly notes this used to be a real bug (failed reacts/reports/deletes looked successful until a reload silently reverted them).
- A `REJECTED` gist (only reachable via the share route) renders a dedicated "This gist has been removed" placeholder card instead of real content, so the surrounding stack's navigation still works past it.
- Any playing video pauses itself the moment the comment sheet, compose sheet, or an edit sheet opens over it (`mediaPaused`, flowing from `FeedContent` through `GistStack` into the front card's `isActive` check) — previously kept playing, audible, underneath a modal that had focus.

### 5.3a `ProfileGistCard.tsx` — the same gist, adapted for a plain vertical list

The `/${avitag}` profile page (Section 4a) needed the same gist look and actions, but laid out for "sits in a list among other rows" instead of `GistCard`'s "fills one fixed-height swipe-stack slot" — different enough (no fixed card height, no swipe gestures, a different footer layout) that it's its own component rather than a prop-flagged variant of `GistCard`, though it reuses `GistCard`'s own `ShortGist`/`PopActionButton`/`SHORT_TEXT` directly rather than duplicating them.

- **Header** is just the timestamp (the fixed date, not a relative one — moved here from the footer, which no longer repeats it) + the action menu — the poster's identity already shows once, up top of the whole page, so repeating it per-gist would be redundant here specifically (unlike the feed, where each card is its own self-contained unit).
- **Media** sits Twitter-style, below the text rather than behind it (`MediaBlock`/`MediaTile`/`VideoTile`): one item keeps its real proportions (capped at 420px tall), sized from **real width/height** when the backend has it (`knownRatio()`, driving a CSS `aspect-ratio` so the tile reserves the correct space before the image/video even loads — see Section 5.5's media-dimensions note) and falling back to client-side measurement otherwise (older media, or a GIF/sticker attached before GIPHY dimension capture existed). Two items sit side by side, still crop-balanced rather than ratio-balanced (a genuine "two different ratios into one clean row" layout isn't built yet — a known, deliberate gap, not a bug).
- **Reactions — mobile:** the wide 5-button row doesn't fit next to a comment button too, so mobile gets `MobileReactionBadge`'s own hero+orbit trigger in the footer; tapping it opens all 5 reactions centered *over the card's own body* (not a tray rising off the trigger, which wouldn't have room to rise on a short list card) with the same "click outside this card closes it" handling the action menu already has — needed specifically because with many cards in one list, opening a different card's picker is a click entirely outside the first one's own DOM.
- **Comments:** the footer's comment button carries the actual count (moved out of the stats row, since it's the same information now living in one place) and reports back up to `ProfileView` via `onToggleComments` rather than owning any comment UI itself — the profile page decides whether/which comment panel or sheet is open (Section 4a). `active` (true while the desktop panel is open and showing this exact gist) lights up the button's own ring, so it's visually obvious which card the panel refers to while scrolling.
- Long text clamps to 5 lines with a tap-to-expand "…more" (`ExpandableText`) that stays open once expanded, matching Twitter/Threads convention — no "show less".
- A `REJECTED` gist gets the same dedicated "removed" placeholder `GistCard` renders, for the same shared-link-only reachability reason.

### 5.4 Media — images, video, and the "text mode" swipe-up

`GistMediaStage.tsx` (`GistMediaBackdrop` + `GistMediaBodyPanel`) implements a genuinely clever interaction: media fills the card body as a backdrop (one full-bleed tile, or two side-by-side for a duo — on **mobile specifically, a duo splits top/bottom instead**, its own gated layout so the experiment stays scoped there; desktop keeps the original side-by-side permanently), with a caption strip on top showing a truncated preview of the gist text (WhatsApp-status style — rounded to match the media tile's own corners, "…more" colored brand-accent blue so it actually reads as the one tappable part; capped at 2 lines on mobile, with a narrower `<375px` tier using a shorter character budget so the clamp is reached before the browser needs to silently clip the "…more" affordance off entirely). Tapping/swiping up on it hands off to "text mode" — the media stays present but heavily blurred+dimmed behind the now-full gist text, with a pill to swipe back down. Video tiles reassign their tap gesture to mute-toggle (first tap unmutes; only once already unmuted does a tap toggle play/pause) since a plain tap can't also mean "open the media"; a dedicated expand button opens `GistMediaOverlay.tsx` instead — a portal-rendered, full-viewport (minus the 360px comment panel on desktop) media lightbox with its own play/pause/scrub/mute bar, left/right nav for a 2-item duo, keyboard support, and drag-to-navigate.

Images use `cloudinarySmartCrop()` (`src/lib/cloudinary.ts`), which injects Cloudinary's `c_fill,g_auto,ar_4:3` transformation into the delivery URL (content-aware crop finding faces/high-contrast regions) — a no-op for any URL that isn't actually a `res.cloudinary.com` delivery URL (e.g. a GIPHY-hosted GIF passes through untouched).

**Real media dimensions, not just guessing:** the backend now stores `width`/`height` on every `gist_media` row (migration `0033`, `KamposBackend/Kampos.md` Section 8) — reported by Cloudinary on every successful upload, and now by GIPHY too (below) for an attached GIF/sticker. `GistMedia.width`/`.height` (`src/types/index.ts`) ride along on every gist fetch. This exists specifically to stop a visible resize: a `<video>` element doesn't resolve its real dimensions until playback actually starts on most browsers, so a tile with no known size used to visibly jump the moment someone hit play. Currently **only `ProfileGistCard`** (Section 5.3a) actually uses it to size a tile via CSS `aspect-ratio` before load — the feed's `GistMediaStage`/`GistCard` still use their own existing crop/fixed-slot sizing, which doesn't need it the same way.

### 5.5 Upload flow — `CreateGistSheet.tsx`

- **Camera capture:** `WebcamCapture.tsx` — live `getUserMedia` preview, canvas snapshot to a JPEG blob, front/back camera toggle, mirrors the front-camera preview so the snapshot matches what was seen.
- **File picker:** validated client-side by `src/lib/mediaValidation.ts` — checks declared MIME type against an allowlist (`ALLOWED_IMAGE_TYPES`: jpeg/png/webp/gif; `ALLOWED_VIDEO_TYPES`: mp4/webm/quicktime), a size cap (10MB images / 150MB video), a video-length cap (`readVideoDurationSeconds` reads real duration off a throwaway `<video>` element's metadata before any upload starts — 120s max, rejected instantly with no bytes sent), **and** a real magic-byte signature sniff (`isGenuineMedia`) that reads the file's first bytes and confirms they actually match the claimed format — catches a renamed `virus.exe` → `photo.jpg` that MIME-type/extension checks alone would miss.
- **GIFs/stickers:** `GiphyPicker.tsx` (Section 5.7).
- Up to `LIMITS.maxMediaPerGist` (2) media items per gist — matches `GistMediaOverlay`'s own hardcoded assumption of showing only the first 2 items.
- Text limit: `LIMITS.gist` = 700 chars (comment limit is half that, 350) — a Twitter-style circular progress ring (`CharCountRing`) shows remaining count, only surfacing the actual number once close to the limit.
- New media only actually uploads (or, for edits, only actually gets deleted server-side) on **Save** — picking/removing items before that is purely local draft state, so closing the sheet without saving leaves the real gist untouched.
- On success, the gist is **re-fetched fresh** (not just the bare create/update response) so newly-attached media (uploaded in a separate step after the gist row itself is created) is actually reflected in what gets spliced into the feed.
- **Posting is all-or-none.** `handlePost` uploads every media item *before* committing the gist's text (or, for an edit, before applying the text change/removals) — if any item fails, whatever DID just upload in that attempt is deleted again immediately (the just-created gist itself, for a new post; the just-attached media, for an edit), the compose sheet's text and picks are left completely untouched, and a specific error explains what happened. This was a real, previously-shipped bug: a failed upload used to be silently swallowed, leaving a gist posted with only some (or none) of its media and no error shown anywhere.

#### Media upload: direct-to-Cloudinary, not through this app's own servers

`gistStore.uploadMedia` (called per-item from `handlePost`) does **not** send the file to this app's `/api/v1` proxy at all — it uploads straight from the browser to Cloudinary, in three steps (`src/lib/cloudinary.ts` + the backend's `media.controller.ts`, see `KamposBackend/Kampos.md` Section 8):

1. `GET /gists/:id/media/signature` — tiny request to this app's own backend, gets back a short-lived signed Cloudinary upload payload.
2. `uploadToCloudinaryDirect()` — the actual file bytes go straight to Cloudinary's own API via `XMLHttpRequest` (not `fetch`, specifically because `fetch` has no upload-progress event) — real percentage progress, no double-hop through this app's own server or its Next.js proxy.
3. `POST /gists/:id/media/finalize` — tells the backend what Cloudinary returned; the backend re-validates size/duration against real policy using Cloudinary's own reported numbers, not anything the client claims.

**Why it's built this way:** routing large files (especially video) through this app's own `/api/v1/[...path]/route.ts` proxy hits hard platform limits that have nothing to do with any cap configured in code — e.g. Vercel serverless functions cap request bodies around 4.5MB, well under even a short video clip. That was a real, previously-silent failure: uploads would fail with no useful error, appearing to work for tiny images and mysteriously failing for anything larger, with no way to tell why. Going direct to Cloudinary removes that ceiling entirely for the heavy part, on top of being genuinely faster (client talks straight to Cloudinary's CDN instead of relaying through two extra hops). The upload XHR's target (`api.cloudinary.com`) has to be explicitly allowed in `next.config.ts`'s CSP `connect-src` — missing at first, which silently blocked the request and surfaced to the XHR as a bare "network error", making a CSP policy violation look exactly like a dropped connection.

`MediaUploadError` (`gistStore.ts`) carries a `.stage` (`"signature" | "upload" | "finalize"`) so `CreateGistSheet.describeUploadFailure()` can show a specific, brand-voice reason per failure point — "couldn't reach Kampos to start the upload" vs. Cloudinary's own real rejection reason vs. the backend's own policy message — instead of one generic error no matter what actually went wrong. A `429` specifically (Kampos's own rate limiter, not a dropped connection) gets its own distinct message rather than the generic "check your connection" copy, which was actively misleading since the request had reached the server fine. Per-item upload progress renders as a slim brand-color ring around the thumbnail (matching the composer's own char-count ring) rather than a flat percentage number — reads sleeker, no digit cluttering a small thumbnail.

### 5.6 Reactions in depth

`ReactionButton.tsx` renders all 5 reaction types as real Lottie animations (`src/lib/reactionAnimations.ts` maps `ReactionType` → the JSON files in `src/assets/lottie/`), playing once on hover/click (not looping) so the resting row stays calm. `externalTrigger` lets something outside the row (the card's own double-tap handler) select a reaction exactly as if the button had been clicked, deduped via a `nonce` so a repeated trigger object doesn't re-fire. `guardClick` runs `requireAuth(...)` *before* any local optimistic state changes — gating any later would flash a reaction that never actually happened for a guest.

`gistStore.react`/`unreact` are optimistic: local `counts.reactions_count` and `my_reaction` update immediately, with a rollback to the pre-optimistic snapshot if the network call fails (an inline comment explains this replaced silent failure that "looked successful in the UI and then just vanish[ed] on reload with no explanation").

### 5.7 GIPHY picker

`src/lib/giphy.ts` wraps GIPHY's REST API (trending + search, `pg-13` rating, capped at GIPHY's real max of 50 results/request) with a 5-minute in-memory cache (module-level `Map`, survives picker unmount/remount for the whole page session) — deliberately conserving calls against GIPHY's free-tier 100/hour cap. If `NEXT_PUBLIC_GIPHY_API_KEY` isn't set, `GiphyPicker.tsx` shows a "GIFs and stickers aren't set up yet" empty state rather than erroring.

**GIPHY-attached media now carries real dimensions too**, matching the Cloudinary path (Section 5.4): GIPHY's own API reports `width`/`height` on `images.original` (as strings, same as Cloudinary-adjacent fields elsewhere — parsed and guarded against a missing/zero/non-numeric value) alongside the URL the picker already used. `GiphyItem`/`GiphyPicker`'s `onAttach` carry them through `CreateGistSheet`'s `PickedMedia` to `gistStore.attachMediaUrl(gistId, url, width, height)`, which the backend's `POST /:gist_id/media/url` now accepts and stores (`KamposBackend/Kampos.md` Section 8) — so a GIF/sticker tile sizes correctly before it loads too, not just an uploaded photo/video.

### 5.8 Comments

`CommentPanel.tsx` (desktop) and `CommentSheet.tsx` (mobile bottom sheet — genuinely rebuilt into a real comment surface, replacing an earlier non-functional compact input row) share `CommentList`/`CommentComposer` underneath, both wired into `commentStore`, with pagination, live-highlight for WS-delivered comments, skeleton/error/empty states, and optimistic single-tap-to-like reactions. Both skip their own tiled doodle backdrop once comments are known to be empty or failed to load — the empty/error state's own illustration/copy already fills that space, and the doodle behind it read as visual noise competing with it. The comment/reply send button plays a two-stage "launch away, spinner covers the wait, spring back with a bounce" animation instead of just jittering a static icon in place while sending.

Both `CommentPanel` and `CommentSheet` are reused as-is by the profile page's own comment UI (Section 4a) — same components, not a separate implementation.

`commentStore.ts` caches comments per `gist_id` (`itemsByGist`), never evicting — revisiting an already-viewed gist this session is instant. A batch prefetch (`prefetchBatch`, hitting `GET /comments/batch`) is fired from `FeedContent`'s `load()` for every gist just loaded, so opening the comment panel on most gists shows content immediately rather than a skeleton. A module-level WS subscription (`comment:created`) at the bottom of the file splices in comments posted by *other* users on any gist you already have cached, with a 2.5s "just arrived" highlight — this subscription is wired up once at module scope (not per-component), so it survives regardless of which panel is mounted.

### 5.9 Reporting

`ReportModal.tsx` — a full dialog (not a quick pop-out menu, deliberately: "a report is a deliberate, considered action, not a quick one-tap toggle") with 10 standard moderation-category pills (Spam, Harassment, Hate speech, Violence, Nudity, Self-harm, False info, Scam, Impersonation, Other — "Other" requires free text). The community-guidelines link points at `env.COMMUNITY_GUIDELINES_URL` (Section 11) — a real link now, not the old `href="#"` placeholder. `gist.my_report` (persisted server-side) seeds whether a gist shows as already-reported across reloads, replacing an earlier session-only local flag.

### 5.10 Sharing

`GistCard.handleShare` tries `navigator.share` first (the OS's native share sheet — covers WhatsApp/Instagram/X/etc. automatically on mobile, since most desktop browsers don't implement it at all) and falls back to `ShareModal.tsx` — explicit WhatsApp/X/Facebook share-intent links plus copy-to-clipboard. Instagram deliberately has no button (no public share-URL scheme exists for it). The shared URL is always the gist's real `/gist/[gistId]` deep link, not the current page URL.

**Share tracking is real, not display-only:** every completed share — `navigator.share` resolving, a platform link being clicked, or copy-link succeeding — calls `gistStore.share(gistId, platform)`, which fires `POST /gists/:gist_id/share` (best-effort, errors swallowed, never blocks the actual share). The backend logs each one to a `gist_shares` table (mirrors `gist_views`: raw rows, no dedup, one row per real share) and folds the total into `v_gist_counts.shares_count`, which `normalizeGist` now reads the same way it reads `views_count`/`reports_count`. `platform` is a free-form label (`"whatsapp"`/`"x"`/`"facebook"`/`"copy_link"`/`"native"`) kept purely for future analytics, not enforced against a fixed list server-side.

### 5.11 OG image generation (`/api/og/[gistId]/route.tsx`)

Uses Next's `ImageResponse` (Vercel's `next/og`, built on Satori) to render a genuine 1200×900 PNG server-side at request time — taller than the standard 1200×630 OG ratio deliberately, trading strict compatibility with X/Facebook's own center-crop tiling for more breathing room on WhatsApp/iMessage/Slack and the app's own direct-link share flow.

Two documented Satori quirks handled explicitly in comments:
1. **Font loading:** `next/font`'s own downloads happen at *build time* as CSS, not raw bytes usable by Satori — so this route fetches the actual Google Fonts `.woff`/`.ttf` file at *request* time instead (`loadGoogleFont`), scoped via the CSS `text=` param to only the glyphs actually needed (keeps it fast/small). Campus/major tags are uppercased in JS before being passed into that scoped font-loading call, not via CSS `text-transform` — because the font subset only contains glyphs for characters in the *source* string, so a CSS-only uppercase would render letters Satori never actually loaded glyph data for and silently substitute a mismatched fallback font.
2. **No real emoji support:** Satori falls back to a generic inline image per emoji glyph that doesn't baseline-align with surrounding text (visible artifacts). Since Kampos gist text is emoji-heavy by design, `stripEmoji()` removes them **only from this static OG image** — the real in-app `GistCard` (genuine browser rendering) still shows emoji completely normally everywhere else.

Images-only in the OG card (first 2 non-video media items) — no server-side video-frame extraction without extra tooling like ffmpeg, so a gist with only video renders as if it were text-only.

---

## 6. Setup-Profile Wizard & Onboarding

**Plain-English:** After verifying your email, a 5-step wizard collects your name, campus, major/level, an optional photo+bio, and finally your unique handle ("avitag") before creating your actual profile.

**Technical details:** One page (`SetupProfileWizard.tsx`) mounts `AppShell`+`StepScaffold` exactly once — only the inner content (keyed by step index) slides left/right via Framer Motion as `currentStep` (persisted in `setupProfileStore`) changes, so the backdrop/wordmark chrome never remounts. Each step is a self-contained component implementing `StepProps`/reporting a `StepController` (`continueDisabled`, `onContinue`, optional `loading`) up to the orchestrator via `setController` — this is how one shared `StepScaffold`/Continue-button instance drives five completely different steps' worth of validation without prop-drilling every field.

1. **`NameStep`** — first/last name, live per-field validation (`validateNamePart`: letters only, min 3 chars), written to the store on every keystroke (not just on Continue).
2. **`SchoolStep`** — campus picker via `SearchSelectList` (`layout="list"`), backed by `referenceStore.fetchCampuses()` → `GET /misc/campuses`. The school/academics steps show a loading skeleton on first paint rather than instant seeded data — the never-used `defaultCampuses.ts`/`defaultMajors.ts` fallback seed files (and the commented-out import that referenced them) were removed in a later cleanup pass, since the backend has been live for a while and nothing actually read them.
3. **`AcademicsStep`** — major (`SearchSelectList`, `layout="chips"`, backed by `fetchMajors()` → `GET /misc/majors`) then level (100–600, only revealed once a major is picked, to avoid splitting attention on two decisions at once).
4. **`ProfileStep`** — optional avatar photo + bio (max `LIMITS.bio` = 250 chars, color-coded countdown). The photo uploads to Cloudinary **immediately** on pick via `POST /profiles/avatar-preupload` (not held as a raw file until final submit) — this is specifically what lets the picture survive a page reload mid-setup (an object URL/File can't be persisted to localStorage, but the resulting Cloudinary URL can). Both fields are optional; Continue only blocks while an upload is actually in flight.
5. **`AvitagStep`** — the handle. Client-side format validation (`validateAvitag`: 4–15 chars, letters/numbers/underscores, must contain a letter, no leading/trailing/double underscores, and rejected if it's on `RESERVED_AVITAGS` — Section 4a/10 — mirrors the backend's own rule) plus a **debounced (450ms) live availability check** against `GET /profiles/avitag-available/:avitag`, guarded by a `checkId` ref so a slow earlier check can't clobber a faster later one's result. Continue is disabled until the backend has actually confirmed `"available"` — a merely-valid-format tag isn't enough. The field itself shows a live inline status icon in its own trailing slot (`TextInput`'s `trailingIcon` prop — spinner while checking, red X once confirmed taken, green check once confirmed free) instead of plain "Checking..." text, and once confirmed available, a real preview card appears below it — avatar, name, avitag, campus/major/level tags, the same header treatment a real gist card uses — so picking a handle previews the actual profile it'll produce, not just a cleared form field. Hidden entirely while still checking or taken, so it never previews a name someone else already has. On submit, `createStudentProfile()` posts to `POST /profiles/students` (multipart form), then auto-`switchProfile`s into it, then routes to `/feed`. A specific race is handled: if the availability check said "available" moments ago but someone else grabbed the tag in between, the backend's real primary-key constraint catches it and the UI surfaces a friendly "No vex, dem don carry this tag" message while flipping the local availability state back to "taken".

The whole wizard's draft (`data`, `imageUrl`, `currentStep`) persists to `localStorage` (`kampos.setup-profile`) so leaving mid-setup and returning resumes exactly where you left off — cleared only once profile creation actually succeeds (on the step component's *unmount*, not the instant creation succeeds, specifically to avoid a visible flash of step 0 rendering behind the success modal).

### Onboarding carousel (`src/app/OnboardingCarousel.tsx`)

3 Kappy-mascot slides (`src/lib/brand.ts`'s `ONBOARDING` array) with pidgin-voice copy, ported verbatim from mobile. `hasSeenOnboarding()`/`markOnboardingSeen()` (`src/lib/onboarding.ts`) are a simple localStorage flag (`kampos.onboarding-seen`) — purely local, no backend — so a returning guest skips straight to `/welcome`. Desktop renders a full-bleed split-screen (illustration fills one half, no boxed card); mobile keeps the original stacked layout. Extensive inline comments document a specific historical bug: illustrations at differing aspect ratios used to get cropped/distorted at certain breakpoints because the containing box's shape had no relationship to the source art's actual proportions — the fix was locking every slide's box to the source art's real aspect ratio (`aspect-[1024/922]`) so it only ever scales uniformly.

---

## 7. Theming

**Plain-English:** Dark mode exists, but only on the main logged-in app screens (feed/profile/settings) — every auth/onboarding/setup screen always renders light, regardless of what you last picked, so the first-impression flow never looks broken by whatever theme you left the app in.

**Technical details:**
- `themeStore.ts` owns only the **preference** (`"light"`/`"dark"`, persisted directly to `localStorage` under `kampos-theme`, read/written outside Zustand's `persist` middleware) — it deliberately never touches `document.documentElement` itself.
- `ThemeRouteSync.tsx` (mounted once in the root layout) is the **one place** that actually toggles the `.dark` class on `<html>`. Gating logic (`isDarkEnabledRoute`) changed shape once `/profile` stopped being a fixed route segment (Section 4a) — a profile now lives at the bare root (`/avitag`), so it can no longer be matched by a fixed path prefix the way `/feed`/`/settings` can. Instead, a `LIGHT_ONLY_ROUTES` set lists every route that should always render light (`""`/`welcome`/`login`/`signup`/`signup-success`/`verify-otp`/`forgot-password`/`reset-password`/`setup-profile`/`gist`), and *everything else* — `feed`, `settings`, or any other first path segment (i.e. any avitag) — is treated as dark-eligible. It re-runs on every client-side navigation (App Router route changes don't re-run a `beforeInteractive` script).
- A tiny inline `<Script id="kampos-theme-init" strategy="beforeInteractive">` in `layout.tsx` applies the same route-gated logic **before first paint** on a hard/initial load, to avoid a flash of the wrong theme; `ThemeRouteSync` takes over for every subsequent client-side nav.
- CSS variables: Tailwind v4's `@theme` block in `globals.css` exposes brand tokens (`--color-brand`, etc.) plus theme-aware surface/text tokens (`--color-surface`, `--color-ink`, `--color-muted`, `--color-faint`, `--color-line`, `--color-brand-tint`) that indirect through `--kp-*` custom properties, redefined separately under `:root` and `.dark` — every component using `bg-surface`/`text-ink`/etc. becomes dark-mode-aware automatically with zero per-component `dark:` classes needed for those specific tokens. Components that need genuinely different treatment per theme (e.g. inverting an SVG doodle backdrop) still use explicit Tailwind `dark:` variants.
- `ThemeToggle.tsx` renders a neutral icon until `mounted` flips true client-side, avoiding a server/client hydration mismatch since the real theme is only knowable in the browser.

---

## 8. Styling Conventions

- **Fonts:** **Nunito, everywhere** — the app's only font now. The original Poppins-for-UI/Nunito-for-content split didn't read as intended once designer eyes were actually on it, so every `font-poppins` utility, the body's default `font-family`, and the OG share-image renderer's font all swapped to Nunito; `next/font/google` now only loads Nunito, widened to the specific weights actually used across the app (400/500/600/700/800). `display: "swap"`, exposed as a CSS variable, same as before.
- **Brand color palette:** `src/lib/brand.ts` — `GIST_CARD_PALETTE` (8 muted colors used for short/text-only "hero" gist cards and the poster-picked `color_key` swatch strip — Section 5.3; trimmed from an original 12, dropping ones too close to a neighbor to read as a genuinely different pick, plus a "neutral" gray that didn't really read as a *color* choice; layman names throughout — e.g. `yellow`/`pink`, not `olive`/`magenta` — kept in sync by hand with the backend's own identical `GIST_COLOR_KEYS`, `KamposBackend/Kampos.md` Section 4), deterministically picked per gist via a simple string hash (`gistColorFor`) when no explicit pick exists, so an unpicked gist's color never flickers across renders.
- **Limits** (`LIMITS` in `brand.ts`): `gist` 700 chars, `comment` 350 (half of gist), `bio` 250, `otp` 6 digits, `avitagMax` 15, `maxMediaPerGist` 2.
- **UI component library** (`src/components/ui/`): `Button` (pill-shaped, spring press animation, `primary`/`secondary`/`ghost` variants, an `invert` prop for the welcome screen's blue/white swap treatment only), `TextInput` (rounded field, password show/hide toggle), `Modal` (portal-rendered to `document.body`, `center`/`sheet` variants, locks body scroll, Escape-to-dismiss), `FeedbackModal.tsx` (exports `ErrorModal`/`ConfirmModal`/`SuccessModal` — all thin wrappers around `Modal`), `Avatar` (graceful degrade to a plain grey circle on missing/broken image, Twitter-style — no placeholder illustration, no broken-image icon), `Chip` (selectable pill for majors/levels), `LinkText` ("Already have an account? Log in." pattern), `OtpInputs` (6-box entry with auto-advance, paste support, and a shake animation keyed by a monotonically-increasing `shakeSignal` rather than a boolean — a boolean can't replay the shake for two consecutive wrong attempts since React bails out of re-rendering on an unchanged value).
- **`GhostCard.tsx`** (`src/components/brand/`) — a small abstract "card silhouette" (avatar dot + text-line bar + colored block, no real content) used by `PhoneKappyOrbit`'s mobile layout in place of real `MiniGistCard`/`MiniCommentCard` content. The orbiting mini-cards were sized/positioned for desktop's wider box; on mobile's narrower, near-square box, real content at that size ended up overlapping and covering Kappy's face almost entirely instead of orbiting around him. `GhostCard` reads as "a gist card" at a glance without needing to actually be legible that small — desktop is unaffected, still real (shrunk-down) card content.
- **`icons.tsx`:** the single icon surface for the whole app. `lucide-react` (thin-stroke, used for plainer UI chrome: close/search/eye/chevron/etc.) and `@phosphor-icons/react` fill-weight icons (bolder/playful — the gist card's pop-out action menu, footer metrics, video controls, and top navigation) are both re-exported from here under Kampos-specific names (e.g. `ShareIconFill`, `CommentIconFill`), so nothing in the app imports either library directly — swapping icon libraries later only touches this one file.
- **Illustrations:** `src/components/brand/illustrations.tsx` is deliberately split into two registries. Genuine vector art (`Kamill`, `Doodles`, `Doodlecard`, `Commentmodal`, `Commenticon`, `Opencomment`, `Cameraicon`, `Bad`) still imports as real inline SVG components via SVGR, so it scales crisply and can be styled. A second set (`Kappywithphone`, `Kappywithfood`, `Kappywithwire`, `Kappymagnifyingglass`) is raster — `.webp` files rendered via `next/image` — because the original `.svg` sources for these were never actually vector art: each one was multi-layer AI-generated artwork (individual layers up to 1024px) wrapped in an SVG `<pattern>`/`<image>` tag with the raster baked in as base64. Since SVGR inlines whatever it's given straight into the JS bundle, that meant 10MB+ of base64 image data was shipping inside the app's own JavaScript, on every page that touched any of them — not lazy-loaded, not compressed, not cached like a real image, just dead weight in every bundle. `scripts/convert-illustrations.mjs` (one-off, kept for reference) rendered each through `sharp` down to a real compressed WebP at a sane target resolution (generous retina headroom over its actual max on-screen size, not the source's absurd native resolution) — roughly a 50x size reduction combined. The `Illustration` component picks the right rendering path per name transparently; every call site (`<Illustration name="X" className="..." />`) is unchanged either way. `KappyWaving`/`KappyPhone`/`KappyLookingUp` (the three full-body mascot shots used via `next/image` directly, not through this registry) went through the same PNG→WebP conversion for the same reason, just without the fake-SVG wrapper — same visual result, ~95% smaller source files.
- **Confirmed dead and removed in the same cleanup pass:** `Kappyup.svg` (9.1MB) and `Kappyswag.svg` (3.9MB) — both were only ever reachable through a branch of `OnboardingCarousel`'s illustration switch that could never actually execute (the carousel has exactly 3 slides, all three handled by earlier, always-true branches above it; see Section 6). `Prototype.svg`, `Googleicon.svg`, `Appleicon.svg`, `Facebookicon.svg` were registered in `illustrations.tsx` but never rendered anywhere (no OAuth UI exists to use the provider icons — see Section 13). `KappyPhone.full.png`/`KappyLookingUp.full.png` were unimported duplicate originals. Total: roughly 28MB of dead files removed, on top of the raster-conversion savings above.
- **Doodle backdrop:** a single tiled SVG (`/brand/doodles.svg`, served from `public/`) reused across the feed, comment panel, onboarding, AuthShell, and AppShell's landscape variant — inverted (`dark:invert`) rather than swapped for a separate dark asset, to keep it legible against a dark background.

---

## 9. Data Flow / Types

`src/types/index.ts` is deliberately permissive in places (`[key: string]: unknown` fallthrough on `Account`, `Profile`, `Gist`, `Comment`) — an explicit comment notes the backend shape isn't fully pinned down and types get "tightened as endpoints are confirmed." Key shapes:

- **`normalizeProfileType()`**: the backend's own `ProfileType` enum is uppercase (`"STUDENT"`, etc.) on every response that carries one; this app's own type/comparisons assume lowercase everywhere. Every `profileType` value passes through this the moment it arrives from the API (applied at every ingestion point in `authStore.ts`, not per call site — see Section 4b for the real bug this fixes) rather than trusting the raw value.
- **`Profile`**: now also carries `campus_name`/`major_name` (full joined names, not just the short `campus_tag`/`major_tag`) on a student profile fetch — see Section 4a/9's `GET /profiles/students/:avitag` note and `KamposBackend/Kampos.md` Section 4.
- **`Gist`**: `gist_id`, `avitag`, `gist_text`, `created_at`/`edited_at`, `media?: GistMedia[]`, `counts?: GistCounts`, `campus_tag`/`major_tag`/`level`, `color_key?: string | null` (the poster's own picked hero color — Section 5.3, null falls back to the hash-based color), `my_reaction`/`my_report` (viewer-specific, hydrated inline from list/get responses so the UI never needs a separate per-gist fetch to know "did I already react/report this").
- **`GistMedia`**: gained `width?: number | null` / `height?: number | null` — Cloudinary's (or now GIPHY's) own reported dimensions, null for anything that predates this or was attached by URL without them (Section 5.4/5.7).
- **`GistCounts`**: `reactions_count`, `comments_count`, `views_count`, `reports_count`, `shares_count` (real, backend-tracked — see below), `reactions_by_type` (per-emoji breakdown).
- **`Comment`**: `comment_id`, `gist_id`, `text`, `commented_at`, `reactions_count`, `my_reaction`, plus denormalized commenter profile fields (`first_name`, `campus_tag`, `major_tag`, `level`, `image_url`) joined server-side.
- **`ReactionType`** = `"LIKE" | "LOVE" | "FIRE" | "SAD" | "LAUGH"` — matches the backend, which renamed its `WOW` enum value to `LAUGH` in place (migration `0029_rename_wow_reaction_to_laugh.sql`, see `KamposBackend/Kampos.md`). `REACTION_ANIMATIONS` maps `LAUGH` to `laugh.json` in `src/assets/lottie/`; the leftover `wow.json` from before the rename was removed.

**Normalization** (`normalizeGist`/`normalizeGists` in `gistStore.ts`) is the one meaningful transform between backend and frontend shape — see Section 5.1. No other systematic normalization layer exists; most other data is consumed close to its raw backend shape.

---

## 10. Validation & Security

- **`src/lib/validation.ts`** — email regex, the shared `PASSWORD_RULES` array (8+ chars, one lower/upper/number/special-char — each rule independently testable, driving both a live green-checklist UI on signup and the submit-time gate), name-part validation (letters only, 3+ chars), avitag validation (4–15 chars, alphanumeric+underscore, must contain a letter, no leading/trailing/double underscore, and not on `RESERVED_AVITAGS` — `login`/`signup`/`feed`/`settings`/`gist`/`api`/`profile`/`kampos`/`kappy`/`ceo`/`admin`/`test` — since a profile lives at `/avitag` with no prefix, Section 4a) — explicitly "ported verbatim in spirit from the mobile app" to keep both platforms' rules identical. The reserved-word check is mirrored server-side too (`KamposBackend/Kampos.md` Section 2) — that's the real enforcement point; this one is just a fast, friendly client-side echo of it.
- **`src/lib/sanitize.ts`** — `stripInvisibleChars` (strips zero-width/bidi-override/control characters — safe to run on every keystroke, used to prevent hidden-text/word-filter-dodging/display-order-spoofing tricks like U+202E right-to-left override), `sanitizeForSubmit` (adds a final trim + caps runs of 4+ blank lines so someone can't pad a post into a wall of empty space), `sanitizeFileName` (strips anything unsafe from an uploaded file's name across OS/filesystem boundaries). An inline comment is explicit that this is about **content hygiene**, not XSS — React already escapes everything it renders as text, so this isn't a script-injection defense.
- **`src/lib/mediaValidation.ts`** — real magic-byte signature sniffing (see Section 5.5) on top of MIME-type/size checks; genuinely catches a renamed/mislabeled file that a naive `<input accept>` + `.type` check would miss.
- No CSRF-token mechanism is visible in this repo — session security relies entirely on the httpOnly cookie + same-origin proxy pattern (Section 1).

---

## 11. Environment Variables

From `.env.example` (copy to `.env.local`) and `src/lib/env.ts`. Only `NEXT_PUBLIC_*` vars are exposed to the browser — since this is a client app, nothing it needs can be a real secret.

| Variable | Purpose | Default if unset |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the Kampos backend (REST at `/api/v1`, WebSocket on the same origin, scheme swapped `http→ws`) | `https://kamposbackend-001.onrender.com` |
| `NEXT_PUBLIC_SITE_URL` | This site's own public origin — required to resolve relative OG/Twitter image URLs (`/api/og/[gistId]`) into absolute ones share-preview crawlers can fetch. **Must** be set to the real production domain wherever deployed, or shared links' image previews break. | `http://localhost:3000` |
| `NEXT_PUBLIC_KAMPOS_WEBSITE_URL` | The separate Kampos marketing site — Terms (`/terms`), Privacy (`/privacy`), and Community Guidelines (`/community-guidelines`) all live there, not in this app. `env.TERMS_URL`/`PRIVACY_URL`/`COMMUNITY_GUIDELINES_URL` derive from it. One env change swaps every link over once the real domain exists. | `https://kampos-website.vercel.app` |
| `NEXT_PUBLIC_GIPHY_API_KEY` | GIPHY API key for the GIF/sticker picker (free from developers.giphy.com) | empty string — `GiphyPicker` shows a "not set up yet" state instead of erroring |

`env.ts` validates both URLs with `new URL(...)` at module load, throwing a clear build/server-startup error if either is malformed — a deliberate fail-fast so the app never ships silently pointed at a broken API origin.

---

## 12. Real-Time (`src/lib/ws.ts`)

**Plain-English:** The app keeps one lightweight WebSocket connection open purely to receive live notifications (e.g. "someone else just commented on a gist you have open") — it never sends anything over this connection.

**Technical details:** `WSClient` is a small hand-rolled class (not Socket.IO or graphql-ws on the frontend, even though the backend runs all three — this only ever speaks the backend's raw `/ws` protocol) with lazy connection (only connects on first `subscribe()` call), exponential backoff reconnection (1s doubling up to a 15s cap), and a topic→listener-set map. One shared module-level instance (`wsClient`) is exported so every subscriber rides the same socket.

**The explicitly-documented guest-only limitation:** "Browsers can't attach custom headers (Authorization) to a WebSocket handshake — the backend's gateway falls back to a guest identity whenever that header is missing, so this connection is always read-only/guest." In practice this means the WS connection can receive broadcasts (new comments, gist approvals) but can never be used to authenticate or write — all writes (reacting, commenting, posting) go through the authenticated REST client (`api.ts`) instead, and the app relies on that mix: reads/live-updates over WS, writes over REST.

Currently the **only** consumer is `commentStore.ts`'s module-level `comment:created` subscription (Section 5.8). No other topic is subscribed to anywhere in this codebase — gist-approval broadcasts, reaction broadcasts, etc. (which the backend does emit, per its own docs) aren't currently wired up to update the frontend live.

---

## 13. Things That Look Built But Aren't (Known Gaps)

- **Public profile pages are student-only.** `/[avitag]` (Section 4a) only ever renders a *student* profile — kreator/kompany/school/idiot profiles have no public page of their own yet, even though the backend has endpoints for all five profile types.
- **Multi-profile switching has no UI.** `profileStore.switchProfile` exists and is called internally (auto-switch after creating a profile, and `authStore`'s self-heal), but there's no screen or menu letting a logged-in user with multiple profiles pick which one is active. Worth knowing alongside this: a gist always posts as whichever profile is *currently active*, not whichever profile's page happens to be open (Section 4a) — confirmed intentional, not something to "fix" once multi-profile support is real.
- **The profile page's two-photo layout doesn't use real dimensions yet.** `ProfileGistCard`'s `MediaBlock` (Section 5.3a) now has real width/height available for a duo, same as the single-item case, but still falls back to the older equal-crop split rather than a Twitter-style ratio-balanced row — a deliberate scope cut (a real design question, not a quick fix), not a bug.
- **OAuth (Google/Facebook/Apple) has no frontend UI.** The backend supports it (per its own docs), and illustration assets for all three provider logos exist in `src/assets/illustrations/` (`Googleicon.svg`, `Facebookicon.svg`, `Appleicon.svg`), but no login/signup button in this repo actually wires them up — only email/password auth is reachable from the UI.
- **Real-time is read-only and narrow in practice.** Only `comment:created` is subscribed to; gist approval/rejection broadcasts and reaction broadcasts (which the backend does emit) aren't consumed anywhere in the frontend, so e.g. a newly-approved gist from someone else won't appear in your feed live — only on next full reload/refetch.
- **No test suite.** No test script, no test files found anywhere in `src/`. Verification throughout this repo's history has instead been manual — `tsc`/`eslint` for correctness, and Playwright screenshots at real breakpoints for anything visual/responsive, run ad hoc rather than as a committed suite.
- **`todo.md`** (repo root) is a live, informal list of outstanding polish items in the founder's own words — worth reading directly for anything not captured above, though it's not kept perfectly in sync with what's actually shipped (some listed items, like edit/delete, sharing, and settings/profile screens, are now done).

---

## 14. Repository Layout

```
kampos-web/
├── public/                       Static assets (brand/doodles.svg, etc.)
├── todo.md                       Informal running backlog/punch list
├── AGENTS.md / CLAUDE.md         Generic Next.js-version warning (not project-specific)
├── .env.example                  Environment variable template
└── src/
    ├── middleware.ts              Silent access-token refresh before every page's gate check
    ├── svg.d.ts                   SVGR type declarations
    ├── app/
    │   ├── layout.tsx              Root layout: fonts, theme-init script, SessionWatcher, AuthPromptModal, ThemeRouteSync
    │   ├── globals.css             Tailwind v4 theme tokens, light/dark CSS variables
    │   ├── page.tsx                "/" — onboarding carousel (guest-only)
    │   ├── OnboardingCarousel.tsx
    │   ├── welcome/                Landing screen (guest-only)
    │   ├── login/, signup/, forgot-password/, reset-password/, verify-otp/
    │   │                           Auth screens — each page.tsx (server gate) + a Form.tsx (client)
    │   ├── signup-success/         Post-verification celebration (needs-profile only)
    │   ├── setup-profile/          5-step wizard orchestrator (needs-profile only)
    │   ├── feed/                   Main app — page.tsx (gate) + FeedContent.tsx (the real UI)
    │   ├── [avitag]/                Public profile page (no gate) — page.tsx + ProfileView.tsx (Section 4a)
    │   ├── settings/                 layout.tsx (rail + gate) + page.tsx/SettingsHub.tsx (hub) +
    │   │                              profile/, account/, legal/, support/ subpages (Section 4b)
    │   ├── gist/[gistId]/          Ungated shared-link view: page.tsx + GistShareView.tsx
    │   └── api/
    │       ├── v1/[...path]/route.ts   Same-origin backend proxy (Section 1)
    │       └── og/[gistId]/route.tsx   Dynamic per-gist OG image generation (Satori)
    ├── opengraph-image.tsx          Static site-wide default OG image (Section 5.11-adjacent)
    ├── robots.ts, sitemap.ts         SEO: crawl rules + the few real guest-facing URLs
    ├── components/
    │   ├── auth/                  HydrateAuth, SessionWatcher, AuthPromptModal
    │   ├── brand/                 Wordmark, illustrations.tsx, GistPreviewCard/Marquee, MiniGistCard, MiniCommentCard, PhoneKappyOrbit, KappyOpportunitiesOrbit, GhostCard (Section 8)
    │   ├── comment/                CommentPanel, CommentSheet (mobile bottom sheet), CommentList/CommentComposer (shared by both — Section 5.8)
    │   ├── gist/                   GistCard, GistStack, CreateGistSheet, GistMediaStage, GistMediaOverlay, ReactionButton, ReportModal, ShareModal, GiphyPicker, WebcamCapture, GistCardSkeleton,
    │   │                            GistTags (CampusTag/MajorTag/LevelTag — Section 5.3), ProfileGistCard/ProfileGistCardSkeleton (Section 5.3a), MobileReactionBadge (Section 5.3a)
    │   ├── layout/                  AppShell, AuthShell, FeedScrollLock (Section 5.2)
    │   ├── onboarding/             ProgressDots
    │   ├── settings/                SettingsRail (desktop nav), SettingsPageShell, SettingsHeader, SettingsRow, LogoutAction (Section 4b)
    │   ├── setup/                  StepScaffold, SearchSelectList, types.ts, steps/{NameStep,SchoolStep,AcademicsStep,ProfileStep,AvitagStep}
    │   ├── theme/                   ThemeRouteSync
    │   └── ui/                      Button, TextInput, Modal, FeedbackModal, Avatar, Chip, LinkText, OtpInputs, ThemeToggle, icons.tsx
    ├── lib/
    │   ├── api.ts                  Shared axios instance + 401/refresh interceptor
    │   ├── env.ts                  Validated env var access
    │   ├── serverAuth.ts            resolveServerAuthState, gateServer
    │   ├── serverProfile.ts          fetchStudentProfileByAvitag() (cache()-wrapped) — server-side profile fetch for /[avitag] (Section 4a)
    │   ├── authGate.ts              destinationFor()
    │   ├── requireAuth.ts            requireAuth() — the shared "must be logged in" gate for actions
    │   ├── serverGist.ts             fetchGistContext() — server-side gist fetch for the share route
    │   ├── cloudinary.ts             cloudinarySmartCrop(), uploadToCloudinaryDirect() (Section 5.5)
    │   ├── heroText.ts                nominalHeroTextRem/fitHeroBlock/fitHeroTextarea — shared hero-text sizing (Section 5.3)
    │   ├── useOverscrollNav.ts        Mobile vertical swipe-to-navigate detector (Section 5.2)
    │   ├── useIsMobile.ts             Breakpoint hook, backs every mobile/desktop UI branch introduced this round
    │   ├── sanitize.ts, mediaValidation.ts, validation.ts   Content/input safety (validation.ts also owns RESERVED_AVITAGS — Section 10)
    │   ├── ws.ts                    WSClient
    │   ├── giphy.ts                  GIPHY API wrapper + cache (now includes width/height — Section 5.7)
    │   ├── format.ts                  timeAgo, friendlyDateTime, compactNumber, formatCountdown
    │   ├── brand.ts                  GIST_CARD_PALETTE (8 colors), gistColorFor, LIMITS, ONBOARDING copy
    │   └── onboarding.ts              hasSeenOnboarding/markOnboardingSeen (localStorage)
    ├── stores/                      One Zustand store per domain (Section 3) — plus unsavedChangesStore.ts (runGuardedNavigation, Section 4b)
    ├── types/index.ts                Shared domain types
    └── assets/
        ├── illustrations/           WebP (converted raster art) + genuine vector SVGs — see Section 8
        └── lottie/                    fire/laugh/like/love/sad.json reaction animations
scripts/
└── convert-illustrations.mjs        One-off sharp conversion script, kept for reference
```

---

## 15. Glossary (Frontend Perspective)

- **Gist** — a post; the app's core content type, rendered as a swipeable card.
- **Avitag** — a user's unique handle/username, chosen during the setup wizard's last step.
- **Profile** — a public identity (student, creator, company, school, or admin) tied to an account; this frontend's UI only actually builds *student* profiles (`createStudentProfile`) — the wizard has no path for the other profile types even though the backend supports them.
- **Account** — the private login; one account can hold multiple profiles, though this frontend has no UI to switch between them.
- **AuthGateState** — this app's own five-value vocabulary (`unknown`/`guest`/`needs-otp`/`needs-profile`/`active`) for "what should this visitor be allowed to see right now."
- **Gate / `gateServer`** — the server-side check every page runs before rendering, redirecting before any HTML ships if the visitor's state isn't allowed on that page.
- **HydrateAuth** — the client component that seeds the Zustand auth store from a gate check the server already did, with no extra network round trip.
- **Same-origin proxy** — `/api/v1/[...path]/route.ts`, the mechanism that makes the backend's httpOnly session cookie first-party to this app (Section 1).
- **Campus tag / major tag** — short lowercase codes (e.g. `unilag`, `computer-science`-style tags) attached to a student profile and, by extension, to their gists — used for the colored tag pills on cards and for future feed filtering.
- **Kappy** — the Kampos mascot, illustrated throughout onboarding, empty states, and error/prompt modals.
- **Avitag availability check** — the debounced live `GET /profiles/avitag-available/:avitag` call during setup, distinct from (but advisory to) the backend's real primary-key uniqueness constraint, which is what actually decides in a race.
