import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { FeedContent } from "./FeedContent";

export default async function FeedPage() {
  const { state, account, profiles } = await gateServer(["active"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <FeedContent />
    </>
  );
}
