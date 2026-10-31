import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { HotPageContent } from "./HotPageContent";

// A real route for the "As e dey hot" story viewer — it used to be a modal
// nested inside EDeyHotRail (itself nested inside the Feed page), which is
// why opening a specific person's stack from a notification needed a
// fragile chain of query-param-on-the-FEED-route + effect + ref-guard +
// nonce just to reach into that nested component's local state. Opening a
// real URL is just... a navigation. See HotPageContent's own doc comment
// for the full before/after.
//
// gateServer, not gateServerForTabs — this isn't one of the 3 bottom tabs
// (same reasoning /gist/[gistId] and the rest of the deep-link-style routes
// use a fresh server check rather than the tabs' tolerated staleness
// window).
export default async function HotPage() {
  const { state, account, profiles } = await gateServer(["active"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <HotPageContent />
    </>
  );
}
