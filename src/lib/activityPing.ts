import { api } from "@/lib/api";

/**
 * Backend's `/activity/ping` (isAuth) — see KamposBackend's activity module.
 * Every "is this user actually doing anything" dashboard metric (lurkers vs
 * posters, feed-mode split, etc.) is derived from `activity_events` rows
 * this produces. Without calling it, someone who only scrolls the feed
 * (never likes/comments/posts/reposts) leaves zero rows and isn't counted
 * as active at all — which is exactly the gap this wiring closes.
 */
export type ActivityEventType = "feed_view" | "amebo_toggled" | "session_start";

/** `feed_mode` is intentionally the real 3-value spelling the feed itself
 * uses (see FeedContent.tsx's own `feedMode` derivation) — never a 2-value
 * guess. Left open (`Record<string, unknown>`) for whatever other
 * metadata a future event type needs, same as the backend's own `jsonb`
 * column accepts. */
export interface ActivityPingMetadata {
  feed_mode?: "gist" | "school" | "amebo";
  [key: string]: unknown;
}

/**
 * Fire-and-forget — never awaited by callers, never throws, never shows
 * anything to the user. A failed ping (offline, backend cold-start, not
 * yet authenticated) must have zero effect on the user's actual
 * experience, so every error is swallowed here rather than surfaced.
 */
export function pingActivity(eventType: ActivityEventType, metadata?: ActivityPingMetadata): void {
  void api.post("/activity/ping", { eventType, metadata }).catch((err) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[activityPing] failed", eventType, err);
    }
  });
}
