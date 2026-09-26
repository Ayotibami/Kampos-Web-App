import { gateServerForTabs } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { VideoFeedContent } from "./VideoFeedContent";

// "Spot" is the settled name for this tab (see MobileTabBar); the route
// itself still lives at /video. Fully wired to the real backend (see
// spotStore.ts) — the feed fetches real posted Spots, and posting goes
// through the real draft -> signature -> Cloudinary upload -> finalize
// sequence.
export default async function VideoPage() {
  // gateServerForTabs, not gateServer — this is the ONLY thing this page
  // awaits server-side (VideoFeedContent fetches its own feed
  // client-side, after the shell's already on screen), so tolerating a
  // few minutes of staleness here is most of what makes this tab feel
  // instant. See serverAuth.ts's own doc on why that's safe.
  const { state, account, profiles } = await gateServerForTabs(["active"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <VideoFeedContent />
    </>
  );
}
