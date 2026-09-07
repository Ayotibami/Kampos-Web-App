import { redirect } from "next/navigation";
import { resolveServerAuthState, isAdminAccount } from "@/lib/serverAuth";
import { isKingRole } from "@/lib/roles";
import { listAdmins } from "@/lib/serverAdmins";
import { AdminsManager } from "./AdminsManager";

/**
 * King-only. VillagePeopleLayout already confirmed "is this account an
 * admin at all" before rendering anything under /villagepeople, but that's
 * not enough here — a plain 'idiot' admin (or, in principle, anyone who
 * guesses the URL) must NOT reach this specific page, since it's what
 * manages who else gets admin access at all. VillagePeopleRail already
 * hides the "Admins" nav link from non-king admins, but hiding a link is a
 * UI nicety, not access control — it doesn't stop a direct URL visit, so
 * the real enforcement has to live here, server-side, same as the layout's
 * own gate.
 *
 * resolveServerAuthState() is cache()-wrapped (see serverAuth.ts) so this
 * re-check doesn't cost a second real network round-trip on top of the one
 * the layout already made for the same request.
 */
export default async function AdminsPage() {
  const { account } = await resolveServerAuthState();
  if (!isAdminAccount(account) || !isKingRole(account?.role)) {
    redirect("/villagepeople");
  }

  const admins = await listAdmins();

  return <AdminsManager initialAdmins={admins} />;
}
