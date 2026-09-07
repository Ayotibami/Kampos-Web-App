import { resolveServerAuthState } from "@/lib/serverAuth";
import { isKingRole } from "@/lib/roles";
import { getHqStats } from "@/lib/serverStats";
import { listAuditLogs } from "@/lib/serverAudit";
import { HqDashboard } from "./HqDashboard";

/**
 * /villagepeople — the section landing page. VillagePeopleLayout already
 * confirmed "is this an admin at all"; the numbers themselves are any-admin
 * (stats.routes.ts is isIdiot, not king-gated), but the "recent activity"
 * mini-feed re-checks king-ness itself and is only fetched/shown for a king,
 * same reasoning as the full Activity log page (see audit/page.tsx) — an
 * activity feed any admin can browse stops functioning as a check ON admins.
 */
export default async function VillagePeoplePage() {
  const { account } = await resolveServerAuthState();
  const isKing = isKingRole(account?.role);

  const [stats, recentActivity] = await Promise.all([
    getHqStats(),
    isKing ? listAuditLogs({ limit: 8 }) : Promise.resolve(null),
  ]);

  return <HqDashboard stats={stats} recentActivity={recentActivity} isKing={isKing} />;
}
