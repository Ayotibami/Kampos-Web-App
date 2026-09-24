import type { ReactNode } from "react";
import { Suspense } from "react";
import Loading from "./loading";

/**
 * Exists purely to give /feed a real layout.tsx — same fix settings/
 * villagepeople already use, for the same reason (see their own layout.tsx
 * comments). page.tsx's own async work (gateServer + fetchFeedGists)
 * already gets an automatic Suspense boundary from loading.tsx, but ONLY
 * for a hard reload/direct URL hit — a client-side navigation here from
 * another top-level route (tapping the Gist tab from /video or a profile)
 * shares no nested layout with wherever it came from, so that automatic
 * boundary never actually mounts; the nearest one already committed in the
 * tree is the ROOT's loading.tsx instead (confirmed empirically — see its
 * own doc). A manually-placed <Suspense> in a real layout.tsx doesn't have
 * that problem: it's freshly evaluated the moment this segment starts
 * rendering, sibling-navigation or not, so it reliably shows THIS route's
 * own feed-shaped skeleton instead of the root's generic one.
 */
export default function FeedLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
