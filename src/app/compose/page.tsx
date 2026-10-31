import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { ComposePageContent } from "./ComposePageContent";

// A real route for the Create Gist sheet — same reasoning /hot got one:
// before this, the sheet only existed as local state inside whichever page
// happened to mount it (FeedContent, separately ProfileView), so a
// notification telling someone to "post something" had nowhere to actually
// go except a full /feed visit first, landing on the composer only once
// that page's own effect noticed a query param. See ComposePageContent's
// own doc comment for the full reasoning, including why the "+" buttons on
// Feed/Profile deliberately keep their OWN local sheet instead of routing
// here too.
//
// gateServer, not gateServerForTabs — not a bottom tab, same as /hot.
export default async function ComposePage() {
  const { state, account, profiles } = await gateServer(["active"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <ComposePageContent />
    </>
  );
}
