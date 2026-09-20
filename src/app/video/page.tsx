import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { VideoFeedContent } from "./VideoFeedContent";

// Placeholder route/label — "Video" is a stand-in name for this tab until
// the real branding is decided (see MobileTabBar). No backend yet: the feed
// below seeds itself with local placeholder clips, and posting only ever
// updates that same in-memory list — nothing is persisted or sent to a
// server. That part comes once the UI direction is locked in.
export default async function VideoPage() {
  const { state, account, profiles } = await gateServer(["active"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <VideoFeedContent />
    </>
  );
}
