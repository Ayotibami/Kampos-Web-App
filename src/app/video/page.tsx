import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { VideoFeedContent } from "./VideoFeedContent";

// "Spot" is the settled name for this tab (see MobileTabBar); the route
// itself still lives at /video. Fully wired to the real backend (see
// spotStore.ts) — the feed fetches real posted Spots, and posting goes
// through the real draft -> signature -> Cloudinary upload -> finalize
// sequence.
export default async function VideoPage() {
  const { state, account, profiles } = await gateServer(["active"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <VideoFeedContent />
    </>
  );
}
