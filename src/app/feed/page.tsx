import { gateServer } from "@/lib/serverAuth";
import { fetchFeedGists } from "@/lib/serverGist";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { FeedContent } from "./FeedContent";

export default async function FeedPage() {
  // Auth check and gist fetch run in parallel — no added latency. If the
  // auth check redirects (user not logged in), the redirect error
  // propagates and the gist fetch result is simply discarded.
  const [{ state, account, profiles }, initialGists] = await Promise.all([
    gateServer(["active"]),
    fetchFeedGists(),
  ]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <FeedContent initialGists={initialGists} />
    </>
  );
}
