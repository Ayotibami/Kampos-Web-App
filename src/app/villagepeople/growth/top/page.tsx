import { TopListsManager } from "./TopListsManager";

/**
 * /villagepeople/growth/top — top posts and top users (by engagement/
 * activity) within a date range. Any admin (same isIdiot tier as
 * stats.routes.ts's own doc comment).
 */
export default function TopListsPage() {
  return <TopListsManager />;
}
