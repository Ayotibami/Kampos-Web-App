import { gateServerForTabs } from "@/lib/serverAuth";
import { fetchFeedGists } from "@/lib/serverGist";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { FeedContent } from "./FeedContent";

export default async function FeedPage() {
  // Auth check and gist fetch run in parallel — no added latency. If the
  // auth check redirects (user not logged in), the redirect error
  // propagates and the gist fetch result is simply discarded.
  // gateServerForTabs, not gateServer — this is one of the three
  // bottom-tab routes, so the auth check itself tolerates a few minutes
  // of staleness instead of re-verifying fresh on every single tap. See
  // serverAuth.ts's own doc on why that's safe specifically here.
  const [{ state, account, profiles }, initialGists] = await Promise.all([
    gateServerForTabs(["active"]),
    fetchFeedGists(),
  ]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <FeedContent initialGists={initialGists} />
    </>
  );
}
