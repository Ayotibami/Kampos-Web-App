import type { ReactNode } from "react";
import { Suspense } from "react";
import Loading from "./loading";

/**
 * Exists purely to give /video a real layout.tsx — same fix feed/layout.tsx
 * already uses, for the same reason (see its own comment). page.tsx's own
 * gateServerForTabs() await already gets an automatic Suspense boundary
 * from loading.tsx, but ONLY for a hard reload/direct URL hit — a
 * client-side navigation here from another top-level route (tapping Spot
 * from /feed or a profile) shares no nested layout with wherever it came
 * from, so that automatic boundary never actually mounts; the nearest one
 * already committed in the tree used to be the ROOT's loading.tsx instead
 * (see its own comment/history). A manually-placed <Suspense> in a real
 * layout.tsx doesn't have that problem: it's freshly evaluated the moment
 * this segment starts rendering, sibling-navigation or not, so it reliably
 * shows THIS route's own loading.tsx — including its fresh-feed bypass —
 * instead of the root's generic one.
 */
export default function VideoLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
