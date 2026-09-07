import { listGists } from "@/lib/serverGistsAdmin";
import { AllGistsManager } from "./AllGistsManager";

/**
 * /villagepeople/gists — "browse every gist regardless of status." Before
 * this screen existed, the admin panel could only ever show a gist while it
 * was pending or reported (Moderation's own queues, /villagepeople/
 * moderation); once actioned, it was gone from view entirely with no way to
 * find it again. Like /villagepeople/moderation and /villagepeople/users
 * (not /admins), there's no extra role check here beyond
 * VillagePeopleLayout's own admin gate — this is for any admin ('idiot' or
 * 'king'), same as the assumed isAuth+isIdiot gate on GET /idiot/gists.
 *
 * The first page loads with no filters applied — same "server does the
 * initial fetch, client owns every filter change/scroll continuation from
 * here on" split as AdminsManager/ModerationManager/UsersManager.
 */
export default async function AllGistsPage() {
  const initialGists = await listGists({ limit: 30 });
  return <AllGistsManager initialGists={initialGists} />;
}
