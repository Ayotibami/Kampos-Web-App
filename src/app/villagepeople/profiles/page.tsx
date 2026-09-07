import {
  listStudentProfiles,
  listKreatorProfiles,
  listKompanyProfiles,
  listSchoolProfiles,
  listIdiotProfiles,
} from "@/lib/serverProfilesAdmin";
import { ProfilesManager } from "./ProfilesManager";

/**
 * /villagepeople/profiles — the new profile-centric section (one tab per
 * profile type), distinct from /villagepeople/users ("Accounts" — one row
 * per login/email). Like /villagepeople/moderation/users/gists (not
 * /admins), there's no extra role check here beyond VillagePeopleLayout's
 * own admin gate — this is for any admin ('idiot' or 'king'), same as the
 * assumed isAuth+isIdiot gate on GET /idiot/profiles/<type>.
 *
 * All 5 tabs' first pages load in parallel with no filters applied — same
 * "server does the initial fetch, client owns every filter change/scroll
 * continuation from here on" split as every other screen in this section.
 * Switching tabs never re-fetches (each tab already has its own initial
 * page), exactly like ModerationManager's 3 tabs.
 */
export default async function ProfilesPage() {
  const [initialStudents, initialKreators, initialKompanies, initialSchools, initialIdiots] = await Promise.all([
    listStudentProfiles({ limit: 20 }),
    listKreatorProfiles({ limit: 20 }),
    listKompanyProfiles({ limit: 20 }),
    listSchoolProfiles({ limit: 20 }),
    listIdiotProfiles({ limit: 20 }),
  ]);

  return (
    <ProfilesManager
      initialStudents={initialStudents}
      initialKreators={initialKreators}
      initialKompanies={initialKompanies}
      initialSchools={initialSchools}
      initialIdiots={initialIdiots}
    />
  );
}
