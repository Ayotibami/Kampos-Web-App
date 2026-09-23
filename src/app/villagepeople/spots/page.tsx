import { listSpots } from "@/lib/serverSpotsAdmin";
import { AllSpotsManager } from "./AllSpotsManager";

/**
 * /villagepeople/spots — "browse every Spot regardless of status", the
 * Spot counterpart to /villagepeople/gists. No extra role check beyond
 * VillagePeopleLayout's own admin gate — any admin ('idiot' or 'king'),
 * same as GET /idiot/spots' isAuth+isIdiot gate.
 *
 * The first page loads with no filters applied — same "server does the
 * initial fetch, client owns every filter change/scroll continuation from
 * here on" split as AllGistsPage.
 */
export default async function AllSpotsPage() {
  const { spots: initialSpots, total: initialTotal } = await listSpots({ limit: 30 });
  return <AllSpotsManager initialSpots={initialSpots} initialTotal={initialTotal} />;
}
