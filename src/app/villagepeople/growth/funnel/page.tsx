import { GrowthFunnelManager } from "./GrowthFunnelManager";

/**
 * /villagepeople/growth/funnel — content views -> clicks -> signups ->
 * activated -> retained day-7, with the backend's own `weakestStep` called
 * out. Same isIdiot tier as every other /villagepeople/growth/* page.
 */
export default function GrowthFunnelPage() {
  return <GrowthFunnelManager />;
}
