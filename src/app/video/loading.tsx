import { AppShell } from "@/components/layout/AppShell";
import { VideoFeedSkeleton } from "./VideoFeedContent";

/**
 * Route-level fallback for /video, shown while VideoPage's own
 * gateServer() await is in flight — but only for a hard reload/direct URL
 * hit. A client-side navigation into /video (tab bar) never mounts this:
 * it shares no nested layout with wherever it's navigated from, so the
 * nearest already-committed Suspense boundary at that point is the ROOT
 * loading.tsx, not this one — that's handled there instead (see its own
 * doc for how it was confirmed and why). This file still matters for the
 * hard-reload path, and its markup is deliberately identical to what the
 * root fallback renders for /video, so which one actually mounts is
 * invisible to the user either way. Same AppShell/height wrapper
 * VideoFeedContent itself renders into, so the swap to the real hydrated
 * page lands in the same box instead of visibly resizing.
 */
export default function Loading() {
  return (
    <AppShell variant="feed">
      <div className="flex h-dvh w-full overflow-hidden bg-black">
        <VideoFeedSkeleton />
      </div>
    </AppShell>
  );
}
