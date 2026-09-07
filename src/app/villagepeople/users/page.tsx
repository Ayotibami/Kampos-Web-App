import { searchUsers } from "@/lib/serverUsers";
import { UsersManager } from "./UsersManager";

/**
 * /villagepeople/users — Group C's "browse/search every account+profile"
 * screen. Like /villagepeople/moderation (not /admins), there's no extra
 * role check here beyond VillagePeopleLayout's own admin gate: browsing,
 * searching, and creating accounts is for any admin ('idiot' or 'king'),
 * same as the backend's isAuth+isIdiot gate on /idiot/users. Only the
 * email-edit control on the account detail page is king-gated — enforced
 * there, not here.
 *
 * The first page loads with no filters applied (search/campus/major/type
 * all empty, limit 20 offset 0) — same "server does the initial fetch,
 * client owns every filter change/page turn from here on" split as
 * AdminsManager/ModerationManager already use.
 */
export default async function UsersPage() {
  const initialRows = await searchUsers({ limit: 20, offset: 0 });
  return <UsersManager initialRows={initialRows} />;
}
