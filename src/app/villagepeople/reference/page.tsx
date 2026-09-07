import { listCampusesAndMajors } from "@/lib/serverReference";
import { ReferenceManager } from "./ReferenceManager";

/**
 * /villagepeople/reference — add/edit/remove the campuses and majors every
 * profile-setup/gist-filter picker in the app draws from. Any admin
 * (VillagePeopleLayout's own gate already confirmed that), not king-gated
 * — see reference.routes.ts's own doc comment for why this sits at the
 * same tier as Users/Profiles CRUD rather than Admins/Activity log.
 */
export default async function ReferencePage() {
  const { campuses, majors } = await listCampusesAndMajors();
  return <ReferenceManager initialCampuses={campuses} initialMajors={majors} />;
}
