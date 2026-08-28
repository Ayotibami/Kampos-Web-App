/**
 * Every page in this app is "dynamic" (reads the session cookie), which
 * means Next's client-side Router Cache treats an already-visited route as
 * fresh for 5 minutes (see next.config.ts's staleTimes.dynamic) — a real,
 * deliberate tradeoff to avoid an auth-check + full data fetch on every
 * back-navigation. The cost: editing your own profile in Settings, then
 * navigating to a page you'd already visited this session (your own
 * profile, the feed) can silently show the pre-edit snapshot — old name,
 * old bio, old avatar — for up to 5 minutes, until something forces that
 * specific page to actually refetch.
 *
 * `router.refresh()` is the right tool for that, but it only busts the
 * client cache for whichever route you call it FROM — there's no API to
 * reach into some *other*, not-currently-rendered route's cache entry from
 * here. So instead of fighting the cache directly, this just leaves a
 * lightweight signal ("a profile edit just happened, recently") that any
 * page can check for itself on mount and self-refresh once if it's stale
 * enough to matter — sessionStorage rather than a store, since it needs to
 * survive exactly across the next page's own fresh mount, not live in
 * memory that a full navigation would reset anyway.
 */
const KEY = "kampos-profile-updated-at";
const RELEVANT_WINDOW_MS = 5 * 60 * 1000; // matches staleTimes.dynamic

/** Call right after a profile edit successfully saves. */
export function markProfileUpdated() {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Private-browsing/storage-blocked — worst case, the next page just
    // doesn't know to self-refresh and shows whatever the cache already had.
  }
}

/** Call on mount from any page that might be showing the current user's own
 * profile data — true at most once per page visit within the same window a
 * real edit could still be why the cache looks wrong. Doesn't clear the
 * flag itself: multiple pages (profile, then feed, say) can each still
 * legitimately need their own one-time refresh within the same window. */
export function wasProfileRecentlyUpdated(): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < RELEVANT_WINDOW_MS;
  } catch {
    return false;
  }
}
