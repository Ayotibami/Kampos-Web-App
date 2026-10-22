import { GrowthDashboardClient } from "./GrowthDashboardClient";

/**
 * /villagepeople/growth — the growth dashboard landing page. Any admin
 * (VillagePeopleLayout's own gate already confirmed that; stats.routes.ts
 * is isIdiot, not king-gated, same tier as HQ's own /villagepeople page).
 * Everything here is interactive (date range, compare toggle), so unlike
 * HqDashboard this is a plain client component with no server-side initial
 * fetch — there's no single "default range" worth pre-rendering around.
 */
export default function GrowthPage() {
  return <GrowthDashboardClient />;
}
