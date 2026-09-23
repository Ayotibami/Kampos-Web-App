import { listPendingGists, listPendingProfiles, listPendingReports, listPendingSpotReports } from "@/lib/serverModeration";
import { ModerationManager } from "./ModerationManager";

/**
 * /villagepeople/moderation — Group B's "police the posts" screens. Unlike
 * /villagepeople/admins, there's no extra role check here beyond what
 * VillagePeopleLayout's own gate already did: moderation is for any admin
 * ('idiot' or 'king'), same as the backend's isAuth+isIdiot gate on every
 * /idiot/moderation route.
 *
 * All four lists are fetched up front, in parallel, same "server does the
 * initial fetch, client component owns the interactive parts" split as
 * admins/page.tsx + AdminsManager.tsx — the tabs just swap which already-
 * loaded list is visible rather than fetching per-tab-switch, so flipping
 * between Pending Posts/Reports/Spot Reports/Profile Verifications is
 * instant and each list only ever needs fetching once per page load. Spot
 * Reports is its own tab, not merged into Reports — the two report kinds
 * join against entirely different content (gists vs. Spots) with different
 * row shapes, same reasoning the backend keeps them as separate endpoints.
 */
export default async function ModerationPage() {
  const [gists, reports, spotReports, profiles] = await Promise.all([
    listPendingGists(),
    listPendingReports(),
    listPendingSpotReports(),
    listPendingProfiles(),
  ]);

  return (
    <ModerationManager
      initialGists={gists}
      initialReports={reports}
      initialSpotReports={spotReports}
      initialProfiles={profiles}
    />
  );
}
