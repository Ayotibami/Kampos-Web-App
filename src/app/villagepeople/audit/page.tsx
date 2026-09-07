import { redirect } from "next/navigation";
import { resolveServerAuthState, isAdminAccount } from "@/lib/serverAuth";
import { isKingRole } from "@/lib/roles";
import { listAuditLogs } from "@/lib/serverAudit";
import { AuditLogManager } from "./AuditLogManager";

/**
 * King-only, same reasoning and same enforcement shape as
 * villagepeople/admins/page.tsx: VillagePeopleLayout already confirmed "is
 * this an admin at all", but a plain 'idiot' admin must not reach this
 * specific page — an activity log any admin can browse stops functioning
 * as a check ON admins (see the conversation that settled this). Hiding
 * the nav link (VillagePeopleRail) is a UI nicety; this re-check is the
 * actual access control, since a hidden link doesn't stop a direct URL
 * visit.
 */
export default async function AuditPage() {
  const { account } = await resolveServerAuthState();
  if (!isAdminAccount(account) || !isKingRole(account?.role)) {
    redirect("/villagepeople");
  }

  const logs = await listAuditLogs();

  return <AuditLogManager initialLogs={logs} />;
}
