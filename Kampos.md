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
| `/profile` | `active` only | **Placeholder** — literally just an illustration + "Your profile dey cook 👀" message. No real profile screen exists yet. |
| `/settings` | `active` only | **Placeholder** — same pattern, "Settings dey come 🔧". |
| `/gist/[gistId]` | **No gate at all** | See below — the one deliberately ungated page. |
| `/api/v1/[...path]` | n/a | The auth proxy (Section 1). |
| `/api/og/[gistId]` | n/a | Dynamic OG image generation (Section 5). |

### The ungated `/gist/[gistId]` share route

This is architecturally the most interesting route. It's the page a shared gist link actually points to (`GistCard`'s `shareUrl` is `${origin}/gist/${gist.gist_id}`, not `window.location.href`). It deliberately calls `resolveServerAuthState()` directly instead of `gateServer(...)` — meaning it renders identically for a completely logged-out stranger, a link-preview crawler (WhatsApp/X/Facebook — none of which are ever logged in), and a real logged-in user. If it were gated, every shared link would just bounce a random visitor to a login wall before they ever saw the content it promised.

It fetches the target gist plus 15 chronological neighbors either side via `fetchGistContext()` (`src/lib/serverGist.ts`, hitting `GET /gists/:id/context`), and 404s (`notFound()`) if the gist genuinely doesn't exist. A `REJECTED` gist (removed by moderation) is the **one case** where this route's `target` can be a non-`APPROVED` gist at all — the backend's `getContext` makes a deliberate exception only for the specific shared gist, never its siblings — and `GistShareView`/`GistCard` render a dedicated "This gist has been removed" state for it in place of content, while comments show "Comments aren't available on a removed gist."

`generateMetadata()` on this route builds the actual Open Graph tags (title, description, `og:image`/`twitter:image` pointing at `/api/og/[gistId]`) — this is what makes shared links show a rich preview card in WhatsApp/iMessage/Slack/X.

Real actions (react/comment/report/share) all still render normally on this page for a guest — clicking one triggers the shared `requireAuth()` prompt (Section 2.6-equivalent gating pattern) instead of silently failing.

---

## 5. The Gist Feature, End to End

**Plain-English:** A "gist" is a short post, optionally with photos/video/GIFs, that appears in a horizontally-swipeable card stack (like a cross between Tinder and Twitter). You react with one of 5 animated emoji, comment in a side panel, and can report/edit/delete/share.

### 5.1 Data flow and normalization

`gistStore.ts`'s `normalizeGist()` is a load-bearing function: the backend returns `reactions_count`/`comments_count`/`views_count`/`reports_count` as **flat fields directly on the gist row**, but the rest of the frontend (`GistCard` etc.) reads them nested under `gist.counts`. Without this normalization step (run on every `list`/`trending`/`byUser`/`get`/`getContext` call), every count would silently read as `undefined` → render as `0`, even though the raw data was right there under a different shape.

### 5.2 The card stack (`GistStack.tsx`)

The signature UI: gists render as an absolutely-positioned deck, front card draggable horizontally (Framer Motion `drag="x"`), with up to `WINDOW_AHEAD` (3) upcoming cards peeking behind at increasing rotation/offset/reduced opacity — only those are actually mounted (everything else returns `null`), keeping the DOM light regardless of feed length. Navigable by drag/flick (threshold 90px or velocity 500), arrow keys, and horizontal wheel/trackpad gesture (vertical scroll is deliberately left alone so it scrolls a card's own content instead of switching cards). A full-screen one-time gesture tutorial (`SwipeHint`) blocks nothing but stays up until the person actually swipes/presses a key/scrolls — no auto-dismiss timer.

`onNearEnd` fires (repeatedly, not once) whenever the front card is within `NEAR_END_THRESHOLD` (5) of the end of the loaded list — `FeedContent.tsx`'s `loadMore()` uses this for cursor pagination against `GET /gists?cursor=...`, tracking an `exhausted` flag once the backend returns an empty page so it stops re-firing.

A peeking card's right edge shows a genuine sliver of its first media item (image or video poster frame) during a drag — a real content teaser baked into the swipe gesture itself, not a bolt-on affordance.

### 5.3 `GistCard.tsx` — the card itself

- **Header:** avatar, name/avitag/relative time, campus/major/level tag pills (each with a subtle staggered "dance" animation every few seconds), and a three-dot action menu (share / report for others' gists, edit+delete for your own). A Quote/repost action existed briefly but was deliberately removed — not planned for now.
- **Body:** short text-only gists (< 200 chars, no media) render as a bold colored "hero" card (`ShortGist`) using a deterministic per-gist color from a 12-color palette (`gistColorFor`, `src/lib/brand.ts` — hashes the gist id so the same gist always gets the same color). Longer text or gists with media get the full scrollable-text or media-panel treatment (Section 5.4).
- **Reactions:** double-tap-anywhere (text-only cards only — media cards' tap gestures are already spoken for) triggers a LOVE reaction plus a big center-screen Lottie burst; the reaction row (`ReactionButton`) offers all 5 types (LIKE/LOVE/FIRE/SAD/LAUGH) with per-type counts, optimistic local deltas, and a shared `onReacted` callback so both entry points (double-tap and row-click) drive the same celebratory burst.
- **Delete/Edit/Report:** all route through `useGistStore`; delete shows a `ConfirmModal`; edit reuses `CreateGistSheet` (pre-fills text+media and calls `update()`+media diffing instead of `create()`); report opens `ReportModal`; every action surfaces failures via `ErrorModal` instead of failing silently — an inline comment explicitly notes this used to be a real bug (failed reacts/reports/deletes looked successful until a reload silently reverted them).
- A `REJECTED` gist (only reachable via the share route) renders a dedicated "This gist has been removed" placeholder card instead of real content, so the surrounding stack's navigation still works past it.

### 5.4 Media — images, video, and the "text mode" swipe-up

`GistMediaStage.tsx` (`GistMediaBackdrop` + `GistMediaBodyPanel`) implements a genuinely clever interaction: media fills the card body as a backdrop (one full-bleed tile, or two side-by-side for a duo), with a caption strip on top showing a truncated preview of the gist text (WhatsApp-status style). Tapping/swiping up on it hands off to "text mode" — the media stays present but heavily blurred+dimmed behind the now-full gist text, with a pill to swipe back down. Video tiles reassign their tap gesture to mute-toggle (first tap unmutes; only once already unmuted does a tap toggle play/pause) since a plain tap can't also mean "open the media"; a dedicated expand button opens `GistMediaOverlay.tsx` instead — a portal-rendered, full-viewport (minus the 360px comment panel on desktop) media lightbox with its own play/pause/scrub/mute bar, left/right nav for a 2-item duo, keyboard support, and drag-to-navigate.

Images use `cloudinarySmartCrop()` (`src/lib/cloudinary.ts`), which injects Cloudinary's `c_fill,g_auto,ar_4:3` transformation into the delivery URL (content-aware crop finding faces/high-contrast regions) — a no-op for any URL that isn't actually a `res.cloudinary.com` delivery URL (e.g. a GIPHY-hosted GIF passes through untouched).

### 5.5 Upload flow — `CreateGistSheet.tsx`

- **Camera capture:** `WebcamCapture.tsx` — live `getUserMedia` preview, canvas snapshot to a JPEG blob, front/back camera toggle, mirrors the front-camera preview so the snapshot matches what was seen.
- **File picker:** validated client-side by `src/lib/mediaValidation.ts` — checks declared MIME type against an allowlist (`ALLOWED_IMAGE_TYPES`: jpeg/png/webp/gif; `ALLOWED_VIDEO_TYPES`: mp4/webm/quicktime), a size cap (15MB images / 50MB video), **and** a real magic-byte signature sniff (`isGenuineMedia`) that reads the file's first bytes and confirms they actually match the claimed format — catches a renamed `virus.exe` → `photo.jpg` that MIME-type/extension checks alone would miss.
- **GIFs/stickers:** `GiphyPicker.tsx` (Section 5.7).
- Up to `LIMITS.maxMediaPerGist` (2) media items per gist — matches `GistMediaOverlay`'s own hardcoded assumption of showing only the first 2 items.
- Text limit: `LIMITS.gist` = 700 chars (comment limit is half that, 350) — a Twitter-style circular progress ring (`CharCountRing`) shows remaining count, only surfacing the actual number once close to the limit.
- New media only actually uploads (or, for edits, only actually gets deleted server-side) on **Save** — picking/removing items before that is purely local draft state, so closing the sheet without saving leaves the real gist untouched.
- On success, the gist is **re-fetched fresh** (not just the bare create/update response) so newly-attached media (uploaded in a separate step after the gist row itself is created) is actually reflected in what gets spliced into the feed.

### 5.6 Reactions in depth

`ReactionButton.tsx` renders all 5 reaction types as real Lottie animations (`src/lib/reactionAnimations.ts` maps `ReactionType` → the JSON files in `src/assets/lottie/`), playing once on hover/click (not looping) so the resting row stays calm. `externalTrigger` lets something outside the row (the card's own double-tap handler) select a reaction exactly as if the button had been clicked, deduped via a `nonce` so a repeated trigger object doesn't re-fire. `guardClick` runs `requireAuth(...)` *before* any local optimistic state changes — gating any later would flash a reaction that never actually happened for a guest.

`gistStore.react`/`unreact` are optimistic: local `counts.reactions_count` and `my_reaction` update immediately, with a rollback to the pre-optimistic snapshot if the network call fails (an inline comment explains this replaced silent failure that "looked successful in the UI and then just vanish[ed] on reload with no explanation").

### 5.7 GIPHY picker

`src/lib/giphy.ts` wraps GIPHY's REST API (trending + search, `pg-13` rating, capped at GIPHY's real max of 50 results/request) with a 5-minute in-memory cache (module-level `Map`, survives picker unmount/remount for the whole page session) — deliberately conserving calls against GIPHY's free-tier 100/hour cap. If `NEXT_PUBLIC_GIPHY_API_KEY` isn't set, `GiphyPicker.tsx` shows a "GIFs and stickers aren't set up yet" empty state rather than erroring.

### 5.8 Comments

Two parallel UIs exist: `CommentPanel.tsx` (the real one — a permanent side panel on desktop, wired into `commentStore`, with pagination, live-highlight for WS-delivered comments, skeleton/error/empty states, optimistic single-tap-to-like reactions) and `CommentSheet.tsx` (a bottom-sheet variant that also exists in the codebase but is **not imported/used anywhere** in the current pages — `FeedContent`/`GistShareView` both only render `CommentPanel`; `CommentSheet` appears to be either superseded or reserved for a future mobile-viewport treatment).

`commentStore.ts` caches comments per `gist_id` (`itemsByGist`), never evicting — revisiting an already-viewed gist this session is instant. A batch prefetch (`prefetchBatch`, hitting `GET /comments/batch`) is fired from `FeedContent`'s `load()` for every gist just loaded, so opening the comment panel on most gists shows content immediately rather than a skeleton. A module-level WS subscription (`comment:created`) at the bottom of the file splices in comments posted by *other* users on any gist you already have cached, with a 2.5s "just arrived" highlight — this subscription is wired up once at module scope (not per-component), so it survives regardless of which panel is mounted.

### 5.9 Reporting

`ReportModal.tsx` — a full dialog (not a quick pop-out menu, deliberately: "a report is a deliberate, considered action, not a quick one-tap toggle") with 10 standard moderation-category pills (Spam, Harassment, Hate speech, Violence, Nudity, Self-harm, False info, Scam, Impersonation, Other — "Other" requires free text). **The community-guidelines link is a literal `href="#"` placeholder** with an explicit `// TODO: swap in the real community guidelines URL once we have it` comment — confirmed still true as of this read. `gist.my_report` (persisted server-side) seeds whether a gist shows as already-reported across reloads, replacing an earlier session-only local flag.

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
2. **`SchoolStep`** — campus picker via `SearchSelectList` (`layout="list"`), backed by `referenceStore.fetchCampuses()` → `GET /misc/campuses`. **`defaultCampuses.ts`/`defaultMajors.ts` exist in the codebase but are explicitly commented out in `referenceStore.ts`** ("Backend's up now — fetch for real instead of seeding these... in case we want the instant-default-data UX back later") — so the school/academics steps genuinely show a loading skeleton on first paint rather than instant seeded data, despite the seed files still being present and ready to re-enable.
3. **`AcademicsStep`** — major (`SearchSelectList`, `layout="chips"`, backed by `fetchMajors()` → `GET /misc/majors`) then level (100–600, only revealed once a major is picked, to avoid splitting attention on two decisions at once).
4. **`ProfileStep`** — optional avatar photo + bio (max `LIMITS.bio` = 250 chars, color-coded countdown). The photo uploads to Cloudinary **immediately** on pick via `POST /profiles/avatar-preupload` (not held as a raw file until final submit) — this is specifically what lets the picture survive a page reload mid-setup (an object URL/File can't be persisted to localStorage, but the resulting Cloudinary URL can). Both fields are optional; Continue only blocks while an upload is actually in flight.
5. **`AvitagStep`** — the handle. Client-side format validation (`validateAvitag`: 4–15 chars, letters/numbers/underscores, must contain a letter, no leading/trailing/double underscores — mirrors the backend's own rule) plus a **debounced (450ms) live availability check** against `GET /profiles/avitag-available/:avitag`, guarded by a `checkId` ref so a slow earlier check can't clobber a faster later one's result. Continue is disabled until the backend has actually confirmed `"available"` — a merely-valid-format tag isn't enough. On submit, `createStudentProfile()` posts to `POST /profiles/students` (multipart form), then auto-`switchProfile`s into it, then routes to `/feed`. A specific race is handled: if the availability check said "available" moments ago but someone else grabbed the tag in between, the backend's real primary-key constraint catches it and the UI surfaces a friendly "No vex, dem don carry this tag" message while flipping the local availability state back to "taken".

The whole wizard's draft (`data`, `imageUrl`, `currentStep`) persists to `localStorage` (`kampos.setup-profile`) so leaving mid-setup and returning resumes exactly where you left off — cleared only once profile creation actually succeeds (on the step component's *unmount*, not the instant creation succeeds, specifically to avoid a visible flash of step 0 rendering behind the success modal).

### Onboarding carousel (`src/app/OnboardingCarousel.tsx`)

3 Kappy-mascot slides (`src/lib/brand.ts`'s `ONBOARDING` array) with pidgin-voice copy, ported verbatim from mobile. `hasSeenOnboarding()`/`markOnboardingSeen()` (`src/lib/onboarding.ts`) are a simple localStorage flag (`kampos.onboarding-seen`) — purely local, no backend — so a returning guest skips straight to `/welcome`. Desktop renders a full-bleed split-screen (illustration fills one half, no boxed card); mobile keeps the original stacked layout. Extensive inline comments document a specific historical bug: illustrations at differing aspect ratios used to get cropped/distorted at certain breakpoints because the containing box's shape had no relationship to the source art's actual proportions — the fix was locking every slide's box to the source art's real aspect ratio (`aspect-[1024/922]`) so it only ever scales uniformly.

---

## 7. Theming

**Plain-English:** Dark mode exists, but only on the main logged-in app screens (feed/profile/settings) — every auth/onboarding/setup screen always renders light, regardless of what you last picked, so the first-impression flow never looks broken by whatever theme you left the app in.

**Technical details:**
- `themeStore.ts` owns only the **preference** (`"light"`/`"dark"`, persisted directly to `localStorage` under `kampos-theme`, read/written outside Zustand's `persist` middleware) — it deliberately never touches `document.documentElement` itself.
- `ThemeRouteSync.tsx` (mounted once in the root layout) is the **one place** that actually toggles the `.dark` class on `<html>`, gated by `DARK_ENABLED_ROUTE = /^\/(feed|profile|settings)(\/|$)/`. It re-runs on every client-side navigation (App Router route changes don't re-run a `beforeInteractive` script).
- A tiny inline `<Script id="kampos-theme-init" strategy="beforeInteractive">` in `layout.tsx` applies the same route-gated logic **before first paint** on a hard/initial load, to avoid a flash of the wrong theme; `ThemeRouteSync` takes over for every subsequent client-side nav.
- CSS variables: Tailwind v4's `@theme` block in `globals.css` exposes brand tokens (`--color-brand`, etc.) plus theme-aware surface/text tokens (`--color-surface`, `--color-ink`, `--color-muted`, `--color-faint`, `--color-line`, `--color-brand-tint`) that indirect through `--kp-*` custom properties, redefined separately under `:root` and `.dark` — every component using `bg-surface`/`text-ink`/etc. becomes dark-mode-aware automatically with zero per-component `dark:` classes needed for those specific tokens. Components that need genuinely different treatment per theme (e.g. inverting an SVG doodle backdrop) still use explicit Tailwind `dark:` variants.
- `ThemeToggle.tsx` renders a neutral icon until `mounted` flips true client-side, avoiding a server/client hydration mismatch since the real theme is only knowable in the browser.

---

## 8. Styling Conventions

- **Fonts:** Poppins (UI text) and Nunito (gist card body text specifically — `font-nunito`), both loaded via `next/font/google` in the root layout with `display: "swap"`, exposed as CSS variables.
- **Brand color palette:** `src/lib/brand.ts` — `GIST_CARD_PALETTE` (12 muted dark colors used for short/text-only "hero" gist cards), deterministically picked per gist via a simple string hash (`gistColorFor`) so a gist's color never flickers across renders.
- **Limits** (`LIMITS` in `brand.ts`): `gist` 700 chars, `comment` 350 (half of gist), `bio` 250, `otp` 6 digits, `avitagMax` 15, `maxMediaPerGist` 2.
- **UI component library** (`src/components/ui/`): `Button` (pill-shaped, spring press animation, `primary`/`secondary`/`ghost` variants, an `invert` prop for the welcome screen's blue/white swap treatment only), `TextInput` (rounded field, password show/hide toggle), `Modal` (portal-rendered to `document.body`, `center`/`sheet` variants, locks body scroll, Escape-to-dismiss), `FeedbackModal.tsx` (exports `ErrorModal`/`ConfirmModal`/`SuccessModal` — all thin wrappers around `Modal`), `Avatar` (graceful degrade to a plain grey circle on missing/broken image, Twitter-style — no placeholder illustration, no broken-image icon), `Chip` (selectable pill for majors/levels), `LinkText` ("Already have an account? Log in." pattern), `OtpInputs` (6-box entry with auto-advance, paste support, and a shake animation keyed by a monotonically-increasing `shakeSignal` rather than a boolean — a boolean can't replay the shake for two consecutive wrong attempts since React bails out of re-rendering on an unchanged value).
- **`icons.tsx`:** the single icon surface for the whole app. `lucide-react` (thin-stroke, used for plainer UI chrome: close/search/eye/chevron/etc.) and `@phosphor-icons/react` fill-weight icons (bolder/playful — the gist card's pop-out action menu, footer metrics, video controls, and top navigation) are both re-exported from here under Kampos-specific names (e.g. `ShareIconFill`, `CommentIconFill`), so nothing in the app imports either library directly — swapping icon libraries later only touches this one file.
- **Illustrations:** `src/components/brand/illustrations.tsx` imports SVGs from `src/assets/illustrations/` via SVGR (`@svgr/webpack`, configured in `next.config.ts` presumably — not directly inspected but implied by `svg.d.ts` + the import style) as real inline React components (`<Illustration name="Kappyswag" />`), so they can be styled/animated/scale crisply, not treated as opaque `<img>` sources. A handful of larger illustrations (`KappyWaving.png`, `KappyPhone.png`, `KappyLookingUp.png`, etc.) are plain raster PNGs used via `next/image` instead, specifically noted in `OnboardingCarousel.tsx` as a fix for one particular SVG (`Kappyswag.svg`) that had actually been a rasterized image smuggled inside SVG markup, causing blur/crop bugs.
- **Doodle backdrop:** a single tiled SVG (`/brand/doodles.svg`, served from `public/`) reused across the feed, comment panel, onboarding, AuthShell, and AppShell's landscape variant — inverted (`dark:invert`) rather than swapped for a separate dark asset, to keep it legible against a dark background.

---

## 9. Data Flow / Types

`src/types/index.ts` is deliberately permissive in places (`[key: string]: unknown` fallthrough on `Account`, `Profile`, `Gist`, `Comment`) — an explicit comment notes the backend shape isn't fully pinned down and types get "tightened as endpoints are confirmed." Key shapes:

- **`Gist`**: `gist_id`, `avitag`, `gist_text`, `created_at`/`edited_at`, `media?: GistMedia[]`, `counts?: GistCounts`, `campus_tag`/`major_tag`/`level`, `my_reaction`/`my_report` (viewer-specific, hydrated inline from list/get responses so the UI never needs a separate per-gist fetch to know "did I already react/report this").
- **`GistCounts`**: `reactions_count`, `comments_count`, `views_count`, `reports_count`, `shares_count` (real, backend-tracked — see below), `reactions_by_type` (per-emoji breakdown).
- **`Comment`**: `comment_id`, `gist_id`, `text`, `commented_at`, `reactions_count`, `my_reaction`, plus denormalized commenter profile fields (`first_name`, `campus_tag`, `major_tag`, `level`, `image_url`) joined server-side.
- **`ReactionType`** = `"LIKE" | "LOVE" | "FIRE" | "SAD" | "LAUGH"` — matches the backend, which renamed its `WOW` enum value to `LAUGH` in place (migration `0029_rename_wow_reaction_to_laugh.sql`, see `KamposBackend/Kampos.md`). Both a `wow.json` and a `laugh.json` Lottie asset exist in `src/assets/lottie/`, and `REACTION_ANIMATIONS` maps the frontend's `LAUGH` key to `laugh.json` — `wow.json` is leftover/orphaned, safe to delete.

**Normalization** (`normalizeGist`/`normalizeGists` in `gistStore.ts`) is the one meaningful transform between backend and frontend shape — see Section 5.1. No other systematic normalization layer exists; most other data is consumed close to its raw backend shape.

---

## 10. Validation & Security

- **`src/lib/validation.ts`** — email regex, the shared `PASSWORD_RULES` array (8+ chars, one lower/upper/number/special-char — each rule independently testable, driving both a live green-checklist UI on signup and the submit-time gate), name-part validation (letters only, 3+ chars), avitag validation (4–15 chars, alphanumeric+underscore, must contain a letter, no leading/trailing/double underscore) — explicitly "ported verbatim in spirit from the mobile app" to keep both platforms' rules identical.
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

- **`/profile` and `/settings` pages are pure placeholders.** Both just render an illustration + a "coming soon"-style message ("Your profile dey cook 👀" / "Settings dey come 🔧"). No real profile view (own gists, bio, stats) or settings (account, notifications, privacy) exists yet, despite being fully gated/routed as if they were real pages.
- **`ReportModal`'s community-guidelines link is `href="#"`** with an explicit TODO comment — confirmed unchanged as of this read.
- **`SignupForm`'s "Terms & Conditions" / "Privacy Policy" text is not a link at all** — it's plain styled `<span>` text inside the agreement checkbox label, not an `<a>`/`<Link>`. Functionally the same class of placeholder as the ReportModal link (`todo.md` explicitly lists "put the links to tc and pp and community guidelines" as outstanding).
- **`CommentSheet.tsx` exists but is unused** — no page/component currently renders it; `CommentPanel.tsx` is the only comment UI actually wired into the app. Possibly a leftover from before the panel-based layout, or reserved for a future mobile treatment.
- **Multi-profile switching has no UI.** `profileStore.switchProfile` exists and is called internally (auto-switch after creating a profile, and `authStore`'s self-heal), but there's no screen or menu letting a logged-in user with multiple profiles pick which one is active.
- **OAuth (Google/Facebook/Apple) has no frontend UI.** The backend supports it (per its own docs), and illustration assets for all three provider logos exist in `src/assets/illustrations/` (`Googleicon.svg`, `Facebookicon.svg`, `Appleicon.svg`), but no login/signup button in this repo actually wires them up — only email/password auth is reachable from the UI.
- **`defaultCampuses.ts`/`defaultMajors.ts` are dead code** — fully written out (large hardcoded lists), imported by nothing (commented out in `referenceStore.ts` with a note they're kept "in case we want the instant-default-data UX back later"). The school/academics wizard steps genuinely show a loading skeleton on first paint rather than using this fallback data.
- **`wow.json` (Lottie reaction asset) is orphaned** — present in `src/assets/lottie/` but `REACTION_ANIMATIONS` maps the frontend's actual reaction type set (`LIKE/LOVE/FIRE/SAD/LAUGH`) to `laugh.json` instead. Harmless, just dead weight — safe to delete.
- **Real-time is read-only and narrow in practice.** Only `comment:created` is subscribed to; gist approval/rejection broadcasts and reaction broadcasts (which the backend does emit) aren't consumed anywhere in the frontend, so e.g. a newly-approved gist from someone else won't appear in your feed live — only on next full reload/refetch.
- **No test suite.** No test script, no test files found anywhere in `src/`.
- **`todo.md`** (repo root) is a live, informal list of outstanding polish items in the founder's own words — worth reading directly for anything not captured above, though it's not kept perfectly in sync with what's actually shipped (some listed items, like edit/delete and sharing, are now done).

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
    │   ├── profile/, settings/     Placeholder pages (active only)
    │   ├── gist/[gistId]/          Ungated shared-link view: page.tsx + GistShareView.tsx
    │   └── api/
    │       ├── v1/[...path]/route.ts   Same-origin backend proxy (Section 1)
    │       └── og/[gistId]/route.tsx   Dynamic OG image generation (Satori)
    ├── components/
    │   ├── auth/                  HydrateAuth, SessionWatcher, AuthPromptModal
    │   ├── brand/                 Wordmark, illustrations.tsx, GistPreviewCard/Marquee, MiniGistCard, MiniCommentCard, PhoneKappyOrbit, KappyOpportunitiesOrbit
    │   ├── comment/                CommentPanel (used), CommentSheet (unused)
    │   ├── gist/                   GistCard, GistStack, CreateGistSheet, GistMediaStage, GistMediaOverlay, ReactionButton, ReportModal, ShareModal, GiphyPicker, WebcamCapture, FeedBottomBar (unused by current feed layout), GistCardSkeleton
    │   ├── layout/                  AppShell, AuthShell
    │   ├── onboarding/             ProgressDots
    │   ├── setup/                  StepScaffold, SearchSelectList, types.ts, steps/{NameStep,SchoolStep,AcademicsStep,ProfileStep,AvitagStep}
    │   ├── theme/                   ThemeRouteSync
    │   └── ui/                      Button, TextInput, Modal, FeedbackModal, Avatar, Chip, LinkText, OtpInputs, ThemeToggle, icons.tsx
    ├── lib/
    │   ├── api.ts                  Shared axios instance + 401/refresh interceptor
    │   ├── env.ts                  Validated env var access
    │   ├── serverAuth.ts            resolveServerAuthState, gateServer
    │   ├── authGate.ts              destinationFor()
    │   ├── requireAuth.ts            requireAuth() — the shared "must be logged in" gate for actions
    │   ├── serverGist.ts             fetchGistContext() — server-side gist fetch for the share route
    │   ├── cloudinary.ts             cloudinarySmartCrop()
    │   ├── sanitize.ts, mediaValidation.ts, validation.ts   Content/input safety
    │   ├── ws.ts                    WSClient
    │   ├── giphy.ts                  GIPHY API wrapper + cache
    │   ├── format.ts                  timeAgo, friendlyDateTime, compactNumber, formatCountdown
    │   ├── brand.ts                  GIST_CARD_PALETTE, gistColorFor, LIMITS, ONBOARDING copy
    │   ├── onboarding.ts              hasSeenOnboarding/markOnboardingSeen (localStorage)
    │   ├── reactionAnimations.ts     ReactionType → Lottie JSON map
    │   └── defaultCampuses.ts, defaultMajors.ts   Unused seed data (see Section 13)
    ├── stores/                      One Zustand store per domain (Section 3)
    ├── types/index.ts                Shared domain types
    └── assets/
        ├── illustrations/           SVG + PNG brand art (Kappy mascot etc.)
        └── lottie/                    fire/laugh/like/love/sad/wow.json reaction animations
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
