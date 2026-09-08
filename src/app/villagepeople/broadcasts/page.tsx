import { redirect } from "next/navigation";
import { resolveServerAuthState, isAdminAccount } from "@/lib/serverAuth";
import { isKingRole } from "@/lib/roles";
import { listBroadcasts } from "@/lib/serverBroadcasts";
import { BroadcastsManager } from "./BroadcastsManager";

/**
 * King-only — same reasoning as admins/page.tsx: emailing every account on
 * the platform is even higher-stakes than managing who has admin access,
 * so a plain 'idiot' admin (or a direct URL guess) must be rejected here,
 * server-side, not just have the nav link hidden.
 */
export default async function BroadcastsPage() {
  const { account } = await resolveServerAuthState();
  if (!isAdminAccount(account) || !isKingRole(account?.role)) {
    redirect("/villagepeople");
  }

  const broadcasts = await listBroadcasts();

  return <BroadcastsManager initialBroadcasts={broadcasts} />;
}
