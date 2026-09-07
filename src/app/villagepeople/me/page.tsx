import { redirect } from "next/navigation";
import { resolveServerAuthState } from "@/lib/serverAuth";
import { getAccountDetail } from "@/lib/serverUsers";
import { MyAccountManager } from "./MyAccountManager";

/**
 * /villagepeople/me — an admin's own account + own profiles, reusing the
 * exact same fetch (getAccountDetail) and view/edit machinery every other
 * account in the panel already goes through, just pointed at the caller's
 * own account_id instead of a route param. See MyAccountManager's own doc
 * comment for why this is a DIFFERENT component from AccountDetailManager
 * rather than that one reused with a flag — the two diverge on which
 * actions make sense to show, not just on data.
 */
export default async function MyAccountPage() {
  const { account } = await resolveServerAuthState();
  // VillagePeopleLayout's own gate already confirmed this is an admin
  // account before this page ever renders — account_id missing here would
  // mean that gate's own resolveServerAuthState() call (cache()-shared,
  // same request) somehow came back without one, not a real access-control
  // gap. Redirect rather than crash either way.
  if (!account?.account_id) redirect("/villagepeople");

  const detail = await getAccountDetail(account.account_id);
  if (!detail) redirect("/villagepeople");

  return <MyAccountManager initialDetail={detail} />;
}
