import { listPendingGists, listPendingProfiles, listPendingReports } from "@/lib/serverModeration";
import { ModerationManager } from "./ModerationManager";

/**
 * /villagepeople/moderation — Group B's "police the posts" screens. Unlike
 * /villagepeople/admins, there's no extra role check here beyond what
 * VillagePeopleLayout's own gate already did: moderation is for any admin
 * ('idiot' or 'king'), same as the backend's isAuth+isIdiot gate on every
 * /idiot/moderation route.
 *
 * All three lists are fetched up front, in parallel, same "server does the
 * initial fetch, client component owns the interactive parts" split as
 * admins/page.tsx + AdminsManager.tsx — the tabs just swap which already-
 * loaded list is visible rather than fetching per-tab-switch, so flipping
 * between Pending Posts/Reports/Profile Verifications is instant and each
 * list only ever needs fetching once per page load.
 */
export default async function ModerationPage() {
  const [gists, reports, profiles] = await Promise.all([
    listPendingGists(),
    listPendingReports(),
    listPendingProfiles(),
  ]);

  return <ModerationManager initialGists={gists} initialReports={reports} initialProfiles={profiles} />;
}
